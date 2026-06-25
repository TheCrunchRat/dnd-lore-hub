"""Startup seeders for the Lantern Realm DB.

Each function is idempotent — running them on a populated database is safe.
Called from `server.py:on_startup`. All state goes through `deps.db`.
"""
import os
import uuid
from datetime import datetime, timezone

from deps import (
    db, logger, hash_password, verify_password, slugify, DEFAULT_MAP_URL,
)
from dnd_srd import (
    RACES as SRD_RACES, CLASSES as SRD_CLASSES, SPELLS as SRD_SPELLS,
    SKILLS as SRD_SKILLS,
)


# ---------------- Admins ----------------
async def seed_admins():
    seeds = [
        ("ADMIN_EMAIL", "ADMIN_PASSWORD", "ADMIN_NAME", "dm@lantern.realm", "lantern-keeper-1", "Dungeon Master"),
        ("CO_DM_EMAIL", "CO_DM_PASSWORD", "CO_DM_NAME", "codm@lantern.realm", "lantern-keeper-2", "Co-DM"),
    ]
    for email_key, pwd_key, name_key, def_email, def_pwd, def_name in seeds:
        email = os.environ.get(email_key, def_email).lower().strip()
        password = os.environ.get(pwd_key, def_pwd)
        name = os.environ.get(name_key, def_name)
        existing = await db.users.find_one({"email": email})
        if not existing:
            await db.users.insert_one({
                "email": email,
                "password_hash": hash_password(password),
                "name": name,
                "role": "admin",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"Seeded admin {email}")
        elif not verify_password(password, existing["password_hash"]):
            await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password)}})
            logger.info(f"Updated admin password for {email}")


# ---------------- Starter Entries ----------------
SEED_ENTRIES = [
    {
        "category": "overview",
        "title": "The Lantern Realm",
        "subtitle": "A world reclaimed by root and rust",
        "summary": "Centuries after the Sundering, civilization survives only in fragments — small kingdoms tethered together by old roads, ember-lit shrines, and the unbroken chain of Lanternkeepers.",
        "content": "When the gods withdrew their light, the forests came forward. Cities crumbled beneath ivy. Towers sank into moss-thick earth. What remains of humankind huddles around lanterns — copper, brass, and bone — passed hand to hand across generations.\n\nTo carry a lantern is to remember; to let one go dark is to be forgotten. The Lantern Realm is a campaign world built on three currents: the slow violence of nature reclaiming stone, the politics of small kingdoms scrabbling over the last roads, and the quiet faith of those who keep the lanterns burning.",
        "image_url": "https://images.pexels.com/photos/20461910/pexels-photo-20461910.jpeg",
        "tags": ["lore", "intro"],
        "metadata": {},
        "pinned": True,
    },
    {
        "category": "location",
        "title": "Mirewatch",
        "subtitle": "A drowning city of lanterns",
        "summary": "Built on stilts above the swallowing fens, Mirewatch is the last great trading post before the Hollow Roads.",
        "content": "The boards never stop creaking. Every plank in Mirewatch is wet with marsh and lantern oil. The city is ruled by the Council of Wicks, twelve elders chosen for the brightness of their hearth-fires.",
        "image_url": "https://images.pexels.com/photos/323340/pexels-photo-323340.jpeg",
        "tags": ["city", "swamp"],
        "metadata": {"region": "The Drowning Fens", "population": "~8,400"},
        "pinned": True,
        "map_x": 38.5,
        "map_y": 62.0,
    },
    {
        "category": "character",
        "title": "Vael Ashen",
        "subtitle": "Lanternkeeper of the Sunken Road",
        "summary": "A weathered ranger sworn to keep the wayshrines lit between Mirewatch and the ruined capital.",
        "content": "Vael has walked the Sunken Road for thirty winters. She speaks little, but the lanterns along her path have not failed once in her tenure.",
        "image_url": "https://images.pexels.com/photos/26178754/pexels-photo-26178754.jpeg",
        "tags": ["npc", "ally"],
        "metadata": {"role": "NPC", "race": "Half-elf", "class": "Ranger"},
        "pinned": False,
    },
    {
        "category": "faction",
        "title": "The Order of Wicks",
        "subtitle": "Keepers of the unbroken flame",
        "summary": "A monastic order tasked with tending every wayshrine, watchtower lantern, and funeral candle across the Realm.",
        "content": "Founded after the Sundering, the Order treats fire as a sacrament. Their initiates are bound by a single vow: 'No lantern shall go dark by my hand or my neglect.'",
        "image_url": "https://images.pexels.com/photos/20461910/pexels-photo-20461910.jpeg",
        "tags": ["order", "religious"],
        "metadata": {"alignment": "Lawful Neutral", "headquarters": "The Brass Cloister"},
        "pinned": True,
    },
    {
        "category": "lore",
        "title": "The Sundering",
        "subtitle": "Year 0 of the Long Dusk",
        "summary": "The day the gods turned their faces, the sky cracked, and the forests began to march.",
        "content": "No mortal saw the moment it began. Scholars argue still — was it divine punishment, a slumber, an exile? What is certain is that within a single year, the great cities of the High Reach fell to root and ruin.",
        "image_url": "",
        "tags": ["event", "cataclysm"],
        "metadata": {"era": "Year 0 LD"},
        "pinned": False,
    },
    {
        "category": "session",
        "title": "Session 01 — Embers on the Sunken Road",
        "subtitle": "The party meets Vael",
        "summary": "Hired to escort a lantern relic from Mirewatch to the Brass Cloister, the party tangles with bog-stalkers on the first night.",
        "content": "Notable moments: Thorne nearly drowned. Mira parlayed with a moss-druid. The lantern was nearly extinguished by a sudden rain — saved by Vael's cloak.",
        "image_url": "",
        "tags": ["session", "act-1"],
        "metadata": {"session_number": 1, "date_played": "2025-11-02"},
        "pinned": False,
    },
    {
        "category": "bestiary",
        "title": "Bog-Stalker",
        "subtitle": "Predator of the Drowning Fens",
        "summary": "A long-limbed amphibian ambush hunter that mimics the flicker of distant lanterns to lure travelers.",
        "content": "Bog-stalkers possess a bioluminescent lure on their tongue. They favor wet, foggy nights and can hold their breath for hours beneath the surface.",
        "image_url": "",
        "tags": ["beast", "swamp"],
        "metadata": {"cr": "3", "type": "Monstrosity", "size": "Large"},
        "pinned": False,
    },
]


async def seed_entries():
    count = await db.entries.count_documents({})
    if count > 0:
        return
    now = datetime.now(timezone.utc).isoformat()
    for e in SEED_ENTRIES:
        eid = str(uuid.uuid4())
        slug = slugify(e["title"])
        doc = {**e, "id": eid, "slug": slug, "created_at": now, "updated_at": now}
        await db.entries.insert_one(doc)
    logger.info("Seeded starter entries")


# ---------------- Magic-Tree starter data ----------------
def _node(nid, name, desc, icon, x, y, req=None):
    return {"id": nid, "name": name, "description": desc, "icon": icon, "x": x, "y": y, "requires": req or []}


def _wickfire_nodes():
    return [
        _node("w1", "Tend the Wick", "Light or extinguish any small flame in sight. The first cantrip.", "Flame", 0.50, 0.06),
        # Tier 1
        _node("w2a", "Lantern Eye", "See clearly in lantern-light up to 60 ft, even through fog or smoke.", "Eye", 0.22, 0.20, ["w1"]),
        _node("w2b", "Steady Flame", "Your tended flames cannot be extinguished by wind or rain for one hour.", "Shield", 0.50, 0.20, ["w1"]),
        _node("w2c", "Spark of Speech", "Cause any single candle, lantern or hearth-fire to gutter in time with your words.", "Wind", 0.78, 0.20, ["w1"]),
        # Tier 2
        _node("w3a", "Wayshrine Sense", "You always know the direction of the nearest lit wayshrine.", "Compass", 0.10, 0.36, ["w2a"]),
        _node("w3b", "Ember Bolt", "Hurl a mote of wickfire (1d8 fire). Lights torches on hit.", "Zap", 0.32, 0.36, ["w2a", "w2b"]),
        _node("w3c", "Hearth-Mend", "Tend a wound by lantern-light — restore 1d6 + tier HP, once per rest.", "Heart", 0.55, 0.36, ["w2b"]),
        _node("w3d", "Brass Ward", "Trace a circle of wickfire that undead and bog-stalkers will not cross.", "Sparkles", 0.78, 0.36, ["w2b", "w2c"]),
        _node("w3e", "Whispering Flame", "Carry a message from one lit lantern to another within a day's walk.", "BookOpen", 0.93, 0.36, ["w2c"]),
        # Tier 3
        _node("w4a", "Lamplighter's Path", "Once per dusk, walk between two lit lanterns up to 100 ft apart in a single step.", "Footprints", 0.18, 0.52, ["w3a", "w3b"]),
        _node("w4b", "Pyre Step", "Step into one flame, step out from another within 30 ft.", "Footprints", 0.42, 0.52, ["w3b"]),
        _node("w4c", "Mirror Wick", "Split one flame into two — they share a single source of fuel.", "Sun", 0.62, 0.52, ["w3c", "w3d"]),
        _node("w4d", "Funeral Bright", "Burn the unclean and the lying without consuming the honest.", "Skull", 0.82, 0.52, ["w3d", "w3e"]),
        # Tier 4
        _node("w5a", "Ash Walk", "For one scene, you leave no footprints and cast no shadow.", "Wind", 0.30, 0.68, ["w4a", "w4b"]),
        _node("w5b", "Cleansing Pyre", "Summon a pillar of pale fire that burns only what is unclean (8d6 radiant).", "Sun", 0.55, 0.68, ["w4b", "w4c"]),
        _node("w5c", "Beacon Call", "Light a flare visible for a hundred miles. Anyone who sees it learns where you are.", "Star", 0.78, 0.68, ["w4c", "w4d"]),
        # Tier 5 (capstones)
        _node("w6a", "Long Burning", "Your final breath does not put out your lantern. Resist death once.", "Crown", 0.35, 0.86, ["w5a", "w5b"]),
        _node("w6b", "Cathedral of Flame", "Erect a 30-ft sphere of light no spirit nor sorcery may enter. Lasts until you sleep.", "Sparkles", 0.65, 0.86, ["w5b", "w5c"]),
    ]


def _mossblood_nodes():
    return [
        _node("m1", "Greenwhisper", "Speak with any plant for one minute. Most have little to say.", "Leaf", 0.50, 0.06),
        # Tier 1
        _node("m2a", "Vine-Step", "Vines and roots part for you. Move silently through undergrowth.", "Footprints", 0.22, 0.20, ["m1"]),
        _node("m2b", "Spore-Tongue", "Taste a mushroom and know if it is safe, lying, or hungry.", "Eye", 0.50, 0.20, ["m1"]),
        _node("m2c", "Moss-Knit", "A poultice of shrine-moss restores 2d4 + tier HP. Once per scene.", "Heart", 0.78, 0.20, ["m1"]),
        # Tier 2
        _node("m3a", "Root-Knot", "Bind a creature in place with roots (STR save DC 8+prof+wis).", "Leaf", 0.12, 0.36, ["m2a"]),
        _node("m3b", "Bark-Skin", "Your skin hardens — +2 AC for one minute, no metal armor.", "Shield", 0.35, 0.36, ["m2a", "m2b"]),
        _node("m3c", "Witch-Light", "Summon a will-o'-wisp that follows your lantern for one night.", "Sparkles", 0.58, 0.36, ["m2b", "m2c"]),
        _node("m3d", "Long Memory", "Touch a tree older than fifty years and see one event it witnessed.", "BookOpen", 0.82, 0.36, ["m2c"]),
        # Tier 3
        _node("m4a", "Forest-March", "The forest carries you at twice your speed for one day.", "Footprints", 0.22, 0.52, ["m3a", "m3b"]),
        _node("m4b", "Hollow-Heart Pact", "Trade a memory to a tree in exchange for one of its oldest gifts.", "Heart", 0.50, 0.52, ["m3b", "m3c"]),
        _node("m4c", "Wyrd-Bind", "Mark a creature — the forest will know it from now on, and refuse it.", "Star", 0.78, 0.52, ["m3c", "m3d"]),
        # Tier 4
        _node("m5a", "Verdant Call", "Summon a host of crows, foxes, or mushroom-spites for one scene.", "Bird", 0.30, 0.70, ["m4a", "m4b"]),
        _node("m5b", "Mushroom Sight", "See through the eyes of any fungus you have touched, anywhere it grows.", "Eye", 0.55, 0.70, ["m4b"]),
        _node("m5c", "The Long Sleep", "Bury yourself in moss — heal fully, but sleep for a week and a day.", "Moon", 0.78, 0.70, ["m4b", "m4c"]),
        # Tier 5
        _node("m6a", "Forest-Born", "You no longer age in any forest older than yourself.", "Trees", 0.40, 0.88, ["m5a", "m5b"]),
        _node("m6b", "Crown of Thorns", "Take root in place — gain Resistance to all damage but cannot move. Lasts a day.", "Crown", 0.65, 0.88, ["m5b", "m5c"]),
    ]


def _sundered_lantern_nodes():
    return [
        _node("s1", "The Wick", "The first star. A small, steady light that cannot be extinguished by living hand.", "Flame", 0.50, 0.06),
        # Tier 1 — the three nearer stars
        _node("s2", "The Smoke", "Obscure your passage from one who watches you.", "Wind", 0.20, 0.20, ["s1"]),
        _node("s3", "The Shadow", "Cast a shadow that is not your own — it walks where you cannot.", "Moon", 0.50, 0.20, ["s1"]),
        _node("s4", "The Flicker", "Be in two places for the length of one heartbeat.", "Star", 0.80, 0.20, ["s1"]),
        # Tier 2 — the four watching stars
        _node("s5", "The Mirror", "What you see in still water tells you a truth about the seer.", "Eye", 0.10, 0.36, ["s2"]),
        _node("s6", "The Hollow", "Empty yourself of one feeling for one scene — fear, love, grief.", "Skull", 0.34, 0.36, ["s2", "s3"]),
        _node("s7", "The Veil", "Step behind the world — for one minute, nothing in it can touch you.", "Sparkles", 0.62, 0.36, ["s3", "s4"]),
        _node("s8", "The Glass", "See a moment that has already happened, once, never twice.", "BookOpen", 0.88, 0.36, ["s4"]),
        # Tier 3 — the long stars
        _node("s9", "The Threshold", "Anyone who crosses a doorway you mark will pause once, helpless.", "Compass", 0.22, 0.54, ["s5", "s6"]),
        _node("s10", "The Watcher", "A star far above sees what you choose to look at, and remembers.", "Eye", 0.48, 0.54, ["s6", "s7"]),
        _node("s11", "The Procession", "Walk in a line with the dead behind you — they will not be seen unless you turn.", "Footprints", 0.76, 0.54, ["s7", "s8"]),
        # Tier 4 — the burning stars
        _node("s12", "The Eclipse", "Become unseen for as long as the lantern at the heart of you holds.", "Moon", 0.30, 0.72, ["s9", "s10"]),
        _node("s13", "The Gate", "Open a door that was never there. Close it from the other side.", "Sparkles", 0.55, 0.72, ["s10"]),
        _node("s14", "The Procession's End", "The dead behind you may take one action — once, never twice.", "Bone", 0.78, 0.72, ["s10", "s11"]),
        # Tier 5 — the final stars
        _node("s15", "The Sundered Crown", "The constellation accepts you. The price is a name, surrendered. From now on, no power may compel you against your will.", "Crown", 0.50, 0.90, ["s12", "s13", "s14"]),
    ]


def _wickwarden_nodes():
    return [
        _node("ww1", "Lantern Bond", "Bond a lantern — it cannot be extinguished by any hand but yours.", "Flame", 0.50, 0.06),
        _node("ww2a", "Brass Discipline", "Add +prof to one save you choose at the start of each day.", "Shield", 0.22, 0.20, ["ww1"]),
        _node("ww2b", "Ember Reflex", "+1 initiative. Once per scene, ignore the first 1d6 fire damage.", "Zap", 0.50, 0.20, ["ww1"]),
        _node("ww2c", "Pilgrim's Stride", "Move at full speed in difficult terrain on roads.", "Footprints", 0.78, 0.20, ["ww1"]),
        # Tier 2
        _node("ww3a", "Wayguard", "An ally within 5 ft of your lantern shares your saves against fear.", "Shield", 0.15, 0.36, ["ww2a"]),
        _node("ww3b", "Lanternstrike", "Once per scene, your weapon attack also lights a torch on hit.", "Sword", 0.40, 0.36, ["ww2a", "ww2b"]),
        _node("ww3c", "Vigil Stance", "When you do not move, attackers have disadvantage.", "Eye", 0.62, 0.36, ["ww2b", "ww2c"]),
        _node("ww3d", "Bonded Flame", "Cast Light on your lantern at will. It cannot be Dispelled.", "Sparkles", 0.85, 0.36, ["ww2c"]),
        # Tier 3
        _node("ww4a", "Stand Fast", "When reduced to 0 HP, regain 1 HP. Once per day.", "Heart", 0.22, 0.54, ["ww3a", "ww3b"]),
        _node("ww4b", "Stoke", "Bonus action — grant an ally within 30 ft +1d6 fire damage on their next hit.", "Flame", 0.50, 0.54, ["ww3b", "ww3c"]),
        _node("ww4c", "Burning Resolve", "You cannot be put to sleep by magical or mundane means.", "Crown", 0.78, 0.54, ["ww3c", "ww3d"]),
        # Tier 4
        _node("ww5a", "Long Watch", "Need only 2 hours of sleep per night.", "Moon", 0.30, 0.72, ["ww4a", "ww4b"]),
        _node("ww5b", "Cleansing Vow", "Once per day, cure one disease, curse, or possession by burning your lantern's wick low.", "Sun", 0.55, 0.72, ["ww4b", "ww4c"]),
        _node("ww5c", "Last Light", "If your bonded lantern is broken, you may relight it once with your own blood.", "Heart", 0.78, 0.72, ["ww4c"]),
        # Capstone
        _node("ww6", "Last Lantern", "When you die, your bonded lantern burns for a year and a day in your honor — anyone who tends it gains one tier of your training.", "Crown", 0.50, 0.90, ["ww5a", "ww5b", "ww5c"]),
    ]


SEED_MAGIC_TREES = [
    {
        "name": "Wickfire",
        "subtitle": "The disciplined flame",
        "summary": "The first and oldest of the Realm's sanctioned schools, taught in the Brass Cloister. Wickfire shapes lantern-fire into tools — for light, for warmth, for the burning of unclean things.",
        "content": "Wickfire practitioners begin by tending a single flame for a year and a day. Only then are they shown how to shape it.",
        "accent_color": "#FBBF24",
        "image_url": "",
        "tree_category": "origin",
        "nodes": [
            {"id": "n1", "name": "Tend the Wick", "description": "The initiate's first cantrip. Light or extinguish any small flame within sight.", "icon": "Flame", "x": 0.5, "y": 0.10, "requires": []},
            {"id": "n2", "name": "Lantern Eye", "description": "See clearly in lantern-light up to 60 feet, even through fog or smoke.", "icon": "Eye", "x": 0.28, "y": 0.32, "requires": ["n1"]},
            {"id": "n3", "name": "Steady Flame", "description": "Your tended flames cannot be put out by wind or rain for one hour.", "icon": "Shield", "x": 0.72, "y": 0.32, "requires": ["n1"]},
            {"id": "n4", "name": "Wayshrine Sense", "description": "You always know the direction of the nearest lit wayshrine.", "icon": "Compass", "x": 0.15, "y": 0.55, "requires": ["n2"]},
            {"id": "n5", "name": "Ember Bolt", "description": "Hurl a mote of wickfire as a ranged attack (1d8 fire). Lights a torch on hit.", "icon": "Zap", "x": 0.42, "y": 0.55, "requires": ["n2", "n3"]},
            {"id": "n6", "name": "Brass Ward", "description": "Trace a circle of wickfire that undead and bog-stalkers will not cross.", "icon": "Sparkles", "x": 0.85, "y": 0.55, "requires": ["n3"]},
            {"id": "n7", "name": "Cleansing Pyre", "description": "Summon a pillar of pale fire that burns only what is unclean.", "icon": "Sun", "x": 0.5, "y": 0.82, "requires": ["n5", "n6"]},
        ],
    },
    {
        "name": "Mossblood",
        "subtitle": "What the forest remembers",
        "summary": "Outlawed in three kingdoms and revered in the rest. Mossblood is the magic of root, mycelium, and the long memory of trees.",
        "content": "Practitioners drink a tea of crushed shrine-moss. Most do not return from the first dream. Those who do speak to the forests differently afterward.",
        "accent_color": "#4A7C59",
        "image_url": "",
        "tree_category": "origin",
        "nodes": [
            {"id": "m1", "name": "Greenwhisper", "description": "Speak with any plant for one minute. Most have little to say.", "icon": "Leaf", "x": 0.5, "y": 0.10, "requires": []},
            {"id": "m2", "name": "Vine-Step", "description": "Vines and roots part to let you walk silently through dense undergrowth.", "icon": "Footprints", "x": 0.3, "y": 0.35, "requires": ["m1"]},
            {"id": "m3", "name": "Moss-Knit", "description": "Mend a wound with a poultice of shrine-moss (heals 2d4 + tier).", "icon": "Heart", "x": 0.7, "y": 0.35, "requires": ["m1"]},
            {"id": "m4", "name": "Long Memory", "description": "Touch a tree older than fifty years and see one event it witnessed.", "icon": "BookOpen", "x": 0.5, "y": 0.62, "requires": ["m2", "m3"]},
            {"id": "m5", "name": "Verdant Call", "description": "Summon a host of crows, foxes, or mushroom-spites to your aid for one scene.", "icon": "Bird", "x": 0.5, "y": 0.85, "requires": ["m4"]},
        ],
    },
    {
        "name": "The Sundered Lantern",
        "subtitle": "A constellation of the Long Dusk",
        "summary": "Among the foundation constellations — wheels of stars older than any kingdom. The Sundered Lantern grants light to those who walk between memory and rumor.",
        "content": "Each star is an aspect. Drawing power from a star asks something in trade: a name, a season of sleep, a dream you would rather forget.",
        "accent_color": "#A78BFA",
        "image_url": "",
        "tree_category": "foundation",
        "nodes": [
            {"id": "s1", "name": "The Wick", "description": "The first star. A small, steady light that cannot be extinguished by living hand.", "icon": "Flame", "x": 0.5, "y": 0.12, "requires": []},
            {"id": "s2", "name": "The Smoke", "description": "Reach the second star to obscure your passage from one who watches you.", "icon": "Wind", "x": 0.25, "y": 0.38, "requires": ["s1"]},
            {"id": "s3", "name": "The Shadow", "description": "The third star. Cast a shadow that is not your own — it walks where you cannot.", "icon": "Moon", "x": 0.75, "y": 0.38, "requires": ["s1"]},
            {"id": "s4", "name": "The Glass", "description": "See a moment that has already happened, once, never twice.", "icon": "Eye", "x": 0.5, "y": 0.65, "requires": ["s2", "s3"]},
            {"id": "s5", "name": "The Eclipse", "description": "Become unseen for as long as the lantern guttering at the heart of you holds.", "icon": "Star", "x": 0.5, "y": 0.88, "requires": ["s4"]},
        ],
    },
]


async def seed_magic_trees():
    count = await db.magic_trees.count_documents({})
    # Backfill any pre-existing trees without a category
    await db.magic_trees.update_many({"tree_category": {"$exists": False}}, {"$set": {"tree_category": "origin"}})

    # Expanded versions — auto-upgrade if the user hasn't customized
    EXPANDED = {
        "Wickfire": _wickfire_nodes(),
        "Mossblood": _mossblood_nodes(),
        "The Sundered Lantern": _sundered_lantern_nodes(),
    }
    OLD_COUNTS = {"Wickfire": 7, "Mossblood": 5, "The Sundered Lantern": 5}
    for name, new_nodes in EXPANDED.items():
        existing = await db.magic_trees.find_one({"name": name})
        if existing and len(existing.get("nodes", [])) == OLD_COUNTS.get(name):
            await db.magic_trees.update_one(
                {"id": existing["id"]},
                {"$set": {"nodes": new_nodes, "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
            logger.info(f"Upgraded {name} to {len(new_nodes)} nodes")

    # Insert the starter Class tree if missing
    if not await db.magic_trees.find_one({"slug": "wickwarden"}):
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": str(uuid.uuid4()), "slug": "wickwarden", "name": "Wickwarden",
            "subtitle": "Class skill path — Defender of the Flame",
            "summary": "The class skill tree for those who walk the road with a lantern and a vow.",
            "content": "Wickwardens are the militant arm of the Order of Wicks — pilgrims and protectors who shield the flame against the dark.",
            "accent_color": "#F97316", "image_url": "", "tree_category": "class",
            "nodes": _wickwarden_nodes(),
            "created_at": now, "updated_at": now,
        }
        await db.magic_trees.insert_one(doc)
        logger.info("Seeded Wickwarden class tree")

    if count > 0:
        if not await db.magic_trees.find_one({"slug": "the-sundered-lantern"}):
            now = datetime.now(timezone.utc).isoformat()
            const = next((t for t in SEED_MAGIC_TREES if t["name"] == "The Sundered Lantern"), None)
            if const:
                doc = {**const, "id": str(uuid.uuid4()), "slug": slugify(const["name"]), "created_at": now, "updated_at": now}
                await db.magic_trees.insert_one(doc)
                logger.info("Seeded foundation constellation")
        return
    now = datetime.now(timezone.utc).isoformat()
    for t in SEED_MAGIC_TREES:
        tid = str(uuid.uuid4())
        slug = slugify(t["name"])
        doc = {**t, "id": tid, "slug": slug, "created_at": now, "updated_at": now}
        await db.magic_trees.insert_one(doc)
    logger.info("Seeded starter magic trees")


# ---------------- D&D 5e Rules Library ----------------
async def seed_rules():
    if await db.rules_skills.count_documents({}) == 0:
        for s in SRD_SKILLS:
            await db.rules_skills.insert_one({**s, "id": str(uuid.uuid4()), "source": "srd"})
    if await db.rules_races.count_documents({}) == 0:
        for r in SRD_RACES:
            await db.rules_races.insert_one({**r, "id": str(uuid.uuid4()), "source": "srd"})
    if await db.rules_classes.count_documents({}) == 0:
        for c in SRD_CLASSES:
            await db.rules_classes.insert_one({**c, "id": str(uuid.uuid4()), "source": "srd"})
    if await db.rules_spells.count_documents({}) == 0:
        for s in SRD_SPELLS:
            await db.rules_spells.insert_one({**s, "id": str(uuid.uuid4()), "source": "srd"})
    logger.info("Seeded D&D 5e rules library")


# ---------------- Guides starter ----------------
async def seed_guides():
    if await db.guides.count_documents({}) > 0:
        return
    now = datetime.now(timezone.utc).isoformat()
    starter = {
        "id": str(uuid.uuid4()),
        "slug": "welcome",
        "title": "Welcome to the Lantern Realm",
        "subtitle": "A short guide for new arrivals",
        "content": (
            "## What this site is\n\n"
            "This is our campaign codex — a place to gather the lore, "
            "characters, locations, and rules of our table. Pages live in the **sidebar**; "
            "click any one to read it.\n\n"
            "## Writing your own guide\n\n"
            "Click **New Guide** above (DM only) to start a new page. The editor accepts:\n\n"
            "- bold and italic text\n"
            "- headings, quotes, and bullet lists\n"
            "- cross-links to the codex — type `[[Entry Name]]` and it becomes a clickable lantern\n\n"
            "## Adding images\n\n"
            "Use the **image button** in the editor toolbar (or drag-and-drop right into "
            "the editor) to upload an image. It gets stored permanently and inserted into "
            "the page as `![image](url)`.\n\n"
            "> Tip: keep images under 10 MB. PNG, JPG, WEBP and GIF all work.\n"
        ),
        "sort_order": 0,
        "is_pinned": True,
        "created_at": now,
        "updated_at": now,
    }
    await db.guides.insert_one(starter)
    logger.info("Seeded starter guide")


# ---------------- Default Regional Map ----------------
async def seed_default_map():
    if await db.regional_maps.count_documents({}) > 0:
        return
    settings_doc = await db.settings.find_one({"_id": "global"}, {"_id": 0})
    image_url = (settings_doc or {}).get("world_map_url") or DEFAULT_MAP_URL
    now = datetime.now(timezone.utc).isoformat()
    default_id = str(uuid.uuid4())
    default_doc = {
        "id": default_id,
        "slug": "lantern-realm",
        "name": "The Lantern Realm",
        "subtitle": "The known world, mapped in ink and ember",
        "image_url": image_url,
        "is_default": True,
        "sort_order": 0,
        "created_at": now,
        "updated_at": now,
    }
    await db.regional_maps.insert_one(default_doc)
    await db.entries.update_many(
        {"category": "location", "map_x": {"$ne": None}, "map_id": None},
        {"$set": {"map_id": default_id}},
    )
    logger.info("Seeded default regional map and migrated existing placements")
