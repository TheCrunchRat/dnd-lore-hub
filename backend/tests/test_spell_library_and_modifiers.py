"""
Iter_10 — Backend coverage for:
  1) GET /api/spells/library returns SRD + homebrew + magic-node spells
     - each magic-node entry carries tree_id, tree_name, tree_slug,
       accent_color, source='magic-node'
  2) Existing test seed 'Ember Lash' on Wickfire (spell-test-node) appears
     in the library with the correct shape
  3) MagicNode pydantic accepts & persists spell_* and modifiers fields,
     and ignores unknown extras
  4) Magic trees with no spell_level / modifiers still return cleanly (no 500)
  5) GET /api/magic/trees/wickfire still works and the seeded node carries
     modifiers = [{str:+1},{wis:-1}]
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

DM_EMAIL = "dm@lantern.realm"
DM_PASSWORD = "lantern-keeper-1"


@pytest.fixture(scope="module")
def dm_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": DM_EMAIL, "password": DM_PASSWORD})
    assert r.status_code == 200, r.text
    return s


# ---------------- /api/spells/library ----------------
class TestSpellLibrary:
    def test_library_returns_list_with_srd(self):
        r = requests.get(f"{API}/spells/library")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        sources = {s.get("source") for s in data}
        assert "srd" in sources

    def test_library_includes_magic_node_source(self):
        r = requests.get(f"{API}/spells/library")
        assert r.status_code == 200
        mn = [s for s in r.json() if s.get("source") == "magic-node"]
        assert len(mn) >= 1, "expected at least the seeded Ember Lash magic-node spell"
        ember = next((s for s in mn if s["name"] == "Ember Lash"), None)
        assert ember is not None
        # Required fields per spec
        for key in ("tree_id", "tree_name", "tree_slug", "accent_color", "node_id"):
            assert key in ember, f"missing {key} on magic-node spell"
        assert ember["tree_name"] == "Wickfire"
        assert ember["tree_slug"] == "wickfire"
        assert ember["level"] == 1
        assert ember["school"] == "Evocation"
        assert ember["source"] == "magic-node"

    def test_library_shape_uniform(self):
        r = requests.get(f"{API}/spells/library")
        assert r.status_code == 200
        for s in r.json():
            for key in ("id", "name", "level", "school", "source"):
                assert key in s


# ---------------- MagicNode persistence (spell_* + modifiers + extras) ----------------
class TestMagicNodePersistence:
    def test_create_update_node_with_spell_and_modifiers(self, dm_session):
        # Create a temp tree
        body = {
            "name": "TEST_StatMod_Tree",
            "subtitle": "tmp",
            "summary": "tmp",
            "content": "",
            "accent_color": "#22c55e",
            "image_url": "",
            "tree_category": "origin",
            "nodes": [
                {
                    "id": "n1",
                    "name": "TEST Bolt",
                    "description": "test bolt",
                    "x": 0.5, "y": 0.5,
                    "requires": [],
                    "max_rank": 1, "current_rank": 0,
                    "spell_level": 2,
                    "school": "Evocation",
                    "casting_time": "1 action",
                    "spell_range": "60 ft",
                    "components": "V,S",
                    "duration": "Instantaneous",
                    "spell_classes": ["Wizard", "Sorcerer"],
                    "modifiers": [{"stat": "int", "value": 2}, {"stat": "hp", "value": 5}],
                    "level_required": 3,
                    # Extra unknown field must be ignored (extra="ignore")
                    "garbage_field": "should be dropped",
                }
            ],
        }
        r = dm_session.post(f"{API}/magic/trees", json=body)
        assert r.status_code == 200, r.text
        created = r.json()
        tid = created["id"]
        try:
            # Re-fetch and verify modifiers + spell fields persisted
            g = requests.get(f"{API}/magic/trees/{tid}")
            assert g.status_code == 200
            tree = g.json()
            node = tree["nodes"][0]
            assert node["spell_level"] == 2
            assert node["school"] == "Evocation"
            assert node["spell_range"] == "60 ft"
            assert node["modifiers"] == [{"stat": "int", "value": 2}, {"stat": "hp", "value": 5}]
            assert node["level_required"] == 3
            assert "garbage_field" not in node

            # Library should now include this magic-node spell
            lib = requests.get(f"{API}/spells/library").json()
            entry = next((s for s in lib if s.get("node_id") == "n1" and s.get("tree_id") == tid), None)
            assert entry is not None, "new magic-node spell not surfaced in /spells/library"
            assert entry["level"] == 2
            assert entry["school"] == "Evocation"
            assert entry["range"] == "60 ft"
            assert entry["source"] == "magic-node"

            # Update: remove spell_level — should disappear from library
            body["nodes"][0]["spell_level"] = None
            u = dm_session.put(f"{API}/magic/trees/{tid}", json=body)
            assert u.status_code == 200
            lib2 = requests.get(f"{API}/spells/library").json()
            assert not any(s.get("node_id") == "n1" and s.get("tree_id") == tid for s in lib2)
        finally:
            dm_session.delete(f"{API}/magic/trees/{tid}")

    def test_legacy_node_without_spell_or_modifiers_still_works(self, dm_session):
        body = {
            "name": "TEST_LegacyTree",
            "tree_category": "origin",
            "accent_color": "#888",
            "nodes": [{"id": "a", "name": "A", "x": 0.3, "y": 0.3, "requires": []}],
        }
        r = dm_session.post(f"{API}/magic/trees", json=body)
        assert r.status_code == 200
        tid = r.json()["id"]
        try:
            g = requests.get(f"{API}/magic/trees/{tid}")
            assert g.status_code == 200
            node = g.json()["nodes"][0]
            # Defaults must be present and falsy
            assert node.get("spell_level") in (None,)
            assert node.get("modifiers") in (None, [])
        finally:
            dm_session.delete(f"{API}/magic/trees/{tid}")


# ---------------- Seeded fixture (Ember Lash) integrity ----------------
class TestWickfireSeed:
    def test_wickfire_tree_has_ember_lash_with_modifiers(self):
        r = requests.get(f"{API}/magic/trees/wickfire")
        assert r.status_code == 200
        tree = r.json()
        node = next((n for n in tree["nodes"] if n["id"] == "spell-test-node"), None)
        assert node is not None, "Ember Lash (spell-test-node) missing from Wickfire"
        assert node["name"] == "Ember Lash"
        assert node["spell_level"] == 1
        mods = node.get("modifiers") or []
        assert {"stat": "str", "value": 1} in mods
        assert {"stat": "wis", "value": -1} in mods
