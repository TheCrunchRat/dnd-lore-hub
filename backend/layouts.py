"""Realm-wide page layout (singleton). Admin edits via PUT; everyone reads via GET.

Stored as a single Mongo doc keyed by `_id: "default"`. Each page (character_sheet,
dice_page) has three ordered lists of block keys: `left`, `right`, `hidden`.

Per-block config (e.g. feed_limit, portrait_size) lives in a parallel `configs`
map: `{ block_key: { ... } }`. Unknown keys are ignored by the frontend.
"""
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict


class PageLayout(BaseModel):
    model_config = ConfigDict(extra="ignore")
    left: List[str] = Field(default_factory=list)
    right: List[str] = Field(default_factory=list)
    hidden: List[str] = Field(default_factory=list)
    configs: Dict[str, dict] = Field(default_factory=dict)


class RealmLayoutIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    character_sheet: Optional[PageLayout] = None
    dice_page: Optional[PageLayout] = None


DEFAULT_LAYOUTS = {
    "character_sheet": {
        "left": [
            "portrait", "equip", "resources", "rest", "modifiers",
            "rollers", "stats", "abilities", "spells", "treesections", "content",
        ],
        "right": [],
        "hidden": [],
        "configs": {
            "portrait": {"size": "medium"},
            "live_feed": {"limit": 8},
        },
    },
    "dice_page": {
        "left": ["active_pc", "display", "quick", "builder", "live_feed"],
        "right": [],
        "hidden": [],
        "configs": {
            "live_feed": {"limit": 12},
        },
    },
}
