"""Shared Pydantic models + DB formatters used by multiple route modules.

Models specific to a single route group live alongside that group; anything
that crosses module boundaries (user, entries, map position, profile output)
is centralised here so callers don't depend on each other through server.py.
"""
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from deps import Category


# ---------------- Auth / Profile ----------------
class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: str


class ProfileIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    quote: Optional[str] = None
    title: Optional[str] = None
    pronouns: Optional[str] = None
    active_pc_id: Optional[str] = None  # currently-equipped character id


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=40)


def profile_to_out(user_doc: dict, include_email: bool = False) -> dict:
    out = {
        "id": user_doc["id"],
        "name": user_doc.get("name", ""),
        "role": user_doc.get("role", "player"),
        "display_name": user_doc.get("display_name") or user_doc.get("name", ""),
        "avatar_url": user_doc.get("avatar_url", ""),
        "bio": user_doc.get("bio", ""),
        "quote": user_doc.get("quote", ""),
        "title": user_doc.get("title", ""),
        "pronouns": user_doc.get("pronouns", ""),
        "active_pc_id": user_doc.get("active_pc_id", ""),
        "created_at": user_doc.get("created_at"),
    }
    if include_email:
        out["email"] = user_doc.get("email", "")
    return out


# ---------------- Entries ----------------
class EntryIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    category: Category
    title: str
    subtitle: Optional[str] = ""
    summary: Optional[str] = ""
    content: Optional[str] = ""
    image_url: Optional[str] = ""
    tags: List[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)
    pinned: bool = False
    is_private: bool = False  # DM-only: hidden from non-admin list/detail responses
    map_x: Optional[float] = None  # 0-100 percent X on world map
    map_y: Optional[float] = None  # 0-100 percent Y on world map
    map_id: Optional[str] = None   # which regional map this entry sits on; null → default


class EntryOut(EntryIn):
    id: str
    slug: str
    created_at: str
    updated_at: str


def entry_to_out(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "slug": doc["slug"],
        "category": doc["category"],
        "title": doc["title"],
        "subtitle": doc.get("subtitle", ""),
        "summary": doc.get("summary", ""),
        "content": doc.get("content", ""),
        "image_url": doc.get("image_url", ""),
        "tags": doc.get("tags", []),
        "metadata": doc.get("metadata", {}),
        "pinned": doc.get("pinned", False),
        "is_private": doc.get("is_private", False),
        "map_x": doc.get("map_x"),
        "map_y": doc.get("map_y"),
        "map_id": doc.get("map_id"),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


class MapPositionIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    map_x: Optional[float] = None
    map_y: Optional[float] = None
    map_id: Optional[str] = None
