"""Magic skill trees + unified spell library (SRD + homebrew + tree-nodes)."""
import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from deps import db, get_current_user, slugify

router = APIRouter()


class NodeModifier(BaseModel):
    model_config = ConfigDict(extra="ignore")
    stat: Literal["str", "dex", "con", "int", "wis", "cha", "hp", "ac", "speed", "init"]
    value: int


class MagicNode(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = ""
    icon: Optional[str] = "Sparkles"
    x: float = 0.5
    y: float = 0.5
    requires: List[str] = Field(default_factory=list)
    # Rank progression: max 1-5, current 0..max
    max_rank: Optional[int] = 1
    current_rank: Optional[int] = 0
    # Visual: small/normal/large/huge changes the rendered size
    tier_size: Optional[str] = "normal"
    # Optional color override (defaults to the tree's accent_color)
    color: Optional[str] = None
    # Optional per-rank descriptions ("rank 1: …", "rank 2: …")
    rank_descriptions: Optional[List[str]] = Field(default_factory=list)
    # Minimum character level required to unlock this node
    level_required: Optional[int] = None
    # ---- Spell properties (when set, this node also appears in /api/spells/library) ----
    spell_level: Optional[int] = None      # 0..9; None = not a spell
    school: Optional[str] = ""
    casting_time: Optional[str] = ""
    spell_range: Optional[str] = ""
    components: Optional[str] = ""
    duration: Optional[str] = ""
    spell_classes: Optional[List[str]] = Field(default_factory=list)
    # Damage / effect dice for casting this spell-node (e.g., 3d6+2)
    dice_count: Optional[int] = None
    dice_size: Optional[int] = None
    bonus: Optional[int] = None
    # ---- Stat modifiers granted while this node is unlocked & level-gate met ----
    modifiers: Optional[List[NodeModifier]] = Field(default_factory=list)


class MagicTreeIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    subtitle: Optional[str] = ""
    summary: Optional[str] = ""
    content: Optional[str] = ""
    accent_color: Optional[str] = "#FBBF24"
    image_url: Optional[str] = ""
    tree_category: Literal["origin", "foundation", "class"] = "origin"
    nodes: List[MagicNode] = Field(default_factory=list)


def magic_to_out(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "slug": doc["slug"],
        "name": doc["name"],
        "subtitle": doc.get("subtitle", ""),
        "summary": doc.get("summary", ""),
        "content": doc.get("content", ""),
        "accent_color": doc.get("accent_color", "#FBBF24"),
        "image_url": doc.get("image_url", ""),
        "tree_category": doc.get("tree_category", "origin"),
        "nodes": doc.get("nodes", []),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


@router.get("/magic/trees")
async def list_magic_trees():
    cursor = db.magic_trees.find({}, {"_id": 0}).sort("updated_at", -1)
    items = await cursor.to_list(length=200)
    return [magic_to_out(d) for d in items]


@router.get("/magic/trees/{tree_id}")
async def get_magic_tree(tree_id: str):
    doc = await db.magic_trees.find_one({"$or": [{"id": tree_id}, {"slug": tree_id}]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Tree not found")
    return magic_to_out(doc)


@router.post("/magic/trees")
async def create_magic_tree(body: MagicTreeIn, _user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    tid = str(uuid.uuid4())
    base_slug = slugify(body.name)
    slug = base_slug
    i = 2
    while await db.magic_trees.find_one({"slug": slug}):
        slug = f"{base_slug}-{i}"
        i += 1
    doc = body.model_dump()
    doc.update({"id": tid, "slug": slug, "created_at": now, "updated_at": now})
    await db.magic_trees.insert_one(doc)
    doc.pop("_id", None)
    return magic_to_out(doc)


@router.put("/magic/trees/{tree_id}")
async def update_magic_tree(tree_id: str, body: MagicTreeIn, _user: dict = Depends(get_current_user)):
    existing = await db.magic_trees.find_one({"id": tree_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Tree not found")
    update = body.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    if update["name"] != existing.get("name"):
        base_slug = slugify(update["name"])
        slug = base_slug
        i = 2
        while await db.magic_trees.find_one({"slug": slug, "id": {"$ne": tree_id}}):
            slug = f"{base_slug}-{i}"
            i += 1
        update["slug"] = slug
    await db.magic_trees.update_one({"id": tree_id}, {"$set": update})
    updated = await db.magic_trees.find_one({"id": tree_id}, {"_id": 0})
    return magic_to_out(updated)


@router.delete("/magic/trees/{tree_id}")
async def delete_magic_tree(tree_id: str, _user: dict = Depends(get_current_user)):
    res = await db.magic_trees.delete_one({"id": tree_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tree not found")
    return {"ok": True}


@router.get("/spells/library")
async def spell_library():
    """Unified spell list: SRD + homebrew rules_spells AND magic-tree nodes
    that have `spell_level` set. Returns the same shape for all sources."""
    items: List[dict] = []
    async for sp in db.rules_spells.find({}, {"_id": 0}):
        items.append({
            "id": sp.get("id"),
            "name": sp.get("name", ""),
            "level": sp.get("level", 0),
            "school": sp.get("school", ""),
            "casting_time": sp.get("casting_time", ""),
            "range": sp.get("range", ""),
            "components": sp.get("components", ""),
            "duration": sp.get("duration", ""),
            "classes": sp.get("classes", []),
            "description": sp.get("description", ""),
            "source": sp.get("source", "srd"),
            "dice_count": sp.get("dice_count"),
            "dice_size": sp.get("dice_size"),
            "bonus": sp.get("bonus"),
        })
    async for tree in db.magic_trees.find({}, {"_id": 0}):
        for n in (tree.get("nodes") or []):
            if n.get("spell_level") is None:
                continue
            items.append({
                "id": f"{tree['id']}::{n['id']}",
                "node_id": n["id"],
                "tree_id": tree["id"],
                "tree_name": tree.get("name", ""),
                "tree_slug": tree.get("slug", ""),
                "tree_category": tree.get("tree_category", "origin"),
                "accent_color": tree.get("accent_color", "#FBBF24"),
                "name": n.get("name", ""),
                "level": int(n.get("spell_level") or 0),
                "school": n.get("school") or "",
                "casting_time": n.get("casting_time") or "",
                "range": n.get("spell_range") or "",
                "components": n.get("components") or "",
                "duration": n.get("duration") or "",
                "classes": n.get("spell_classes") or [],
                "description": n.get("description") or "",
                "source": "magic-node",
                "dice_count": n.get("dice_count"),
                "dice_size": n.get("dice_size"),
                "bonus": n.get("bonus"),
            })
    items.sort(key=lambda s: (s.get("level", 0), s.get("name", "").lower()))
    return items
