"""End-to-end level-gate test: set level=1, count visible class-tree nodes;
bump to level=10, count again; drop back to level=1, confirm reversibility.
This validates the data the frontend will render (the gate is client-side, so
backend just needs to expose the full tree and the PC level)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "dm@lantern.realm", "password": "lantern-keeper-1"})
    assert r.status_code == 200
    return s


def _visible_class_nodes(tree, level):
    return [n for n in (tree.get("nodes") or [])
            if not n.get("level_required") or n["level_required"] <= level]


def test_level_gate_for_wawa(session):
    # Get wawa
    r = session.get(f"{BASE_URL}/api/entries/wawa")
    if r.status_code != 200:
        pytest.skip("wawa PC missing")
    pc = r.json()
    meta = pc.get("metadata", {})
    class_tree_id = meta.get("class_tree_id")
    if not class_tree_id:
        # Set one
        trees = session.get(f"{BASE_URL}/api/magic/trees").json()
        class_trees = [t for t in trees if t.get("tree_category") == "class" and t.get("nodes")]
        if not class_trees:
            pytest.skip("No class trees with nodes")
        class_tree_id = class_trees[0]["id"]
    tree = session.get(f"{BASE_URL}/api/magic/trees").json()
    tree = next((t for t in tree if t["id"] == class_tree_id), None)
    assert tree, "class tree missing"

    # Save current level for restoration
    original_level = meta.get("level", 1)

    # Set level=1
    body1 = {"player_name": meta.get("owner") or pc["title"], "name": pc["title"], "level": 1, "class_tree_id": class_tree_id}
    r = session.put(f"{BASE_URL}/api/pcs/{pc['id']}", json=body1)
    assert r.status_code == 200
    visible_l1 = _visible_class_nodes(tree, 1)

    # Set level=10
    body10 = {"player_name": meta.get("owner") or pc["title"], "name": pc["title"], "level": 10}
    r = session.put(f"{BASE_URL}/api/pcs/{pc['id']}", json=body10)
    assert r.status_code == 200
    assert r.json()["metadata"]["level"] == 10
    visible_l10 = _visible_class_nodes(tree, 10)

    # Back to 1
    r = session.put(f"{BASE_URL}/api/pcs/{pc['id']}", json=body1)
    assert r.status_code == 200
    assert r.json()["metadata"]["level"] == 1
    visible_l1_again = _visible_class_nodes(tree, 1)

    print(f"\nTree '{tree['name']}' has {len(tree.get('nodes', []))} total nodes")
    print(f"L1 visible: {len(visible_l1)}, L10 visible: {len(visible_l10)}")
    if any(n.get("level_required", 0) > 1 for n in tree.get("nodes", [])):
        # Tree has gated nodes -> level up should reveal more, level down should hide
        assert len(visible_l10) >= len(visible_l1)
    assert len(visible_l1) == len(visible_l1_again)  # reversibility

    # Restore
    session.put(f"{BASE_URL}/api/pcs/{pc['id']}", json={
        "player_name": meta.get("owner") or pc["title"], "name": pc["title"], "level": original_level
    })
