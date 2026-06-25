"""Mongo index declarations for the Lantern Realm DB.

All index creation lives here so `server.py` stays a thin shell and so a new
collection's indexes are easy to find and add. Called once from the FastAPI
startup hook.
"""


async def ensure_indexes(db) -> None:
    # Users
    await db.users.create_index("email", unique=True)

    # Codex entries
    await db.entries.create_index("id", unique=True)
    await db.entries.create_index("slug", unique=True)
    await db.entries.create_index("category")

    # Dice
    await db.dice_rolls.create_index([("created_at", -1)])

    # Magic trees
    await db.magic_trees.create_index("id", unique=True)
    await db.magic_trees.create_index("slug", unique=True)

    # Sessions + comments
    await db.scheduled_sessions.create_index("scheduled_at")
    await db.session_comments.create_index("id", unique=True)
    await db.session_comments.create_index([("session_id", 1), ("created_at", 1)])

    # Uploads
    await db.uploads.create_index("id", unique=True)

    # Regional maps + guides
    await db.regional_maps.create_index("id", unique=True)
    await db.regional_maps.create_index("slug", unique=True)
    await db.guides.create_index("id", unique=True)
    await db.guides.create_index("slug", unique=True)

    # Shop
    await db.shop_merchants.create_index("id", unique=True)
    await db.shop_merchants.create_index("slug", unique=True)
    await db.shop_items.create_index("id", unique=True)
    await db.shop_items.create_index("merchant_id")
    await db.shop_requests.create_index("id", unique=True)
    await db.shop_requests.create_index([("status", 1), ("created_at", -1)])

    # D&D 5e SRD rules library
    for coll in ("rules_races", "rules_classes", "rules_spells", "rules_skills"):
        await db[coll].create_index("id", unique=True)
