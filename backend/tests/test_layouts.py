"""Tests for the realm layouts singleton endpoints (GET/PUT /api/layouts)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dnd-lore-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DM_EMAIL = "dm@lantern.realm"
DM_PASS = "lantern-keeper-1"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": DM_EMAIL, "password": DM_PASS})
    assert r.status_code == 200, f"DM login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def anon_session():
    return requests.Session()


# ---------- Layouts API ----------

def test_get_layouts_public_returns_defaults(anon_session):
    r = anon_session.get(f"{API}/layouts")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "character_sheet" in data
    assert "dice_page" in data
    # New default blocks must be present somewhere on character_sheet
    cs = data["character_sheet"]
    all_cs = (cs.get("left") or []) + (cs.get("right") or []) + (cs.get("hidden") or [])
    assert "saves_skills" in all_cs, f"saves_skills missing from character_sheet: {all_cs}"
    assert "gear" in all_cs, f"gear missing from character_sheet: {all_cs}"
    # Dice page should have live_feed by default (in right column)
    dp = data["dice_page"]
    all_dp = (dp.get("left") or []) + (dp.get("right") or []) + (dp.get("hidden") or [])
    assert "live_feed" in all_dp


def test_put_layouts_requires_admin(anon_session):
    r = anon_session.put(
        f"{API}/layouts",
        json={"dice_page": {"left": [], "right": ["live_feed"], "hidden": [], "configs": {}}},
    )
    # Anonymous → 401 (no token) or 403 depending on auth wiring
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}: {r.text}"


def test_put_layouts_admin_persists_and_reflects(admin_session):
    # Snapshot current
    cur = admin_session.get(f"{API}/layouts").json()

    # Move live_feed Side → Main on dice_page
    payload = {
        "dice_page": {
            "left": ["active_pc", "display", "quick", "builder", "live_feed"],
            "right": [],
            "hidden": [],
            "configs": {"live_feed": {"limit": 25}},
        }
    }
    r = admin_session.put(f"{API}/layouts", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "live_feed" in body["dice_page"]["left"]
    assert "live_feed" not in body["dice_page"].get("right", [])
    assert body["dice_page"]["configs"]["live_feed"]["limit"] == 25

    # GET round-trip
    g = admin_session.get(f"{API}/layouts").json()
    assert "live_feed" in g["dice_page"]["left"]
    assert g["dice_page"]["configs"]["live_feed"]["limit"] == 25

    # Restore default ordering (live_feed back in right)
    restore = {
        "dice_page": {
            "left": cur["dice_page"]["left"],
            "right": cur["dice_page"]["right"],
            "hidden": cur["dice_page"].get("hidden", []),
            "configs": cur["dice_page"].get("configs", {}),
        }
    }
    r2 = admin_session.put(f"{API}/layouts", json=restore)
    assert r2.status_code == 200
    g2 = admin_session.get(f"{API}/layouts").json()
    assert g2["dice_page"]["right"] == cur["dice_page"]["right"]


def test_put_layouts_empty_body_400(admin_session):
    r = admin_session.put(f"{API}/layouts", json={})
    assert r.status_code == 400


def test_put_layouts_character_sheet_saves_new_keys(admin_session):
    # Snapshot
    cur = admin_session.get(f"{API}/layouts").json()
    cs = cur["character_sheet"]
    # Force a known ordering with saves_skills and gear in hidden
    payload = {
        "character_sheet": {
            "left": [k for k in cs["left"] if k not in ("saves_skills", "gear")],
            "right": [],
            "hidden": ["saves_skills", "gear"],
            "configs": cs.get("configs", {}),
        }
    }
    r = admin_session.put(f"{API}/layouts", json=payload)
    assert r.status_code == 200
    body = r.json()["character_sheet"]
    assert "saves_skills" in body["hidden"]
    assert "gear" in body["hidden"]

    # Restore
    restore = {"character_sheet": {"left": cs["left"], "right": cs.get("right", []),
                                    "hidden": cs.get("hidden", []), "configs": cs.get("configs", {})}}
    admin_session.put(f"{API}/layouts", json=restore)
