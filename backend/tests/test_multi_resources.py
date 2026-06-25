"""Iter_12 — multi-resource + PUT merge contract for /api/pcs.

Coverage:
- resources array round-trips via PUT /api/pcs + GET /api/entries/{slug}
- Builder-style PUT WITHOUT `resources` preserves existing resources (the bug)
- Legacy single resource_* fields are NOT popped on None (preserved on partial PUT)
- Sending `resource_name=""` deliberately clears the legacy single-resource fields
- Gated modifier scenario: tree node with level_required>character.level persists
  through unlock pointers (foundation/origin) for the panel to render
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
DM_EMAIL = "dm@lantern.realm"
DM_PASSWORD = "lantern-keeper-1"
WAWA_ID = "a6ded32c-bce2-4eaf-bf00-939a5fa345f8"
WAWA_SLUG = "wawa"


@pytest.fixture(scope="module")
def dm_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": DM_EMAIL, "password": DM_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"DM login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def wawa_baseline(dm_session):
    """Seed wawa with two resources (Mana + Wickfire) before the test class runs."""
    g = dm_session.get(f"{BASE_URL}/api/entries/{WAWA_SLUG}")
    assert g.status_code == 200, g.text
    meta = g.json()["metadata"]
    payload = {
        "player_name": meta.get("owner", "Laz"),
        "name": g.json()["title"],
        "level": meta.get("level", 3),
        "race": meta.get("race", ""),
        "char_class": meta.get("class", ""),
        "resources": [
            {"id": str(uuid.uuid4()), "name": "Mana",     "max": 10, "current": 7, "color": "#60A5FA"},
            {"id": str(uuid.uuid4()), "name": "Wickfire", "max": 3,  "current": 3, "color": "#F97316"},
        ],
    }
    r = dm_session.put(f"{BASE_URL}/api/pcs/{WAWA_ID}", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- 1. resources round-trip ----------
def test_resources_roundtrip(dm_session, wawa_baseline):
    g = dm_session.get(f"{BASE_URL}/api/entries/{WAWA_SLUG}")
    assert g.status_code == 200
    res = g.json()["metadata"].get("resources") or []
    names = [r["name"] for r in res]
    assert "Mana" in names and "Wickfire" in names
    mana = next(r for r in res if r["name"] == "Mana")
    assert mana["max"] == 10 and mana["current"] == 7 and mana["color"] == "#60A5FA"


# ---------- 2. THE BUG: builder-style PUT without `resources` preserves them ----------
def test_builder_put_without_resources_preserves_them(dm_session, wawa_baseline):
    before = dm_session.get(f"{BASE_URL}/api/entries/{WAWA_SLUG}").json()["metadata"]
    before_res = before.get("resources") or []
    assert len(before_res) >= 2, "precondition: resources seeded"

    # Builder-style partial PUT — only changes level. NO `resources`, NO `resource_*`.
    partial = {
        "player_name": before.get("owner", "Laz"),
        "name": "wawa",
        "level": (before.get("level", 3) or 3) + 1,  # 3 -> 4
    }
    r = dm_session.put(f"{BASE_URL}/api/pcs/{WAWA_ID}", json=partial)
    assert r.status_code == 200, r.text

    after = dm_session.get(f"{BASE_URL}/api/entries/{WAWA_SLUG}").json()["metadata"]
    assert after.get("level") == partial["level"]
    after_res = after.get("resources") or []
    assert len(after_res) == len(before_res), "resources array MUST be preserved on partial PUT"
    assert {r["name"] for r in after_res} == {r["name"] for r in before_res}


# ---------- 3. legacy resource_* fields preserved when not sent ----------
def test_legacy_single_resource_preserved_on_partial(dm_session):
    # First, set a legacy single resource_name explicitly
    g = dm_session.get(f"{BASE_URL}/api/entries/{WAWA_SLUG}").json()
    meta = g["metadata"]
    setup = {
        "player_name": meta.get("owner", "Laz"),
        "name": g["title"],
        "level": meta.get("level", 4),
        "resource_name": "LegacyEmber",
        "resource_max": 4,
        "resource_current": 2,
        "resource_color": "#FBBF24",
    }
    r = dm_session.put(f"{BASE_URL}/api/pcs/{WAWA_ID}", json=setup)
    assert r.status_code == 200
    meta_after = dm_session.get(f"{BASE_URL}/api/entries/{WAWA_SLUG}").json()["metadata"]
    assert meta_after.get("resource_name") == "LegacyEmber"

    # Now do a partial PUT (the bug repro) that does NOT include any resource_* field.
    partial = {
        "player_name": meta.get("owner", "Laz"),
        "name": g["title"],
        "level": meta.get("level", 4),
    }
    r2 = dm_session.put(f"{BASE_URL}/api/pcs/{WAWA_ID}", json=partial)
    assert r2.status_code == 200
    meta_final = dm_session.get(f"{BASE_URL}/api/entries/{WAWA_SLUG}").json()["metadata"]
    # Legacy fields MUST still exist (bug fix: None should NOT pop them).
    assert meta_final.get("resource_name") == "LegacyEmber"
    assert meta_final.get("resource_max") == 4


# ---------- 4. explicit empty-string clears legacy fields ----------
def test_legacy_resource_explicit_clear(dm_session):
    g = dm_session.get(f"{BASE_URL}/api/entries/{WAWA_SLUG}").json()
    meta = g["metadata"]
    clear_payload = {
        "player_name": meta.get("owner", "Laz"),
        "name": g["title"],
        "level": meta.get("level", 4),
        "resource_name": "",  # deliberate clear
    }
    r = dm_session.put(f"{BASE_URL}/api/pcs/{WAWA_ID}", json=clear_payload)
    assert r.status_code == 200
    meta_after = dm_session.get(f"{BASE_URL}/api/entries/{WAWA_SLUG}").json()["metadata"]
    assert "resource_name" not in meta_after or not meta_after.get("resource_name")


# ---------- 5. add a 3rd resource, verify ordering preserved ----------
def test_third_resource_persists(dm_session):
    g = dm_session.get(f"{BASE_URL}/api/entries/{WAWA_SLUG}").json()
    meta = g["metadata"]
    existing = list(meta.get("resources") or [])
    existing.append({"id": str(uuid.uuid4()), "name": "Sand Charges", "max": 5, "current": 5, "color": "#84CC16"})
    payload = {
        "player_name": meta.get("owner", "Laz"),
        "name": g["title"],
        "level": meta.get("level", 4),
        "resources": existing,
    }
    r = dm_session.put(f"{BASE_URL}/api/pcs/{WAWA_ID}", json=payload)
    assert r.status_code == 200, r.text
    after = dm_session.get(f"{BASE_URL}/api/entries/{WAWA_SLUG}").json()["metadata"]["resources"]
    names = [x["name"] for x in after]
    assert "Sand Charges" in names
    sand = next(x for x in after if x["name"] == "Sand Charges")
    assert sand["max"] == 5 and sand["color"] == "#84CC16"


# ---------- 6. gated modifier round-trip (modifier panel data) ----------
def test_gated_modifier_node_persists(dm_session):
    """Add a tree+node with level_required=10, modifier {dex:+2}; bind to wawa via
    foundation_unlocks; verify both ends round-trip so the panel can render the
    'Unlocks at higher levels' row with a deep link."""
    tree_payload = {
        "name": f"TEST_GatedTree_{uuid.uuid4().hex[:6]}",
        "tree_category": "foundation",
        "accent_color": "#A78BFA",
        "nodes": [{
            "id": "gated_node_1",
            "name": "Tide Step",
            "description": "Pending shift",
            "level_required": 10,
            "modifiers": [{"stat": "dex", "value": 2}],
        }],
    }
    rt = dm_session.post(f"{BASE_URL}/api/magic/trees", json=tree_payload)
    assert rt.status_code == 200, rt.text
    tree = rt.json()
    assert tree["nodes"][0]["level_required"] == 10
    assert tree["nodes"][0]["modifiers"][0] == {"stat": "dex", "value": 2}

    try:
        g = dm_session.get(f"{BASE_URL}/api/entries/{WAWA_SLUG}").json()
        meta = g["metadata"]
        # Pin level below the gate so the "still below the gate" assertion holds
        # regardless of prior data accumulation.
        payload = {
            "player_name": meta.get("owner", "Laz"),
            "name": g["title"],
            "level": 4,
            "foundation_unlocks": [{"tree_id": tree["id"], "node_id": "gated_node_1"}],
        }
        r = dm_session.put(f"{BASE_URL}/api/pcs/{WAWA_ID}", json=payload)
        assert r.status_code == 200
        meta2 = dm_session.get(f"{BASE_URL}/api/entries/{WAWA_SLUG}").json()["metadata"]
        fu = meta2.get("foundation_unlocks") or []
        assert any(u.get("tree_id") == tree["id"] and u.get("node_id") == "gated_node_1" for u in fu)
        # And character is still below the gate
        assert (meta2.get("level") or 1) < 10
    finally:
        dm_session.delete(f"{BASE_URL}/api/magic/trees/{tree['id']}")


# ---------- 7. legacy_clear bug already covered; sanity: extras allowed ----------
def test_resources_accepts_extra_fields(dm_session):
    g = dm_session.get(f"{BASE_URL}/api/entries/{WAWA_SLUG}").json()
    meta = g["metadata"]
    payload = {
        "player_name": meta.get("owner", "Laz"),
        "name": g["title"],
        "level": meta.get("level", 4),
        "resources": [
            {"id": "r1", "name": "Mana", "max": 10, "current": 7, "color": "#60A5FA", "extra": "ignored-ok"},
        ],
    }
    r = dm_session.put(f"{BASE_URL}/api/pcs/{WAWA_ID}", json=payload)
    assert r.status_code == 200, r.text
