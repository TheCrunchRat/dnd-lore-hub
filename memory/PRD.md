# Lantern Realm Codex — PRD

## Original Problem Statement
> "build a website for me that allows me to explain and dive deeper about the narrative world of my dnd game"

## User Choices
- All sections (overview, locations, characters, factions, lore, sessions, bestiary)
- Two-DM management (admin login, public read-only)
- No AI features
- Visual vibe: dark fantasy with nature overgrowing + strong lantern motifs

## Architecture
- **Backend**: FastAPI + Motor (Mongo) on `/api`
- **Auth**: JWT (HS256) via httpOnly cookies, bcrypt password hashing
- **Models**: Unified `entries` collection w/ `category` enum + freeform `metadata` dict
- **Frontend**: React 19 + react-router 7 + tailwind + lucide-react + sonner toasts
- **Theme**: Custom dark palette (obsidian, moss, stone, lantern gold #FBBF24), Cormorant Garamond + Manrope fonts, vine-frame card corners, ember-flicker animation, drop-cap prose

## User Personas
- **DM (admin)**: edits any entry, pins, deletes
- **Co-DM (admin)**: same powers
- **Player / visitor (anonymous)**: browses every section read-only

## What's Implemented (Dec 2025)
- Seeded two admin accounts + 7 starter entries (one per category)
- Public endpoints: list/get entries, stats, category & full-text filter
- Admin endpoints: create / update / delete entries (cookie auth)
- Pages: Home (hero + Seven Tomes bento + recents), CategoryList (search + grid),
  EntryDetail (hero image, drop-cap content, metadata, related), Login, Admin (drawer editor)
- Lantern animated motifs, vine-frame corners, ember glow text, noise overlay
- Toast notifications via sonner

## Backlog / Next
- **P1** Visual world map (Leaflet / SVG hotspots linking locations)
- **P1** Public sharable share-link toggle per entry
- **P2** Markdown rich-text editor (currently plain text w/ paragraph splitting)
- **P2** Cross-linking between entries (mention syntax)
- **P2** Image upload (currently URL-only)
- **P3** Player-facing comments / questions per session
