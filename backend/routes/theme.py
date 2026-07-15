"""Realm cosmetic theme + decals.

A singleton doc drives every page's background, tint, vignette, grain, accent
color, and floating decals (images layered above/below content with optional
scroll or mouse parallax). Admins edit through a live in-page editor.
"""
import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from deps import db, get_current_user

router = APIRouter()


class Decal(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    image_url: str = Field(min_length=1)
    x: float = 50.0   # % from left
    y: float = 50.0   # % from top
    width: float = 12.0  # % of viewport width
    opacity: float = 0.85
    rotation: float = 0.0
    z_index: int = 5  # positive = above content, negative = below
    parallax_mode: Literal["static", "scroll", "mouse"] = "static"
    depth: float = 0.3  # 0..1, how strongly parallax reacts
    pages: List[str] = Field(default_factory=list)  # empty = all pages; otherwise route prefixes


class PageOverride(BaseModel):
    model_config = ConfigDict(extra="ignore")
    background_url: Optional[str] = None
    background_blur: Optional[float] = None
    background_dim: Optional[float] = None
    background_fade: Optional[float] = None
    background_position: Optional[str] = None
    background_size: Optional[str] = None
    overlay_tint: Optional[str] = None
    overlay_strength: Optional[float] = None
    accent_color: Optional[str] = None
    vignette: Optional[bool] = None
    grain: Optional[bool] = None
    transition_ms: Optional[int] = None


class ThemeIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    background_url: Optional[str] = ""
    background_blur: float = 0.0       # px, 0..20
    background_dim: float = 0.45       # 0..1
    background_fade: float = 0.0       # 0..1 — feather the image edges into darkness
    background_position: str = "center"  # CSS background-position
    background_size: str = "cover"       # cover | contain | auto
    overlay_tint: Literal["none", "warm", "cool", "dark", "purple", "green"] = "none"
    overlay_strength: float = 0.2      # 0..1
    accent_color: str = "#FBBF24"
    vignette: bool = True
    grain: bool = False
    transition_ms: int = 600            # background/tint cross-fade duration
    decals: List[Decal] = Field(default_factory=list)
    page_overrides: dict = Field(default_factory=dict)  # {"/dice": {...PageOverride...}}


DEFAULT_THEME = {
    "background_url": "",
    "background_blur": 0.0,
    "background_dim": 0.45,
    "background_fade": 0.0,
    "background_position": "center",
    "background_size": "cover",
    "overlay_tint": "none",
    "overlay_strength": 0.2,
    "accent_color": "#FBBF24",
    "vignette": True,
    "grain": False,
    "transition_ms": 600,
    "decals": [],
    "page_overrides": {},
}


def _theme_out(doc: dict) -> dict:
    if not doc:
        return DEFAULT_THEME
    doc.pop("_id", None)
    return {**DEFAULT_THEME, **doc}


@router.get("/theme")
async def get_theme():
    doc = await db.realm_theme.find_one({"_id": "default"}, {"_id": 0})
    return _theme_out(doc or {})


@router.put("/theme")
async def put_theme(body: ThemeIn, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    payload = body.model_dump()
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.realm_theme.update_one({"_id": "default"}, {"$set": payload}, upsert=True)
    return await get_theme()


@router.post("/theme/decals")
async def add_decal(body: Decal, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    # Ensure the decal has a stable id
    decal = body.model_dump()
    decal["id"] = decal.get("id") or str(uuid.uuid4())
    await db.realm_theme.update_one(
        {"_id": "default"},
        {"$push": {"decals": decal},
         "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return await get_theme()


@router.put("/theme/decals/{decal_id}")
async def update_decal(decal_id: str, body: Decal, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    decal = body.model_dump()
    decal["id"] = decal_id
    res = await db.realm_theme.update_one(
        {"_id": "default", "decals.id": decal_id},
        {"$set": {"decals.$": decal, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Decal not found")
    return await get_theme()


@router.delete("/theme/decals/{decal_id}")
async def delete_decal(decal_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    res = await db.realm_theme.update_one(
        {"_id": "default"},
        {"$pull": {"decals": {"id": decal_id}},
         "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=404, detail="Decal not found")
    return {"ok": True}
