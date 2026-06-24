from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt
import requests
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

# ---------------- Config ----------------
JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 60 * 24  # 1 day
REFRESH_TTL_DAYS = 30

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Lantern Realm Codex API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("codex")

CATEGORIES = ["overview", "location", "character", "faction", "lore", "session", "bestiary"]
Category = Literal["overview", "location", "character", "faction", "lore", "session", "bestiary"]


# ---------------- Auth helpers ----------------
def hash_password(pwd: str) -> str:
    return bcrypt.hashpw(pwd.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pwd: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pwd.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": now + timedelta(minutes=ACCESS_TTL_MIN),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": now + timedelta(days=REFRESH_TTL_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                        max_age=ACCESS_TTL_MIN * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none",
                        max_age=REFRESH_TTL_DAYS * 86400, path="/")


def clear_auth_cookies(response: Response) -> None:
    # Match attributes set on login so browsers/curl actually overwrite the cookies.
    # Use a non-empty sentinel value: some HTTP clients (e.g. curl) don't replace cookies
    # when the new value is an empty string, but they do replace when given a real value.
    # The sentinel is not a valid JWT so it will fail auth even if it lingers.
    for name in ("access_token", "refresh_token"):
        response.set_cookie(
            key=name,
            value="logged-out",
            httponly=True,
            secure=True,
            samesite="none",
            max_age=0,
            expires=0,
            path="/",
        )


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        # Server-side invalidation: tokens issued before `valid_after` are rejected (used on logout)
        valid_after = user.get("valid_after", 0)
        iat = payload.get("iat", 0)
        if valid_after and iat < valid_after:
            raise HTTPException(status_code=401, detail="Session ended")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_optional_user(request: Request) -> Optional[dict]:
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


# ---------------- Models ----------------
class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=40)


class EntryIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    category: Category
    title: str
    subtitle: Optional[str] = ""
    summary: Optional[str] = ""
    content: Optional[str] = ""
    image_url: Optional[str] = ""
    tags: List[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)
    pinned: bool = False
    is_private: bool = False  # DM-only: hidden from non-admin list/detail responses
    map_x: Optional[float] = None  # 0-100 percent X on world map
    map_y: Optional[float] = None  # 0-100 percent Y on world map
    map_id: Optional[str] = None   # which regional map this entry sits on; null → default


class EntryOut(EntryIn):
    id: str
    slug: str
    created_at: str
    updated_at: str


def slugify(text: str) -> str:
    s = "".join(c.lower() if c.isalnum() else "-" for c in text)
    while "--" in s:
        s = s.replace("--", "-")
    return s.strip("-") or uuid.uuid4().hex[:8]


def entry_to_out(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "slug": doc["slug"],
        "category": doc["category"],
        "title": doc["title"],
        "subtitle": doc.get("subtitle", ""),
        "summary": doc.get("summary", ""),
        "content": doc.get("content", ""),
        "image_url": doc.get("image_url", ""),
        "tags": doc.get("tags", []),
        "metadata": doc.get("metadata", {}),
        "pinned": doc.get("pinned", False),
        "is_private": doc.get("is_private", False),
        "map_x": doc.get("map_x"),
        "map_y": doc.get("map_y"),
        "map_id": doc.get("map_id"),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


# ---------------- Auth Endpoints ----------------
@api.post("/auth/login", response_model=UserPublic)
async def login(body: LoginIn, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    uid = str(user["_id"])
    access = create_access_token(uid, email)
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "email": user["email"], "name": user["name"], "role": user["role"]}


@api.post("/auth/register", response_model=UserPublic)
async def register(body: RegisterIn, response: Response):
    email = body.email.lower().strip()
    name = body.name.strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="An account with that email already exists")
    user_doc = {
        "email": email,
        "password_hash": hash_password(body.password),
        "name": name,
        "role": "player",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.users.insert_one(user_doc)
    uid = str(res.inserted_id)
    access = create_access_token(uid, email)
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "email": email, "name": name, "role": "player"}


@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    # Invalidate ALL tokens issued before now for this user
    now_ts = int(datetime.now(timezone.utc).timestamp()) + 1
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"valid_after": now_ts}})
    clear_auth_cookies(response)
    return {"ok": True}


@api.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}


@api.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    rtok = request.cookies.get("refresh_token")
    if not rtok:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(rtok, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        uid = payload["sub"]
        user = await db.users.find_one({"_id": ObjectId(uid)})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        access = create_access_token(uid, user["email"])
        new_refresh = create_refresh_token(uid)
        set_auth_cookies(response, access, new_refresh)
        return {"ok": True}
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


# ---------------- Entry Endpoints ----------------
@api.get("/entries")
async def list_entries(
    category: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 200,
    user: Optional[dict] = Depends(get_optional_user),
):
    query: dict = {}
    if category and category in CATEGORIES:
        query["category"] = category
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"summary": {"$regex": q, "$options": "i"}},
            {"content": {"$regex": q, "$options": "i"}},
            {"tags": {"$regex": q, "$options": "i"}},
        ]
    # Hide DM-only entries from non-admins
    if not user or user.get("role") != "admin":
        query["is_private"] = {"$ne": True}
    cursor = db.entries.find(query, {"_id": 0}).sort([("pinned", -1), ("updated_at", -1)]).limit(limit)
    items = await cursor.to_list(length=limit)
    return [entry_to_out(d) for d in items]


@api.get("/entries/{entry_id}")
async def get_entry(entry_id: str, user: Optional[dict] = Depends(get_optional_user)):
    doc = await db.entries.find_one({"$or": [{"id": entry_id}, {"slug": entry_id}]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Entry not found")
    # Sealed (DM-only) entries return 403 with a "sealed" marker for non-admins so the
    # frontend can render its decorative SealedEntry page instead of a generic 404.
    if doc.get("is_private") and (not user or user.get("role") != "admin"):
        raise HTTPException(status_code=403, detail="sealed")
    return entry_to_out(doc)


@api.post("/entries", response_model=EntryOut)
async def create_entry(body: EntryIn, _user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    eid = str(uuid.uuid4())
    base_slug = slugify(body.title)
    slug = base_slug
    i = 2
    while await db.entries.find_one({"slug": slug}):
        slug = f"{base_slug}-{i}"
        i += 1
    doc = body.model_dump()
    doc.update({"id": eid, "slug": slug, "created_at": now, "updated_at": now})
    await db.entries.insert_one(doc)
    doc.pop("_id", None)
    return entry_to_out(doc)


@api.put("/entries/{entry_id}", response_model=EntryOut)
async def update_entry(entry_id: str, body: EntryIn, _user: dict = Depends(get_current_user)):
    existing = await db.entries.find_one({"id": entry_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Entry not found")
    update = body.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    if update["title"] != existing.get("title"):
        base_slug = slugify(update["title"])
        slug = base_slug
        i = 2
        while await db.entries.find_one({"slug": slug, "id": {"$ne": entry_id}}):
            slug = f"{base_slug}-{i}"
            i += 1
        update["slug"] = slug
    await db.entries.update_one({"id": entry_id}, {"$set": update})
    updated = await db.entries.find_one({"id": entry_id}, {"_id": 0})
    return entry_to_out(updated)


@api.delete("/entries/{entry_id}")
async def delete_entry(entry_id: str, _user: dict = Depends(get_current_user)):
    res = await db.entries.delete_one({"id": entry_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"ok": True}


@api.get("/stats")
async def stats(user: Optional[dict] = Depends(get_optional_user)):
    match: dict = {}
    if not user or user.get("role") != "admin":
        match["is_private"] = {"$ne": True}
    pipeline = []
    if match:
        pipeline.append({"$match": match})
    pipeline.append({"$group": {"_id": "$category", "count": {"$sum": 1}}})
    counts = {c: 0 for c in CATEGORIES}
    async for row in db.entries.aggregate(pipeline):
        if row["_id"] in counts:
            counts[row["_id"]] = row["count"]
    return counts


# ---------------- Settings (singleton) ----------------
DEFAULT_MAP_URL = "https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?auto=format&fit=crop&w=2400&q=80"


class SettingsIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    world_map_url: Optional[str] = None


@api.get("/settings")
async def get_settings():
    doc = await db.settings.find_one({"_id": "global"}, {"_id": 0})
    if not doc:
        return {"world_map_url": DEFAULT_MAP_URL}
    return {"world_map_url": doc.get("world_map_url") or DEFAULT_MAP_URL}


@api.put("/settings")
async def update_settings(body: SettingsIn, _user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    await db.settings.update_one({"_id": "global"}, {"$set": update}, upsert=True)
    return await get_settings()


class MapPositionIn(BaseModel):
    map_x: Optional[float] = None
    map_y: Optional[float] = None
    map_id: Optional[str] = None


# ---------------- Regional Maps ----------------
class RegionalMapIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str = Field(min_length=1, max_length=80)
    subtitle: Optional[str] = ""
    image_url: str = ""
    sort_order: int = 0


def map_to_out(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "slug": doc["slug"],
        "name": doc["name"],
        "subtitle": doc.get("subtitle", ""),
        "image_url": doc.get("image_url", ""),
        "is_default": doc.get("is_default", False),
        "sort_order": doc.get("sort_order", 0),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


async def _make_unique_map_slug(name: str) -> str:
    base = slugify(name) or f"map-{uuid.uuid4().hex[:6]}"
    candidate = base
    i = 2
    while await db.regional_maps.find_one({"slug": candidate}):
        candidate = f"{base}-{i}"
        i += 1
    return candidate


@api.get("/maps")
async def list_maps():
    cursor = db.regional_maps.find({}, {"_id": 0}).sort([("sort_order", 1), ("created_at", 1)])
    items = await cursor.to_list(length=200)
    return [map_to_out(d) for d in items]


@api.get("/maps/{map_id}")
async def get_map(map_id: str):
    doc = await db.regional_maps.find_one({"$or": [{"id": map_id}, {"slug": map_id}]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Map not found")
    return map_to_out(doc)


@api.post("/maps")
async def create_map(body: RegionalMapIn, _user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    mid = str(uuid.uuid4())
    slug = await _make_unique_map_slug(body.name)
    has_any = await db.regional_maps.count_documents({}) > 0
    doc = body.model_dump()
    doc.update({
        "id": mid, "slug": slug, "is_default": not has_any,
        "created_at": now, "updated_at": now,
    })
    await db.regional_maps.insert_one(doc)
    doc.pop("_id", None)
    return map_to_out(doc)


@api.put("/maps/{map_id}")
async def update_map(map_id: str, body: RegionalMapIn, _user: dict = Depends(get_current_user)):
    existing = await db.regional_maps.find_one({"id": map_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Map not found")
    update = body.model_dump()
    # Re-slug if name changed
    if update["name"] != existing.get("name"):
        update["slug"] = await _make_unique_map_slug(update["name"])
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.regional_maps.update_one({"id": map_id}, {"$set": update})
    updated = await db.regional_maps.find_one({"id": map_id}, {"_id": 0})
    return map_to_out(updated)


@api.post("/maps/{map_id}/set_default")
async def set_default_map(map_id: str, _user: dict = Depends(get_current_user)):
    existing = await db.regional_maps.find_one({"id": map_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Map not found")
    await db.regional_maps.update_many({}, {"$set": {"is_default": False}})
    await db.regional_maps.update_one({"id": map_id}, {"$set": {"is_default": True}})
    updated = await db.regional_maps.find_one({"id": map_id}, {"_id": 0})
    return map_to_out(updated)


@api.delete("/maps/{map_id}")
async def delete_map(map_id: str, _user: dict = Depends(get_current_user)):
    existing = await db.regional_maps.find_one({"id": map_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Map not found")
    total = await db.regional_maps.count_documents({})
    if total <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last map")
    # Unpin entries assigned to this map
    await db.entries.update_many(
        {"map_id": map_id},
        {"$set": {"map_id": None, "map_x": None, "map_y": None}},
    )
    await db.regional_maps.delete_one({"id": map_id})
    # If we deleted the default, promote the lowest-sort_order remaining map
    if existing.get("is_default"):
        nxt = await db.regional_maps.find_one({}, sort=[("sort_order", 1), ("created_at", 1)])
        if nxt:
            await db.regional_maps.update_one({"id": nxt["id"]}, {"$set": {"is_default": True}})
    return {"ok": True}


# ---------------- Communal Dice Rolls ----------------
class DieRoll(BaseModel):
    sides: int
    value: int


class DiceRollIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    player_name: str = Field(min_length=1, max_length=40)
    label: str
    rolls: List[DieRoll]
    modifier: int = 0
    total: int
    crit: bool = False
    fumble: bool = False


@api.post("/dice/rolls")
async def post_dice_roll(body: DiceRollIn):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.dice_rolls.insert_one(doc)
    # Keep the collection bounded — drop oldest beyond 200
    count = await db.dice_rolls.count_documents({})
    if count > 200:
        to_drop = count - 200
        old = db.dice_rolls.find({}, {"_id": 1}).sort("created_at", 1).limit(to_drop)
        ids = [d["_id"] async for d in old]
        if ids:
            await db.dice_rolls.delete_many({"_id": {"$in": ids}})
    doc.pop("_id", None)
    return doc


@api.get("/dice/rolls")
async def list_dice_rolls(since: Optional[str] = None, limit: int = 50):
    query: dict = {}
    if since:
        query["created_at"] = {"$gt": since}
    cursor = db.dice_rolls.find(query, {"_id": 0}).sort("created_at", -1).limit(min(max(limit, 1), 200))
    items = await cursor.to_list(length=limit)
    items.reverse()  # chronological order ascending for delta merges
    return items


@api.delete("/dice/rolls")
async def clear_dice_rolls(_user: dict = Depends(get_current_user)):
    res = await db.dice_rolls.delete_many({})
    return {"deleted": res.deleted_count}


# ---------------- Magic Skill Trees ----------------
class MagicNode(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = ""
    icon: Optional[str] = "Sparkles"
    x: float = 0.5
    y: float = 0.5
    requires: List[str] = Field(default_factory=list)
    # Rank progression: max 1-5, current 0..max
    max_rank: Optional[int] = 1
    current_rank: Optional[int] = 0
    # Visual: small/normal/large/huge changes the rendered size
    tier_size: Optional[str] = "normal"
    # Optional color override (defaults to the tree's accent_color)
    color: Optional[str] = None
    # Optional per-rank descriptions ("rank 1: …", "rank 2: …")
    rank_descriptions: Optional[List[str]] = Field(default_factory=list)
    # Minimum character level required to unlock this node
    level_required: Optional[int] = None


class MagicTreeIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    subtitle: Optional[str] = ""
    summary: Optional[str] = ""
    content: Optional[str] = ""
    accent_color: Optional[str] = "#FBBF24"
    image_url: Optional[str] = ""
    tree_category: Literal["origin", "foundation", "class"] = "origin"
    nodes: List[MagicNode] = Field(default_factory=list)


def magic_to_out(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "slug": doc["slug"],
        "name": doc["name"],
        "subtitle": doc.get("subtitle", ""),
        "summary": doc.get("summary", ""),
        "content": doc.get("content", ""),
        "accent_color": doc.get("accent_color", "#FBBF24"),
        "image_url": doc.get("image_url", ""),
        "tree_category": doc.get("tree_category", "origin"),
        "nodes": doc.get("nodes", []),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


@api.get("/magic/trees")
async def list_magic_trees():
    cursor = db.magic_trees.find({}, {"_id": 0}).sort("updated_at", -1)
    items = await cursor.to_list(length=200)
    return [magic_to_out(d) for d in items]


@api.get("/magic/trees/{tree_id}")
async def get_magic_tree(tree_id: str):
    doc = await db.magic_trees.find_one({"$or": [{"id": tree_id}, {"slug": tree_id}]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Tree not found")
    return magic_to_out(doc)


@api.post("/magic/trees")
async def create_magic_tree(body: MagicTreeIn, _user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    tid = str(uuid.uuid4())
    base_slug = slugify(body.name)
    slug = base_slug
    i = 2
    while await db.magic_trees.find_one({"slug": slug}):
        slug = f"{base_slug}-{i}"
        i += 1
    doc = body.model_dump()
    doc.update({"id": tid, "slug": slug, "created_at": now, "updated_at": now})
    await db.magic_trees.insert_one(doc)
    doc.pop("_id", None)
    return magic_to_out(doc)


@api.put("/magic/trees/{tree_id}")
async def update_magic_tree(tree_id: str, body: MagicTreeIn, _user: dict = Depends(get_current_user)):
    existing = await db.magic_trees.find_one({"id": tree_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Tree not found")
    update = body.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    if update["name"] != existing.get("name"):
        base_slug = slugify(update["name"])
        slug = base_slug
        i = 2
        while await db.magic_trees.find_one({"slug": slug, "id": {"$ne": tree_id}}):
            slug = f"{base_slug}-{i}"
            i += 1
        update["slug"] = slug
    await db.magic_trees.update_one({"id": tree_id}, {"$set": update})
    updated = await db.magic_trees.find_one({"id": tree_id}, {"_id": 0})
    return magic_to_out(updated)


@api.delete("/magic/trees/{tree_id}")
async def delete_magic_tree(tree_id: str, _user: dict = Depends(get_current_user)):
    res = await db.magic_trees.delete_one({"id": tree_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tree not found")
    return {"ok": True}


# ---------------- Session Scheduler ----------------
class SessionRSVP(BaseModel):
    model_config = ConfigDict(extra="ignore")
    player_name: str = Field(min_length=1, max_length=40)
    status: Literal["yes", "maybe", "no"]
    comment: Optional[str] = ""


class SessionScheduleIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str
    scheduled_at: str  # ISO datetime
    duration_minutes: int = 180
    location: Optional[str] = ""
    notes: Optional[str] = ""
    status: Literal["planned", "cancelled", "completed"] = "planned"


def session_to_out(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "title": doc["title"],
        "scheduled_at": doc["scheduled_at"],
        "duration_minutes": doc.get("duration_minutes", 180),
        "location": doc.get("location", ""),
        "notes": doc.get("notes", ""),
        "status": doc.get("status", "planned"),
        "rsvps": doc.get("rsvps", []),
        "comments_locked": doc.get("comments_locked", False),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


@api.get("/sessions")
async def list_sessions():
    cursor = db.scheduled_sessions.find({}, {"_id": 0}).sort("scheduled_at", 1)
    items = await cursor.to_list(length=500)
    return [session_to_out(d) for d in items]


@api.get("/sessions/{session_id}")
async def get_session(session_id: str):
    doc = await db.scheduled_sessions.find_one({"id": session_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    return session_to_out(doc)


@api.post("/sessions")
async def create_session(body: SessionScheduleIn, _user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    sid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({"id": sid, "rsvps": [], "created_at": now, "updated_at": now})
    await db.scheduled_sessions.insert_one(doc)
    doc.pop("_id", None)
    return session_to_out(doc)


@api.put("/sessions/{session_id}")
async def update_session(session_id: str, body: SessionScheduleIn, _user: dict = Depends(get_current_user)):
    existing = await db.scheduled_sessions.find_one({"id": session_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Session not found")
    update = body.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.scheduled_sessions.update_one({"id": session_id}, {"$set": update})
    updated = await db.scheduled_sessions.find_one({"id": session_id}, {"_id": 0})
    return session_to_out(updated)


@api.delete("/sessions/{session_id}")
async def delete_session(session_id: str, _user: dict = Depends(get_current_user)):
    res = await db.scheduled_sessions.delete_one({"id": session_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@api.post("/sessions/{session_id}/rsvp")
async def post_rsvp(session_id: str, body: SessionRSVP):
    session = await db.scheduled_sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    rsvps = [r for r in session.get("rsvps", []) if r.get("player_name", "").lower() != body.player_name.lower()]
    rsvps.append({"player_name": body.player_name.strip(), "status": body.status, "comment": body.comment or "", "updated_at": datetime.now(timezone.utc).isoformat()})
    await db.scheduled_sessions.update_one(
        {"id": session_id},
        {"$set": {"rsvps": rsvps, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    updated = await db.scheduled_sessions.find_one({"id": session_id}, {"_id": 0})
    return session_to_out(updated)


@api.delete("/sessions/{session_id}/rsvp")
async def delete_rsvp(session_id: str, player_name: str):
    session = await db.scheduled_sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    rsvps = [r for r in session.get("rsvps", []) if r.get("player_name", "").lower() != player_name.lower()]
    await db.scheduled_sessions.update_one(
        {"id": session_id},
        {"$set": {"rsvps": rsvps, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    updated = await db.scheduled_sessions.find_one({"id": session_id}, {"_id": 0})
    return session_to_out(updated)


# ---------------- Session Comments ----------------
class SessionCommentIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body: str = Field(min_length=1, max_length=4000)


def comment_to_out(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "session_id": doc["session_id"],
        "author_id": doc.get("author_id"),
        "author_name": doc.get("author_name", "Wanderer"),
        "author_role": doc.get("author_role", "player"),
        "body": doc.get("body", ""),
        "pinned": doc.get("pinned", False),
        "edited": doc.get("edited", False),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


@api.get("/sessions/{session_id}/comments")
async def list_comments(session_id: str):
    session = await db.scheduled_sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    cursor = db.session_comments.find(
        {"session_id": session_id, "deleted": {"$ne": True}}, {"_id": 0}
    ).sort([("pinned", -1), ("created_at", 1)])
    items = await cursor.to_list(length=500)
    return {
        "session_id": session_id,
        "comments_locked": session.get("comments_locked", False),
        "comments": [comment_to_out(d) for d in items],
    }


@api.post("/sessions/{session_id}/comments")
async def post_comment(session_id: str, body: SessionCommentIn, user: dict = Depends(get_current_user)):
    session = await db.scheduled_sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("comments_locked") and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Comments are sealed for this session")
    now = datetime.now(timezone.utc).isoformat()
    cid = str(uuid.uuid4())
    doc = {
        "id": cid,
        "session_id": session_id,
        "author_id": user["id"],
        "author_name": user.get("name") or user.get("email") or "Wanderer",
        "author_role": user.get("role", "player"),
        "body": body.body.strip(),
        "pinned": False,
        "edited": False,
        "deleted": False,
        "created_at": now,
        "updated_at": now,
    }
    await db.session_comments.insert_one(doc)
    return comment_to_out(doc)


@api.put("/sessions/{session_id}/comments/{comment_id}")
async def edit_comment(session_id: str, comment_id: str, body: SessionCommentIn, user: dict = Depends(get_current_user)):
    doc = await db.session_comments.find_one({"id": comment_id, "session_id": session_id})
    if not doc or doc.get("deleted"):
        raise HTTPException(status_code=404, detail="Comment not found")
    # Author can edit own; admin can edit any
    if doc.get("author_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the author or the Lanternkeeper may edit this")
    now = datetime.now(timezone.utc).isoformat()
    await db.session_comments.update_one(
        {"id": comment_id},
        {"$set": {"body": body.body.strip(), "edited": True, "updated_at": now}},
    )
    updated = await db.session_comments.find_one({"id": comment_id}, {"_id": 0})
    return comment_to_out(updated)


@api.delete("/sessions/{session_id}/comments/{comment_id}")
async def delete_comment(session_id: str, comment_id: str, user: dict = Depends(get_current_user)):
    doc = await db.session_comments.find_one({"id": comment_id, "session_id": session_id})
    if not doc or doc.get("deleted"):
        raise HTTPException(status_code=404, detail="Comment not found")
    if doc.get("author_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the author or the Lanternkeeper may delete this")
    await db.session_comments.update_one({"id": comment_id}, {"$set": {"deleted": True}})
    return {"ok": True}


@api.post("/sessions/{session_id}/comments/{comment_id}/pin")
async def toggle_pin_comment(session_id: str, comment_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the Lanternkeeper may pin comments")
    doc = await db.session_comments.find_one({"id": comment_id, "session_id": session_id})
    if not doc or doc.get("deleted"):
        raise HTTPException(status_code=404, detail="Comment not found")
    new_state = not doc.get("pinned", False)
    await db.session_comments.update_one({"id": comment_id}, {"$set": {"pinned": new_state}})
    updated = await db.session_comments.find_one({"id": comment_id}, {"_id": 0})
    return comment_to_out(updated)


@api.post("/sessions/{session_id}/lock_comments")
async def toggle_session_lock(session_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the Lanternkeeper may lock comments")
    session = await db.scheduled_sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    new_state = not session.get("comments_locked", False)
    await db.scheduled_sessions.update_one(
        {"id": session_id},
        {"$set": {"comments_locked": new_state, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    updated = await db.scheduled_sessions.find_one({"id": session_id}, {"_id": 0})
    return session_to_out(updated)


# ---------------- Player-Owned PCs (Public, ownership by player_name) ----------------
class PlayerCharacterIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    player_name: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=80)
    subtitle: Optional[str] = ""
    summary: Optional[str] = ""
    content: Optional[str] = ""
    image_url: Optional[str] = ""
    race: Optional[str] = ""
    char_class: Optional[str] = ""
    level: Optional[int] = 1
    alignment: Optional[str] = ""
    pronouns: Optional[str] = ""
    # --- 5e SRD fields (all optional so legacy editor still works) ---
    race_id: Optional[str] = None
    class_id: Optional[str] = None
    background: Optional[str] = ""
    ability_scores: Optional[dict] = None  # {str, dex, con, int, wis, cha}
    max_hp: Optional[int] = None
    current_hp: Optional[int] = None
    armor_class: Optional[int] = None
    speed: Optional[int] = None
    proficiencies: Optional[List[str]] = None  # skill names
    saving_throws: Optional[List[str]] = None  # ability names
    languages: Optional[List[str]] = None
    spells_known: Optional[List[str]] = None   # spell names or ids
    spell_slots: Optional[dict] = None          # {1: {max, used}, ...}
    equipment: Optional[List[str]] = None
    features: Optional[List[str]] = None


async def _is_admin(request: Request) -> bool:
    user = await get_optional_user(request)
    return bool(user and user.get("role") == "admin")


@api.post("/pcs")
async def create_pc(body: PlayerCharacterIn, request: Request):
    current = await get_optional_user(request)
    # Signed-in users own through their account; anonymous fall back to player_name
    owner_name = (current["name"] if current else body.player_name).strip()
    user_id = current["id"] if current else None

    now = datetime.now(timezone.utc).isoformat()
    eid = str(uuid.uuid4())
    base_slug = slugify(body.name)
    slug = base_slug
    i = 2
    while await db.entries.find_one({"slug": slug}):
        slug = f"{base_slug}-{i}"
        i += 1

    metadata = {
        "role": "PC",
        "owner": owner_name,
        "race": body.race or "",
        "class": body.char_class or "",
        "level": body.level or 1,
        "alignment": body.alignment or "",
        "pronouns": body.pronouns or "",
        "race_id": body.race_id or "",
        "class_id": body.class_id or "",
        "background": body.background or "",
        "ability_scores": body.ability_scores or {},
        "max_hp": body.max_hp,
        "current_hp": body.current_hp,
        "armor_class": body.armor_class,
        "speed": body.speed,
        "proficiencies": body.proficiencies or [],
        "saving_throws": body.saving_throws or [],
        "languages": body.languages or [],
        "spells_known": body.spells_known or [],
        "spell_slots": body.spell_slots or {},
        "equipment": body.equipment or [],
        "features": body.features or [],
    }
    if user_id:
        metadata["user_id"] = user_id
    metadata = {k: v for k, v in metadata.items() if v not in ("", None, [], {})}

    doc = {
        "id": eid,
        "slug": slug,
        "category": "character",
        "title": body.name.strip(),
        "subtitle": body.subtitle or "",
        "summary": body.summary or "",
        "content": body.content or "",
        "image_url": body.image_url or "",
        "tags": ["pc", "player-character"],
        "metadata": metadata,
        "pinned": False,
        "created_at": now,
        "updated_at": now,
    }
    await db.entries.insert_one(doc)
    doc.pop("_id", None)
    return entry_to_out(doc)


def _can_modify_pc(entry: dict, current: Optional[dict], player_name: str) -> bool:
    if current and current.get("role") == "admin":
        return True
    meta = entry.get("metadata") or {}
    if current and meta.get("user_id") and meta.get("user_id") == current.get("id"):
        return True
    owner = (meta.get("owner") or "").strip().lower()
    return bool(owner and player_name and owner == player_name.strip().lower())


@api.put("/pcs/{entry_id}")
async def update_pc(entry_id: str, body: PlayerCharacterIn, request: Request):
    existing = await db.entries.find_one({"id": entry_id, "category": "character"})
    if not existing:
        raise HTTPException(status_code=404, detail="Character not found")
    current = await get_optional_user(request)
    if not _can_modify_pc(existing, current, body.player_name):
        raise HTTPException(status_code=403, detail="Only the character's player or a DM can edit this character")

    metadata = {**(existing.get("metadata") or {})}
    metadata.update({
        "role": "PC",
        "owner": metadata.get("owner") or (current["name"] if current else body.player_name.strip()),
        "race": body.race or metadata.get("race", ""),
        "class": body.char_class or metadata.get("class", ""),
        "level": body.level if body.level is not None else metadata.get("level", 1),
        "alignment": body.alignment or metadata.get("alignment", ""),
        "pronouns": body.pronouns or metadata.get("pronouns", ""),
    })
    # 5e fields — replace when client sends them (even empty list means "cleared")
    for k, v in {
        "race_id": body.race_id,
        "class_id": body.class_id,
        "background": body.background,
        "ability_scores": body.ability_scores,
        "max_hp": body.max_hp,
        "current_hp": body.current_hp,
        "armor_class": body.armor_class,
        "speed": body.speed,
        "proficiencies": body.proficiencies,
        "saving_throws": body.saving_throws,
        "languages": body.languages,
        "spells_known": body.spells_known,
        "spell_slots": body.spell_slots,
        "equipment": body.equipment,
        "features": body.features,
    }.items():
        if v is not None:
            metadata[k] = v
    if current and not metadata.get("user_id"):
        metadata["user_id"] = current["id"]
    metadata = {k: v for k, v in metadata.items() if v not in ("", None)}

    update = {
        "title": body.name.strip(),
        "subtitle": body.subtitle or "",
        "summary": body.summary or "",
        "content": body.content or "",
        "image_url": body.image_url or "",
        "metadata": metadata,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if update["title"] != existing.get("title"):
        base_slug = slugify(update["title"])
        slug = base_slug
        i = 2
        while await db.entries.find_one({"slug": slug, "id": {"$ne": entry_id}}):
            slug = f"{base_slug}-{i}"
            i += 1
        update["slug"] = slug
    await db.entries.update_one({"id": entry_id}, {"$set": update})
    updated = await db.entries.find_one({"id": entry_id}, {"_id": 0})
    return entry_to_out(updated)


@api.delete("/pcs/{entry_id}")
async def delete_pc(entry_id: str, request: Request, player_name: str = ""):
    existing = await db.entries.find_one({"id": entry_id, "category": "character"})
    if not existing:
        raise HTTPException(status_code=404, detail="Character not found")
    current = await get_optional_user(request)
    if not _can_modify_pc(existing, current, player_name):
        raise HTTPException(status_code=403, detail="Only the character's player or a DM can delete this character")
    await db.entries.delete_one({"id": entry_id})
    return {"ok": True}


@api.get("/me/pcs")
async def my_pcs(user: dict = Depends(get_current_user)):
    cursor = db.entries.find(
        {"category": "character", "metadata.user_id": user["id"]},
        {"_id": 0},
    ).sort("updated_at", -1)
    items = await cursor.to_list(length=100)
    return [entry_to_out(d) for d in items]


# ---------------- D&D 5e Rules Library ----------------
from dnd_srd import RACES as SRD_RACES, CLASSES as SRD_CLASSES, SPELLS as SRD_SPELLS, SKILLS as SRD_SKILLS, SPELL_SLOTS_FULL  # noqa: E402

RULES_COLLECTIONS = {
    "races": "rules_races",
    "classes": "rules_classes",
    "spells": "rules_spells",
    "skills": "rules_skills",
}


def _strip_rules_doc(d: dict) -> dict:
    d.pop("_id", None)
    return d


@api.get("/rules/_computed/spell_slots")
async def spell_slots_table():
    return SPELL_SLOTS_FULL


@api.get("/rules/{kind}")
async def list_rules(kind: str):
    coll = RULES_COLLECTIONS.get(kind)
    if not coll:
        raise HTTPException(status_code=404, detail="Unknown rule kind")
    cursor = db[coll].find({}, {"_id": 0}).sort("name", 1)
    items = await cursor.to_list(length=2000)
    return items


@api.get("/rules/{kind}/{rule_id}")
async def get_rule(kind: str, rule_id: str):
    coll = RULES_COLLECTIONS.get(kind)
    if not coll:
        raise HTTPException(status_code=404, detail="Unknown rule kind")
    doc = await db[coll].find_one({"id": rule_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc


@api.post("/rules/{kind}")
async def create_rule(kind: str, body: dict, _user: dict = Depends(get_current_user)):
    coll = RULES_COLLECTIONS.get(kind)
    if not coll:
        raise HTTPException(status_code=404, detail="Unknown rule kind")
    if not body.get("name"):
        raise HTTPException(status_code=400, detail="name is required")
    doc = {**body, "id": str(uuid.uuid4()), "source": body.get("source", "homebrew"), "created_at": datetime.now(timezone.utc).isoformat()}
    await db[coll].insert_one(doc)
    return _strip_rules_doc(doc)


@api.put("/rules/{kind}/{rule_id}")
async def update_rule(kind: str, rule_id: str, body: dict, _user: dict = Depends(get_current_user)):
    coll = RULES_COLLECTIONS.get(kind)
    if not coll:
        raise HTTPException(status_code=404, detail="Unknown rule kind")
    existing = await db[coll].find_one({"id": rule_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    body.pop("id", None)
    body["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db[coll].update_one({"id": rule_id}, {"$set": body})
    updated = await db[coll].find_one({"id": rule_id}, {"_id": 0})
    return updated


@api.delete("/rules/{kind}/{rule_id}")
async def delete_rule(kind: str, rule_id: str, _user: dict = Depends(get_current_user)):
    coll = RULES_COLLECTIONS.get(kind)
    if not coll:
        raise HTTPException(status_code=404, detail="Unknown rule kind")
    res = await db[coll].delete_one({"id": rule_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


async def seed_rules():
    if await db.rules_skills.count_documents({}) == 0:
        for s in SRD_SKILLS:
            await db.rules_skills.insert_one({**s, "id": str(uuid.uuid4()), "source": "srd"})
    if await db.rules_races.count_documents({}) == 0:
        for r in SRD_RACES:
            await db.rules_races.insert_one({**r, "id": str(uuid.uuid4()), "source": "srd"})
    if await db.rules_classes.count_documents({}) == 0:
        for c in SRD_CLASSES:
            await db.rules_classes.insert_one({**c, "id": str(uuid.uuid4()), "source": "srd"})
    if await db.rules_spells.count_documents({}) == 0:
        for s in SRD_SPELLS:
            await db.rules_spells.insert_one({**s, "id": str(uuid.uuid4()), "source": "srd"})
    logger.info("Seeded D&D 5e rules library")


async def seed_default_map():
    # If a map already exists, nothing to do.
    if await db.regional_maps.count_documents({}) > 0:
        return
    # Migrate the single legacy world_map_url (from settings) into a default map.
    settings_doc = await db.settings.find_one({"_id": "global"}, {"_id": 0})
    image_url = (settings_doc or {}).get("world_map_url") or DEFAULT_MAP_URL
    now = datetime.now(timezone.utc).isoformat()
    default_id = str(uuid.uuid4())
    default_doc = {
        "id": default_id,
        "slug": "lantern-realm",
        "name": "The Lantern Realm",
        "subtitle": "The known world, mapped in ink and ember",
        "image_url": image_url,
        "is_default": True,
        "sort_order": 0,
        "created_at": now,
        "updated_at": now,
    }
    await db.regional_maps.insert_one(default_doc)
    # Backfill: every already-placed location entry inherits the default map
    await db.entries.update_many(
        {"category": "location", "map_x": {"$ne": None}, "map_id": None},
        {"$set": {"map_id": default_id}},
    )
    logger.info("Seeded default regional map and migrated existing placements")


@api.put("/entries/{entry_id}/position")
async def set_position(entry_id: str, body: MapPositionIn, _user: dict = Depends(get_current_user)):
    existing = await db.entries.find_one({"id": entry_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Entry not found")
    update = {
        "map_x": body.map_x,
        "map_y": body.map_y,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    # Allow clearing or re-assigning the map via the same endpoint
    if body.map_id is not None:
        update["map_id"] = body.map_id or None
    elif body.map_x is None and body.map_y is None:
        # Removing position also clears map assignment for clarity
        update["map_id"] = None
    await db.entries.update_one({"id": entry_id}, {"$set": update})
    updated = await db.entries.find_one({"id": entry_id}, {"_id": 0})
    return entry_to_out(updated)


# ---------------- Seeding ----------------
async def seed_admins():
    seeds = [
        ("ADMIN_EMAIL", "ADMIN_PASSWORD", "ADMIN_NAME", "dm@lantern.realm", "lantern-keeper-1", "Dungeon Master"),
        ("CO_DM_EMAIL", "CO_DM_PASSWORD", "CO_DM_NAME", "codm@lantern.realm", "lantern-keeper-2", "Co-DM"),
    ]
    for email_key, pwd_key, name_key, def_email, def_pwd, def_name in seeds:
        email = os.environ.get(email_key, def_email).lower().strip()
        password = os.environ.get(pwd_key, def_pwd)
        name = os.environ.get(name_key, def_name)
        existing = await db.users.find_one({"email": email})
        if not existing:
            await db.users.insert_one({
                "email": email,
                "password_hash": hash_password(password),
                "name": name,
                "role": "admin",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"Seeded admin {email}")
        elif not verify_password(password, existing["password_hash"]):
            await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password)}})
            logger.info(f"Updated admin password for {email}")


SEED_ENTRIES = [
    {
        "category": "overview",
        "title": "The Lantern Realm",
        "subtitle": "A world reclaimed by root and rust",
        "summary": "Centuries after the Sundering, civilization survives only in fragments — small kingdoms tethered together by old roads, ember-lit shrines, and the unbroken chain of Lanternkeepers.",
        "content": "When the gods withdrew their light, the forests came forward. Cities crumbled beneath ivy. Towers sank into moss-thick earth. What remains of humankind huddles around lanterns — copper, brass, and bone — passed hand to hand across generations.\n\nTo carry a lantern is to remember; to let one go dark is to be forgotten. The Lantern Realm is a campaign world built on three currents: the slow violence of nature reclaiming stone, the politics of small kingdoms scrabbling over the last roads, and the quiet faith of those who keep the lanterns burning.",
        "image_url": "https://images.pexels.com/photos/20461910/pexels-photo-20461910.jpeg",
        "tags": ["lore", "intro"],
        "metadata": {},
        "pinned": True,
    },
    {
        "category": "location",
        "title": "Mirewatch",
        "subtitle": "A drowning city of lanterns",
        "summary": "Built on stilts above the swallowing fens, Mirewatch is the last great trading post before the Hollow Roads.",
        "content": "The boards never stop creaking. Every plank in Mirewatch is wet with marsh and lantern oil. The city is ruled by the Council of Wicks, twelve elders chosen for the brightness of their hearth-fires.",
        "image_url": "https://images.pexels.com/photos/323340/pexels-photo-323340.jpeg",
        "tags": ["city", "swamp"],
        "metadata": {"region": "The Drowning Fens", "population": "~8,400"},
        "pinned": True,
        "map_x": 38.5,
        "map_y": 62.0,
    },
    {
        "category": "character",
        "title": "Vael Ashen",
        "subtitle": "Lanternkeeper of the Sunken Road",
        "summary": "A weathered ranger sworn to keep the wayshrines lit between Mirewatch and the ruined capital.",
        "content": "Vael has walked the Sunken Road for thirty winters. She speaks little, but the lanterns along her path have not failed once in her tenure.",
        "image_url": "https://images.pexels.com/photos/26178754/pexels-photo-26178754.jpeg",
        "tags": ["npc", "ally"],
        "metadata": {"role": "NPC", "race": "Half-elf", "class": "Ranger"},
        "pinned": False,
    },
    {
        "category": "faction",
        "title": "The Order of Wicks",
        "subtitle": "Keepers of the unbroken flame",
        "summary": "A monastic order tasked with tending every wayshrine, watchtower lantern, and funeral candle across the Realm.",
        "content": "Founded after the Sundering, the Order treats fire as a sacrament. Their initiates are bound by a single vow: 'No lantern shall go dark by my hand or my neglect.'",
        "image_url": "https://images.pexels.com/photos/20461910/pexels-photo-20461910.jpeg",
        "tags": ["order", "religious"],
        "metadata": {"alignment": "Lawful Neutral", "headquarters": "The Brass Cloister"},
        "pinned": True,
    },
    {
        "category": "lore",
        "title": "The Sundering",
        "subtitle": "Year 0 of the Long Dusk",
        "summary": "The day the gods turned their faces, the sky cracked, and the forests began to march.",
        "content": "No mortal saw the moment it began. Scholars argue still — was it divine punishment, a slumber, an exile? What is certain is that within a single year, the great cities of the High Reach fell to root and ruin.",
        "image_url": "",
        "tags": ["event", "cataclysm"],
        "metadata": {"era": "Year 0 LD"},
        "pinned": False,
    },
    {
        "category": "session",
        "title": "Session 01 — Embers on the Sunken Road",
        "subtitle": "The party meets Vael",
        "summary": "Hired to escort a lantern relic from Mirewatch to the Brass Cloister, the party tangles with bog-stalkers on the first night.",
        "content": "Notable moments: Thorne nearly drowned. Mira parlayed with a moss-druid. The lantern was nearly extinguished by a sudden rain — saved by Vael's cloak.",
        "image_url": "",
        "tags": ["session", "act-1"],
        "metadata": {"session_number": 1, "date_played": "2025-11-02"},
        "pinned": False,
    },
    {
        "category": "bestiary",
        "title": "Bog-Stalker",
        "subtitle": "Predator of the Drowning Fens",
        "summary": "A long-limbed amphibian ambush hunter that mimics the flicker of distant lanterns to lure travelers.",
        "content": "Bog-stalkers possess a bioluminescent lure on their tongue. They favor wet, foggy nights and can hold their breath for hours beneath the surface.",
        "image_url": "",
        "tags": ["beast", "swamp"],
        "metadata": {"cr": "3", "type": "Monstrosity", "size": "Large"},
        "pinned": False,
    },
]


async def seed_entries():
    count = await db.entries.count_documents({})
    if count > 0:
        return
    now = datetime.now(timezone.utc).isoformat()
    for e in SEED_ENTRIES:
        eid = str(uuid.uuid4())
        slug = slugify(e["title"])
        doc = {**e, "id": eid, "slug": slug, "created_at": now, "updated_at": now}
        await db.entries.insert_one(doc)
    logger.info("Seeded starter entries")


SEED_MAGIC_TREES = [
    {
        "name": "Wickfire",
        "subtitle": "The disciplined flame",
        "summary": "The first and oldest of the Realm's sanctioned schools, taught in the Brass Cloister. Wickfire shapes lantern-fire into tools — for light, for warmth, for the burning of unclean things.",
        "content": "Wickfire practitioners begin by tending a single flame for a year and a day. Only then are they shown how to shape it.",
        "accent_color": "#FBBF24",
        "image_url": "",
        "tree_category": "origin",
        "nodes": [
            {"id": "n1", "name": "Tend the Wick", "description": "The initiate's first cantrip. Light or extinguish any small flame within sight.", "icon": "Flame", "x": 0.5, "y": 0.10, "requires": []},
            {"id": "n2", "name": "Lantern Eye", "description": "See clearly in lantern-light up to 60 feet, even through fog or smoke.", "icon": "Eye", "x": 0.28, "y": 0.32, "requires": ["n1"]},
            {"id": "n3", "name": "Steady Flame", "description": "Your tended flames cannot be put out by wind or rain for one hour.", "icon": "Shield", "x": 0.72, "y": 0.32, "requires": ["n1"]},
            {"id": "n4", "name": "Wayshrine Sense", "description": "You always know the direction of the nearest lit wayshrine.", "icon": "Compass", "x": 0.15, "y": 0.55, "requires": ["n2"]},
            {"id": "n5", "name": "Ember Bolt", "description": "Hurl a mote of wickfire as a ranged attack (1d8 fire). Lights a torch on hit.", "icon": "Zap", "x": 0.42, "y": 0.55, "requires": ["n2", "n3"]},
            {"id": "n6", "name": "Brass Ward", "description": "Trace a circle of wickfire that undead and bog-stalkers will not cross.", "icon": "Sparkles", "x": 0.85, "y": 0.55, "requires": ["n3"]},
            {"id": "n7", "name": "Cleansing Pyre", "description": "Summon a pillar of pale fire that burns only what is unclean.", "icon": "Sun", "x": 0.5, "y": 0.82, "requires": ["n5", "n6"]},
        ],
    },
    {
        "name": "Mossblood",
        "subtitle": "What the forest remembers",
        "summary": "Outlawed in three kingdoms and revered in the rest. Mossblood is the magic of root, mycelium, and the long memory of trees.",
        "content": "Practitioners drink a tea of crushed shrine-moss. Most do not return from the first dream. Those who do speak to the forests differently afterward.",
        "accent_color": "#4A7C59",
        "image_url": "",
        "tree_category": "origin",
        "nodes": [
            {"id": "m1", "name": "Greenwhisper", "description": "Speak with any plant for one minute. Most have little to say.", "icon": "Leaf", "x": 0.5, "y": 0.10, "requires": []},
            {"id": "m2", "name": "Vine-Step", "description": "Vines and roots part to let you walk silently through dense undergrowth.", "icon": "Footprints", "x": 0.3, "y": 0.35, "requires": ["m1"]},
            {"id": "m3", "name": "Moss-Knit", "description": "Mend a wound with a poultice of shrine-moss (heals 2d4 + tier).", "icon": "Heart", "x": 0.7, "y": 0.35, "requires": ["m1"]},
            {"id": "m4", "name": "Long Memory", "description": "Touch a tree older than fifty years and see one event it witnessed.", "icon": "BookOpen", "x": 0.5, "y": 0.62, "requires": ["m2", "m3"]},
            {"id": "m5", "name": "Verdant Call", "description": "Summon a host of crows, foxes, or mushroom-spites to your aid for one scene.", "icon": "Bird", "x": 0.5, "y": 0.85, "requires": ["m4"]},
        ],
    },
    {
        "name": "The Sundered Lantern",
        "subtitle": "A constellation of the Long Dusk",
        "summary": "Among the foundation constellations — wheels of stars older than any kingdom. The Sundered Lantern grants light to those who walk between memory and rumor.",
        "content": "Each star is an aspect. Drawing power from a star asks something in trade: a name, a season of sleep, a dream you would rather forget.",
        "accent_color": "#A78BFA",
        "image_url": "",
        "tree_category": "foundation",
        "nodes": [
            {"id": "s1", "name": "The Wick", "description": "The first star. A small, steady light that cannot be extinguished by living hand.", "icon": "Flame", "x": 0.5, "y": 0.12, "requires": []},
            {"id": "s2", "name": "The Smoke", "description": "Reach the second star to obscure your passage from one who watches you.", "icon": "Wind", "x": 0.25, "y": 0.38, "requires": ["s1"]},
            {"id": "s3", "name": "The Shadow", "description": "The third star. Cast a shadow that is not your own — it walks where you cannot.", "icon": "Moon", "x": 0.75, "y": 0.38, "requires": ["s1"]},
            {"id": "s4", "name": "The Glass", "description": "See a moment that has already happened, once, never twice.", "icon": "Eye", "x": 0.5, "y": 0.65, "requires": ["s2", "s3"]},
            {"id": "s5", "name": "The Eclipse", "description": "Become unseen for as long as the lantern guttering at the heart of you holds.", "icon": "Star", "x": 0.5, "y": 0.88, "requires": ["s4"]},
        ],
    },
]


async def seed_magic_trees():
    count = await db.magic_trees.count_documents({})
    # Backfill any pre-existing trees without a category
    await db.magic_trees.update_many({"tree_category": {"$exists": False}}, {"$set": {"tree_category": "origin"}})

    # Expanded versions — auto-upgrade if the user hasn't customized
    EXPANDED = {
        "Wickfire": _wickfire_nodes(),
        "Mossblood": _mossblood_nodes(),
        "The Sundered Lantern": _sundered_lantern_nodes(),
    }
    OLD_COUNTS = {"Wickfire": 7, "Mossblood": 5, "The Sundered Lantern": 5}
    for name, new_nodes in EXPANDED.items():
        existing = await db.magic_trees.find_one({"name": name})
        if existing and len(existing.get("nodes", [])) == OLD_COUNTS.get(name):
            await db.magic_trees.update_one(
                {"id": existing["id"]},
                {"$set": {"nodes": new_nodes, "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
            logger.info(f"Upgraded {name} to {len(new_nodes)} nodes")

    # Insert the starter Class tree if missing
    if not await db.magic_trees.find_one({"slug": "wickwarden"}):
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": str(uuid.uuid4()), "slug": "wickwarden", "name": "Wickwarden",
            "subtitle": "Class skill path — Defender of the Flame",
            "summary": "The class skill tree for those who walk the road with a lantern and a vow.",
            "content": "Wickwardens are the militant arm of the Order of Wicks — pilgrims and protectors who shield the flame against the dark.",
            "accent_color": "#F97316", "image_url": "", "tree_category": "class",
            "nodes": _wickwarden_nodes(),
            "created_at": now, "updated_at": now,
        }
        await db.magic_trees.insert_one(doc)
        logger.info("Seeded Wickwarden class tree")

    if count > 0:
        if not await db.magic_trees.find_one({"slug": "the-sundered-lantern"}):
            now = datetime.now(timezone.utc).isoformat()
            const = next((t for t in SEED_MAGIC_TREES if t["name"] == "The Sundered Lantern"), None)
            if const:
                doc = {**const, "id": str(uuid.uuid4()), "slug": slugify(const["name"]), "created_at": now, "updated_at": now}
                await db.magic_trees.insert_one(doc)
                logger.info("Seeded foundation constellation")
        return
    now = datetime.now(timezone.utc).isoformat()
    for t in SEED_MAGIC_TREES:
        tid = str(uuid.uuid4())
        slug = slugify(t["name"])
        doc = {**t, "id": tid, "slug": slug, "created_at": now, "updated_at": now}
        await db.magic_trees.insert_one(doc)
    logger.info("Seeded starter magic trees")


def _node(nid, name, desc, icon, x, y, req=None):
    return {"id": nid, "name": name, "description": desc, "icon": icon, "x": x, "y": y, "requires": req or []}


def _wickfire_nodes():
    return [
        _node("w1", "Tend the Wick", "Light or extinguish any small flame in sight. The first cantrip.", "Flame", 0.50, 0.06),
        # Tier 1
        _node("w2a", "Lantern Eye", "See clearly in lantern-light up to 60 ft, even through fog or smoke.", "Eye", 0.22, 0.20, ["w1"]),
        _node("w2b", "Steady Flame", "Your tended flames cannot be extinguished by wind or rain for one hour.", "Shield", 0.50, 0.20, ["w1"]),
        _node("w2c", "Spark of Speech", "Cause any single candle, lantern or hearth-fire to gutter in time with your words.", "Wind", 0.78, 0.20, ["w1"]),
        # Tier 2
        _node("w3a", "Wayshrine Sense", "You always know the direction of the nearest lit wayshrine.", "Compass", 0.10, 0.36, ["w2a"]),
        _node("w3b", "Ember Bolt", "Hurl a mote of wickfire (1d8 fire). Lights torches on hit.", "Zap", 0.32, 0.36, ["w2a", "w2b"]),
        _node("w3c", "Hearth-Mend", "Tend a wound by lantern-light — restore 1d6 + tier HP, once per rest.", "Heart", 0.55, 0.36, ["w2b"]),
        _node("w3d", "Brass Ward", "Trace a circle of wickfire that undead and bog-stalkers will not cross.", "Sparkles", 0.78, 0.36, ["w2b", "w2c"]),
        _node("w3e", "Whispering Flame", "Carry a message from one lit lantern to another within a day's walk.", "BookOpen", 0.93, 0.36, ["w2c"]),
        # Tier 3
        _node("w4a", "Lamplighter's Path", "Once per dusk, walk between two lit lanterns up to 100 ft apart in a single step.", "Footprints", 0.18, 0.52, ["w3a", "w3b"]),
        _node("w4b", "Pyre Step", "Step into one flame, step out from another within 30 ft.", "Footprints", 0.42, 0.52, ["w3b"]),
        _node("w4c", "Mirror Wick", "Split one flame into two — they share a single source of fuel.", "Sun", 0.62, 0.52, ["w3c", "w3d"]),
        _node("w4d", "Funeral Bright", "Burn the unclean and the lying without consuming the honest.", "Skull", 0.82, 0.52, ["w3d", "w3e"]),
        # Tier 4
        _node("w5a", "Ash Walk", "For one scene, you leave no footprints and cast no shadow.", "Wind", 0.30, 0.68, ["w4a", "w4b"]),
        _node("w5b", "Cleansing Pyre", "Summon a pillar of pale fire that burns only what is unclean (8d6 radiant).", "Sun", 0.55, 0.68, ["w4b", "w4c"]),
        _node("w5c", "Beacon Call", "Light a flare visible for a hundred miles. Anyone who sees it learns where you are.", "Star", 0.78, 0.68, ["w4c", "w4d"]),
        # Tier 5 (capstones)
        _node("w6a", "Long Burning", "Your final breath does not put out your lantern. Resist death once.", "Crown", 0.35, 0.86, ["w5a", "w5b"]),
        _node("w6b", "Cathedral of Flame", "Erect a 30-ft sphere of light no spirit nor sorcery may enter. Lasts until you sleep.", "Sparkles", 0.65, 0.86, ["w5b", "w5c"]),
    ]


def _mossblood_nodes():
    return [
        _node("m1", "Greenwhisper", "Speak with any plant for one minute. Most have little to say.", "Leaf", 0.50, 0.06),
        # Tier 1
        _node("m2a", "Vine-Step", "Vines and roots part for you. Move silently through undergrowth.", "Footprints", 0.22, 0.20, ["m1"]),
        _node("m2b", "Spore-Tongue", "Taste a mushroom and know if it is safe, lying, or hungry.", "Eye", 0.50, 0.20, ["m1"]),
        _node("m2c", "Moss-Knit", "A poultice of shrine-moss restores 2d4 + tier HP. Once per scene.", "Heart", 0.78, 0.20, ["m1"]),
        # Tier 2
        _node("m3a", "Root-Knot", "Bind a creature in place with roots (STR save DC 8+prof+wis).", "Leaf", 0.12, 0.36, ["m2a"]),
        _node("m3b", "Bark-Skin", "Your skin hardens — +2 AC for one minute, no metal armor.", "Shield", 0.35, 0.36, ["m2a", "m2b"]),
        _node("m3c", "Witch-Light", "Summon a will-o'-wisp that follows your lantern for one night.", "Sparkles", 0.58, 0.36, ["m2b", "m2c"]),
        _node("m3d", "Long Memory", "Touch a tree older than fifty years and see one event it witnessed.", "BookOpen", 0.82, 0.36, ["m2c"]),
        # Tier 3
        _node("m4a", "Forest-March", "The forest carries you at twice your speed for one day.", "Footprints", 0.22, 0.52, ["m3a", "m3b"]),
        _node("m4b", "Hollow-Heart Pact", "Trade a memory to a tree in exchange for one of its oldest gifts.", "Heart", 0.50, 0.52, ["m3b", "m3c"]),
        _node("m4c", "Wyrd-Bind", "Mark a creature — the forest will know it from now on, and refuse it.", "Star", 0.78, 0.52, ["m3c", "m3d"]),
        # Tier 4
        _node("m5a", "Verdant Call", "Summon a host of crows, foxes, or mushroom-spites for one scene.", "Bird", 0.30, 0.70, ["m4a", "m4b"]),
        _node("m5b", "Mushroom Sight", "See through the eyes of any fungus you have touched, anywhere it grows.", "Eye", 0.55, 0.70, ["m4b"]),
        _node("m5c", "The Long Sleep", "Bury yourself in moss — heal fully, but sleep for a week and a day.", "Moon", 0.78, 0.70, ["m4b", "m4c"]),
        # Tier 5
        _node("m6a", "Forest-Born", "You no longer age in any forest older than yourself.", "Trees", 0.40, 0.88, ["m5a", "m5b"]),
        _node("m6b", "Crown of Thorns", "Take root in place — gain Resistance to all damage but cannot move. Lasts a day.", "Crown", 0.65, 0.88, ["m5b", "m5c"]),
    ]


def _sundered_lantern_nodes():
    return [
        _node("s1", "The Wick", "The first star. A small, steady light that cannot be extinguished by living hand.", "Flame", 0.50, 0.06),
        # Tier 1 — the three nearer stars
        _node("s2", "The Smoke", "Obscure your passage from one who watches you.", "Wind", 0.20, 0.20, ["s1"]),
        _node("s3", "The Shadow", "Cast a shadow that is not your own — it walks where you cannot.", "Moon", 0.50, 0.20, ["s1"]),
        _node("s4", "The Flicker", "Be in two places for the length of one heartbeat.", "Star", 0.80, 0.20, ["s1"]),
        # Tier 2 — the four watching stars
        _node("s5", "The Mirror", "What you see in still water tells you a truth about the seer.", "Eye", 0.10, 0.36, ["s2"]),
        _node("s6", "The Hollow", "Empty yourself of one feeling for one scene — fear, love, grief.", "Skull", 0.34, 0.36, ["s2", "s3"]),
        _node("s7", "The Veil", "Step behind the world — for one minute, nothing in it can touch you.", "Sparkles", 0.62, 0.36, ["s3", "s4"]),
        _node("s8", "The Glass", "See a moment that has already happened, once, never twice.", "BookOpen", 0.88, 0.36, ["s4"]),
        # Tier 3 — the long stars
        _node("s9", "The Threshold", "Anyone who crosses a doorway you mark will pause once, helpless.", "Compass", 0.22, 0.54, ["s5", "s6"]),
        _node("s10", "The Watcher", "A star far above sees what you choose to look at, and remembers.", "Eye", 0.48, 0.54, ["s6", "s7"]),
        _node("s11", "The Procession", "Walk in a line with the dead behind you — they will not be seen unless you turn.", "Footprints", 0.76, 0.54, ["s7", "s8"]),
        # Tier 4 — the burning stars
        _node("s12", "The Eclipse", "Become unseen for as long as the lantern at the heart of you holds.", "Moon", 0.30, 0.72, ["s9", "s10"]),
        _node("s13", "The Gate", "Open a door that was never there. Close it from the other side.", "Sparkles", 0.55, 0.72, ["s10"]),
        _node("s14", "The Procession's End", "The dead behind you may take one action — once, never twice.", "Bone", 0.78, 0.72, ["s10", "s11"]),
        # Tier 5 — the final stars
        _node("s15", "The Sundered Crown", "The constellation accepts you. The price is a name, surrendered. From now on, no power may compel you against your will.", "Crown", 0.50, 0.90, ["s12", "s13", "s14"]),
    ]


def _wickwarden_nodes():
    return [
        _node("ww1", "Lantern Bond", "Bond a lantern — it cannot be extinguished by any hand but yours.", "Flame", 0.50, 0.06),
        _node("ww2a", "Brass Discipline", "Add +prof to one save you choose at the start of each day.", "Shield", 0.22, 0.20, ["ww1"]),
        _node("ww2b", "Ember Reflex", "+1 initiative. Once per scene, ignore the first 1d6 fire damage.", "Zap", 0.50, 0.20, ["ww1"]),
        _node("ww2c", "Pilgrim's Stride", "Move at full speed in difficult terrain on roads.", "Footprints", 0.78, 0.20, ["ww1"]),
        # Tier 2
        _node("ww3a", "Wayguard", "An ally within 5 ft of your lantern shares your saves against fear.", "Shield", 0.15, 0.36, ["ww2a"]),
        _node("ww3b", "Lanternstrike", "Once per scene, your weapon attack also lights a torch on hit.", "Sword", 0.40, 0.36, ["ww2a", "ww2b"]),
        _node("ww3c", "Vigil Stance", "When you do not move, attackers have disadvantage.", "Eye", 0.62, 0.36, ["ww2b", "ww2c"]),
        _node("ww3d", "Bonded Flame", "Cast Light on your lantern at will. It cannot be Dispelled.", "Sparkles", 0.85, 0.36, ["ww2c"]),
        # Tier 3
        _node("ww4a", "Stand Fast", "When reduced to 0 HP, regain 1 HP. Once per day.", "Heart", 0.22, 0.54, ["ww3a", "ww3b"]),
        _node("ww4b", "Stoke", "Bonus action — grant an ally within 30 ft +1d6 fire damage on their next hit.", "Flame", 0.50, 0.54, ["ww3b", "ww3c"]),
        _node("ww4c", "Burning Resolve", "You cannot be put to sleep by magical or mundane means.", "Crown", 0.78, 0.54, ["ww3c", "ww3d"]),
        # Tier 4
        _node("ww5a", "Long Watch", "Need only 2 hours of sleep per night.", "Moon", 0.30, 0.72, ["ww4a", "ww4b"]),
        _node("ww5b", "Cleansing Vow", "Once per day, cure one disease, curse, or possession by burning your lantern's wick low.", "Sun", 0.55, 0.72, ["ww4b", "ww4c"]),
        _node("ww5c", "Last Light", "If your bonded lantern is broken, you may relight it once with your own blood.", "Heart", 0.78, 0.72, ["ww4c"]),
        # Capstone
        _node("ww6", "Last Lantern", "When you die, your bonded lantern burns for a year and a day in your honor — anyone who tends it gains one tier of your training.", "Crown", 0.50, 0.90, ["ww5a", "ww5b", "ww5c"]),
    ]


# ---------------- App wiring ----------------
allow_origins = [FRONTEND_URL]
extra_origins = os.environ.get("CORS_ORIGINS", "")
if extra_origins:
    for o in extra_origins.split(","):
        o = o.strip()
        if o and o != "*" and o not in allow_origins:
            allow_origins.append(o)

# ---------------- Object Storage (Emergent) ----------------
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = os.environ.get("APP_NAME", "lantern-realm")
_storage_key: Optional[str] = None

ALLOWED_IMAGE_TYPES = {
    "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg",
    "image/webp": "webp", "image/gif": "gif",
}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


def init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY is not configured")
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    r.raise_for_status()
    _storage_key = r.json()["storage_key"]
    return _storage_key


def _storage_put(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    r = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if r.status_code == 403:
        global _storage_key
        _storage_key = None
        key = init_storage()
        r = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    r.raise_for_status()
    return r.json()


def _storage_get(path: str):
    key = init_storage()
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if r.status_code == 403:
        global _storage_key
        _storage_key = None
        key = init_storage()
        r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


# ---------------- Upload Endpoints ----------------
@api.post("/uploads")
async def upload_image(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the Lanternkeeper may upload")
    ct = (file.content_type or "").lower()
    if ct not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {ct or 'unknown'}")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)")
    ext = ALLOWED_IMAGE_TYPES[ct]
    file_id = uuid.uuid4().hex
    path = f"{APP_NAME}/uploads/{user['id']}/{file_id}.{ext}"
    try:
        result = _storage_put(path, data, ct)
    except Exception as exc:
        logger.error(f"Storage upload failed: {exc}")
        raise HTTPException(status_code=502, detail="Storage backend unavailable")
    record = {
        "id": file_id,
        "storage_path": result.get("path", path),
        "original_filename": file.filename or f"{file_id}.{ext}",
        "content_type": ct,
        "size": result.get("size", len(data)),
        "uploaded_by": user["id"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.uploads.insert_one(record)
    return {"id": file_id, "url": f"/api/uploads/{file_id}", "size": record["size"]}


@api.get("/uploads/{file_id}")
async def fetch_upload(file_id: str):
    record = await db.uploads.find_one({"id": file_id, "is_deleted": {"$ne": True}})
    if not record:
        raise HTTPException(status_code=404, detail="Upload not found")
    try:
        data, ct = _storage_get(record["storage_path"])
    except Exception as exc:
        logger.error(f"Storage fetch failed for {file_id}: {exc}")
        raise HTTPException(status_code=502, detail="Storage backend unavailable")
    return Response(
        content=data,
        media_type=record.get("content_type") or ct,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@api.delete("/uploads/{file_id}")
async def soft_delete_upload(file_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the Lanternkeeper may delete uploads")
    r = await db.uploads.update_one({"id": file_id}, {"$set": {"is_deleted": True}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Upload not found")
    return {"ok": True}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.entries.create_index("id", unique=True)
    await db.entries.create_index("slug", unique=True)
    await db.entries.create_index("category")
    await db.dice_rolls.create_index([("created_at", -1)])
    await db.magic_trees.create_index("id", unique=True)
    await db.magic_trees.create_index("slug", unique=True)
    await db.scheduled_sessions.create_index("scheduled_at")
    await db.session_comments.create_index("id", unique=True)
    await db.session_comments.create_index([("session_id", 1), ("created_at", 1)])
    await db.uploads.create_index("id", unique=True)
    await db.regional_maps.create_index("id", unique=True)
    await db.regional_maps.create_index("slug", unique=True)
    for coll in ("rules_races", "rules_classes", "rules_spells", "rules_skills"):
        await db[coll].create_index("id", unique=True)
    await seed_admins()
    await seed_entries()
    await seed_magic_trees()
    await seed_rules()
    await seed_default_map()
    try:
        init_storage()
        logger.info("Emergent object storage initialised")
    except Exception as exc:
        logger.warning(f"Storage init deferred (will retry on first upload): {exc}")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
