"""Shop — merchants, items, and DM-approved purchase requests.

Players browse `/api/shop/merchants`, click an item, and submit a purchase
request tied to their active PC. The DM reviews `/api/shop/requests`; on
approve, the item name is appended to the PC's equipment list and the
price is deducted from the PC's gold balance.
"""
import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from deps import db, get_current_user, slugify

router = APIRouter()


# ---------------- Models ----------------
class MerchantIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str = Field(min_length=1, max_length=80)
    title: Optional[str] = ""              # e.g. "Ash-clad Herbalist"
    description: Optional[str] = ""        # short prose
    greeting: Optional[str] = ""           # speech bubble text shown to players
    portrait_url: Optional[str] = ""       # merchant portrait
    background_url: Optional[str] = ""     # full-bleed scene background
    counter_url: Optional[str] = ""        # optional counter / table overlay
    closed_art_url: Optional[str] = ""     # shown when is_open=False
    accent_color: Optional[str] = "#FBBF24"
    is_open: bool = True
    sort_order: int = 0


class ShopItemIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    merchant_id: str
    name: str = Field(min_length=1, max_length=80)
    description: Optional[str] = ""
    category: Literal["weapon", "armor", "consumable", "gear", "curio", "magical", "service"] = "gear"
    rarity: Literal["common", "uncommon", "rare", "very-rare", "legendary"] = "common"
    price_gp: int = Field(default=0, ge=0)
    image_url: Optional[str] = ""
    featured: bool = False
    stock: Optional[int] = None  # None = unlimited
    sort_order: int = 0


class PurchaseRequestIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    pc_id: str
    note: Optional[str] = ""


class SellRequestIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    pc_id: str
    merchant_id: str
    item_name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = ""
    proposed_price_gp: int = Field(ge=0)
    note: Optional[str] = ""


class RequestDecisionIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    reason: Optional[str] = ""
    # Sell-only: DM can override the player's proposed price on approve
    final_price_gp: Optional[int] = None


class GoldAdjustIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    # one of these will be applied; `delta` is preferred
    delta: Optional[int] = None
    set: Optional[int] = None


# ---------------- Formatters ----------------
def merchant_out(d: dict) -> dict:
    return {
        "id": d["id"],
        "slug": d.get("slug"),
        "name": d["name"],
        "title": d.get("title", ""),
        "description": d.get("description", ""),
        "greeting": d.get("greeting", ""),
        "portrait_url": d.get("portrait_url", ""),
        "background_url": d.get("background_url", ""),
        "counter_url": d.get("counter_url", ""),
        "closed_art_url": d.get("closed_art_url", ""),
        "accent_color": d.get("accent_color", "#FBBF24"),
        "is_open": d.get("is_open", True),
        "sort_order": d.get("sort_order", 0),
        "created_at": d.get("created_at"),
        "updated_at": d.get("updated_at"),
    }


def item_out(d: dict) -> dict:
    return {
        "id": d["id"],
        "merchant_id": d["merchant_id"],
        "name": d["name"],
        "description": d.get("description", ""),
        "category": d.get("category", "gear"),
        "rarity": d.get("rarity", "common"),
        "price_gp": d.get("price_gp", 0),
        "image_url": d.get("image_url", ""),
        "featured": d.get("featured", False),
        "stock": d.get("stock"),
        "sort_order": d.get("sort_order", 0),
        "created_at": d.get("created_at"),
        "updated_at": d.get("updated_at"),
    }


def request_out(d: dict) -> dict:
    return {
        "id": d["id"],
        "kind": d.get("kind", "purchase"),
        "status": d.get("status", "pending"),
        "item_id": d.get("item_id"),
        "item_snapshot": d.get("item_snapshot", {}),
        "merchant_id": d.get("merchant_id"),
        "merchant_name": d.get("merchant_name", ""),
        "user_id": d.get("user_id"),
        "user_name": d.get("user_name", ""),
        "pc_id": d.get("pc_id"),
        "pc_name": d.get("pc_name", ""),
        "price_gp": d.get("price_gp", 0),
        "final_price_gp": d.get("final_price_gp"),
        "note": d.get("note", ""),
        "reason": d.get("reason", ""),
        "created_at": d.get("created_at"),
        "decided_at": d.get("decided_at"),
    }


# ---------------- Merchants ----------------
@router.get("/shop/merchants")
async def list_merchants():
    cursor = db.shop_merchants.find({}, {"_id": 0}).sort([("sort_order", 1), ("created_at", 1)])
    items = await cursor.to_list(length=200)
    return [merchant_out(d) for d in items]


@router.get("/shop/merchants/{merchant_id}")
async def get_merchant(merchant_id: str):
    doc = await db.shop_merchants.find_one(
        {"$or": [{"id": merchant_id}, {"slug": merchant_id}]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Merchant not found")
    items_cur = db.shop_items.find({"merchant_id": doc["id"]}, {"_id": 0}).sort(
        [("featured", -1), ("sort_order", 1), ("name", 1)]
    )
    items = [item_out(d) for d in await items_cur.to_list(length=500)]
    out = merchant_out(doc)
    out["items"] = items
    out["featured_items"] = [i for i in items if i["featured"]]
    return out


@router.post("/shop/merchants")
async def create_merchant(body: MerchantIn, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    now = datetime.now(timezone.utc).isoformat()
    base_slug = slugify(body.name)
    slug = base_slug
    i = 2
    while await db.shop_merchants.find_one({"slug": slug}):
        slug = f"{base_slug}-{i}"
        i += 1
    doc = body.model_dump()
    doc.update({"id": str(uuid.uuid4()), "slug": slug, "created_at": now, "updated_at": now})
    await db.shop_merchants.insert_one(doc)
    doc.pop("_id", None)
    return merchant_out(doc)


@router.put("/shop/merchants/{merchant_id}")
async def update_merchant(merchant_id: str, body: MerchantIn, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    existing = await db.shop_merchants.find_one({"id": merchant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Merchant not found")
    update = body.model_dump()
    if update["name"] != existing.get("name"):
        base_slug = slugify(update["name"])
        slug = base_slug
        i = 2
        while await db.shop_merchants.find_one({"slug": slug, "id": {"$ne": merchant_id}}):
            slug = f"{base_slug}-{i}"
            i += 1
        update["slug"] = slug
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.shop_merchants.update_one({"id": merchant_id}, {"$set": update})
    updated = await db.shop_merchants.find_one({"id": merchant_id}, {"_id": 0})
    return merchant_out(updated)


@router.post("/shop/merchants/{merchant_id}/toggle-open")
async def toggle_merchant_open(merchant_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    existing = await db.shop_merchants.find_one({"id": merchant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Merchant not found")
    new_state = not existing.get("is_open", True)
    await db.shop_merchants.update_one(
        {"id": merchant_id},
        {"$set": {"is_open": new_state, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    updated = await db.shop_merchants.find_one({"id": merchant_id}, {"_id": 0})
    return merchant_out(updated)


@router.delete("/shop/merchants/{merchant_id}")
async def delete_merchant(merchant_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    existing = await db.shop_merchants.find_one({"id": merchant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Merchant not found")
    await db.shop_items.delete_many({"merchant_id": merchant_id})
    await db.shop_merchants.delete_one({"id": merchant_id})
    return {"ok": True}


# ---------------- Items ----------------
@router.get("/shop/items")
async def list_items(merchant_id: Optional[str] = None):
    query: dict = {}
    if merchant_id:
        query["merchant_id"] = merchant_id
    cursor = db.shop_items.find(query, {"_id": 0}).sort([
        ("featured", -1), ("sort_order", 1), ("name", 1)
    ])
    items = await cursor.to_list(length=1000)
    return [item_out(d) for d in items]


@router.post("/shop/items")
async def create_item(body: ShopItemIn, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    merchant = await db.shop_merchants.find_one({"id": body.merchant_id})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    now = datetime.now(timezone.utc).isoformat()
    doc = body.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_at": now, "updated_at": now})
    await db.shop_items.insert_one(doc)
    doc.pop("_id", None)
    return item_out(doc)


@router.put("/shop/items/{item_id}")
async def update_item(item_id: str, body: ShopItemIn, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    existing = await db.shop_items.find_one({"id": item_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    update = body.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.shop_items.update_one({"id": item_id}, {"$set": update})
    updated = await db.shop_items.find_one({"id": item_id}, {"_id": 0})
    return item_out(updated)


@router.delete("/shop/items/{item_id}")
async def delete_item(item_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    res = await db.shop_items.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


# ---------------- Purchase requests ----------------
@router.post("/shop/items/{item_id}/request")
async def request_purchase(item_id: str, body: PurchaseRequestIn, user: dict = Depends(get_current_user)):
    item = await db.shop_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    merchant = await db.shop_merchants.find_one({"id": item["merchant_id"]}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    if not merchant.get("is_open", True):
        raise HTTPException(status_code=400, detail="Shop is closed")
    if item.get("stock") is not None and item["stock"] <= 0:
        raise HTTPException(status_code=400, detail="Out of stock")
    pc = await db.entries.find_one({"id": body.pc_id, "category": "character"})
    if not pc:
        raise HTTPException(status_code=404, detail="Character not found")
    pc_meta = pc.get("metadata") or {}
    # Only the PC's owner can submit requests on its behalf
    if pc_meta.get("user_id") and pc_meta["user_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="That character is not yours")
    # Block duplicate pending requests for same item + same PC
    dup = await db.shop_requests.find_one({
        "item_id": item_id, "pc_id": body.pc_id, "status": "pending"
    })
    if dup:
        raise HTTPException(status_code=409, detail="A pending request for this item already exists")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "kind": "purchase",
        "status": "pending",
        "item_id": item_id,
        "item_snapshot": item,
        "merchant_id": merchant["id"],
        "merchant_name": merchant.get("name", ""),
        "user_id": user["id"],
        "user_name": user.get("name", ""),
        "pc_id": body.pc_id,
        "pc_name": pc.get("title", ""),
        "price_gp": item.get("price_gp", 0),
        "note": (body.note or "").strip(),
        "reason": "",
        "created_at": now,
        "decided_at": None,
    }
    await db.shop_requests.insert_one(doc)
    return request_out(doc)


@router.post("/shop/sell-requests")
async def request_sell(body: SellRequestIn, user: dict = Depends(get_current_user)):
    merchant = await db.shop_merchants.find_one({"id": body.merchant_id}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    if not merchant.get("is_open", True):
        raise HTTPException(status_code=400, detail="Shop is closed")
    pc = await db.entries.find_one({"id": body.pc_id, "category": "character"})
    if not pc:
        raise HTTPException(status_code=404, detail="Character not found")
    pc_meta = pc.get("metadata") or {}
    if pc_meta.get("user_id") and pc_meta["user_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="That character is not yours")
    equipment = list(pc_meta.get("equipment") or [])
    item_name = body.item_name.strip()
    if item_name not in equipment:
        raise HTTPException(status_code=400, detail=f"{pc['title']} is not carrying \"{item_name}\"")
    # Block duplicate pending sell for same item + PC + merchant
    dup = await db.shop_requests.find_one({
        "kind": "sell", "pc_id": body.pc_id, "merchant_id": body.merchant_id,
        "item_snapshot.name": item_name, "status": "pending",
    })
    if dup:
        raise HTTPException(status_code=409, detail="A pending sell request for this item already exists")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "kind": "sell",
        "status": "pending",
        "item_id": None,
        "item_snapshot": {
            "name": item_name,
            "description": (body.description or "").strip(),
            "source": "pc-equipment",
        },
        "merchant_id": merchant["id"],
        "merchant_name": merchant.get("name", ""),
        "user_id": user["id"],
        "user_name": user.get("name", ""),
        "pc_id": body.pc_id,
        "pc_name": pc.get("title", ""),
        "price_gp": int(body.proposed_price_gp),
        "note": (body.note or "").strip(),
        "reason": "",
        "created_at": now,
        "decided_at": None,
    }
    await db.shop_requests.insert_one(doc)
    return request_out(doc)


@router.get("/shop/requests")
async def list_requests(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    # Players see their own; admins see all
    query: dict = {}
    if status:
        query["status"] = status
    if user.get("role") != "admin":
        query["user_id"] = user["id"]
    cursor = db.shop_requests.find(query, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(length=500)
    return [request_out(d) for d in items]


@router.post("/shop/requests/{req_id}/approve")
async def approve_request(req_id: str, body: Optional[RequestDecisionIn] = None, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    req = await db.shop_requests.find_one({"id": req_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Already {req['status']}")
    pc = await db.entries.find_one({"id": req["pc_id"], "category": "character"})
    if not pc:
        raise HTTPException(status_code=404, detail="Character no longer exists")
    snap = req.get("item_snapshot") or {}
    kind = req.get("kind", "purchase")
    meta = pc.get("metadata") or {}
    gold = int(meta.get("gold_gp", 0))
    equipment = list(meta.get("equipment") or [])
    item_name = snap.get("name", "Mysterious item")
    final_price = None

    if kind == "sell":
        # Player sells an item → DM credits gold, item leaves equipment
        if item_name not in equipment:
            raise HTTPException(status_code=400, detail=f"{pc['title']} no longer carries \"{item_name}\"")
        # DM may override the proposed price on approve
        final_price = (body.final_price_gp if body and body.final_price_gp is not None
                       else int(req.get("price_gp", 0)))
        if final_price < 0:
            raise HTTPException(status_code=400, detail="Price cannot be negative")
        equipment.remove(item_name)
        meta["equipment"] = equipment
        meta["gold_gp"] = gold + final_price
    else:
        # Purchase: deduct gold, append item
        price = int(req.get("price_gp", 0))
        if gold < price:
            raise HTTPException(status_code=400, detail=f"{pc['title']} has {gold} gp but the item costs {price} gp")
        final_price = price
        equipment.append(item_name)
        meta["equipment"] = equipment
        meta["gold_gp"] = gold - price
        # Decrement stock if tracked
        if snap.get("stock") is not None:
            await db.shop_items.update_one(
                {"id": req["item_id"], "stock": {"$gt": 0}},
                {"$inc": {"stock": -1}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
            )

    await db.entries.update_one(
        {"id": pc["id"]},
        {"$set": {"metadata": meta, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    now = datetime.now(timezone.utc).isoformat()
    await db.shop_requests.update_one(
        {"id": req_id},
        {"$set": {"status": "approved", "decided_at": now, "reason": "", "final_price_gp": final_price}},
    )
    updated = await db.shop_requests.find_one({"id": req_id}, {"_id": 0})
    return request_out(updated)


@router.post("/shop/requests/{req_id}/deny")
async def deny_request(req_id: str, body: RequestDecisionIn, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    req = await db.shop_requests.find_one({"id": req_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Already {req['status']}")
    now = datetime.now(timezone.utc).isoformat()
    await db.shop_requests.update_one(
        {"id": req_id},
        {"$set": {"status": "denied", "decided_at": now, "reason": (body.reason or "").strip()}},
    )
    updated = await db.shop_requests.find_one({"id": req_id}, {"_id": 0})
    return request_out(updated)


@router.post("/shop/requests/{req_id}/cancel")
async def cancel_request(req_id: str, user: dict = Depends(get_current_user)):
    req = await db.shop_requests.find_one({"id": req_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Already {req['status']}")
    if req["user_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not your request")
    now = datetime.now(timezone.utc).isoformat()
    await db.shop_requests.update_one(
        {"id": req_id},
        {"$set": {"status": "cancelled", "decided_at": now}},
    )
    updated = await db.shop_requests.find_one({"id": req_id}, {"_id": 0})
    return request_out(updated)


# ---------------- PC gold balance (DM tool) ----------------
@router.put("/pcs/{pc_id}/gold")
async def adjust_pc_gold(pc_id: str, body: GoldAdjustIn, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    pc = await db.entries.find_one({"id": pc_id, "category": "character"})
    if not pc:
        raise HTTPException(status_code=404, detail="Character not found")
    meta = pc.get("metadata") or {}
    cur = int(meta.get("gold_gp", 0))
    if body.set is not None:
        new = max(0, int(body.set))
    elif body.delta is not None:
        new = max(0, cur + int(body.delta))
    else:
        raise HTTPException(status_code=400, detail="Provide `delta` or `set`")
    meta["gold_gp"] = new
    await db.entries.update_one(
        {"id": pc_id},
        {"$set": {"metadata": meta, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"id": pc_id, "gold_gp": new}
