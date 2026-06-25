"""Realm-wide page layouts (singleton). Admin edits, everyone reads."""
from fastapi import APIRouter, Depends, HTTPException

from deps import db, get_current_user
from layouts import RealmLayoutIn, DEFAULT_LAYOUTS

router = APIRouter()


@router.get("/layouts")
async def get_layouts():
    doc = await db.realm_layouts.find_one({"_id": "default"}, {"_id": 0}) or {}
    return {
        "character_sheet": {**DEFAULT_LAYOUTS["character_sheet"], **(doc.get("character_sheet") or {})},
        "dice_page": {**DEFAULT_LAYOUTS["dice_page"], **(doc.get("dice_page") or {})},
    }


@router.put("/layouts")
async def put_layouts(body: RealmLayoutIn, _user: dict = Depends(get_current_user)):
    if _user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    update: dict = {}
    if body.character_sheet is not None:
        update["character_sheet"] = body.character_sheet.model_dump()
    if body.dice_page is not None:
        update["dice_page"] = body.dice_page.model_dump()
    if not update:
        raise HTTPException(status_code=400, detail="No layout fields supplied")
    await db.realm_layouts.update_one({"_id": "default"}, {"$set": update}, upsert=True)
    return await get_layouts()
