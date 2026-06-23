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
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
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


# ---------------- Models ----------------
class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


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
    map_x: Optional[float] = None  # 0-100 percent X on world map
    map_y: Optional[float] = None  # 0-100 percent Y on world map


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
        "map_x": doc.get("map_x"),
        "map_y": doc.get("map_y"),
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
async def list_entries(category: Optional[str] = None, q: Optional[str] = None, limit: int = 200):
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
    cursor = db.entries.find(query, {"_id": 0}).sort([("pinned", -1), ("updated_at", -1)]).limit(limit)
    items = await cursor.to_list(length=limit)
    return [entry_to_out(d) for d in items]


@api.get("/entries/{entry_id}")
async def get_entry(entry_id: str):
    doc = await db.entries.find_one({"$or": [{"id": entry_id}, {"slug": entry_id}]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Entry not found")
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
async def stats():
    pipeline = [{"$group": {"_id": "$category", "count": {"$sum": 1}}}]
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


# ---------------- App wiring ----------------
app.include_router(api)

allow_origins = [FRONTEND_URL]
extra_origins = os.environ.get("CORS_ORIGINS", "")
if extra_origins:
    for o in extra_origins.split(","):
        o = o.strip()
        if o and o != "*" and o not in allow_origins:
            allow_origins.append(o)

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
    await seed_admins()
    await seed_entries()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
