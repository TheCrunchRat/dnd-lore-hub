"""Auth + Profile endpoints — login, register, logout, refresh, /auth/me, /profile/me, /profile/{id}."""
from datetime import datetime, timezone

import jwt
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from deps import (
    db, get_current_user, hash_password, verify_password,
    create_access_token, create_refresh_token,
    set_auth_cookies, clear_auth_cookies,
    JWT_SECRET, JWT_ALGORITHM,
)
from models import (
    UserPublic, LoginIn, RegisterIn, ProfileIn,
    profile_to_out, entry_to_out,
)

router = APIRouter()


# ---------------- Auth ----------------
@router.post("/auth/login", response_model=UserPublic)
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


@router.post("/auth/register", response_model=UserPublic)
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


@router.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    # Invalidate ALL tokens issued before now for this user
    now_ts = int(datetime.now(timezone.utc).timestamp()) + 1
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"valid_after": now_ts}})
    clear_auth_cookies(response)
    return {"ok": True}


@router.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}


@router.post("/auth/refresh")
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


# ---------------- Profile ----------------
async def _profile_stats(user_id: str) -> dict:
    chars = await db.entries.count_documents({"category": "character", "metadata.user_id": user_id})
    comments = await db.session_comments.count_documents({"author_id": user_id, "deleted": {"$ne": True}})
    # RSVP count: sessions where this user appears in rsvps[]
    rsvps = await db.scheduled_sessions.count_documents({"rsvps.user_id": user_id})
    return {"characters": chars, "comments": comments, "rsvps": rsvps}


async def _profile_characters(user_id: str) -> list:
    cursor = db.entries.find(
        {"category": "character", "metadata.user_id": user_id},
        {"_id": 0},
    ).sort("updated_at", -1)
    items = await cursor.to_list(length=100)
    return [entry_to_out(d) for d in items]


@router.get("/profile/me")
async def get_my_profile(user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})
    doc["id"] = user["id"]
    return {
        "profile": profile_to_out(doc, include_email=True),
        "stats": await _profile_stats(user["id"]),
        "characters": await _profile_characters(user["id"]),
    }


@router.put("/profile/me")
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


@router.get("/profile/{user_id}")
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
