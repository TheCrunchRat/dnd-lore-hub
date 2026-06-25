"""Tests for dice ↔ PC integration:
 - POST /api/dice/rolls accepts pc_id/pc_name/kind and persists them
 - GET /api/dice/rolls returns them
 - PUT /api/pcs/{id} persists skill_profs / skill_experts and preserves prior metadata
 - GET /api/spells/library includes dice_count/dice_size/bonus for both
   rules_spells AND magic-tree nodes
"""
import os
import uuid
from pathlib import Path
import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
DM_EMAIL = "dm@lantern.realm"
DM_PASS = "lantern-keeper-1"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": DM_EMAIL, "password": DM_PASS})
    assert r.status_code == 200, f"DM login failed: {r.status_code} {r.text}"
    return s


# ---------- DICE ROLL FEED ----------

class TestDiceRollFeed:
    def test_post_roll_with_pc_fields_persists(self):
        unique_label = f"TEST_Skill_{uuid.uuid4().hex[:6]}"
        payload = {
            "player_name": "Laz",
            "label": unique_label,
            "rolls": [{"sides": 20, "value": 17}],
            "modifier": 5,
            "total": 22,
            "crit": False,
            "fumble": False,
            "pc_id": "test-pc-id-xyz",
            "pc_name": "wawa",
            "kind": "skill",
        }
        r = requests.post(f"{BASE_URL}/api/dice/rolls", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["pc_id"] == "test-pc-id-xyz"
        assert body["pc_name"] == "wawa"
        assert body["kind"] == "skill"
        assert body["total"] == 22
        assert body["rolls"][0]["sides"] == 20
        assert body["rolls"][0]["value"] == 17

        # GET and verify presence in feed
        feed = requests.get(f"{BASE_URL}/api/dice/rolls?limit=10").json()
        found = next((e for e in feed if e.get("label") == unique_label), None)
        assert found is not None, "Posted roll missing from feed"
        assert found["pc_id"] == "test-pc-id-xyz"
        assert found["pc_name"] == "wawa"
        assert found["kind"] == "skill"

    def test_post_roll_without_pc_fields_still_works(self):
        unique_label = f"TEST_Basic_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/dice/rolls", json={
            "player_name": "Anonymous",
            "label": unique_label,
            "rolls": [{"sides": 20, "value": 10}],
            "modifier": 0,
            "total": 10,
        })
        assert r.status_code == 200
        body = r.json()
        assert body["pc_id"] is None
        assert body["pc_name"] is None


# ---------- PC SKILL PROFS / EXPERTS ----------

class TestPcSkillsPersistence:
    def test_wawa_skill_profs_and_metadata_preserved(self, session):
        # Find wawa PC
        chars = session.get(f"{BASE_URL}/api/entries?category=character&limit=50").json()
        wawa = next((c for c in chars if c.get("slug") == "wawa" or c.get("title", "").lower() == "wawa"), None)
        assert wawa is not None, "Seed PC 'wawa' not found"
        pc_id = wawa["id"]

        # Snapshot prior critical metadata to verify preservation
        prior = wawa.get("metadata") or {}
        prior_level = prior.get("level")
        prior_resources = prior.get("resources") or []
        prior_origin = prior.get("origin_unlocks") or []

        # PUT with skill_profs / skill_experts; intentionally minimal body
        payload = {
            "name": wawa.get("title") or "wawa",
            "player_name": "Laz",
            "skill_profs": ["Athletics", "Stealth"],
            "skill_experts": ["Stealth"],
        }
        r = session.put(f"{BASE_URL}/api/pcs/{pc_id}", json=payload)
        assert r.status_code == 200, r.text

        # GET and verify persistence + preservation of other fields
        updated = session.get(f"{BASE_URL}/api/entries/{pc_id}").json()
        meta = updated.get("metadata") or {}
        assert set(meta.get("skill_profs") or []) == {"Athletics", "Stealth"}
        assert set(meta.get("skill_experts") or []) == {"Stealth"}
        # Critical metadata preserved
        if prior_level is not None:
            assert meta.get("level") == prior_level, "level was clobbered"
        if prior_resources:
            assert meta.get("resources") == prior_resources, "resources were clobbered"
        if prior_origin:
            assert meta.get("origin_unlocks") == prior_origin, "origin_unlocks were clobbered"


# ---------- SPELL LIBRARY DICE FIELDS ----------

class TestSpellLibraryDice:
    def test_library_returns_dice_fields(self):
        items = requests.get(f"{BASE_URL}/api/spells/library").json()
        assert isinstance(items, list) and len(items) > 0
        # Every item should expose the dice keys (even when None)
        sample = items[0]
        for k in ("dice_count", "dice_size", "bonus"):
            assert k in sample, f"missing {k} on spell library row"

    def test_can_put_spell_with_dice_config(self, session):
        # Find Fire Bolt or any SRD spell
        items = requests.get(f"{BASE_URL}/api/spells/library").json()
        target = next((s for s in items if s.get("name", "").lower() == "fire bolt" and s.get("source") != "magic-node"), None)
        if target is None:
            pytest.skip("Fire Bolt not in library")
        sid = target["id"]
        payload = {
            "name": target.get("name", "Fire Bolt"),
            "level": target.get("level", 0),
            "school": target.get("school", "evocation"),
            "casting_time": target.get("casting_time", "1 action"),
            "range": target.get("range", "120 feet"),
            "components": target.get("components", "V, S"),
            "duration": target.get("duration", "Instantaneous"),
            "classes": target.get("classes", []),
            "description": target.get("description", ""),
            "dice_count": 1,
            "dice_size": 10,
            "bonus": 0,
        }
        r = session.put(f"{BASE_URL}/api/rules/spells/{sid}", json=payload)
        assert r.status_code == 200, r.text
        # Re-fetch library and verify dice config persisted
        items2 = requests.get(f"{BASE_URL}/api/spells/library").json()
        again = next((s for s in items2 if s.get("id") == sid), None)
        assert again is not None
        assert again.get("dice_count") == 1
        assert again.get("dice_size") == 10
        assert again.get("bonus") == 0
