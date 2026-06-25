"""Backend tests for the new rest_config round-trip on /api/pcs/{id} PUT."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dnd-lore-hub.preview.emergentagent.com").rstrip("/")
WAWA_ID = "a6ded32c-bce2-4eaf-bf00-939a5fa345f8"


@pytest.fixture(scope="module")
def dm_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "dm@lantern.realm", "password": "lantern-keeper-1"})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def wawa_seed(dm_session):
    # Seed wawa with resource_name/max so we can test resource math.
    r = dm_session.get(f"{BASE_URL}/api/entries/{WAWA_ID}")
    assert r.status_code == 200
    entry = r.json()
    m = entry["metadata"]
    body = {"name": entry["title"],
            "player_name": m.get("owner") or "Laz",
            **m,
            "resource_name": "Mana",
            "resource_max": 10,
            "resource_color": "#60A5FA"}
    body.pop("_id", None)
    r2 = dm_session.put(f"{BASE_URL}/api/pcs/{WAWA_ID}", json=body)
    assert r2.status_code == 200, r2.text
    return r2.json()


def _payload_from(entry, **overrides):
    m = entry.get("metadata", {}) or {}
    p = {
        "name": entry["title"],
        "player_name": m.get("owner") or m.get("player_name") or entry["title"],
        **m,
    }
    p.update(overrides)
    p.pop("_id", None)
    return p


def test_rest_config_round_trip_preserves_other_metadata(dm_session, wawa_seed):
    m0 = wawa_seed["metadata"]
    target = {
        "long": {"hp_value": 50, "hp_is_percent": False,
                 "resource_value": 100, "resource_is_percent": True},
        "short": {"hp_value": 25, "hp_is_percent": True,
                  "resource_value": 50, "resource_is_percent": True},
    }
    body = _payload_from(wawa_seed, rest_config=target)
    r = dm_session.put(f"{BASE_URL}/api/pcs/{WAWA_ID}", json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["metadata"]["rest_config"] == target

    g = dm_session.get(f"{BASE_URL}/api/entries/{WAWA_ID}")
    assert g.status_code == 200
    md = g.json()["metadata"]
    assert md["rest_config"] == target
    for k in ["level", "race", "class", "max_hp", "ability_scores",
              "resource_name", "resource_max"]:
        if k in m0 and m0[k] is not None:
            assert md.get(k) == m0[k], f"field {k} changed: {md.get(k)} != {m0[k]}"


def test_rest_apply_long_persists_current_hp_and_resource(dm_session, wawa_seed):
    body = _payload_from(wawa_seed, current_hp=1, resource_current=0)
    r = dm_session.put(f"{BASE_URL}/api/pcs/{WAWA_ID}", json=body)
    assert r.status_code == 200, r.text
    md0 = r.json()["metadata"]
    assert md0["current_hp"] == 1
    assert md0["resource_current"] == 0

    cfg = md0["rest_config"]["long"]
    max_hp = md0["max_hp"]
    res_max = md0["resource_max"]
    new_hp = min(max_hp, 1 + (cfg["hp_value"] if not cfg["hp_is_percent"]
                              else (cfg["hp_value"] * max_hp) // 100))
    new_res = min(res_max, 0 + (cfg["resource_value"] if not cfg["resource_is_percent"]
                                else (cfg["resource_value"] * res_max) // 100))
    body2 = _payload_from(r.json(),
                          current_hp=new_hp, resource_current=new_res,
                          spell_slots_used={})
    r2 = dm_session.put(f"{BASE_URL}/api/pcs/{WAWA_ID}", json=body2)
    assert r2.status_code == 200, r2.text
    md1 = r2.json()["metadata"]
    assert md1["current_hp"] == max_hp  # 1+50 flat clamped
    assert md1["resource_current"] == res_max  # 100% resource
    assert md1["spell_slots_used"] == {}


def test_short_rest_percent_math(dm_session, wawa_seed):
    g = dm_session.get(f"{BASE_URL}/api/entries/{WAWA_ID}").json()
    md = g["metadata"]
    body = _payload_from(g, current_hp=2, resource_current=0)
    assert dm_session.put(f"{BASE_URL}/api/pcs/{WAWA_ID}", json=body).status_code == 200

    cfg = md["rest_config"]["short"]
    max_hp = md["max_hp"]
    res_max = md["resource_max"]
    delta_hp = (cfg["hp_value"] * max_hp) // 100   # 25% of 10 = 2
    delta_res = (cfg["resource_value"] * res_max) // 100  # 50% of 10 = 5
    new_hp = min(max_hp, 2 + delta_hp)
    new_res = min(res_max, 0 + delta_res)
    body2 = _payload_from(g, current_hp=new_hp, resource_current=new_res)
    r = dm_session.put(f"{BASE_URL}/api/pcs/{WAWA_ID}", json=body2)
    assert r.status_code == 200
    md2 = r.json()["metadata"]
    assert md2["current_hp"] == new_hp
    assert md2["resource_current"] == new_res
