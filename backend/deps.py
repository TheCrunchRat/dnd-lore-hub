"""Shared infrastructure for the Lantern Realm backend.

Owns the Mongo client, logger, JWT helpers, cookie helpers, and the FastAPI
auth dependencies. Route modules and seeders import from here so we don't
duplicate config or fight circular imports through `server.py`.
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Literal, Optional

import bcrypt
import jwt
from bson import ObjectId
from fastapi import HTTPException, Request, Response
from motor.motor_asyncio import AsyncIOMotorClient


# ---------------- Config ----------------
JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 60 * 24  # 1 day
REFRESH_TTL_DAYS = 30

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

APP_NAME = os.environ.get("APP_NAME", "lantern-realm")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"

ALLOWED_IMAGE_TYPES = {
    "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg",
    "image/webp": "webp", "image/gif": "gif",
}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

DEFAULT_MAP_URL = "https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?auto=format&fit=crop&w=2400&q=80"

CATEGORIES = ["overview", "location", "character", "faction", "lore", "session", "bestiary"]
Category = Literal["overview", "location", "character", "faction", "lore", "session", "bestiary"]


# ---------------- Mongo ----------------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


# ---------------- Logger ----------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("codex")


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
    for name in ("access_token", "refresh_token"):
        response.set_cookie(
            key=name, value="logged-out",
            httponly=True, secure=True, samesite="none",
            max_age=0, expires=0, path="/",
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


# ---------------- Misc helpers ----------------
def slugify(text: str) -> str:
    s = "".join(c.lower() if c.isalnum() else "-" for c in text)
    while "--" in s:
        s = s.replace("--", "-")
    return s.strip("-") or uuid.uuid4().hex[:8]
