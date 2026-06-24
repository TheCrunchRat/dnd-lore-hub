"""Tests for DM-only (is_private) visibility on entries."""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://dnd-lore-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

DM_EMAIL = "dm@lantern.realm"
DM_PASS = "lantern-keeper-1"
SLUG = "the-sundering"


@pytest.fixture(scope="module")
def dm_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": DM_EMAIL, "password": DM_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def anon_session():
    return requests.Session()


def _set_private(dm, slug, val):
    r = dm.get(f"{API}/entries/{slug}", timeout=15)
    assert r.status_code == 200
    entry = r.json()
    entry["is_private"] = val
    r2 = dm.put(f"{API}/entries/{entry['id']}", json=entry, timeout=15)
    assert r2.status_code == 200, r2.text
    return entry


def test_anon_lists_filter_private(dm_session, anon_session):
    # Baseline: ensure target is public
    _set_private(dm_session, SLUG, False)
    anon_all = anon_session.get(f"{API}/entries", timeout=15).json()
    dm_all = dm_session.get(f"{API}/entries", timeout=15).json()
    assert any(e["slug"] == SLUG for e in anon_all)
    base_anon = len(anon_all)
    base_dm = len(dm_all)

    # Seal it
    _set_private(dm_session, SLUG, True)
    try:
        anon_after = anon_session.get(f"{API}/entries", timeout=15).json()
        dm_after = dm_session.get(f"{API}/entries", timeout=15).json()
        assert not any(e["slug"] == SLUG for e in anon_after), "Sealed entry leaked to anon list"
        assert any(e["slug"] == SLUG and e["is_private"] is True for e in dm_after), "DM cannot see sealed entry"
        assert len(anon_after) == base_anon - 1
        assert len(dm_after) == base_dm

        # Detail: anon gets 403 + {detail: 'sealed'}
        r = anon_session.get(f"{API}/entries/{SLUG}", timeout=15)
        assert r.status_code == 403
        assert r.json().get("detail") == "sealed"

        # Detail: DM gets 200 with is_private=true
        r2 = dm_session.get(f"{API}/entries/{SLUG}", timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("is_private") is True

        # Stats: anon count for 'lore' should be one less
        anon_stats = anon_session.get(f"{API}/stats", timeout=15).json()
        dm_stats = dm_session.get(f"{API}/stats", timeout=15).json()
        assert dm_stats["lore"] == anon_stats["lore"] + 1
    finally:
        # Cleanup — revert
        _set_private(dm_session, SLUG, False)


def test_category_filter_excludes_private(dm_session, anon_session):
    _set_private(dm_session, SLUG, True)
    try:
        anon_lore = anon_session.get(f"{API}/entries", params={"category": "lore"}, timeout=15).json()
        assert not any(e["slug"] == SLUG for e in anon_lore)
        dm_lore = dm_session.get(f"{API}/entries", params={"category": "lore"}, timeout=15).json()
        assert any(e["slug"] == SLUG for e in dm_lore)
    finally:
        _set_private(dm_session, SLUG, False)


def test_search_excludes_private(dm_session, anon_session):
    _set_private(dm_session, SLUG, True)
    try:
        r = anon_session.get(f"{API}/entries", params={"q": "Sundering"}, timeout=15).json()
        assert not any(e["slug"] == SLUG for e in r)
    finally:
        _set_private(dm_session, SLUG, False)


def test_cleanup_state(dm_session, anon_session):
    """Verify the seed entry is left as is_private=false after suite runs."""
    r = anon_session.get(f"{API}/entries/{SLUG}", timeout=15)
    assert r.status_code == 200
    assert r.json().get("is_private") in (False, None)
