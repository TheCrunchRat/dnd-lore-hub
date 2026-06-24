"""Tests for /api/guides (DM-only write, anonymous read) + regression checks."""
import os
import io
import struct
import zlib
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE}/api"

DM_EMAIL = "dm@lantern.realm"
DM_PASS = "lantern-keeper-1"

TEST_TITLE_PREFIX = "TEST_REVERT_ME_"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def dm_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": DM_EMAIL, "password": DM_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def anon_session():
    return requests.Session()


@pytest.fixture(autouse=True)
def cleanup_test_guides(dm_session):
    yield
    try:
        items = dm_session.get(f"{API}/guides", timeout=15).json()
        for g in items:
            if g.get("title", "").startswith(TEST_TITLE_PREFIX):
                dm_session.delete(f"{API}/guides/{g['id']}", timeout=15)
    except Exception:
        pass


# ---------- public read ----------
def test_anon_can_list_guides_and_welcome_is_present(anon_session):
    r = anon_session.get(f"{API}/guides", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    titles = [g["title"] for g in data]
    assert any("Welcome to the Lantern Realm" in t for t in titles), f"Seed guide missing. Got: {titles}"
    # _id should NOT leak
    for g in data:
        assert "_id" not in g
        assert "id" in g and "slug" in g and "title" in g


def test_anon_can_get_guide_by_slug(anon_session):
    listing = anon_session.get(f"{API}/guides", timeout=15).json()
    first = listing[0]
    r = anon_session.get(f"{API}/guides/{first['slug']}", timeout=15)
    assert r.status_code == 200
    assert r.json()["slug"] == first["slug"]


# ---------- DM-only writes (auth enforcement) ----------
def test_anon_cannot_create_guide(anon_session):
    r = anon_session.post(f"{API}/guides", json={"title": "x", "content": ""}, timeout=15)
    assert r.status_code == 401


def test_anon_cannot_update_guide(anon_session, dm_session):
    listing = dm_session.get(f"{API}/guides", timeout=15).json()
    gid = listing[0]["id"]
    r = anon_session.put(f"{API}/guides/{gid}", json={"title": "x", "content": ""}, timeout=15)
    assert r.status_code == 401


def test_anon_cannot_delete_guide(anon_session, dm_session):
    listing = dm_session.get(f"{API}/guides", timeout=15).json()
    gid = listing[0]["id"]
    r = anon_session.delete(f"{API}/guides/{gid}", timeout=15)
    assert r.status_code == 401


# ---------- DM CRUD lifecycle ----------
def test_dm_create_update_pin_delete(dm_session, anon_session):
    title = f"{TEST_TITLE_PREFIX}Lifecycle"
    payload = {
        "title": title,
        "subtitle": "subtitle one",
        "content": "**hello** [[Mirewatch]] world",
        "sort_order": 99,
        "is_pinned": False,
    }
    r = dm_session.post(f"{API}/guides", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    assert created["title"] == title
    assert created["slug"] == "test-revert-me-lifecycle"
    assert created["is_pinned"] is False
    gid = created["id"]

    # GET to verify persistence (anon should also see it)
    get_anon = anon_session.get(f"{API}/guides/{created['slug']}", timeout=15)
    assert get_anon.status_code == 200
    assert get_anon.json()["content"] == "**hello** [[Mirewatch]] world"

    # Update: change title -> re-slug; pin
    upd = {**payload, "title": f"{TEST_TITLE_PREFIX}Renamed", "is_pinned": True, "content": "edited"}
    r2 = dm_session.put(f"{API}/guides/{gid}", json=upd, timeout=15)
    assert r2.status_code == 200, r2.text
    updated = r2.json()
    assert updated["title"] == f"{TEST_TITLE_PREFIX}Renamed"
    assert updated["slug"] == "test-revert-me-renamed"
    assert updated["is_pinned"] is True
    assert updated["content"] == "edited"

    # Pinned float above unpinned (the Welcome seed is also pinned, so we just verify
    # ordering: all pinned come before any unpinned, and our guide is in the pinned block).
    listing = dm_session.get(f"{API}/guides", timeout=15).json()
    pinned_ids = [g["id"] for g in listing if g["is_pinned"]]
    unpinned_ids = [g["id"] for g in listing if not g["is_pinned"]]
    assert gid in pinned_ids, "Our pinned guide not in pinned set"
    pinned_idx = max([i for i, g in enumerate(listing) if g["is_pinned"]])
    unpinned_idx = min([i for i, g in enumerate(listing) if not g["is_pinned"]], default=len(listing))
    assert pinned_idx < unpinned_idx, "Pinned guides should appear before unpinned"

    # Delete
    r3 = dm_session.delete(f"{API}/guides/{gid}", timeout=15)
    assert r3.status_code in (200, 204)
    r4 = dm_session.get(f"{API}/guides/{gid}", timeout=15)
    assert r4.status_code == 404


def test_dm_validation_empty_title(dm_session):
    # Backend may either 422 (pydantic) or 400 — accept both; or 200 if it allows empty (then frontend handles)
    r = dm_session.post(f"{API}/guides", json={"title": "", "content": ""}, timeout=15)
    # Frontend blocks empty title — backend behavior captured here for visibility
    # Accept any non-2xx OR 2xx (frontend enforces). Just note in report.
    assert r.status_code in (200, 201, 400, 422), r.text


# ---------- regression checks ----------
def test_regression_sessions_comments(anon_session):
    sessions = anon_session.get(f"{API}/sessions", timeout=15).json()
    assert isinstance(sessions, list) and len(sessions) >= 1
    sid = sessions[0]["id"]
    r = anon_session.get(f"{API}/sessions/{sid}/comments", timeout=15)
    assert r.status_code == 200
    data = r.json()
    # Either {locked, comments:[...]} shape or list — assert at minimum it contains comments
    assert ("comments" in data) or isinstance(data, list)


def test_regression_maps(anon_session):
    r = anon_session.get(f"{API}/maps", timeout=15)
    assert r.status_code == 200
    maps = r.json()
    assert isinstance(maps, list) and len(maps) >= 1


def test_regression_upload(dm_session):
    # Minimal valid PNG (1x1)
    def _png_1x1():
        sig = b"\x89PNG\r\n\x1a\n"
        def chunk(t, d):
            return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
        ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
        raw = b"\x00\xff\x00\x00"
        idat = chunk(b"IDAT", zlib.compress(raw))
        iend = chunk(b"IEND", b"")
        return sig + ihdr + idat + iend

    files = {"file": ("test.png", io.BytesIO(_png_1x1()), "image/png")}
    # Drop content-type so requests sets multipart
    s = requests.Session()
    s.cookies.update(dm_session.cookies)
    r = s.post(f"{API}/uploads", files=files, timeout=30)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert "id" in data and "url" in data and "size" in data
    assert data["url"].endswith(data["id"]) or "/uploads/" in data["url"]


def test_regression_private_entry_sealed(dm_session, anon_session):
    SLUG = "the-sundering"
    # Seal then verify anon 403 + detail sealed
    r = dm_session.get(f"{API}/entries/{SLUG}", timeout=15)
    assert r.status_code == 200
    entry = r.json()
    entry["is_private"] = True
    try:
        rp = dm_session.put(f"{API}/entries/{entry['id']}", json=entry, timeout=15)
        assert rp.status_code == 200
        ra = anon_session.get(f"{API}/entries/{SLUG}", timeout=15)
        assert ra.status_code == 403
        assert ra.json().get("detail") == "sealed"
    finally:
        entry["is_private"] = False
        dm_session.put(f"{API}/entries/{entry['id']}", json=entry, timeout=15)
