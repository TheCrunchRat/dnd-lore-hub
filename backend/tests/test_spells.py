"""
Backend tests for Spell System Overhaul Batch C:
- PUT /api/pcs/{id} merges spell_slots_used and spells_prepared without losing
  the rest of metadata (race, class, ability_scores, equipment, features, etc.).
- Long-rest semantics: spell_slots_used set to {} clears the field via filter.
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


@pytest.fixture
def wizard_pc(dm_session):
    """Create a wizard PC with spells_known, slots, equipment, features, ability_scores."""
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "player_name": "DM",
        "name": f"TEST_Wizard_{suffix}",
        "race": "Elf",
        "char_class": "Wizard",
        "level": 3,
        "alignment": "Neutral Good",
        "ability_scores": {"str": 8, "dex": 14, "con": 12, "int": 16, "wis": 10, "cha": 11},
        "max_hp": 18,
        "current_hp": 18,
        "armor_class": 12,
        "speed": 30,
        "proficiencies": ["Arcana", "History"],
        "saving_throws": ["int", "wis"],
        "languages": ["Common", "Elvish"],
        "spells_known": ["Fire Bolt", "Mage Armor", "Magic Missile", "Shield"],
        "spells_prepared": ["Mage Armor", "Magic Missile"],
        "spell_slots": {"1": {"max": 4, "used": 0}, "2": {"max": 2, "used": 0}},
        "spell_slots_used": {},
        "equipment": ["Quarterstaff", "Spellbook", "Component pouch"],
        "features": ["Arcane Recovery", "Darkvision"],
    }
    r = dm_session.post(f"{API}/pcs", json=payload)
    assert r.status_code in (200, 201), f"create pc failed: {r.status_code} {r.text}"
    pc = r.json()
    yield pc
    # Cleanup
    dm_session.delete(f"{API}/pcs/{pc['id']}")


def _get_pc(sess, pc_id):
    r = sess.get(f"{API}/entries/{pc_id}")
    assert r.status_code == 200, r.text
    return r.json()


def test_create_pc_persists_spell_fields(dm_session, wizard_pc):
    pc = _get_pc(dm_session, wizard_pc["id"])
    md = pc["metadata"]
    assert md["spells_known"] == ["Fire Bolt", "Mage Armor", "Magic Missile", "Shield"]
    assert md["spells_prepared"] == ["Mage Armor", "Magic Missile"]
    assert md["spell_slots"]["1"]["max"] == 4
    assert md.get("equipment") == ["Quarterstaff", "Spellbook", "Component pouch"]
    assert md.get("features") == ["Arcane Recovery", "Darkvision"]


def test_put_merges_spell_slots_used_without_losing_metadata(dm_session, wizard_pc):
    """Mimic frontend SpellManager.persist(): spread full metadata + patch."""
    pc_id = wizard_pc["id"]
    md_before = wizard_pc["metadata"]
    body = {
        "player_name": md_before.get("owner", "DM"),
        "name": wizard_pc["title"],
        # spread metadata (this is what the frontend does)
        "race": md_before.get("race"),
        "char_class": md_before.get("class"),
        "level": md_before.get("level"),
        "ability_scores": md_before.get("ability_scores"),
        "max_hp": md_before.get("max_hp"),
        "current_hp": md_before.get("current_hp"),
        "armor_class": md_before.get("armor_class"),
        "speed": md_before.get("speed"),
        "spells_known": md_before.get("spells_known"),
        "spells_prepared": md_before.get("spells_prepared"),
        "spell_slots": md_before.get("spell_slots"),
        "equipment": md_before.get("equipment"),
        "features": md_before.get("features"),
        "spell_slots_used": {"1": 2},
    }
    r = dm_session.put(f"{API}/pcs/{pc_id}", json=body)
    assert r.status_code == 200, r.text
    md = r.json()["metadata"]
    # New field merged
    assert md["spell_slots_used"] == {"1": 2}
    # Pre-existing fields preserved
    assert md["race"] == "Elf"
    assert md["class"] == "Wizard"
    assert md["level"] == 3
    assert md["ability_scores"]["int"] == 16
    assert md["spells_known"] == ["Fire Bolt", "Mage Armor", "Magic Missile", "Shield"]
    assert md["spells_prepared"] == ["Mage Armor", "Magic Missile"]
    assert md["spell_slots"]["1"]["max"] == 4
    assert md["equipment"] == ["Quarterstaff", "Spellbook", "Component pouch"]
    assert md["features"] == ["Arcane Recovery", "Darkvision"]
    assert md["max_hp"] == 18
    assert md["armor_class"] == 12
    # Verify persistence on re-fetch
    pc2 = _get_pc(dm_session, pc_id)
    assert pc2["metadata"]["spell_slots_used"] == {"1": 2}
    assert pc2["metadata"]["race"] == "Elf"


def test_put_merges_spells_prepared_without_losing_metadata(dm_session, wizard_pc):
    pc_id = wizard_pc["id"]
    body = {
        "player_name": "DM",
        "name": wizard_pc["title"],
        "spells_prepared": ["Fire Bolt", "Shield"],
    }
    r = dm_session.put(f"{API}/pcs/{pc_id}", json=body)
    assert r.status_code == 200, r.text
    md = r.json()["metadata"]
    assert md["spells_prepared"] == ["Fire Bolt", "Shield"]
    assert md["spells_known"] == ["Fire Bolt", "Mage Armor", "Magic Missile", "Shield"]
    assert md["race"] == "Elf"
    assert md["equipment"] == ["Quarterstaff", "Spellbook", "Component pouch"]
    assert md["features"] == ["Arcane Recovery", "Darkvision"]


def test_long_rest_clears_spell_slots_used(dm_session, wizard_pc):
    pc_id = wizard_pc["id"]
    # First spend some slots
    dm_session.put(
        f"{API}/pcs/{pc_id}",
        json={"player_name": "DM", "name": wizard_pc["title"], "spell_slots_used": {"1": 3, "2": 1}},
    )
    pc = _get_pc(dm_session, pc_id)
    assert pc["metadata"].get("spell_slots_used") == {"1": 3, "2": 1}

    # Long rest: send empty dict
    r = dm_session.put(
        f"{API}/pcs/{pc_id}",
        json={"player_name": "DM", "name": wizard_pc["title"], "spell_slots_used": {}},
    )
    assert r.status_code == 200, r.text
    md = r.json()["metadata"]
    # Empty {} is treated as "cleared" — should not be present, or be {}
    assert md.get("spell_slots_used", {}) in ({}, None) or md["spell_slots_used"] == {}
    # Other fields still intact
    assert md["spell_slots"]["1"]["max"] == 4
    assert md["spells_known"] == ["Fire Bolt", "Mage Armor", "Magic Missile", "Shield"]


def test_anonymous_cannot_modify_pc(wizard_pc):
    """Anonymous PUT (no auth cookies, no matching player_name) must be forbidden."""
    anon = requests.Session()
    r = anon.put(
        f"{API}/pcs/{wizard_pc['id']}",
        json={"player_name": "RandomStranger", "name": wizard_pc["title"], "spell_slots_used": {"1": 1}},
    )
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


def test_public_get_returns_spell_fields(wizard_pc):
    """Anonymous GET should expose spells_known and spell_slots (read-only view)."""
    anon = requests.Session()
    r = anon.get(f"{API}/entries/{wizard_pc['id']}")
    assert r.status_code == 200
    md = r.json()["metadata"]
    assert "spells_known" in md
    assert "spell_slots" in md
