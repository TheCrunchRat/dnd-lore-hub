"""Small in-app wiki (guides) — list, get, CRUD."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from deps import db, get_current_user, slugify

router = APIRouter()


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


@router.get("/guides")
async def list_guides():
    cursor = db.guides.find({}, {"_id": 0}).sort([
        ("is_pinned", -1), ("sort_order", 1), ("created_at", 1)
    ])
    items = await cursor.to_list(length=200)
    return [guide_to_out(d) for d in items]


@router.get("/guides/{guide_id}")
async def get_guide(guide_id: str):
    doc = await db.guides.find_one({"$or": [{"id": guide_id}, {"slug": guide_id}]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Guide not found")
    return guide_to_out(doc)


@router.post("/guides")
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


@router.put("/guides/{guide_id}")
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


@router.delete("/guides/{guide_id}")
async def delete_guide(guide_id: str, _user: dict = Depends(get_current_user)):
    res = await db.guides.delete_one({"id": guide_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Guide not found")
    return {"ok": True}
