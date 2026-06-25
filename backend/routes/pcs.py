"""Player Characters — create, update, delete + active-pc (equip/unequip) flow."""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from deps import db, get_current_user, get_optional_user, slugify
from models import entry_to_out

router = APIRouter()


class PlayerCharacterIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    player_name: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=80)
    subtitle: Optional[str] = ""
    summary: Optional[str] = ""
    content: Optional[str] = ""
    image_url: Optional[str] = ""
    race: Optional[str] = ""
    char_class: Optional[str] = ""
    level: Optional[int] = None
    alignment: Optional[str] = ""
    pronouns: Optional[str] = ""
    # --- 5e SRD fields (all optional so legacy editor still works) ---
    race_id: Optional[str] = None
    class_id: Optional[str] = None
    background: Optional[str] = ""
    ability_scores: Optional[dict] = None  # {str, dex, con, int, wis, cha}
    max_hp: Optional[int] = None
    current_hp: Optional[int] = None
    armor_class: Optional[int] = None
    speed: Optional[int] = None
    proficiencies: Optional[List[str]] = None  # skill names
    saving_throws: Optional[List[str]] = None  # ability names
    skill_profs: Optional[List[str]] = None    # 5e skill names player is proficient in
    skill_experts: Optional[List[str]] = None  # 5e skill names with expertise (double prof)
    languages: Optional[List[str]] = None
    spells_known: Optional[List[str]] = None   # spell names or ids
    spells_prepared: Optional[List[str]] = None  # subset of spells_known that are prepared today
    spell_slots: Optional[dict] = None          # {1: {max, used}, ...}
    spell_slots_used: Optional[dict] = None     # {"1": 2, ...} spent per level (≤ max)
    equipment: Optional[List[str]] = None
    features: Optional[List[str]] = None
    # Custom configurable resource (legacy single-resource fields)
    resource_name: Optional[str] = None
    resource_current: Optional[int] = None
    resource_max: Optional[int] = None
    resource_color: Optional[str] = None  # hex; defaults to lantern gold
    # Multiple resources: [{id, name, max, current, color}]
    resources: Optional[List[dict]] = None
    # Magic-tree integration
    origin_unlocks: Optional[List[dict]] = None      # [{tree_id, node_id, as_spell: bool}]
    foundation_unlocks: Optional[List[dict]] = None  # [{tree_id, node_id}]
    class_tree_id: Optional[str] = None              # selected homebrew class-tree id
    # Long/Short rest recovery config
    rest_config: Optional[dict] = None


def _can_modify_pc(entry: dict, current: Optional[dict], player_name: str) -> bool:
    if current and current.get("role") == "admin":
        return True
    meta = entry.get("metadata") or {}
    if current and meta.get("user_id") and meta.get("user_id") == current.get("id"):
        return True
    owner = (meta.get("owner") or "").strip().lower()
    return bool(owner and player_name and owner == player_name.strip().lower())


@router.post("/pcs")
async def create_pc(body: PlayerCharacterIn, request: Request):
    current = await get_optional_user(request)
    # Signed-in users own through their account; anonymous fall back to player_name
    owner_name = (current["name"] if current else body.player_name).strip()
    user_id = current["id"] if current else None

    now = datetime.now(timezone.utc).isoformat()
    eid = str(uuid.uuid4())
    base_slug = slugify(body.name)
    slug = base_slug
    i = 2
    while await db.entries.find_one({"slug": slug}):
        slug = f"{base_slug}-{i}"
        i += 1

    metadata = {
        "role": "PC",
        "owner": owner_name,
        "race": body.race or "",
        "class": body.char_class or "",
        "level": body.level or 1,
        "alignment": body.alignment or "",
        "pronouns": body.pronouns or "",
        "race_id": body.race_id or "",
        "class_id": body.class_id or "",
        "background": body.background or "",
        "ability_scores": body.ability_scores or {},
        "max_hp": body.max_hp,
        "current_hp": body.current_hp,
        "armor_class": body.armor_class,
        "speed": body.speed,
        "proficiencies": body.proficiencies or [],
        "saving_throws": body.saving_throws or [],
        "skill_profs": body.skill_profs or [],
        "skill_experts": body.skill_experts or [],
        "languages": body.languages or [],
        "spells_known": body.spells_known or [],
        "spells_prepared": body.spells_prepared or [],
        "spell_slots": body.spell_slots or {},
        "spell_slots_used": body.spell_slots_used or {},
        "equipment": body.equipment or [],
        "features": body.features or [],
        "resource_name": body.resource_name or "",
        "resource_max": body.resource_max,
        "resource_current": body.resource_current,
        "resource_color": body.resource_color or "",
        "resources": body.resources or [],
        "origin_unlocks": body.origin_unlocks or [],
        "foundation_unlocks": body.foundation_unlocks or [],
        "class_tree_id": body.class_tree_id or "",
        "rest_config": body.rest_config or {},
    }
    if user_id:
        metadata["user_id"] = user_id
    metadata = {k: v for k, v in metadata.items() if v not in ("", None, [], {})}

    doc = {
        "id": eid,
        "slug": slug,
        "category": "character",
        "title": body.name.strip(),
        "subtitle": body.subtitle or "",
        "summary": body.summary or "",
        "content": body.content or "",
        "image_url": body.image_url or "",
        "tags": ["pc", "player-character"],
        "metadata": metadata,
        "pinned": False,
        "created_at": now,
        "updated_at": now,
    }
    await db.entries.insert_one(doc)
    doc.pop("_id", None)
    return entry_to_out(doc)


@router.put("/pcs/{entry_id}")
async def update_pc(entry_id: str, body: PlayerCharacterIn, request: Request):
    existing = await db.entries.find_one({"id": entry_id, "category": "character"})
    if not existing:
        raise HTTPException(status_code=404, detail="Character not found")
    current = await get_optional_user(request)
    if not _can_modify_pc(existing, current, body.player_name):
        raise HTTPException(status_code=403, detail="Only the character's player or a DM can edit this character")

    metadata = {**(existing.get("metadata") or {})}
    metadata.update({
        "role": "PC",
        "owner": metadata.get("owner") or (current["name"] if current else body.player_name.strip()),
        "race": body.race or metadata.get("race", ""),
        "class": body.char_class or metadata.get("class", ""),
        "level": body.level if body.level is not None else metadata.get("level", 1),
        "alignment": body.alignment or metadata.get("alignment", ""),
        "pronouns": body.pronouns or metadata.get("pronouns", ""),
    })
    # 5e fields — replace when client sends them (even empty list means "cleared")
    for k, v in {
        "race_id": body.race_id,
        "class_id": body.class_id,
        "background": body.background,
        "ability_scores": body.ability_scores,
        "max_hp": body.max_hp,
        "current_hp": body.current_hp,
        "armor_class": body.armor_class,
        "speed": body.speed,
        "proficiencies": body.proficiencies,
        "saving_throws": body.saving_throws,
        "skill_profs": body.skill_profs,
        "skill_experts": body.skill_experts,
        "languages": body.languages,
        "spells_known": body.spells_known,
        "spells_prepared": body.spells_prepared,
        "spell_slots": body.spell_slots,
        "spell_slots_used": body.spell_slots_used,
        "equipment": body.equipment,
        "features": body.features,
        "origin_unlocks": body.origin_unlocks,
        "foundation_unlocks": body.foundation_unlocks,
        "class_tree_id": body.class_tree_id,
        "rest_config": body.rest_config,
        "resources": body.resources,
    }.items():
        if v is not None:
            metadata[k] = v
    # Legacy single-resource fields: only touch when client explicitly sends an
    # empty string (deliberate clear). Sending None (the default when absent
    # from the payload) preserves the existing value — this is what fixes the
    # CharacterBuilder save wiping the resource.
    for k, v in {
        "resource_name": body.resource_name,
        "resource_max": body.resource_max,
        "resource_current": body.resource_current,
        "resource_color": body.resource_color,
    }.items():
        if v == "":
            metadata.pop(k, None)
        elif v is not None:
            metadata[k] = v
    if current and not metadata.get("user_id"):
        metadata["user_id"] = current["id"]
    metadata = {k: v for k, v in metadata.items() if v not in ("", None)}

    update = {
        "title": body.name.strip(),
        "subtitle": body.subtitle or "",
        "summary": body.summary or "",
        "content": body.content or "",
        "image_url": body.image_url or "",
        "metadata": metadata,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
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


@router.delete("/pcs/{entry_id}")
async def delete_pc(entry_id: str, request: Request, player_name: str = ""):
    existing = await db.entries.find_one({"id": entry_id, "category": "character"})
    if not existing:
        raise HTTPException(status_code=404, detail="Character not found")
    current = await get_optional_user(request)
    if not _can_modify_pc(existing, current, player_name):
        raise HTTPException(status_code=403, detail="Only the character's player or a DM can delete this character")
    await db.entries.delete_one({"id": entry_id})
    return {"ok": True}


@router.get("/me/pcs")
async def my_pcs(user: dict = Depends(get_current_user)):
    cursor = db.entries.find(
        {"category": "character", "metadata.user_id": user["id"]},
        {"_id": 0},
    ).sort("updated_at", -1)
    items = await cursor.to_list(length=100)
    return [entry_to_out(d) for d in items]


# ---------------- Active PC (equip / unequip) ----------------
@router.get("/me/active-pc")
async def my_active_pc(user: dict = Depends(get_current_user)):
    """Return the user's currently-equipped character (or null)."""
    doc = await db.users.find_one({"_id": ObjectId(user["id"])}, {"active_pc_id": 1})
    pc_id = (doc or {}).get("active_pc_id")
    if not pc_id:
        return None
    entry = await db.entries.find_one({"id": pc_id, "category": "character"}, {"_id": 0})
    return entry_to_out(entry) if entry else None


@router.post("/pcs/{entry_id}/equip")
async def equip_pc(entry_id: str, user: dict = Depends(get_current_user)):
    """Claim a PC as yours (if unowned) and set it as your active character.
    Admins can claim/equip any PC. Players can only equip PCs that are
    unowned or already theirs."""
    entry = await db.entries.find_one({"id": entry_id, "category": "character"})
    if not entry:
        raise HTTPException(status_code=404, detail="Character not found")
    metadata = entry.get("metadata") or {}
    if metadata.get("role") != "PC":
        raise HTTPException(status_code=400, detail="Only Player Characters can be equipped")
    existing_owner = metadata.get("user_id") or ""
    if existing_owner and existing_owner != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="This character is already claimed by another player")
    # Stake the claim if unowned (or admin force-claiming)
    metadata["user_id"] = user["id"]
    if not metadata.get("owner"):
        metadata["owner"] = user["name"]
    await db.entries.update_one(
        {"id": entry_id},
        {"$set": {"metadata": metadata, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    # Set as active on the user doc
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {"$set": {"active_pc_id": entry_id, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    updated = await db.entries.find_one({"id": entry_id}, {"_id": 0})
    return {"ok": True, "entry": entry_to_out(updated)}


@router.post("/pcs/unequip")
async def unequip_pc(user: dict = Depends(get_current_user)):
    """Clear the user's active character (does NOT release ownership)."""
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {"$set": {"active_pc_id": "", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}
