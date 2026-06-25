"""D&D 5e SRD rules library — races / classes / spells / skills.

Public read endpoints; admin-only writes for homebrew additions.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from deps import db, get_current_user
from dnd_srd import SPELL_SLOTS_FULL

router = APIRouter()

RULES_COLLECTIONS = {
    "races": "rules_races",
    "classes": "rules_classes",
    "spells": "rules_spells",
    "skills": "rules_skills",
}


def _strip_rules_doc(d: dict) -> dict:
    d.pop("_id", None)
    return d


@router.get("/rules/_computed/spell_slots")
async def spell_slots_table():
    return SPELL_SLOTS_FULL


@router.get("/rules/{kind}")
async def list_rules(kind: str):
    coll = RULES_COLLECTIONS.get(kind)
    if not coll:
        raise HTTPException(status_code=404, detail="Unknown rule kind")
    cursor = db[coll].find({}, {"_id": 0}).sort("name", 1)
    items = await cursor.to_list(length=2000)
    return items


@router.get("/rules/{kind}/{rule_id}")
async def get_rule(kind: str, rule_id: str):
    coll = RULES_COLLECTIONS.get(kind)
    if not coll:
        raise HTTPException(status_code=404, detail="Unknown rule kind")
    doc = await db[coll].find_one({"id": rule_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc


@router.post("/rules/{kind}")
async def create_rule(kind: str, body: dict, _user: dict = Depends(get_current_user)):
    coll = RULES_COLLECTIONS.get(kind)
    if not coll:
        raise HTTPException(status_code=404, detail="Unknown rule kind")
    if not body.get("name"):
        raise HTTPException(status_code=400, detail="name is required")
    doc = {**body, "id": str(uuid.uuid4()), "source": body.get("source", "homebrew"), "created_at": datetime.now(timezone.utc).isoformat()}
    await db[coll].insert_one(doc)
    return _strip_rules_doc(doc)


@router.put("/rules/{kind}/{rule_id}")
async def update_rule(kind: str, rule_id: str, body: dict, _user: dict = Depends(get_current_user)):
    coll = RULES_COLLECTIONS.get(kind)
    if not coll:
        raise HTTPException(status_code=404, detail="Unknown rule kind")
    existing = await db[coll].find_one({"id": rule_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    body.pop("id", None)
    body["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db[coll].update_one({"id": rule_id}, {"$set": body})
    updated = await db[coll].find_one({"id": rule_id}, {"_id": 0})
    return updated


@router.delete("/rules/{kind}/{rule_id}")
async def delete_rule(kind: str, rule_id: str, _user: dict = Depends(get_current_user)):
    coll = RULES_COLLECTIONS.get(kind)
    if not coll:
        raise HTTPException(status_code=404, detail="Unknown rule kind")
    res = await db[coll].delete_one({"id": rule_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}
