"""Shop feature tests — merchants, items, requests, purchase flow."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
ADMIN_EMAIL = "dm@lantern.realm"
ADMIN_PASS = "lantern-keeper-1"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed {r.status_code}")
    return s


@pytest.fixture(scope="module")
def anon_session():
    return requests.Session()


# ---------------- public listing ----------------
class TestPublicMerchants:
    def test_list_merchants_seeded(self):
        r = requests.get(f"{BASE_URL}/api/shop/merchants")
        assert r.status_code == 200
        names = [m["name"] for m in r.json()]
        assert "Quill of the Wickrow" in names
        assert "Maerin Bone-Trader" in names

    def test_merchant_detail_has_items_and_featured(self):
        merchants = requests.get(f"{BASE_URL}/api/shop/merchants").json()
        mid = merchants[0]["id"]
        r = requests.get(f"{BASE_URL}/api/shop/merchants/{mid}")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and "featured_items" in data
        assert isinstance(data["items"], list)
        assert all(i.get("featured") for i in data["featured_items"])


# ---------------- admin merchant CRUD ----------------
class TestMerchantCRUD:
    created_id = None

    def test_non_admin_cannot_create(self, anon_session):
        r = anon_session.post(f"{BASE_URL}/api/shop/merchants", json={"name": "Hack"})
        assert r.status_code in (401, 403)

    def test_admin_create_merchant(self, admin_session):
        body = {
            "name": f"TEST_Merchant_{uuid.uuid4().hex[:6]}",
            "title": "TEST title",
            "greeting": "hello",
            "portrait_url": "http://example.com/p.png",
            "background_url": "http://example.com/bg.png",
            "closed_art_url": "http://example.com/c.png",
            "accent_color": "#FF00FF",
        }
        r = admin_session.post(f"{BASE_URL}/api/shop/merchants", json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == body["name"]
        assert d["accent_color"] == "#FF00FF"
        assert d["is_open"] is True
        TestMerchantCRUD.created_id = d["id"]

    def test_admin_update_merchant(self, admin_session):
        mid = TestMerchantCRUD.created_id
        r = admin_session.put(
            f"{BASE_URL}/api/shop/merchants/{mid}",
            json={"name": "TEST_Renamed", "greeting": "updated"},
        )
        assert r.status_code == 200
        assert r.json()["greeting"] == "updated"

    def test_toggle_open_flips_state(self, admin_session):
        mid = TestMerchantCRUD.created_id
        r1 = admin_session.post(f"{BASE_URL}/api/shop/merchants/{mid}/toggle-open")
        assert r1.status_code == 200
        assert r1.json()["is_open"] is False
        r2 = admin_session.post(f"{BASE_URL}/api/shop/merchants/{mid}/toggle-open")
        assert r2.json()["is_open"] is True

    def test_delete_merchant_cascades(self, admin_session):
        mid = TestMerchantCRUD.created_id
        item = admin_session.post(
            f"{BASE_URL}/api/shop/items",
            json={"merchant_id": mid, "name": "TEST_Cascade", "price_gp": 1},
        ).json()
        item_id = item["id"]
        r = admin_session.delete(f"{BASE_URL}/api/shop/merchants/{mid}")
        assert r.status_code == 200
        # item should be gone from listing
        items = admin_session.get(f"{BASE_URL}/api/shop/items").json()
        assert not any(i["id"] == item_id for i in items)


# ---------------- item CRUD + purchase flow ----------------
class TestPurchaseFlow:
    state = {}

    def test_setup(self, admin_session):
        # Use a seeded merchant
        merchants = admin_session.get(f"{BASE_URL}/api/shop/merchants").json()
        # Find an open merchant
        open_m = next((m for m in merchants if m.get("is_open")), merchants[0])
        if not open_m.get("is_open"):
            admin_session.post(f"{BASE_URL}/api/shop/merchants/{open_m['id']}/toggle-open")
        self.state["merchant_id"] = open_m["id"]

        # Create a cheap test item
        body = {"merchant_id": open_m["id"], "name": "TEST_Tonic", "price_gp": 10, "category": "consumable", "rarity": "common"}
        r = admin_session.post(f"{BASE_URL}/api/shop/items", json=body)
        assert r.status_code == 200
        self.state["item_id"] = r.json()["id"]

        # Get a PC (any character) via /entries?category=character
        pcs = requests.get(f"{BASE_URL}/api/entries?category=character&limit=100").json()
        assert isinstance(pcs, list) and len(pcs) > 0, "no PCs available"
        # Prefer 'wawa'
        pc = next((p for p in pcs if "wawa" in (p.get("title", "") + p.get("slug", "")).lower()), pcs[0])
        self.state["pc_id"] = pc["id"]

        # Set PC gold to 200
        r = admin_session.put(f"{BASE_URL}/api/pcs/{pc['id']}/gold", json={"set": 200})
        assert r.status_code == 200
        assert r.json()["gold_gp"] == 200

    def test_request_purchase_success(self, admin_session):
        body = {"pc_id": self.state["pc_id"], "note": "test"}
        r = admin_session.post(f"{BASE_URL}/api/shop/items/{self.state['item_id']}/request", json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "pending"
        self.state["req_id"] = d["id"]

    def test_duplicate_request_returns_409(self, admin_session):
        body = {"pc_id": self.state["pc_id"]}
        r = admin_session.post(f"{BASE_URL}/api/shop/items/{self.state['item_id']}/request", json=body)
        assert r.status_code == 409

    def test_list_requests_includes_pending(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/shop/requests?status=pending")
        assert r.status_code == 200
        assert any(req["id"] == self.state["req_id"] for req in r.json())

    def test_approve_deducts_gold_and_appends_equipment(self, admin_session):
        rid = self.state["req_id"]
        r = admin_session.post(f"{BASE_URL}/api/shop/requests/{rid}/approve")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"

        # Verify gold deducted and item appended
        pc = requests.get(f"{BASE_URL}/api/entries/{self.state['pc_id']}").json()
        meta = pc.get("metadata") or {}
        assert meta.get("gold_gp") == 190
        assert "TEST_Tonic" in (meta.get("equipment") or [])

    def test_approve_insufficient_gold_400(self, admin_session):
        # Set gold to 0
        admin_session.put(f"{BASE_URL}/api/pcs/{self.state['pc_id']}/gold", json={"set": 0})
        # Create another item
        item = admin_session.post(
            f"{BASE_URL}/api/shop/items",
            json={"merchant_id": self.state["merchant_id"], "name": "TEST_Costly", "price_gp": 999},
        ).json()
        req = admin_session.post(
            f"{BASE_URL}/api/shop/items/{item['id']}/request",
            json={"pc_id": self.state["pc_id"]},
        ).json()
        r = admin_session.post(f"{BASE_URL}/api/shop/requests/{req['id']}/approve")
        assert r.status_code == 400
        assert "gp" in r.json().get("detail", "").lower()
        # cleanup
        admin_session.post(f"{BASE_URL}/api/shop/requests/{req['id']}/cancel")
        admin_session.delete(f"{BASE_URL}/api/shop/items/{item['id']}")

    def test_deny_with_reason(self, admin_session):
        item = admin_session.post(
            f"{BASE_URL}/api/shop/items",
            json={"merchant_id": self.state["merchant_id"], "name": "TEST_Deny", "price_gp": 5},
        ).json()
        req = admin_session.post(
            f"{BASE_URL}/api/shop/items/{item['id']}/request",
            json={"pc_id": self.state["pc_id"]},
        ).json()
        r = admin_session.post(f"{BASE_URL}/api/shop/requests/{req['id']}/deny", json={"reason": "no"})
        assert r.status_code == 200
        assert r.json()["status"] == "denied"
        assert r.json()["reason"] == "no"
        admin_session.delete(f"{BASE_URL}/api/shop/items/{item['id']}")

    def test_cancel_by_requester(self, admin_session):
        item = admin_session.post(
            f"{BASE_URL}/api/shop/items",
            json={"merchant_id": self.state["merchant_id"], "name": "TEST_Cancel", "price_gp": 5},
        ).json()
        req = admin_session.post(
            f"{BASE_URL}/api/shop/items/{item['id']}/request",
            json={"pc_id": self.state["pc_id"]},
        ).json()
        r = admin_session.post(f"{BASE_URL}/api/shop/requests/{req['id']}/cancel")
        assert r.status_code == 200
        assert r.json()["status"] == "cancelled"
        admin_session.delete(f"{BASE_URL}/api/shop/items/{item['id']}")

    def test_closed_merchant_rejects_request(self, admin_session):
        mid = self.state["merchant_id"]
        # Make a new item
        item = admin_session.post(
            f"{BASE_URL}/api/shop/items",
            json={"merchant_id": mid, "name": "TEST_Closed", "price_gp": 5},
        ).json()
        # Close shop
        admin_session.post(f"{BASE_URL}/api/shop/merchants/{mid}/toggle-open")
        r = admin_session.post(
            f"{BASE_URL}/api/shop/items/{item['id']}/request",
            json={"pc_id": self.state["pc_id"]},
        )
        assert r.status_code == 400
        assert "closed" in r.json().get("detail", "").lower()
        # Reopen
        admin_session.post(f"{BASE_URL}/api/shop/merchants/{mid}/toggle-open")
        admin_session.delete(f"{BASE_URL}/api/shop/items/{item['id']}")

    def test_cleanup(self, admin_session):
        # Delete our TEST_Tonic
        admin_session.delete(f"{BASE_URL}/api/shop/items/{self.state['item_id']}")
        # Restore PC gold to a reasonable value
        admin_session.put(f"{BASE_URL}/api/pcs/{self.state['pc_id']}/gold", json={"set": 175})


# ---------------- item enums ----------------
class TestItemValidation:
    def test_invalid_category_rejected(self, admin_session):
        merchants = admin_session.get(f"{BASE_URL}/api/shop/merchants").json()
        r = admin_session.post(
            f"{BASE_URL}/api/shop/items",
            json={"merchant_id": merchants[0]["id"], "name": "TEST_Bad", "category": "wand", "price_gp": 1},
        )
        assert r.status_code == 422

    def test_invalid_rarity_rejected(self, admin_session):
        merchants = admin_session.get(f"{BASE_URL}/api/shop/merchants").json()
        r = admin_session.post(
            f"{BASE_URL}/api/shop/items",
            json={"merchant_id": merchants[0]["id"], "name": "TEST_Bad", "rarity": "epic", "price_gp": 1},
        )
        assert r.status_code == 422


# ---------------- auth ----------------
class TestAuthz:
    def test_non_admin_create_item_forbidden(self, anon_session):
        r = anon_session.post(f"{BASE_URL}/api/shop/items", json={"merchant_id": "x", "name": "y"})
        assert r.status_code in (401, 403)

    def test_non_admin_toggle_open_forbidden(self, anon_session):
        merchants = requests.get(f"{BASE_URL}/api/shop/merchants").json()
        r = anon_session.post(f"{BASE_URL}/api/shop/merchants/{merchants[0]['id']}/toggle-open")
        assert r.status_code in (401, 403)
