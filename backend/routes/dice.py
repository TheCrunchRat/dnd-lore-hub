"""Communal dice rolls — post, list (with `since` cursor), clear (admin)."""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from deps import db, get_current_user

router = APIRouter()


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


@router.post("/dice/rolls")
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


@router.get("/dice/rolls")
async def list_dice_rolls(since: Optional[str] = None, limit: int = 50):
    query: dict = {}
    if since:
        query["created_at"] = {"$gt": since}
    cursor = db.dice_rolls.find(query, {"_id": 0}).sort("created_at", -1).limit(min(max(limit, 1), 200))
    items = await cursor.to_list(length=limit)
    items.reverse()  # chronological order ascending for delta merges
    return items


@router.delete("/dice/rolls")
async def clear_dice_rolls(_user: dict = Depends(get_current_user)):
    res = await db.dice_rolls.delete_many({})
    return {"deleted": res.deleted_count}
