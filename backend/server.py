"""Lantern Realm Codex — API server.

This module is intentionally thin: it instantiates the FastAPI app, mounts
each domain router under `/api`, configures CORS, and wires the startup/
shutdown hooks. All endpoint logic lives in `routes/*.py`; shared
infrastructure (Mongo client, JWT helpers, auth deps) lives in `deps.py`;
data seeders live in `seeds.py`.
"""
import os

from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware

from deps import client, db, logger, FRONTEND_URL
from routes.auth import router as auth_router
from routes.entries import router as entries_router
from routes.guides import router as guides_router
from routes.maps import router as maps_router
from routes.dice import router as dice_router
from routes.magic import router as magic_router
from routes.sessions import router as sessions_router
from routes.pcs import router as pcs_router
from routes.rules import router as rules_router
from routes.layouts import router as layouts_router
from routes.shop import router as shop_router
from storage import router as storage_router, init_storage
from seeds import (
    seed_admins, seed_entries, seed_magic_trees, seed_rules,
    seed_default_map, seed_guides, seed_shop,
)

app = FastAPI(title="Lantern Realm Codex API")

# Combined /api router — every sub-router is mounted here so the path table
# is registered as a single unit under `/api`.
api = APIRouter(prefix="/api")
for sub in (
    auth_router, entries_router, guides_router, maps_router, dice_router,
    magic_router, sessions_router, pcs_router, rules_router, layouts_router,
    shop_router, storage_router,
):
    api.include_router(sub)

app.include_router(api)


# ---------------- CORS ----------------
allow_origins = [FRONTEND_URL]
extra_origins = os.environ.get("CORS_ORIGINS", "")
if extra_origins:
    for o in extra_origins.split(","):
        o = o.strip()
        if o and o != "*" and o not in allow_origins:
            allow_origins.append(o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------- Startup / Shutdown ----------------
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.entries.create_index("id", unique=True)
    await db.entries.create_index("slug", unique=True)
    await db.entries.create_index("category")
    await db.dice_rolls.create_index([("created_at", -1)])
    await db.magic_trees.create_index("id", unique=True)
    await db.magic_trees.create_index("slug", unique=True)
    await db.scheduled_sessions.create_index("scheduled_at")
    await db.session_comments.create_index("id", unique=True)
    await db.session_comments.create_index([("session_id", 1), ("created_at", 1)])
    await db.uploads.create_index("id", unique=True)
    await db.regional_maps.create_index("id", unique=True)
    await db.regional_maps.create_index("slug", unique=True)
    await db.guides.create_index("id", unique=True)
    await db.guides.create_index("slug", unique=True)
    await db.shop_merchants.create_index("id", unique=True)
    await db.shop_merchants.create_index("slug", unique=True)
    await db.shop_items.create_index("id", unique=True)
    await db.shop_items.create_index("merchant_id")
    await db.shop_requests.create_index("id", unique=True)
    await db.shop_requests.create_index([("status", 1), ("created_at", -1)])
    for coll in ("rules_races", "rules_classes", "rules_spells", "rules_skills"):
        await db[coll].create_index("id", unique=True)
    await seed_admins()
    await seed_entries()
    await seed_magic_trees()
    await seed_rules()
    await seed_default_map()
    await seed_guides()
    await seed_shop()
    try:
        init_storage()
        logger.info("Emergent object storage initialised")
    except Exception as exc:
        logger.warning(f"Storage init deferred (will retry on first upload): {exc}")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
