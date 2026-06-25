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
- **Spell System — Batch C (interactive)**:
  - New `components/SpellManager.jsx` — clickable spell-slot pips per level (mark spent / restore), Long-Rest button that empties `spell_slots_used`, and tap-to-toggle Prepared spells (subset of `spells_known` stored as `spells_prepared`; legacy PCs with no `spells_prepared` are treated as "all prepared")
  - Backend `PlayerCharacterIn` already supports `spells_prepared` / `spell_slots_used`; PUT merges them into metadata
  - `CharacterSheet` now renders `<SpellManager />` in place of the old read-only blocks
  - Hardening: `PlayerCharacterIn.level` default flipped from 1 → None so a minimal PUT can no longer reset character level
  - EntryDetail legacy properties card now also filters `spells_prepared`, `spell_slots_used`, `resource_*` to avoid the `[object Object]` leak
  - Test coverage: `/app/backend/tests/test_spells.py` (6/6 pass) — create, slot merge, prepared merge, long rest, anon 403, public read
- **Magic Trees → Character integration** (three distinct feels):
  - **Origin Magic**: per-PC `origin_unlocks` array of `{tree_id, node_id, as_spell}`. Players pick nodes via a `MagicTreePicker` modal; each origin unlock can be toggled **castable as a spell** — castable ones merge into the Spells list (with a flame icon) and respect prepared/known + spell-slot use. Non-castable ones sit in the new "Origin Powers" section
  - **Foundation Training**: per-PC `foundation_unlocks` array of `{tree_id, node_id}`. Players self-select nodes; they appear on the sheet with the tree's accent color
  - **Class Path**: single `class_tree_id`. Replaces the 5e SRD class dropdown in `CharacterBuilder` entirely. Selected tree's nodes auto-populate "Class Features" — the list is filtered live by `node.level_required <= pc.level`, so leveling up reveals features and leveling down hides them
  - New components: `MagicTreePicker.jsx` (reusable modal) and `CharacterTreeSections.jsx` (the three on-sheet blocks). Both stable `data-testid`s
  - Backend `PlayerCharacterIn` + POST/PUT extended; metadata-preserving merge unchanged
  - EntryDetail legacy properties card hides the new keys to avoid `[object Object]` leaks
  - Tests: `/app/backend/tests/test_magic_trees_pc.py` + `/app/backend/tests/test_level_gate_e2e.py` — 8/8 pass
- **Spell Compendium + Homebrew (Batch D)**:
  - New public page `/spells` listing all SRD + homebrew spells with search-by-text + filter-by-level + filter-by-school + filter-by-class + "homebrew only" toggle + clear-filters
  - DM-only inline CRUD: Forge / Edit / Delete homebrew spells with a `SpellEditor` modal (school dropdown, level dropdown, casting time, range, components, duration, classes, description). Homebrew spells render with an orange "Homebrew" badge
  - `CharacterBuilder` spells step: removed the hard `klass?.spellcasting` gate (was broken since the SRD class dropdown was replaced by class-trees). Now always visible; spell slots grid renders all 9 levels; spell picker has its own search + level + school + class filters; homebrew spells flagged with `HB`
  - Top nav: added "Spells" link between Magic and Shop
  - Tests: `/app/backend/tests/test_spells_crud.py` — 3/3 pass
- **Tree ↔ Spell merge + Stat Modifiers**:
  - `/spells` route removed; top nav cleaned; `/magic` page gains a `Spell Compendium` toggle button that renders the full compendium inline (search/filter/cards). "Back to Trees" restores the tree grid
  - `MagicNode` model extended with `spell_level / school / casting_time / spell_range / components / duration / spell_classes` and `modifiers: List[{stat, value}]`. `NodeEditor` gains "Also publish as a spell" toggle (reveals spell fields) and "Stat Modifiers" section (Add/remove rows; stats: str/dex/con/int/wis/cha + hp/ac/speed/init)
  - New endpoint `GET /api/spells/library` merges SRD + homebrew rules_spells + every magic-tree node with `spell_level` set. Node-sourced spells carry `tree_id / tree_name / tree_slug / accent_color / node_id` and `source: "magic-node"`; the compendium card shows a clickable tree-name badge in the tree's accent color
  - `lib/statModifiers.js` computes per-PC modifier totals from origin/foundation unlocks + class-tree (auto), level-gated by `pc.level >= node.level_required`. `CharacterSheet` applies the bonuses to all six ability scores plus HP/AC/Speed/Init, with a small +/- badge per stat and a hover tooltip listing each contributing node. Level-down hides modifiers automatically
  - `CharacterBuilder` spell picker now reads `/api/spells/library` so node-spells show in the builder too
  - Tests: `/app/backend/tests/test_spell_library_and_modifiers.py` (6 new) — 17/17 pytests pass
- **Typed modifiers + cross-link polish**:
  - Promoted `MagicNode.modifiers` from `List[dict]` to a typed `List[NodeModifier]` model with `stat: Literal["str","dex","con","int","wis","cha","hp","ac","speed","init"]` and `value: int`. Bad payloads now return a clear 422 at the API boundary instead of being silently dropped on the frontend
  - `SpellManager` spell pills for origin spells now have a small **"View on tree"** external-link icon next to the flame. Clicking it navigates to `/magic/<tree.slug>?node=<nodeId>`
  - `MagicTree` page reads `?node=` on load: auto-selects the node, opens the NodeEditor panel, plays a 2.4s gold pulse ring (`@keyframes tree-node-pulse` in `index.css`), then strips the query param so refreshes don't repeat. `TreeCanvas` accepts a new `highlightedNodeId` prop for the pulse
  - Backend regression: 46/46 pytests still green
- **Rest System Overhaul**:
  - Removed the Spell Slots card from `CharacterSheet` and the `Spell Slots (max / used)` step from `CharacterBuilder` (legacy fields stay in the DB for back-compat)
  - New `RestManager.jsx` mounts under `ResourceBar` on the sheet with **Long Rest** + **Short Rest** buttons and a gear icon → portal modal `RestConfig` (form per rest type with HP & resource rows, each row has a value input + Flat/% toggle)
  - Backend `PlayerCharacterIn.rest_config: Optional[dict]`. POST initializes to `{}`. PUT merges via existing `if v is not None` block
  - Defaults if no config saved: long = 100% HP / 100% resource; short = 25% HP / 50% resource
  - Long Rest also resets legacy `spell_slots_used = {}` (back-compat); both rests clamp `current_hp` / `resource_current` to their respective max
  - Bugfix: `StatBlock` was rendering literal `0` under HP/AC/Speed/Init when `mod === 0` (classic `0 && JSX` falsy trap). Switched to `Boolean(mod)` guard + ternary
  - EntryDetail legacy-properties filter now also hides `rest_config`
  - Tests: `/app/backend/tests/test_rest_config.py` — 3/3 pass · 49/49 total
- **Multi-resources + Modifier Visibility + Save Bug Fix**:
  - **Bug**: saving via Character Builder wiped the Mana bar. Root cause: PUT `/api/pcs/{id}` was POPing `resource_*` legacy fields when the client sent `None` (which the builder always did since it never included resource fields). Fixed: pop only on explicit empty string (deliberate clear); `None` preserves
  - `metadata.resources: List[{id, name, max, current, color}]` — first-class multi-resource model. Legacy single `resource_*` fields kept for back-compat read; first `resources` write clears them
  - `ResourceBar.jsx` fully rewritten: one row per resource with name, current/max, +/- buttons, settings gear, colored progress bar. "+ Add resource" button opens the same modal in "New Resource" mode
  - `RestManager` now applies recovery to every resource, each clamped to its own max
  - `ActiveModifiersPanel.jsx` (new) — collapsible breakdown between Rest bar and stat row. Lists every active modifier with its source tree·node and ±value, plus an "Unlocks at higher levels" section for level-gated modifiers (each pending row deep-links to `/magic/<slug>?node=<id>` with the pulse)
  - EntryDetail legacy-properties filter extended with `resources`
  - Tests: `/app/backend/tests/test_multi_resources.py` (7 new) — 56/56 pytests pass
- **Profile ↔ Sheet ↔ Dice integration + 5e Skills + Spell Dice**:
  - Shared `lib/dice.js` util (rollDie, rollPool, abilityMod, profBonus, postRoll, rollAndPost, SKILLS_5E table). DieRoll wire-format is `{sides, value}` matching the backend
  - New `SheetRollers.jsx` mounted on the sheet: one-click Ability Check + Save buttons per stat, an Initiative button in the header, and a collapsible 18-row 5e Skill table. Every roll: toasts AND POSTs to the shared `/api/dice/rolls` feed (live on `/dice`)
  - Backend `PlayerCharacterIn.skill_profs / skill_experts` (string lists); `DiceRollIn` extended with optional `pc_id / pc_name / kind`
  - Spell dice config (per-spell, 3a): `dice_count`, `dice_size`, `bonus` added to both rules_spells (Compendium SpellEditor + cards) and magic-tree nodes (NodeEditor SpellFields). `/api/spells/library` surfaces them uniformly. `SpellManager` adds a dice-icon "cast" button next to spell pills that have dice configured — rolls and posts to the feed with `kind=spell`
  - Profile cards split into **Sheet** + **Quick Roll** buttons; Quick Roll → `/dice?character=<id>` renders an Active-PC banner with the embedded `SheetRollers`, plus a clear-X that strips the query param
  - Tests: `/app/backend/tests/test_dice_pc_integration.py` (5 new) — 61/61 pytests pass
- **Equip flow + Sheet polish + Live feed everywhere**:
  - **Equip / Claim**: new `POST /api/pcs/{id}/equip` (claims if unowned, sets as active), `POST /api/pcs/unequip`, `GET /api/me/active-pc`. `User.active_pc_id` persisted; surfaced in `profile_to_out`. Non-admin attempting to equip a PC owned by someone else → 403 (verified via curl)
  - **EquipBanner** on every PC detail page: anonymous variant nudges sign-in; signed-in shows Equip / Claim & Equip / Unequip with state-aware copy and toasts
  - **Profile** marks the equipped PC with a `✦ Equipped` badge + gold border/glow
  - **`/dice` auto-loads the equipped PC** when there's no `?character=` query; the close-X smartly strips the query OR unequips depending on origin
  - **`LiveRollFeed` widget** (new) — polling roll feed embedded on the character sheet so players see party rolls without leaving the page. Color-coded per kind (ability/save/skill/init/spell), with crit / fumble accents
  - **CharacterPortrait** slot at the top of the sheet — `metadata.portrait_url`, drag-and-drop upload via existing ImageUploader, single-letter placeholder, Remove button. Wrapped in a `lantern-card vine-frame` with gold border/glow
  - **ResourceBar** "Add resource" button reduced to a small inline pill (border-rust/60, single Plus icon + 'Add')
  - Backend regression: 61/61 pytests still green
- **Admin-configurable Page Layouts (1a+2c+3a)**:
  - New `layouts.py` backend module + `realm_layouts` singleton Mongo doc keyed by `_id: "default"`. `DEFAULT_LAYOUTS` defines per-page block order for `character_sheet` (portrait, equip, resources, rest, modifiers, rollers, stats, abilities, saves_skills, spells, treesections, gear, content) and `dice_page` (active_pc, display, quick, builder + live_feed in the right rail)
  - Endpoints: `GET /api/layouts` public (merges defaults), `PUT /api/layouts` admin-only (per-page payload), 66/66 pytests pass
  - `lib/layouts.js` (frontend): `BLOCKS` registry + human labels, `useRealmLayout()` hook, `effectivePage()` reconciles missing keys (appends to `left`) + drops stale keys, `blockConfig()` for per-block settings
  - `AdminLayouts.jsx` (DM editor, route `/admin/layouts`): three slots (Main / Side / Hidden), per-block up/down + slot dropdown, per-block settings (portrait size, live_feed limit), Save + Reset Page. New tile `layouts-admin-link` on `/admin`
  - `CharacterSheet.jsx` refactored: dynamic `renderBlock(key)` switch driven by `effectivePage(layout, "character_sheet")`. **`LiveRollFeed` removed entirely** (moved to Dice page per user request). 1-col when right slot empty, 2-col grid when populated. `EntryDetail` now passes `equipNode` + `contentNode` props so EquipBanner and markdown body can be slotted into the layout
  - `Dice.jsx` refactored: same renderBlock pattern. `live_feed` block ("Around the Table") owns the right rail by default; DM can move it to main column / hide it
  - Tests: `/app/backend/tests/test_layouts.py` (5 new) — 66/66 pytests pass. Frontend e2e verified: move live_feed Side→Main on `/admin/layouts` reflects on `/dice` as single-column; LiveRollFeed confirmed absent from `/characters/{slug}`
- **"Whose turn?" highlight on Dice live feed (P1)**: the most-recent `kind:"init"` roll in the feed pins to the top with a bright `#FBBF24` border, ember-pulse glow, and a `★ CURRENT TURN — <pc_name or player>` badge (`data-testid="current-turn"` + `data-testid="current-turn-badge"`). Stays "current" until another initiative roll is posted, so the table can flip between actors naturally
- **Backend modularization Phase 2 (P2 finished)**: extracted *every* remaining route group into `/app/backend/routes/*.py`. `server.py` is now 99 lines (was 2204 before the refactor; 1463 after Phase 1):
  - `/app/backend/models.py` — shared Pydantic models + formatters (`UserPublic`, `ProfileIn`, `LoginIn`, `RegisterIn`, `EntryIn`, `EntryOut`, `MapPositionIn`, `entry_to_out`, `profile_to_out`)
  - `routes/auth.py` (153 lines) — `/auth/login`, `/auth/register`, `/auth/logout`, `/auth/me`, `/auth/refresh`, `/profile/me`, `/profile/{user_id}` + `_profile_stats` / `_profile_characters` helpers
  - `routes/entries.py` (131) — entries CRUD + `/stats` + `/settings`
  - `routes/guides.py` (103) — guides CRUD + `_make_unique_guide_slug`
  - `routes/maps.py` (145) — regional maps + `set_default` / `delete` (with unpin-on-delete) + `/entries/{id}/position`
  - `routes/dice.py` (66) — `/dice/rolls` POST/GET/DELETE with bounded retention
  - `routes/magic.py` (194) — `/magic/trees` CRUD + `MagicNode` / `MagicTreeIn` / `NodeModifier` models + `/spells/library` (unified SRD + homebrew + magic-node spells)
  - `routes/sessions.py` (239) — sessions CRUD + RSVPs + per-session comments (post / edit / delete / pin / lock)
  - `routes/pcs.py` (311) — Player Characters CRUD + `_can_modify_pc` + active-pc (`/me/active-pc`, `/pcs/{id}/equip`, `/pcs/unequip`)
  - `routes/rules.py` (89), `routes/layouts.py` (31), `storage.py` (126), `seeds.py` (433), `deps.py` (155) — unchanged from Phase 1
  - `server.py` (99) — now JUST imports each router, mounts them under `api = APIRouter(prefix="/api")`, configures CORS, and registers startup/shutdown
  - Fixed one pre-existing flaky test (`test_gated_modifier_node_persists`) that depended on `wawa.level < 10` from accumulated state — now pins the level via the test payload
  - **All 66 pytests pass** post-refactor. Live smoke: 11 endpoint groups (`/auth`, `/profile`, `/entries`, `/sessions`, `/magic/trees`, `/maps`, `/guides`, `/spells/library`, `/layouts`, `/rules/*`, `/dice/rolls`) all 200 OK
- **Backend modularization (P2)**: `server.py` shrunk from 2204 → 1463 lines (~33% reduction). Extracted:
  - `/app/backend/deps.py` — Mongo client, logger, JWT config, auth helpers (`hash_password`, `verify_password`, token creators, cookie helpers, `get_current_user`, `get_optional_user`), `slugify`, `CATEGORIES`, storage config constants
  - `/app/backend/seeds.py` — all `seed_*` functions (admins, entries, magic trees, rules, default map, guides) and tree-data helpers (`_node`, `_wickfire_nodes`, etc.) + `SEED_ENTRIES` / `SEED_MAGIC_TREES`
  - `/app/backend/storage.py` — Emergent object storage helpers + `/uploads/*` endpoints (its own APIRouter)
  - `/app/backend/routes/rules.py` — D&D 5e SRD rules library endpoints
  - `/app/backend/routes/layouts.py` — `GET/PUT /api/layouts` endpoints
  - `server.py` now imports from these modules and just hosts the remaining route groups (auth, profile, entries, settings, guides, maps, dice, magic, sessions, comments, PCs, equip). Sub-routers are mounted under the same `/api` prefix via `api.include_router(sub)`. 66/66 pytests pass; live `/api/layouts`, `/api/rules/*`, `/api/entries`, `/api/dice/rolls` curls all 200 OK

## Backlog / Next
- **P1** Populate Shop page with items, prices, merchant NPCs (last remaining seed)
- **P2** Continue refactor as the codebase grows — extract `models.py` into per-domain submodules if the file exceeds 250 lines; consider `db/indexes.py` for the index-creation block in `server.py`
- **P3** Promote `SpellFields` & `ModifiersEditor` from inline-in-`NodeEditor.jsx` to their own files if the editor keeps growing

## Test Credentials
See `/app/memory/test_credentials.md`. DM: `dm@lantern.realm` / `lantern-keeper-1`.

## Critical Rules (do not regress)
- Never use `window.confirm`, `window.prompt`, or `window.alert` — browsers silently block them and break app state. Use inline "click again to confirm" or React modals.
- Player characters (`pcs`) link via `user_id` if logged in OR fall back to `player_name` string — keep backwards compatibility.
- All backend routes prefixed `/api`. Frontend uses `process.env.REACT_APP_BACKEND_URL`. No hardcoded URLs.
