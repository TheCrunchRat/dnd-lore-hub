"""
Backend tests for Spell Compendium CRUD (iteration 9/10):
- GET /api/rules/spells: public, returns seed SRD spells
- POST /api/rules/spells: admin-only, creates homebrew spell
- PUT /api/rules/spells/{id}: admin-only, updates homebrew spell
- DELETE /api/rules/spells/{id}: admin-only, deletes spell
- Anonymous mutations must be rejected (401/403)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

DM_EMAIL = "dm@lantern.realm"
DM_PASSWORD = "lantern-keeper-1"


@pytest.fixture(scope="module")
def dm_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": DM_EMAIL, "password": DM_PASSWORD})
    assert r.status_code == 200, f"DM login failed: {r.status_code} {r.text}"
    return s


def test_public_get_spells_returns_seed_list():
    anon = requests.Session()
    r = anon.get(f"{API}/rules/spells")
    assert r.status_code == 200, r.text
    spells = r.json()
    assert isinstance(spells, list)
    assert len(spells) >= 18, f"Expected at least 18 seed spells, got {len(spells)}"
    # Validate shape
    sample = spells[0]
    for key in ("id", "name", "level", "school"):
        assert key in sample, f"Missing key '{key}' in spell payload"


def test_anonymous_post_spell_forbidden():
    anon = requests.Session()
    r = anon.post(f"{API}/rules/spells", json={
        "name": "TEST_AnonSpell", "level": 1, "school": "Evocation",
        "description": "should be rejected", "source": "homebrew",
    })
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


def test_admin_post_put_delete_homebrew_spell(dm_session):
    suffix = uuid.uuid4().hex[:8]
    name = f"TEST_Wickfire_{suffix}"
    payload = {
        "name": name,
        "level": 2,
        "school": "Evocation",
        "casting_time": "1 action",
        "range": "60 feet",
        "components": "V, S, M (a tethered lantern)",
        "duration": "Instantaneous",
        "classes": ["Wickwarden", "Wizard"],
        "description": "Hurl a tethered lantern that explodes in flame.",
        "source": "homebrew",
    }
    # CREATE
    r = dm_session.post(f"{API}/rules/spells", json=payload)
    assert r.status_code in (200, 201), f"Create failed: {r.status_code} {r.text}"
    created = r.json()
    assert "id" in created
    assert created["name"] == name
    assert created["level"] == 2
    assert created["school"] == "Evocation"
    assert created.get("source") == "homebrew"
    spell_id = created["id"]

    try:
        # GET verify persistence
        r = requests.get(f"{API}/rules/spells")
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()]
        assert spell_id in ids, "Newly created spell not in list"

        # Anonymous DELETE must be forbidden
        anon = requests.Session()
        r_anon = anon.delete(f"{API}/rules/spells/{spell_id}")
        assert r_anon.status_code in (401, 403), f"Anon delete should be blocked, got {r_anon.status_code}"

        # Anonymous PUT must be forbidden
        r_anon_put = anon.put(f"{API}/rules/spells/{spell_id}", json={**payload, "level": 9})
        assert r_anon_put.status_code in (401, 403), f"Anon put should be blocked, got {r_anon_put.status_code}"

        # UPDATE level → 3
        upd_body = {**payload, "level": 3}
        r = dm_session.put(f"{API}/rules/spells/{spell_id}", json=upd_body)
        assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text}"
        updated = r.json()
        assert updated["level"] == 3
        assert updated["name"] == name

        # Re-fetch list and verify updated level persisted
        r = requests.get(f"{API}/rules/spells")
        item = next((s for s in r.json() if s["id"] == spell_id), None)
        assert item is not None
        assert item["level"] == 3

    finally:
        # DELETE
        r = dm_session.delete(f"{API}/rules/spells/{spell_id}")
        assert r.status_code in (200, 204), f"DELETE failed: {r.status_code} {r.text}"

    # Verify gone
    r = requests.get(f"{API}/rules/spells")
    ids = [s["id"] for s in r.json()]
    assert spell_id not in ids, "Spell still present after delete"
