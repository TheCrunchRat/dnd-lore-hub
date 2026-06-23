"""Tests for the new world-map feature: /api/settings and /api/entries/{id}/position."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dnd-lore-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DM_EMAIL = "dm@lantern.realm"
DM_PASSWORD = "lantern-keeper-1"


@pytest.fixture(scope="module")
def anon_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def dm_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": DM_EMAIL, "password": DM_PASSWORD})
    assert r.status_code == 200, f"DM login failed: {r.status_code} {r.text}"
    return s


# -------- /api/settings --------
class TestSettings:
    def test_get_settings_returns_world_map_url(self, anon_client):
        r = anon_client.get(f"{API}/settings")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict)
        assert "world_map_url" in data
        assert isinstance(data["world_map_url"], str)
        assert data["world_map_url"].startswith("http")

    def test_put_settings_without_auth_401(self, anon_client):
        r = anon_client.put(f"{API}/settings", json={"world_map_url": "https://example.com/x.png"})
        assert r.status_code == 401

    def test_put_settings_with_dm_updates(self, dm_client):
        # First read current value to restore later
        original = dm_client.get(f"{API}/settings").json()["world_map_url"]
        new_url = "https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?auto=format&fit=crop&w=2400&q=80&test=1"
        r = dm_client.put(f"{API}/settings", json={"world_map_url": new_url})
        assert r.status_code == 200
        data = r.json()
        assert data["world_map_url"] == new_url
        # Persisted via GET
        get_r = dm_client.get(f"{API}/settings")
        assert get_r.json()["world_map_url"] == new_url
        # Restore
        dm_client.put(f"{API}/settings", json={"world_map_url": original})


# -------- Entry map_x/map_y model --------
class TestEntryMapFields:
    def test_mirewatch_exposes_seeded_coords(self, anon_client):
        r = anon_client.get(f"{API}/entries/mirewatch")
        assert r.status_code == 200
        data = r.json()
        assert "map_x" in data and "map_y" in data
        assert data["map_x"] == 38.5
        assert data["map_y"] == 62.0
        assert data["slug"] == "mirewatch"


# -------- /api/entries/{id}/position --------
class TestEntryPosition:
    def test_position_without_auth_401(self, anon_client):
        r = anon_client.put(f"{API}/entries/mirewatch/position", json={"map_x": 50, "map_y": 50})
        assert r.status_code == 401

    def test_position_update_with_auth(self, dm_client):
        # Need the actual id (route only accepts id, not slug)
        original = dm_client.get(f"{API}/entries/mirewatch").json()
        mid = original["id"]
        orig_x, orig_y = original["map_x"], original["map_y"]
        try:
            r = dm_client.put(f"{API}/entries/{mid}/position", json={"map_x": 50, "map_y": 50})
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["map_x"] == 50
            assert data["map_y"] == 50
            # Verify persisted
            get_r = dm_client.get(f"{API}/entries/mirewatch")
            assert get_r.json()["map_x"] == 50
            assert get_r.json()["map_y"] == 50
        finally:
            dm_client.put(f"{API}/entries/{mid}/position", json={"map_x": orig_x, "map_y": orig_y})

    def test_position_clear_with_null(self, dm_client):
        original = dm_client.get(f"{API}/entries/mirewatch").json()
        mid = original["id"]
        orig_x, orig_y = original["map_x"], original["map_y"]
        try:
            r = dm_client.put(f"{API}/entries/{mid}/position", json={"map_x": None, "map_y": None})
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["map_x"] is None
            assert data["map_y"] is None
            get_r = dm_client.get(f"{API}/entries/mirewatch")
            j = get_r.json()
            assert j["map_x"] is None
            assert j["map_y"] is None
        finally:
            dm_client.put(f"{API}/entries/{mid}/position", json={"map_x": orig_x or 38.5, "map_y": orig_y or 62.0})

    def test_position_unknown_entry_404(self, dm_client):
        r = dm_client.put(f"{API}/entries/does-not-exist-xyz/position", json={"map_x": 10, "map_y": 10})
        assert r.status_code == 404
