# Lantern Realm Codex — PRD

## Original Problem Statement
> "Build a website to explain and dive deeper into the narrative world of a D&D game. Content managed by the creator and party. No AI impacting the lore. Aesthetic: dark fantasy with nature-overgrowing vibe and lantern motifs."

## Product Requirements
- Codex for lore / locations / characters / factions / bestiary
- Interactive world map (image overlay + lantern markers)
- Communal dice page (live-poll roller)
- Interactive magic skill trees: origin / foundation / class categories, 1–5 rank upgrades, custom node tier sizes, colors, level requirements
- Session planner with RSVPs
- Full D&D 5e character creation system for players
- Player accounts + DM admin portal
- Shop page (placeholder)

## User Personas
- **DM (admin)**: edits any entry, pins, deletes, builds skill trees, schedules sessions
- **Co-DM (admin)**: same powers
- **Player (registered)**: owns characters, RSVPs sessions, rolls dice
- **Visitor (anonymous)**: read-only

## Architecture
- **Backend**: FastAPI + Motor (Mongo), routes prefixed `/api`
- **Auth**: JWT (HS256) via httpOnly cookies, bcrypt
- **Models**: `users`, `entries`, `pcs`, `magic_trees`, `sessions`, `dice_rolls`, plus D&D 5e SRD rules (`dnd_srd.py`)
- **Frontend**: React 19 + react-router 7 + tailwind + lucide-react + sonner + react-leaflet
- **Theme**: Custom dark palette (obsidian, moss, stone, lantern gold #FBBF24), Cormorant Garamond + Manrope, vine-frame card corners, ember-flicker, drop-cap prose

## What's Implemented
### Dec 2025
- Seeded two admin accounts + 7 starter entries (one per category)
- Public endpoints: list/get entries, stats, search, settings
- Admin endpoints: CRUD entries, set per-entry map position, settings
- Pages: Home, CategoryList, EntryDetail, Login, Admin, WorldMap (Leaflet `/map`)
- Visual world map: image overlay, lantern markers, popups linking to entries, click-to-place coords, per-location sidebar, swap-map-image admin tool
- Lantern animated motifs, vine-frame, ember glow, noise overlay
- Toast notifications via sonner

### Jan–Feb 2026
- Player accounts + character ownership (`/register`)
- Communal Dice page with live polling (`/dice`)
- Sessions Scheduler with RSVPs (`/sessions`)
- Full 5e Character Builder + Sheet (PCs vs NPCs) (`/characters`)
- Magic system overhaul: 3 categories (Origin / Foundation / Class) with tabs, 1–5 rank upgrades + per-rank descriptions, tier sizes (small/normal/large/huge), per-node color overrides, expanded 60+ icon picker, larger 1400×1000 canvas with curved bezier connections (`/magic`)
- Inline two-click confirm pattern replacing all `window.confirm`/`window.prompt` usage (browser-blocking dialogs broke app state)

### Feb 2026 (this fork)
- **MagicBackdrop** component: decorative `chain + vine + lantern with ember-flame` SVG, applied behind both `/magic` list page (right) and `/magic/:slug` tree page (left)
- **Level requirement system on skill-tree nodes**:
  - `level_required` integer (1–20) per node (saved/loaded from backend)
  - Lock badge on node circle showing the level number
  - **Hover tooltip** (SVG, inside the tree canvas) — "REQUIRES LEVEL N" when hovering a locked node (non-edit mode)
  - **Click popup modal** — `LockedNodeModal` with SEALED ABILITY overline, lock-badged icon, "Requires Level N" banner, description, per-rank effects, flavour text
- Replaced last remaining `window.confirm` (school deletion) with inline two-click confirm pattern
- Restructured Magic page JSX so modals escape the `z-10` content stacking context and properly overlay the global navbar (z-40)

## Backlog / Next
- **P1** Populate Shop page with items, prices, merchant NPCs
- **P1** Public sharable share-link toggle per entry (DM-only spoiler tags)
- **P2** Refactor: split MagicTree.jsx (1086 lines) into `components/magic-tree/{LockedNodeModal, SchoolSettings, NodeEditor, TreeCanvas}`
- **P2** Refactor: break `server.py` into route modules under `/app/backend/routes`
- **P2** Markdown rich-text editor (currently plain-text paragraph split)
- **P2** Cross-linking between entries (`[[mention]]` syntax)
- **P2** Image upload (currently URL-only)
- **P2** Multiple regional maps (per-faction / per-act)
- **P3** Player-facing comments / questions per session
- **P3** Backend min/max enforcement for `level_required` (currently UI-only 1–20)

## Test Credentials
See `/app/memory/test_credentials.md`. DM: `dm@lantern.realm` / `lantern-keeper-1`.

## Critical Rules (do not regress)
- Never use `window.confirm`, `window.prompt`, or `window.alert` — browsers silently block them and break app state. Use inline "click again to confirm" or React modals.
- Player characters (`pcs`) link via `user_id` if logged in OR fall back to `player_name` string — keep backwards compatibility.
- All backend routes prefixed `/api`. Frontend uses `process.env.REACT_APP_BACKEND_URL`. No hardcoded URLs.
