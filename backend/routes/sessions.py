"""Session scheduler + per-session player comments."""
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from deps import db, get_current_user

router = APIRouter()


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


@router.get("/sessions")
async def list_sessions():
    cursor = db.scheduled_sessions.find({}, {"_id": 0}).sort("scheduled_at", 1)
    items = await cursor.to_list(length=500)
    return [session_to_out(d) for d in items]


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    doc = await db.scheduled_sessions.find_one({"id": session_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    return session_to_out(doc)


@router.post("/sessions")
async def create_session(body: SessionScheduleIn, _user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    sid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({"id": sid, "rsvps": [], "created_at": now, "updated_at": now})
    await db.scheduled_sessions.insert_one(doc)
    doc.pop("_id", None)
    return session_to_out(doc)


@router.put("/sessions/{session_id}")
async def update_session(session_id: str, body: SessionScheduleIn, _user: dict = Depends(get_current_user)):
    existing = await db.scheduled_sessions.find_one({"id": session_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Session not found")
    update = body.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.scheduled_sessions.update_one({"id": session_id}, {"$set": update})
    updated = await db.scheduled_sessions.find_one({"id": session_id}, {"_id": 0})
    return session_to_out(updated)


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, _user: dict = Depends(get_current_user)):
    res = await db.scheduled_sessions.delete_one({"id": session_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@router.post("/sessions/{session_id}/rsvp")
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


@router.delete("/sessions/{session_id}/rsvp")
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


@router.get("/sessions/{session_id}/comments")
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


@router.post("/sessions/{session_id}/comments")
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


@router.put("/sessions/{session_id}/comments/{comment_id}")
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


@router.delete("/sessions/{session_id}/comments/{comment_id}")
async def delete_comment(session_id: str, comment_id: str, user: dict = Depends(get_current_user)):
    doc = await db.session_comments.find_one({"id": comment_id, "session_id": session_id})
    if not doc or doc.get("deleted"):
        raise HTTPException(status_code=404, detail="Comment not found")
    if doc.get("author_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the author or the Lanternkeeper may delete this")
    await db.session_comments.update_one({"id": comment_id}, {"$set": {"deleted": True}})
    return {"ok": True}


@router.post("/sessions/{session_id}/comments/{comment_id}/pin")
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


@router.post("/sessions/{session_id}/lock_comments")
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
