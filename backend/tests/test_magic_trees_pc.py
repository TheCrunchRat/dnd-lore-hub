"""
Backend tests for iter_8 magic-tree PC integration:
- POST/PUT /api/pcs accepts origin_unlocks, foundation_unlocks, class_tree_id
- Data persists across reads and existing metadata is preserved on partial updates
- Level-down/up cycle preserves the unlocks (level gating is client-side)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
DM_EMAIL = "dm@lantern.realm"
DM_PASS = "lantern-keeper-1"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": DM_EMAIL, "password": DM_PASS})
    assert r.status_code == 200, f"DM login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def trees(session):
    r = session.get(f"{BASE_URL}/api/magic/trees")
    assert r.status_code == 200
    data = r.json()
    by_cat = {"origin": [], "foundation": [], "class": []}
    for t in data:
        cat = t.get("tree_category", "origin")
        by_cat.setdefault(cat, []).append(t)
    return by_cat


def _first_with_nodes(tree_list):
    for t in tree_list:
        if t.get("nodes"):
            return t
    return None


def test_trees_have_required_categories(trees):
    # The iter_8 seed data should provide origin, foundation, and class trees
    assert _first_with_nodes(trees.get("origin", [])), "No origin tree with nodes found"
    assert _first_with_nodes(trees.get("foundation", [])), "No foundation tree with nodes found"
    assert _first_with_nodes(trees.get("class", [])), "No class tree with nodes found"


@pytest.fixture(scope="module")
def pc(session, trees):
    """Create a fresh TEST_ PC for full lifecycle testing."""
    player_name = "TEST_TreePlayer"
    pc_name = f"TEST_TreePC_{uuid.uuid4().hex[:6]}"
    r = session.post(
        f"{BASE_URL}/api/pcs",
        json={
            "player_name": player_name,
            "name": pc_name,
            "race": "Elf",
            "char_class": "Wizard",
            "level": 1,
            "ability_scores": {"str": 8, "dex": 14, "con": 12, "int": 16, "wis": 12, "cha": 10},
        },
    )
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["title"] == pc_name
    yield {"id": created["id"], "name": pc_name, "player_name": player_name}
    # Teardown
    session.delete(f"{BASE_URL}/api/pcs/{created['id']}")


def test_create_persists_existing_metadata(session, pc):
    r = session.get(f"{BASE_URL}/api/entries/{pc['id']}")
    assert r.status_code == 200
    m = r.json()["metadata"]
    assert m["race"] == "Elf"
    assert m["class"] == "Wizard"
    assert m["level"] == 1
    assert m["ability_scores"]["int"] == 16


def test_put_persists_new_tree_fields(session, pc, trees):
    o_tree = _first_with_nodes(trees["origin"])
    f_tree = _first_with_nodes(trees["foundation"])
    c_tree = _first_with_nodes(trees["class"])

    o_node = o_tree["nodes"][0]["id"]
    f_node = f_tree["nodes"][0]["id"]

    payload = {
        "player_name": pc["player_name"],
        "name": pc["name"],
        "origin_unlocks": [
            {"tree_id": o_tree["id"], "node_id": o_node, "as_spell": True}
        ],
        "foundation_unlocks": [
            {"tree_id": f_tree["id"], "node_id": f_node}
        ],
        "class_tree_id": c_tree["id"],
    }
    r = session.put(f"{BASE_URL}/api/pcs/{pc['id']}", json=payload)
    assert r.status_code == 200, r.text
    m = r.json()["metadata"]
    assert m["origin_unlocks"][0]["tree_id"] == o_tree["id"]
    assert m["origin_unlocks"][0]["node_id"] == o_node
    assert m["origin_unlocks"][0]["as_spell"] is True
    assert m["foundation_unlocks"][0]["node_id"] == f_node
    assert m["class_tree_id"] == c_tree["id"]

    # GET to verify persistence
    r2 = session.get(f"{BASE_URL}/api/entries/{pc['id']}")
    m2 = r2.json()["metadata"]
    assert m2["origin_unlocks"] == m["origin_unlocks"]
    assert m2["foundation_unlocks"] == m["foundation_unlocks"]
    assert m2["class_tree_id"] == c_tree["id"]
    # Existing fields preserved across the merge
    assert m2["race"] == "Elf"
    assert m2["class"] == "Wizard"
    assert m2["ability_scores"]["int"] == 16


def test_level_cycle_preserves_unlocks(session, pc, trees):
    o_tree = _first_with_nodes(trees["origin"])
    f_tree = _first_with_nodes(trees["foundation"])

    # Level up to 10
    r = session.put(
        f"{BASE_URL}/api/pcs/{pc['id']}",
        json={"player_name": pc["player_name"], "name": pc["name"], "level": 10},
    )
    assert r.status_code == 200
    m = r.json()["metadata"]
    assert m["level"] == 10
    # Unlocks should still be there (not wiped by partial update)
    assert any(u["tree_id"] == o_tree["id"] for u in m.get("origin_unlocks", []))
    assert any(u["tree_id"] == f_tree["id"] for u in m.get("foundation_unlocks", []))

    # Level back down to 1
    r = session.put(
        f"{BASE_URL}/api/pcs/{pc['id']}",
        json={"player_name": pc["player_name"], "name": pc["name"], "level": 1},
    )
    assert r.status_code == 200
    m = r.json()["metadata"]
    assert m["level"] == 1
    assert any(u["tree_id"] == o_tree["id"] for u in m.get("origin_unlocks", []))


def test_toggle_as_spell_off(session, pc, trees):
    o_tree = _first_with_nodes(trees["origin"])
    o_node = o_tree["nodes"][0]["id"]
    r = session.put(
        f"{BASE_URL}/api/pcs/{pc['id']}",
        json={
            "player_name": pc["player_name"],
            "name": pc["name"],
            "origin_unlocks": [
                {"tree_id": o_tree["id"], "node_id": o_node, "as_spell": False}
            ],
        },
    )
    assert r.status_code == 200
    m = r.json()["metadata"]
    assert m["origin_unlocks"][0]["as_spell"] is False


def test_clear_class_tree(session, pc):
    # Empty-string class_tree_id should clear it (filtered out by `not in ("", None)`)
    r = session.put(
        f"{BASE_URL}/api/pcs/{pc['id']}",
        json={
            "player_name": pc["player_name"],
            "name": pc["name"],
            "class_tree_id": "",
        },
    )
    assert r.status_code == 200
    m = r.json()["metadata"]
    assert "class_tree_id" not in m or m["class_tree_id"] in ("", None)


def test_existing_wawa_pc_visible(session):
    """Sanity: the wawa PC referenced in the request still exists."""
    r = session.get(f"{BASE_URL}/api/entries/wawa")
    if r.status_code == 200:
        data = r.json()
        assert data["category"] == "character"
    else:
        pytest.skip("wawa PC not found in this environment")
