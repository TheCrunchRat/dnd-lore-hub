from datetime import datetime, timezone
from typing import List, Optional, Literal

from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr, ConfigDict

import os
import uuid

from deps import (
    client, db, logger, FRONTEND_URL, DEFAULT_MAP_URL,
    Category, CATEGORIES,
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    set_auth_cookies, clear_auth_cookies,
    get_current_user, get_optional_user,
    slugify, JWT_SECRET, JWT_ALGORITHM, ACCESS_TTL_MIN, REFRESH_TTL_DAYS,
)
import jwt

app = FastAPI(title="Lantern Realm Codex API")
api = APIRouter(prefix="/api")


# ---------------- Models ----------------
class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: str


class ProfileIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    quote: Optional[str] = None
    title: Optional[str] = None
    pronouns: Optional[str] = None
    active_pc_id: Optional[str] = None  # currently-equipped character id


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


# ---------------- Profile Endpoints ----------------
def profile_to_out(user_doc: dict, include_email: bool = False) -> dict:
    out = {
        "id": user_doc["id"],
        "name": user_doc.get("name", ""),
        "role": user_doc.get("role", "player"),
        "display_name": user_doc.get("display_name") or user_doc.get("name", ""),
        "avatar_url": user_doc.get("avatar_url", ""),
        "bio": user_doc.get("bio", ""),
        "quote": user_doc.get("quote", ""),
        "title": user_doc.get("title", ""),
        "pronouns": user_doc.get("pronouns", ""),
        "active_pc_id": user_doc.get("active_pc_id", ""),
        "created_at": user_doc.get("created_at"),
    }
    if include_email:
        out["email"] = user_doc.get("email", "")
    return out


async def _profile_stats(user_id: str) -> dict:
    chars = await db.entries.count_documents({"category": "character", "metadata.user_id": user_id})
    comments = await db.session_comments.count_documents({"author_id": user_id, "deleted": {"$ne": True}})
    # RSVP count: sessions where this user appears in rsvps[]
    rsvps = await db.scheduled_sessions.count_documents({"rsvps.user_id": user_id})
    return {"characters": chars, "comments": comments, "rsvps": rsvps}


async def _profile_characters(user_id: str) -> List[dict]:
    cursor = db.entries.find(
        {"category": "character", "metadata.user_id": user_id},
        {"_id": 0},
    ).sort("updated_at", -1)
    items = await cursor.to_list(length=100)
    return [entry_to_out(d) for d in items]


@api.get("/profile/me")
async def get_my_profile(user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})
    doc["id"] = user["id"]
    return {
        "profile": profile_to_out(doc, include_email=True),
        "stats": await _profile_stats(user["id"]),
        "characters": await _profile_characters(user["id"]),
    }


@api.put("/profile/me")
async def update_my_profile(body: ProfileIn, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    # strip whitespace on all string fields
    for k in list(updates):
        if isinstance(updates[k], str):
            updates[k] = updates[k].strip()
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": updates})
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})
    doc["id"] = user["id"]
    return {
        "profile": profile_to_out(doc, include_email=True),
        "stats": await _profile_stats(user["id"]),
        "characters": await _profile_characters(user["id"]),
    }


@api.get("/profile/{user_id}")
async def get_profile(user_id: str):
    try:
        doc = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        doc = None
    if not doc:
        raise HTTPException(status_code=404, detail="Player not found")
    doc["id"] = user_id
    return {
        "profile": profile_to_out(doc, include_email=False),
        "stats": await _profile_stats(user_id),
        "characters": await _profile_characters(user_id),
    }


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


# ---------------- Guide Pages (small wiki) ----------------
class GuideIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str = Field(min_length=1, max_length=120)
    subtitle: Optional[str] = ""
    content: Optional[str] = ""
    sort_order: int = 0
    is_pinned: bool = False


def guide_to_out(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "slug": doc["slug"],
        "title": doc["title"],
        "subtitle": doc.get("subtitle", ""),
        "content": doc.get("content", ""),
        "sort_order": doc.get("sort_order", 0),
        "is_pinned": doc.get("is_pinned", False),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


async def _make_unique_guide_slug(title: str) -> str:
    base = slugify(title) or f"guide-{uuid.uuid4().hex[:6]}"
    candidate = base
    i = 2
    while await db.guides.find_one({"slug": candidate}):
        candidate = f"{base}-{i}"
        i += 1
    return candidate


@api.get("/guides")
async def list_guides():
    cursor = db.guides.find({}, {"_id": 0}).sort([
        ("is_pinned", -1), ("sort_order", 1), ("created_at", 1)
    ])
    items = await cursor.to_list(length=200)
    return [guide_to_out(d) for d in items]


@api.get("/guides/{guide_id}")
async def get_guide(guide_id: str):
    doc = await db.guides.find_one({"$or": [{"id": guide_id}, {"slug": guide_id}]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Guide not found")
    return guide_to_out(doc)


@api.post("/guides")
async def create_guide(body: GuideIn, _user: dict = Depends(get_current_user)):
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    now = datetime.now(timezone.utc).isoformat()
    gid = str(uuid.uuid4())
    slug = await _make_unique_guide_slug(title)
    doc = body.model_dump()
    doc["title"] = title
    doc.update({"id": gid, "slug": slug, "created_at": now, "updated_at": now})
    await db.guides.insert_one(doc)
    doc.pop("_id", None)
    return guide_to_out(doc)


@api.put("/guides/{guide_id}")
async def update_guide(guide_id: str, body: GuideIn, _user: dict = Depends(get_current_user)):
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    existing = await db.guides.find_one({"id": guide_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Guide not found")
    update = body.model_dump()
    update["title"] = title
    if title != existing.get("title"):
        update["slug"] = await _make_unique_guide_slug(title)
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.guides.update_one({"id": guide_id}, {"$set": update})
    updated = await db.guides.find_one({"id": guide_id}, {"_id": 0})
    return guide_to_out(updated)


@api.delete("/guides/{guide_id}")
async def delete_guide(guide_id: str, _user: dict = Depends(get_current_user)):
    res = await db.guides.delete_one({"id": guide_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Guide not found")
    return {"ok": True}


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
    # Optional PC linkage (used by sheet rolls)
    pc_id: Optional[str] = None
    pc_name: Optional[str] = None
    kind: Optional[str] = None  # "ability"|"save"|"init"|"skill"|"spell"|"custom"


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
class NodeModifier(BaseModel):
    model_config = ConfigDict(extra="ignore")
    stat: Literal["str", "dex", "con", "int", "wis", "cha", "hp", "ac", "speed", "init"]
    value: int


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
    # ---- Spell properties (when set, this node also appears in /api/spells/library) ----
    spell_level: Optional[int] = None      # 0..9; None = not a spell
    school: Optional[str] = ""
    casting_time: Optional[str] = ""
    spell_range: Optional[str] = ""
    components: Optional[str] = ""
    duration: Optional[str] = ""
    spell_classes: Optional[List[str]] = Field(default_factory=list)
    # Damage / effect dice for casting this spell-node (e.g., 3d6+2)
    dice_count: Optional[int] = None
    dice_size: Optional[int] = None
    bonus: Optional[int] = None
    # ---- Stat modifiers granted while this node is unlocked & level-gate met ----
    modifiers: Optional[List[NodeModifier]] = Field(default_factory=list)


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


@api.get("/spells/library")
async def spell_library():
    """Unified spell list: SRD + homebrew rules_spells AND magic-tree nodes
    that have `spell_level` set. Returns the same shape for all sources."""
    items: List[dict] = []
    async for sp in db.rules_spells.find({}, {"_id": 0}):
        items.append({
            "id": sp.get("id"),
            "name": sp.get("name", ""),
            "level": sp.get("level", 0),
            "school": sp.get("school", ""),
            "casting_time": sp.get("casting_time", ""),
            "range": sp.get("range", ""),
            "components": sp.get("components", ""),
            "duration": sp.get("duration", ""),
            "classes": sp.get("classes", []),
            "description": sp.get("description", ""),
            "source": sp.get("source", "srd"),
            "dice_count": sp.get("dice_count"),
            "dice_size": sp.get("dice_size"),
            "bonus": sp.get("bonus"),
        })
    async for tree in db.magic_trees.find({}, {"_id": 0}):
        for n in (tree.get("nodes") or []):
            if n.get("spell_level") is None:
                continue
            items.append({
                "id": f"{tree['id']}::{n['id']}",
                "node_id": n["id"],
                "tree_id": tree["id"],
                "tree_name": tree.get("name", ""),
                "tree_slug": tree.get("slug", ""),
                "tree_category": tree.get("tree_category", "origin"),
                "accent_color": tree.get("accent_color", "#FBBF24"),
                "name": n.get("name", ""),
                "level": int(n.get("spell_level") or 0),
                "school": n.get("school") or "",
                "casting_time": n.get("casting_time") or "",
                "range": n.get("spell_range") or "",
                "components": n.get("components") or "",
                "duration": n.get("duration") or "",
                "classes": n.get("spell_classes") or [],
                "description": n.get("description") or "",
                "source": "magic-node",
                "dice_count": n.get("dice_count"),
                "dice_size": n.get("dice_size"),
                "bonus": n.get("bonus"),
            })
    items.sort(key=lambda s: (s.get("level", 0), s.get("name", "").lower()))
    return items


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
    level: Optional[int] = None
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
    skill_profs: Optional[List[str]] = None    # 5e skill names player is proficient in
    skill_experts: Optional[List[str]] = None  # 5e skill names with expertise (double prof)
    languages: Optional[List[str]] = None
    spells_known: Optional[List[str]] = None   # spell names or ids
    spells_prepared: Optional[List[str]] = None  # subset of spells_known that are prepared today
    spell_slots: Optional[dict] = None          # {1: {max, used}, ...}
    spell_slots_used: Optional[dict] = None     # {"1": 2, ...} spent per level (≤ max)
    equipment: Optional[List[str]] = None
    features: Optional[List[str]] = None
    # Custom configurable resource (legacy single-resource fields)
    resource_name: Optional[str] = None
    resource_current: Optional[int] = None
    resource_max: Optional[int] = None
    resource_color: Optional[str] = None  # hex; defaults to lantern gold
    # Multiple resources: [{id, name, max, current, color}]
    resources: Optional[List[dict]] = None
    # Magic-tree integration
    origin_unlocks: Optional[List[dict]] = None      # [{tree_id, node_id, as_spell: bool}]
    foundation_unlocks: Optional[List[dict]] = None  # [{tree_id, node_id}]
    class_tree_id: Optional[str] = None              # selected homebrew class-tree id
    # Long/Short rest recovery config:
    #   { long: {hp_value, hp_is_percent, resource_value, resource_is_percent},
    #     short: {...} }
    rest_config: Optional[dict] = None


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
        "skill_profs": body.skill_profs or [],
        "skill_experts": body.skill_experts or [],
        "languages": body.languages or [],
        "spells_known": body.spells_known or [],
        "spells_prepared": body.spells_prepared or [],
        "spell_slots": body.spell_slots or {},
        "spell_slots_used": body.spell_slots_used or {},
        "equipment": body.equipment or [],
        "features": body.features or [],
        "resource_name": body.resource_name or "",
        "resource_max": body.resource_max,
        "resource_current": body.resource_current,
        "resource_color": body.resource_color or "",
        "resources": body.resources or [],
        "origin_unlocks": body.origin_unlocks or [],
        "foundation_unlocks": body.foundation_unlocks or [],
        "class_tree_id": body.class_tree_id or "",
        "rest_config": body.rest_config or {},
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
        "skill_profs": body.skill_profs,
        "skill_experts": body.skill_experts,
        "languages": body.languages,
        "spells_known": body.spells_known,
        "spells_prepared": body.spells_prepared,
        "spell_slots": body.spell_slots,
        "spell_slots_used": body.spell_slots_used,
        "equipment": body.equipment,
        "features": body.features,
        "origin_unlocks": body.origin_unlocks,
        "foundation_unlocks": body.foundation_unlocks,
        "class_tree_id": body.class_tree_id,
        "rest_config": body.rest_config,
        "resources": body.resources,
    }.items():
        if v is not None:
            metadata[k] = v
    # Legacy single-resource fields: only touch when client explicitly sends an
    # empty string (deliberate clear). Sending None (the default when absent
    # from the payload) preserves the existing value — this is what fixes the
    # CharacterBuilder save wiping the resource.
    for k, v in {
        "resource_name": body.resource_name,
        "resource_max": body.resource_max,
        "resource_current": body.resource_current,
        "resource_color": body.resource_color,
    }.items():
        if v == "":
            metadata.pop(k, None)
        elif v is not None:
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


# ---------------- Realm Layout (singleton) ----------------
# Layouts endpoints live in routes/layouts.py


@api.get("/me/active-pc")
async def my_active_pc(user: dict = Depends(get_current_user)):
    """Return the user's currently-equipped character (or null)."""
    doc = await db.users.find_one({"_id": ObjectId(user["id"])}, {"active_pc_id": 1})
    pc_id = (doc or {}).get("active_pc_id")
    if not pc_id:
        return None
    entry = await db.entries.find_one({"id": pc_id, "category": "character"}, {"_id": 0})
    return entry_to_out(entry) if entry else None


@api.post("/pcs/{entry_id}/equip")
async def equip_pc(entry_id: str, user: dict = Depends(get_current_user)):
    """Claim a PC as yours (if unowned) and set it as your active character.
    Admins can claim/equip any PC. Players can only equip PCs that are
    unowned or already theirs."""
    entry = await db.entries.find_one({"id": entry_id, "category": "character"})
    if not entry:
        raise HTTPException(status_code=404, detail="Character not found")
    metadata = entry.get("metadata") or {}
    if metadata.get("role") != "PC":
        raise HTTPException(status_code=400, detail="Only Player Characters can be equipped")
    existing_owner = metadata.get("user_id") or ""
    if existing_owner and existing_owner != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="This character is already claimed by another player")
    # Stake the claim if unowned (or admin force-claiming)
    metadata["user_id"] = user["id"]
    if not metadata.get("owner"):
        metadata["owner"] = user["name"]
    await db.entries.update_one(
        {"id": entry_id},
        {"$set": {"metadata": metadata, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    # Set as active on the user doc
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {"$set": {"active_pc_id": entry_id, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    updated = await db.entries.find_one({"id": entry_id}, {"_id": 0})
    return {"ok": True, "entry": entry_to_out(updated)}


@api.post("/pcs/unequip")
async def unequip_pc(user: dict = Depends(get_current_user)):
    """Clear the user's active character (does NOT release ownership)."""
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {"$set": {"active_pc_id": "", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}


# ---------------- D&D 5e Rules Library ----------------
# Endpoints now live in routes/rules.py


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



# ---------------- App wiring ----------------
allow_origins = [FRONTEND_URL]
extra_origins = os.environ.get("CORS_ORIGINS", "")
if extra_origins:
    for o in extra_origins.split(","):
        o = o.strip()
        if o and o != "*" and o not in allow_origins:
            allow_origins.append(o)


# Mount the modular routers BEFORE including the main `api` router so the
# combined path table is registered as one unit under `/api`.
from routes.rules import router as rules_router  # noqa: E402
from routes.layouts import router as layouts_router  # noqa: E402
from storage import router as storage_router, init_storage  # noqa: E402

for sub in (rules_router, layouts_router, storage_router):
    api.include_router(sub)

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from seeds import (  # noqa: E402
    seed_admins, seed_entries, seed_magic_trees, seed_rules,
    seed_default_map, seed_guides,
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
    await db.guides.create_index("id", unique=True)
    await db.guides.create_index("slug", unique=True)
    for coll in ("rules_races", "rules_classes", "rules_spells", "rules_skills"):
        await db[coll].create_index("id", unique=True)
    await seed_admins()
    await seed_entries()
    await seed_magic_trees()
    await seed_rules()
    await seed_default_map()
    await seed_guides()
    try:
        init_storage()
        logger.info("Emergent object storage initialised")
    except Exception as exc:
        logger.warning(f"Storage init deferred (will retry on first upload): {exc}")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
