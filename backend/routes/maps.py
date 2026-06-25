"""Regional maps + entry position pinning."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from deps import db, get_current_user, slugify
from models import MapPositionIn, entry_to_out

router = APIRouter()


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


@router.get("/maps")
async def list_maps():
    cursor = db.regional_maps.find({}, {"_id": 0}).sort([("sort_order", 1), ("created_at", 1)])
    items = await cursor.to_list(length=200)
    return [map_to_out(d) for d in items]


@router.get("/maps/{map_id}")
async def get_map(map_id: str):
    doc = await db.regional_maps.find_one({"$or": [{"id": map_id}, {"slug": map_id}]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Map not found")
    return map_to_out(doc)


@router.post("/maps")
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


@router.put("/maps/{map_id}")
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


@router.post("/maps/{map_id}/set_default")
async def set_default_map(map_id: str, _user: dict = Depends(get_current_user)):
    existing = await db.regional_maps.find_one({"id": map_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Map not found")
    await db.regional_maps.update_many({}, {"$set": {"is_default": False}})
    await db.regional_maps.update_one({"id": map_id}, {"$set": {"is_default": True}})
    updated = await db.regional_maps.find_one({"id": map_id}, {"_id": 0})
    return map_to_out(updated)


@router.delete("/maps/{map_id}")
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


# ---------------- Entry position pinning (lives next to the maps it references) ----------------
@router.put("/entries/{entry_id}/position")
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
