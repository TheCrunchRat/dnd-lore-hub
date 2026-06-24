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
- **Level requirement system on skill-tree nodes** (lock badge + hover tooltip + click popup `LockedNodeModal`)
- Replaced all `window.confirm`/`window.prompt` with inline two-click confirm
- **Refactor**: split `MagicTree.jsx` (1086 → 387 lines) into `components/magic-tree/*`
- **Per-entry DM-Only visibility toggle**: `is_private` field, list/detail filtering, `SealedEntry.jsx` watchful-eye-with-vines placeholder page
- **Admin panel revamp**: 5 quick-link tiles, 4 stat tiles, search + sort dropdown, card-row entries with thumbnails, sectioned editor drawer with field hints
- **Markdown editor + cross-linking** (Batch 1 of 4):
  - `lib/markdown.js` — marked + DOMPurify pipeline with `[[wiki-link]]` and `[[slug|label]]` expansion (resolves by slug → title → broken-link span)
  - `components/MarkdownView.jsx` — renders sanitised HTML; delegates internal anchor clicks to React Router for SPA navigation
  - `components/MarkdownEditor.jsx` — controlled textarea with toolbar (B/I/H/lists/quote/link/code/codex), live split-pane preview, `[[` autocomplete dropdown matching codex entries, Ctrl+B/I/K shortcuts
  - Wired into Admin summary + content fields, EntryDetail summary + content rendering, EntryCard preview (via `markdownToPlain`)
  - Custom `.prose-tome` styles for headings/lists/blockquote/bold/italic/code/codex-link/broken-link with the lantern aesthetic
- **Image upload** (Batch 2 of 4):
  - Emergent managed object storage (`integrations.emergentagent.com/objstore`) integrated via `EMERGENT_LLM_KEY`
  - Backend: `POST /api/uploads` (admin-only, multipart, validates PNG/JPG/WEBP/GIF up to 10 MB), `GET /api/uploads/:id` (public, served with `Cache-Control: immutable`), `DELETE /api/uploads/:id` (admin-only, soft delete via `is_deleted` flag)
  - `uploads` Mongo collection with index on `id`
  - `components/ImageUploader.jsx` — drag-and-drop + click-to-pick with preview, used in two modes: full dropzone (hero image) and compact icon (markdown toolbar)
  - Wired into Admin "Hero Image" field (replaces URL-only input; URL field remains as fallback) and into MarkdownEditor toolbar (inserts `![image](url)` at cursor)
  - DOMPurify config extended to allow `<img>` with `src`, `alt`, `loading`
- **Player comments per session** (Batch 4 of 4):
  - Backend: `session_comments` collection with fields `{id, session_id, author_id, author_name, author_role, body, pinned, edited, deleted, created_at, updated_at}` (soft delete) + `comments_locked` bool added to `scheduled_sessions`
  - Endpoints: `GET /api/sessions/:id/comments` (public), `POST` (login required, blocked when locked unless admin), `PUT /comments/:cid` (author or admin), `DELETE /comments/:cid` (author or admin, soft delete), `POST /comments/:cid/pin` (admin only), `POST /sessions/:id/lock_comments` (admin only)
  - Pinned comments float to the top; markdown + `[[wiki-link]]` rendering reused inside comments via `MarkdownView`
  - `components/SessionComments.jsx` — collapsible thread per session card with: post box (Ctrl+Enter to send), inline edit, two-click delete confirm, DM pin/unpin per comment, DM lock/unlock for the whole thread, relative timestamps, DM role badge
  - Wired into each `SessionCard` on `/sessions`; entries pre-loaded at the page level so cross-links resolve
- **Multiple regional maps** (Batch 3 of 4):
  - Backend: `regional_maps` collection `{id, slug, name, subtitle, image_url, is_default, sort_order, ...}` with auto-unique slug; entries gain a `map_id` field (null → default map); seed migrates the legacy `settings.world_map_url` into a single default map and backfills existing placements
  - Endpoints: `GET /api/maps`, `GET /api/maps/:id_or_slug`, `POST /api/maps`, `PUT /api/maps/:id`, `POST /api/maps/:id/set_default`, `DELETE /api/maps/:id` (blocks deletion of the last map; unpins all entries assigned to a deleted map). `PUT /api/entries/:id/position` now accepts optional `map_id`.
  - Frontend: `/map` rewritten — tab bar across all maps (count per map shown), atlas controls panel with edit/delete/set-default per row, `MapEditor` drawer with name/subtitle/image + integrated `ImageUploader`. Placement happens against the active map's `map_id`. Two-click delete confirm for maps.
- **Guides** (small wiki at `/guide` and `/guide/:slug`):
  - Backend: new `guides` collection `{id, slug, title, subtitle, content (markdown), sort_order, is_pinned, ...}`; auto-unique slug derived from title; server-side title strip + non-empty validation; CRUD endpoints public-read + DM-write; seeded "Welcome to the Lantern Realm" pinned guide
  - Frontend: `pages/Guide.jsx` — left sidebar with all guides (pinned first), active article rendered via `MarkdownView` so `[[wiki-link]]` and images work; `GuideEditor` drawer with title/subtitle/`MarkdownEditor`/sort-order/pin-toggle. DM-only New / Edit / Pin / two-click-Delete controls
  - Wired into top nav between Sessions and Bestiary; admin quick-link tile `qlink-guide` added
  - Markdown pipeline bugfix: `[[wiki-link]]` tokens inside backtick code spans now stay literal (no raw HTML leak)
  - CSS bugfix: prose drop-cap scoped to direct-child first paragraph only (no longer applies inside list items / blockquotes)
  - Sonner toaster repositioned to bottom-right so it no longer overlaps editor save buttons
  - Pytest suite `/app/backend/tests/test_guides.py` — 11/11 pass
- **Player Profiles** (`/profile` for self, `/profile/:user_id` public):
  - Backend: extended `users` model with `display_name, avatar_url, bio, quote, title, pronouns`; new `ProfileIn` model; endpoints `GET /api/profile/me` (login required, includes email), `PUT /api/profile/me` (own only), `GET /api/profile/:user_id` (public, omits email). Bundle includes `{profile, stats: {characters/comments/rsvps}, characters: [...]}`.
  - Frontend `pages/Profile.jsx`: hero card with avatar, custom title (+ DM badge), display name, pronouns, italic quote, stats tiles, markdown bio with `[[wiki]]` cross-links, character grid linked into each PC sheet. Editor drawer reuses `ImageUploader` (avatar) + `MarkdownEditor` (bio).
  - Top nav user pill in `Layout.jsx` is now a link to `/profile`.
- **Custom Resource Bar** on character sheet (mana/wickfire/sorcery points/whatever):
  - Backend `PCIn` extended with `resource_name / resource_max / resource_current / resource_color`; update path now allows explicit clearing by sending empty/null (the standard `if v is not None` filter is bypassed for these specific fields). 0 is preserved as a valid current value.
  - Frontend `components/ResourceBar.jsx`: one configurable bar per character — name + max + current + colour. Owner/DM gets `-1 / +1 / Fill` quick buttons, a slider for fine-tuning, and a config modal to rename/recolour or remove. Gradient progress bar with ember glow. Hidden for non-editors when not configured; shows an "Add a resource" stub for editors.
  - Wired into `CharacterSheet` at the top of the stat blocks.

## Backlog / Next
- **P0** Spell system overhaul (Batches C + D — user requested 2e/all-four):
  - Batch C: per-level spell-slot tracker (checkboxes) + prepared/known toggle
  - Batch D: redesigned spell browser (search/filter by school + level + description) + DM-managed homebrew spells in the rules library
- **P1** Populate Shop page with items, prices, merchant NPCs (last remaining seed)
- **P2** Refactor: break `server.py` (now ~2000 lines) into route modules under `/app/backend/routes`
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
