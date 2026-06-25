"""Shop sell-to-merchant flow tests (iteration 17)."""
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


@pytest.fixture(scope="module")
def setup_pc(admin_session):
    """Find DM's PC (wawa) and seed equipment + gold."""
    pcs = requests.get(f"{BASE_URL}/api/entries?category=character&limit=100").json()
    pc = next((p for p in pcs if "wawa" in (p.get("title", "") + p.get("slug", "")).lower()), pcs[0])
    pc_id = pc["id"]
    # Seed gold to 100
    admin_session.put(f"{BASE_URL}/api/pcs/{pc_id}/gold", json={"set": 100})
    # Seed equipment via PUT /api/entries/{id}
    full = requests.get(f"{BASE_URL}/api/entries/{pc_id}").json()
    meta = full.get("metadata") or {}
    meta["equipment"] = ["Iron Dagger", "Healing Tonic", "Iron Dagger"]  # duplicate
    body = {"title": full["title"], "category": "character", "summary": full.get("summary", ""),
            "body": full.get("body", ""), "metadata": meta}
    r = admin_session.put(f"{BASE_URL}/api/entries/{pc_id}", json=body)
    assert r.status_code in (200, 201), r.text
    # Pick an open merchant
    merchants = requests.get(f"{BASE_URL}/api/shop/merchants").json()
    open_m = next((m for m in merchants if m.get("is_open")), merchants[0])
    if not open_m.get("is_open"):
        admin_session.post(f"{BASE_URL}/api/shop/merchants/{open_m['id']}/toggle-open")
    return {"pc_id": pc_id, "merchant_id": open_m["id"]}


class TestSellFlow:
    state = {}

    def test_create_sell_request(self, admin_session, setup_pc):
        body = {
            "pc_id": setup_pc["pc_id"],
            "merchant_id": setup_pc["merchant_id"],
            "item_name": "Iron Dagger",
            "proposed_price_gp": 15,
            "note": "Heirloom dagger",
        }
        r = admin_session.post(f"{BASE_URL}/api/shop/sell-requests", json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["kind"] == "sell"
        assert d["status"] == "pending"
        assert d["price_gp"] == 15
        assert d["item_snapshot"]["name"] == "Iron Dagger"
        assert d["pc_id"] == setup_pc["pc_id"]
        TestSellFlow.state["req_id"] = d["id"]
        TestSellFlow.state["pc_id"] = setup_pc["pc_id"]
        TestSellFlow.state["merchant_id"] = setup_pc["merchant_id"]

    def test_duplicate_sell_returns_409(self, admin_session, setup_pc):
        body = {
            "pc_id": setup_pc["pc_id"],
            "merchant_id": setup_pc["merchant_id"],
            "item_name": "Iron Dagger",
            "proposed_price_gp": 20,
        }
        r = admin_session.post(f"{BASE_URL}/api/shop/sell-requests", json=body)
        assert r.status_code == 409

    def test_sell_item_not_in_equipment_400(self, admin_session, setup_pc):
        body = {
            "pc_id": setup_pc["pc_id"],
            "merchant_id": setup_pc["merchant_id"],
            "item_name": "Phantom Sword",
            "proposed_price_gp": 50,
        }
        r = admin_session.post(f"{BASE_URL}/api/shop/sell-requests", json=body)
        assert r.status_code == 400
        assert "not carrying" in r.json().get("detail", "").lower()

    def test_sell_closed_merchant_400(self, admin_session, setup_pc):
        mid = setup_pc["merchant_id"]
        admin_session.post(f"{BASE_URL}/api/shop/merchants/{mid}/toggle-open")  # close
        body = {
            "pc_id": setup_pc["pc_id"],
            "merchant_id": mid,
            "item_name": "Healing Tonic",
            "proposed_price_gp": 5,
        }
        r = admin_session.post(f"{BASE_URL}/api/shop/sell-requests", json=body)
        assert r.status_code == 400
        assert "closed" in r.json().get("detail", "").lower()
        admin_session.post(f"{BASE_URL}/api/shop/merchants/{mid}/toggle-open")  # reopen

    def test_sell_anon_401_or_403(self, anon_session, setup_pc):
        body = {
            "pc_id": setup_pc["pc_id"],
            "merchant_id": setup_pc["merchant_id"],
            "item_name": "Iron Dagger",
            "proposed_price_gp": 1,
        }
        r = anon_session.post(f"{BASE_URL}/api/shop/sell-requests", json=body)
        assert r.status_code in (401, 403)

    def test_list_requests_has_kind_field(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/shop/requests")
        assert r.status_code == 200
        for req in r.json():
            assert "kind" in req
            assert "final_price_gp" in req
            assert req["kind"] in ("purchase", "sell")

    def test_approve_sell_with_override_credits_gold_and_removes_item(self, admin_session):
        rid = self.state["req_id"]
        pc_id = self.state["pc_id"]
        # Snapshot current state
        pc_before = requests.get(f"{BASE_URL}/api/entries/{pc_id}").json()
        meta_before = pc_before.get("metadata") or {}
        gold_before = int(meta_before.get("gold_gp", 0))
        eq_before = list(meta_before.get("equipment") or [])
        dagger_count_before = eq_before.count("Iron Dagger")
        assert dagger_count_before >= 1

        # Approve with override 20
        r = admin_session.post(f"{BASE_URL}/api/shop/requests/{rid}/approve", json={"final_price_gp": 20})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "approved"
        assert d["final_price_gp"] == 20
        assert d["kind"] == "sell"

        # Verify gold credited and one Iron Dagger instance removed
        pc_after = requests.get(f"{BASE_URL}/api/entries/{pc_id}").json()
        meta_after = pc_after.get("metadata") or {}
        assert int(meta_after.get("gold_gp", 0)) == gold_before + 20
        eq_after = meta_after.get("equipment") or []
        assert eq_after.count("Iron Dagger") == dagger_count_before - 1

    def test_approve_sell_without_override_uses_proposed_price(self, admin_session, setup_pc):
        # Create a new sell for Healing Tonic at 8 gp
        body = {
            "pc_id": setup_pc["pc_id"],
            "merchant_id": setup_pc["merchant_id"],
            "item_name": "Healing Tonic",
            "proposed_price_gp": 8,
        }
        r = admin_session.post(f"{BASE_URL}/api/shop/sell-requests", json=body)
        assert r.status_code == 200
        req_id = r.json()["id"]
        pc_before = requests.get(f"{BASE_URL}/api/entries/{setup_pc['pc_id']}").json()
        gold_before = int((pc_before.get("metadata") or {}).get("gold_gp", 0))

        # Approve with empty body
        r2 = admin_session.post(f"{BASE_URL}/api/shop/requests/{req_id}/approve")
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["final_price_gp"] == 8
        pc_after = requests.get(f"{BASE_URL}/api/entries/{setup_pc['pc_id']}").json()
        assert int((pc_after.get("metadata") or {}).get("gold_gp", 0)) == gold_before + 8
        assert "Healing Tonic" not in (pc_after.get("metadata") or {}).get("equipment", [])

    def test_approve_sell_item_no_longer_in_equipment_400(self, admin_session, setup_pc):
        # Add a ghost item, create sell request, remove the item, then try to approve
        full = requests.get(f"{BASE_URL}/api/entries/{setup_pc['pc_id']}").json()
        meta = full.get("metadata") or {}
        eq = list(meta.get("equipment") or [])
        eq.append("Ghost Item")
        meta["equipment"] = eq
        admin_session.put(f"{BASE_URL}/api/entries/{setup_pc['pc_id']}", json={
            "title": full["title"], "category": "character",
            "summary": full.get("summary", ""), "body": full.get("body", ""),
            "metadata": meta,
        })
        # Create sell
        r = admin_session.post(f"{BASE_URL}/api/shop/sell-requests", json={
            "pc_id": setup_pc["pc_id"], "merchant_id": setup_pc["merchant_id"],
            "item_name": "Ghost Item", "proposed_price_gp": 3,
        })
        rid = r.json()["id"]
        # Remove item manually
        eq.remove("Ghost Item")
        meta["equipment"] = eq
        admin_session.put(f"{BASE_URL}/api/entries/{setup_pc['pc_id']}", json={
            "title": full["title"], "category": "character",
            "summary": full.get("summary", ""), "body": full.get("body", ""),
            "metadata": meta,
        })
        # Approve should fail
        r3 = admin_session.post(f"{BASE_URL}/api/shop/requests/{rid}/approve")
        assert r3.status_code == 400
        assert "no longer carries" in r3.json().get("detail", "").lower()
        # Cancel
        admin_session.post(f"{BASE_URL}/api/shop/requests/{rid}/cancel")

    def test_purchase_approve_sets_final_price_gp(self, admin_session, setup_pc):
        # Create purchase item and approve, verify final_price_gp set
        item = admin_session.post(f"{BASE_URL}/api/shop/items", json={
            "merchant_id": setup_pc["merchant_id"], "name": "TEST_BuyAndFinal",
            "price_gp": 7, "category": "gear",
        }).json()
        admin_session.put(f"{BASE_URL}/api/pcs/{setup_pc['pc_id']}/gold", json={"set": 100})
        req = admin_session.post(f"{BASE_URL}/api/shop/items/{item['id']}/request",
                                  json={"pc_id": setup_pc["pc_id"]}).json()
        r = admin_session.post(f"{BASE_URL}/api/shop/requests/{req['id']}/approve")
        assert r.status_code == 200
        d = r.json()
        assert d["final_price_gp"] == 7
        assert d["kind"] == "purchase"
        # Cleanup item
        admin_session.delete(f"{BASE_URL}/api/shop/items/{item['id']}")

    def test_deny_and_cancel_work_for_sell(self, admin_session, setup_pc):
        # Re-add an item and create a sell
        full = requests.get(f"{BASE_URL}/api/entries/{setup_pc['pc_id']}").json()
        meta = full.get("metadata") or {}
        eq = list(meta.get("equipment") or [])
        eq.extend(["SellDeny Item", "SellCancel Item"])
        meta["equipment"] = eq
        admin_session.put(f"{BASE_URL}/api/entries/{setup_pc['pc_id']}", json={
            "title": full["title"], "category": "character",
            "summary": full.get("summary", ""), "body": full.get("body", ""),
            "metadata": meta,
        })
        # deny
        r1 = admin_session.post(f"{BASE_URL}/api/shop/sell-requests", json={
            "pc_id": setup_pc["pc_id"], "merchant_id": setup_pc["merchant_id"],
            "item_name": "SellDeny Item", "proposed_price_gp": 4,
        }).json()
        r = admin_session.post(f"{BASE_URL}/api/shop/requests/{r1['id']}/deny", json={"reason": "nope"})
        assert r.status_code == 200 and r.json()["status"] == "denied"
        # cancel
        r2 = admin_session.post(f"{BASE_URL}/api/shop/sell-requests", json={
            "pc_id": setup_pc["pc_id"], "merchant_id": setup_pc["merchant_id"],
            "item_name": "SellCancel Item", "proposed_price_gp": 4,
        }).json()
        r = admin_session.post(f"{BASE_URL}/api/shop/requests/{r2['id']}/cancel")
        assert r.status_code == 200 and r.json()["status"] == "cancelled"

    def test_cleanup_restore_pc(self, admin_session, setup_pc):
        # Leave wawa with >=100 gp + 2 items
        full = requests.get(f"{BASE_URL}/api/entries/{setup_pc['pc_id']}").json()
        meta = full.get("metadata") or {}
        eq = [e for e in (meta.get("equipment") or []) if not e.startswith("SellDeny") and not e.startswith("SellCancel") and e != "Ghost Item"]
        # Ensure 2 items
        if len(eq) < 2:
            eq.extend(["Iron Dagger", "Healing Tonic"])
        meta["equipment"] = eq
        admin_session.put(f"{BASE_URL}/api/entries/{setup_pc['pc_id']}", json={
            "title": full["title"], "category": "character",
            "summary": full.get("summary", ""), "body": full.get("body", ""),
            "metadata": meta,
        })
        admin_session.put(f"{BASE_URL}/api/pcs/{setup_pc['pc_id']}/gold", json={"set": 175})
