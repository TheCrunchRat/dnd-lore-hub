"""Codex entries (lore / locations / characters / etc.) — list, get, CRUD, /stats, /settings."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict

from deps import db, CATEGORIES, DEFAULT_MAP_URL, get_current_user, get_optional_user, slugify
from models import EntryIn, EntryOut, entry_to_out

router = APIRouter()


@router.get("/entries")
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


@router.get("/entries/{entry_id}")
async def get_entry(entry_id: str, user: Optional[dict] = Depends(get_optional_user)):
    doc = await db.entries.find_one({"$or": [{"id": entry_id}, {"slug": entry_id}]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Entry not found")
    # Sealed (DM-only) entries return 403 with a "sealed" marker for non-admins so the
    # frontend can render its decorative SealedEntry page instead of a generic 404.
    if doc.get("is_private") and (not user or user.get("role") != "admin"):
        raise HTTPException(status_code=403, detail="sealed")
    return entry_to_out(doc)


@router.post("/entries", response_model=EntryOut)
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


@router.put("/entries/{entry_id}", response_model=EntryOut)
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


@router.delete("/entries/{entry_id}")
async def delete_entry(entry_id: str, _user: dict = Depends(get_current_user)):
    res = await db.entries.delete_one({"id": entry_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"ok": True}


@router.get("/stats")
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


@router.get("/settings")
async def get_settings():
    doc = await db.settings.find_one({"_id": "global"}, {"_id": 0})
    if not doc:
        return {"world_map_url": DEFAULT_MAP_URL}
    return {"world_map_url": doc.get("world_map_url") or DEFAULT_MAP_URL}


@router.put("/settings")
async def update_settings(body: SettingsIn, _user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    await db.settings.update_one({"_id": "global"}, {"$set": update}, upsert=True)
    return await get_settings()
