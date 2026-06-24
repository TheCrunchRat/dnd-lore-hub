import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import api, { CATEGORIES, formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import {
  Plus, Trash2, Save, X, Pin, PinOff, Pencil, Lock, Unlock,
  Search, Library, Map as MapIcon, Sparkles, CalendarDays, Users, FileText,
  Image as ImageIcon, Flame, Eye, ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";

const emptyEntry = {
  category: "location",
  title: "",
  subtitle: "",
  summary: "",
  content: "",
  image_url: "",
  tags: [],
  metadata: {},
  pinned: false,
  is_private: false,
};

const SORTS = [
  { key: "recent", label: "Recently edited" },
  { key: "oldest", label: "Oldest first" },
  { key: "title", label: "Title (A→Z)" },
  { key: "title-desc", label: "Title (Z→A)" },
];

const QUICK_LINKS = [
  { to: "/admin/rules", label: "Rules Library", icon: Library, testid: "rules-admin-link" },
  { to: "/map", label: "World Map", icon: MapIcon, testid: "qlink-map" },
  { to: "/magic", label: "Magic Trees", icon: Sparkles, testid: "qlink-magic" },
  { to: "/sessions", label: "Sessions", icon: CalendarDays, testid: "qlink-sessions" },
  { to: "/characters", label: "Characters", icon: Users, testid: "qlink-characters" },
];

export default function Admin() {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyEntry);
  const [tagInput, setTagInput] = useState("");
  const [metaKey, setMetaKey] = useState("");
  const [metaValue, setMetaValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchParams] = useSearchParams();
  const [confirmingDelete, setConfirmingDelete] = useState(null);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const r = await api.get("/entries");
      setEntries(r.data || []);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEntries(); }, []);

  // Open editor if ?edit=<id> present
  useEffect(() => {
    const id = searchParams.get("edit");
    if (id && entries.length) {
      const found = entries.find((e) => e.id === id);
      if (found) openEdit(found);
    }
  }, [searchParams, entries]);

  // ---------- Stats ----------
  const stats = useMemo(() => {
    const total = entries.length;
    const privateCount = entries.filter((e) => e.is_private).length;
    return {
      total,
      pub: total - privateCount,
      privateCount,
      pinned: entries.filter((e) => e.pinned).length,
    };
  }, [entries]);

  // ---------- Filter + search + sort ----------
  const visible = useMemo(() => {
    let arr = entries;
    if (filter !== "all") arr = arr.filter((e) => e.category === filter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter((e) =>
        [e.title, e.subtitle, e.summary, ...(e.tags || [])]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q))
      );
    }
    const sorted = [...arr];
    switch (sort) {
      case "oldest":
        sorted.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
        break;
      case "title":
        sorted.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        break;
      case "title-desc":
        sorted.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
        break;
      case "recent":
      default:
        // Pinned first, then most-recently-updated. Matches backend order.
        sorted.sort((a, b) => {
          if (!!b.pinned - !!a.pinned !== 0) return !!b.pinned - !!a.pinned;
          return (b.updated_at || "").localeCompare(a.updated_at || "");
        });
        break;
    }
    return sorted;
  }, [entries, filter, query, sort]);

  // ---------- Editor ops ----------
  const openNew = () => { setEditing("new"); setDraft({ ...emptyEntry }); setTagInput(""); };
  const openEdit = (e) => {
    setEditing(e.id);
    setDraft({
      category: e.category,
      title: e.title || "",
      subtitle: e.subtitle || "",
      summary: e.summary || "",
      content: e.content || "",
      image_url: e.image_url || "",
      tags: e.tags || [],
      metadata: e.metadata || {},
      pinned: !!e.pinned,
      is_private: !!e.is_private,
    });
    setTagInput("");
  };
  const closeEditor = () => { setEditing(null); setDraft(emptyEntry); };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!draft.tags.includes(t)) setDraft({ ...draft, tags: [...draft.tags, t] });
    setTagInput("");
  };
  const removeTag = (t) => setDraft({ ...draft, tags: draft.tags.filter((x) => x !== t) });
  const addMeta = () => {
    if (!metaKey.trim()) return;
    setDraft({ ...draft, metadata: { ...draft.metadata, [metaKey.trim()]: metaValue } });
    setMetaKey(""); setMetaValue("");
  };
  const removeMeta = (k) => {
    const m = { ...draft.metadata };
    delete m[k];
    setDraft({ ...draft, metadata: m });
  };

  const save = async () => {
    if (!draft.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      if (editing === "new") {
        await api.post("/entries", draft);
        toast.success("Entry inscribed");
      } else {
        await api.put(`/entries/${editing}`, draft);
        toast.success("Entry updated");
      }
      closeEditor();
      await fetchEntries();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  // ---------- Row actions ----------
  const togglePin = async (e) => {
    try {
      await api.put(`/entries/${e.id}`, { ...e, pinned: !e.pinned });
      await fetchEntries();
    } catch (err) { toast.error(formatApiError(err)); }
  };
  const togglePrivate = async (e) => {
    try {
      await api.put(`/entries/${e.id}`, { ...e, is_private: !e.is_private });
      toast.success(!e.is_private ? "Entry sealed (DM only)" : "Entry unsealed (public)");
      await fetchEntries();
    } catch (err) { toast.error(formatApiError(err)); }
  };
  const remove = async (e) => {
    if (confirmingDelete !== e.id) {
      setConfirmingDelete(e.id);
      setTimeout(() => setConfirmingDelete((cur) => (cur === e.id ? null : cur)), 4000);
      return;
    }
    setConfirmingDelete(null);
    try {
      await api.delete(`/entries/${e.id}`);
      toast.success(`Erased "${e.title}"`);
      await fetchEntries();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-12" data-testid="admin-page">
      {/* ===== Header ===== */}
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="text-xs tracking-[0.35em] uppercase text-lantern mb-2">Admin · Lanternkeeper</div>
          <h1 className="font-serif-display text-4xl md:text-5xl text-bone ember-glow">Inscribe the Codex</h1>
          <p className="text-sm text-muted-bone mt-2">Signed in as {user?.name} · {user?.email}</p>
        </div>
        <button
          onClick={openNew}
          data-testid="new-entry-btn"
          className="inline-flex items-center gap-2 px-5 py-3 bg-[#FBBF24] text-[#0B0E0C] font-semibold tracking-wide hover:bg-[#F59E0B] transition-colors shadow-[0_0_24px_rgba(251,191,36,0.25)]"
        >
          <Plus className="w-4 h-4" />
          New Entry
        </button>
      </div>

      {/* ===== Quick links ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6" data-testid="quick-links">
        {QUICK_LINKS.map(({ to, label, icon: Icon, testid }) => (
          <Link
            key={to}
            to={to}
            data-testid={testid}
            className="lantern-card group p-4 flex items-center gap-3 hover:border-[#FBBF24]/40 transition-colors"
          >
            <div className="w-10 h-10 rounded-sm border border-rust flex items-center justify-center group-hover:border-[#FBBF24]/60 transition-colors">
              <Icon className="w-4 h-4 text-lantern" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] tracking-[0.3em] uppercase text-muted-bone">Go to</div>
              <div className="text-sm font-semibold text-bone truncate group-hover:text-lantern transition-colors">
                {label}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* ===== Stat tiles ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8" data-testid="stat-tiles">
        <StatTile icon={FileText} label="Entries" value={stats.total} testid="stat-total" />
        <StatTile icon={Eye} label="Public" value={stats.pub} accent="#4A7C59" testid="stat-public" />
        <StatTile icon={Lock} label="DM Only" value={stats.privateCount} accent="#FBBF24" testid="stat-private" />
        <StatTile icon={Pin} label="Pinned" value={stats.pinned} accent="#F59E0B" testid="stat-pinned" />
      </div>

      {/* ===== Toolbar (search + sort) ===== */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-bone pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, subtitle, summary, or tag…"
            data-testid="admin-search"
            className="w-full pl-10 pr-3 py-2.5 bg-stone-deep border border-rust text-bone placeholder:text-muted-bone focus:border-[#FBBF24] focus:outline-none transition-colors"
          />
        </div>
        <div className="relative inline-flex items-center">
          <ArrowUpDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-bone pointer-events-none" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            data-testid="admin-sort"
            className="appearance-none pl-9 pr-8 py-2.5 bg-stone-deep border border-rust text-bone focus:border-[#FBBF24] focus:outline-none cursor-pointer text-sm"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ===== Category chips ===== */}
      <div className="flex flex-wrap gap-2 mb-6" data-testid="filter-bar">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          testid="filter-all"
        >
          All <span className="opacity-70 ml-1">({entries.length})</span>
        </FilterChip>
        {CATEGORIES.map((c) => {
          const count = entries.filter((e) => e.category === c.key).length;
          return (
            <FilterChip
              key={c.key}
              active={filter === c.key}
              onClick={() => setFilter(c.key)}
              testid={`filter-${c.key}`}
            >
              {c.label} <span className="opacity-70 ml-1">({count})</span>
            </FilterChip>
          );
        })}
      </div>

      {/* ===== Entries list ===== */}
      {loading ? (
        <div className="text-muted-bone">Drawing the lantern closer…</div>
      ) : visible.length === 0 ? (
        <div className="lantern-card p-12 text-center" data-testid="entries-empty">
          <Flame className="w-10 h-10 text-lantern/40 mx-auto mb-3 ember-pulse" strokeWidth={1} />
          <p className="font-serif-display text-2xl text-bone mb-2">
            {query ? "No entries match that search" : "No entries in this branch yet"}
          </p>
          <p className="text-sm text-muted-bone">
            {query
              ? "Try a different word, or clear the search."
              : "Click \u201CNew Entry\u201D above to inscribe the first one."}
          </p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="entries-table">
          {visible.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              onEdit={() => openEdit(e)}
              onTogglePin={() => togglePin(e)}
              onTogglePrivate={() => togglePrivate(e)}
              onDelete={() => remove(e)}
              confirming={confirmingDelete === e.id}
            />
          ))}
        </div>
      )}

      {/* ===== Editor Drawer ===== */}
      {editing && (
        <EditorDrawer
          editing={editing}
          draft={draft}
          setDraft={setDraft}
          tagInput={tagInput}
          setTagInput={setTagInput}
          addTag={addTag}
          removeTag={removeTag}
          metaKey={metaKey}
          setMetaKey={setMetaKey}
          metaValue={metaValue}
          setMetaValue={setMetaValue}
          addMeta={addMeta}
          removeMeta={removeMeta}
          saving={saving}
          onSave={save}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function StatTile({ icon: Icon, label, value, accent = "#FBBF24", testid }) {
  return (
    <div className="lantern-card p-4 flex items-center gap-3" data-testid={testid}>
      <div
        className="w-11 h-11 rounded-sm flex items-center justify-center shrink-0"
        style={{ background: `${accent}15`, border: `1px solid ${accent}40` }}
      >
        <Icon className="w-4 h-4" style={{ color: accent }} strokeWidth={1.5} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] tracking-[0.3em] uppercase text-muted-bone">{label}</div>
        <div className="font-serif-display text-2xl text-bone leading-none mt-1">{value}</div>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, testid, children }) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`px-3.5 py-1.5 text-xs tracking-[0.2em] uppercase border transition-colors ${
        active
          ? "border-[#FBBF24] text-lantern bg-[#FBBF24]/5"
          : "border-rust text-muted-bone hover:text-bone hover:border-[#FBBF24]/30"
      }`}
    >
      {children}
    </button>
  );
}

function EntryRow({ entry, onEdit, onTogglePin, onTogglePrivate, onDelete, confirming }) {
  const cat = CATEGORIES.find((c) => c.key === entry.category);
  const preview = (entry.summary || entry.content || "").trim();
  return (
    <div
      className="lantern-card p-4 flex items-start gap-4 group"
      data-testid={`row-${entry.slug}`}
    >
      {/* Thumbnail */}
      <div className="shrink-0 w-16 h-16 border border-rust bg-[#0B0E0C] flex items-center justify-center overflow-hidden">
        {entry.image_url ? (
          <img src={entry.image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-5 h-5 text-muted-bone/60" strokeWidth={1.5} />
        )}
      </div>

      {/* Main */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[10px] tracking-[0.3em] uppercase text-lantern">
            {cat?.label || entry.category}
          </span>
          {entry.pinned && (
            <span className="inline-flex items-center gap-1 text-[10px] tracking-[0.25em] uppercase text-[#F59E0B] border border-[#F59E0B]/40 bg-[#F59E0B]/5 px-1.5 py-0.5">
              <Pin className="w-2.5 h-2.5" /> Pinned
            </span>
          )}
          {entry.is_private && (
            <span
              className="inline-flex items-center gap-1 text-[10px] tracking-[0.25em] uppercase text-[#FBBF24] border border-[#FBBF24]/40 bg-[#FBBF24]/5 px-1.5 py-0.5"
              data-testid={`dm-only-${entry.slug}`}
            >
              <Lock className="w-2.5 h-2.5" /> DM Only
            </span>
          )}
        </div>
        <div className="font-serif-display text-xl text-bone group-hover:text-lantern transition-colors leading-tight">
          {entry.title}
        </div>
        {entry.subtitle && (
          <div className="text-sm text-muted-bone italic mt-0.5">{entry.subtitle}</div>
        )}
        {preview && (
          <p className="text-xs text-muted-bone leading-relaxed mt-2 line-clamp-2">{preview}</p>
        )}
        {entry.tags?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.tags.slice(0, 6).map((t) => (
              <span
                key={t}
                className="text-[10px] tracking-wider uppercase border border-rust px-1.5 py-0.5 text-muted-bone"
              >
                {t}
              </span>
            ))}
            {entry.tags.length > 6 && (
              <span className="text-[10px] text-muted-bone">+{entry.tags.length - 6}</span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onEdit}
          data-testid={`edit-${entry.slug}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-widest uppercase border border-rust text-bone hover:border-[#FBBF24]/50 hover:text-lantern transition-colors"
          title="Edit entry"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Edit</span>
        </button>
        <IconAction
          onClick={onTogglePrivate}
          active={entry.is_private}
          testid={`toggle-private-${entry.slug}`}
          title={entry.is_private ? "Unseal (make public)" : "Seal (DM only)"}
          activeColor="#FBBF24"
        >
          {entry.is_private ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
        </IconAction>
        <IconAction
          onClick={onTogglePin}
          active={entry.pinned}
          testid={`pin-${entry.slug}`}
          title={entry.pinned ? "Unpin" : "Pin to top"}
          activeColor="#F59E0B"
        >
          {entry.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
        </IconAction>
        <button
          onClick={onDelete}
          data-testid={`delete-${entry.slug}`}
          className={`p-2 transition-colors inline-flex items-center gap-1.5 ${
            confirming
              ? "text-red-400 border border-red-400 bg-red-950/20"
              : "text-muted-bone hover:text-red-400"
          }`}
          title={confirming ? "Click again to confirm" : "Delete"}
        >
          <Trash2 className="w-4 h-4" />
          {confirming && (
            <span className="text-[10px] tracking-widest uppercase whitespace-nowrap">Confirm</span>
          )}
        </button>
      </div>
    </div>
  );
}

function IconAction({ onClick, active, testid, title, activeColor, children }) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      title={title}
      className={`p-2 transition-colors ${
        active
          ? "text-[var(--ic-active,#FBBF24)] hover:opacity-80"
          : "text-muted-bone hover:text-lantern"
      }`}
      style={active ? { "--ic-active": activeColor } : undefined}
    >
      {children}
    </button>
  );
}

// ============================================================================
// Editor Drawer
// ============================================================================
function EditorDrawer({
  editing, draft, setDraft, tagInput, setTagInput, addTag, removeTag,
  metaKey, setMetaKey, metaValue, setMetaValue, addMeta, removeMeta,
  saving, onSave, onClose,
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B0E0C]/80 backdrop-blur-sm"
      onClick={onClose}
      data-testid="editor-overlay"
    >
      <div
        className="absolute right-0 top-0 h-full w-full max-w-2xl bg-stone-deep border-l border-rust overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="editor-drawer"
      >
        <div className="sticky top-0 z-10 bg-stone-deep/95 backdrop-blur-sm border-b border-rust px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.3em] uppercase text-lantern">
              {editing === "new" ? "New Entry" : "Editing"}
            </div>
            <h2 className="font-serif-display text-2xl text-bone truncate">
              {draft.title || "Untitled"}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onSave}
              disabled={saving}
              data-testid="save-btn"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-sm hover:bg-[#F59E0B] disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={onClose}
              data-testid="close-editor"
              className="p-2 text-muted-bone hover:text-bone"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-7">
          {/* --- Section: Identity --- */}
          <Section title="Identity" subtitle="What this entry is, and where it lives in the codex.">
            <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
              <Field label="Category">
                <select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  data-testid="field-category"
                  className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Title" required>
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  data-testid="field-title"
                  placeholder="e.g. Mirewatch"
                  className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
                />
              </Field>
            </div>
            <Field label="Subtitle" hint="A short, evocative tag-line shown beneath the title.">
              <input
                type="text"
                value={draft.subtitle}
                onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                data-testid="field-subtitle"
                placeholder="A drowning city of lanterns"
                className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
              />
            </Field>
          </Section>

          {/* --- Section: Lore body --- */}
          <Section title="Lore" subtitle="One or two sentences to summarise, then the full chronicle.">
            <Field label="Summary" hint="1–2 sentences. Shown on cards and below the title.">
              <textarea
                rows={3}
                value={draft.summary}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                data-testid="field-summary"
                className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y"
              />
            </Field>
            <Field
              label="Content"
              hint="Full body. Leave a blank line to break paragraphs."
            >
              <textarea
                rows={10}
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                data-testid="field-content"
                className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y font-mono text-sm leading-relaxed"
              />
              <div className="text-[10px] text-muted-bone mt-1">
                {draft.content.length.toLocaleString()} chars · {draft.content.split(/\s+/).filter(Boolean).length.toLocaleString()} words
              </div>
            </Field>
          </Section>

          {/* --- Section: Hero image --- */}
          <Section title="Hero Image" subtitle="A wide image displayed at the top of the entry.">
            <Field label="Image URL">
              <input
                type="text"
                value={draft.image_url}
                onChange={(e) => setDraft({ ...draft, image_url: e.target.value })}
                data-testid="field-image"
                placeholder="https://…"
                className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
              />
              {draft.image_url ? (
                <img src={draft.image_url} alt="" className="mt-3 h-32 w-full object-cover border border-rust" />
              ) : (
                <div className="mt-3 h-32 border border-dashed border-rust flex items-center justify-center text-muted-bone text-xs">
                  No image yet
                </div>
              )}
            </Field>
          </Section>

          {/* --- Section: Tags & Metadata --- */}
          <Section title="Tags & Metadata" subtitle="Search keywords and custom key/value fields.">
            <Field label="Tags">
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  placeholder="Add tag and press Enter"
                  data-testid="field-tag-input"
                  className="flex-1 px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addTag}
                  data-testid="add-tag-btn"
                  className="px-3 py-2 border border-rust text-bone hover:border-[#FBBF24]/50 text-xs tracking-widest uppercase"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {draft.tags.length === 0 ? (
                  <span className="text-[11px] text-muted-bone italic">No tags yet.</span>
                ) : (
                  draft.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider border border-rust px-2 py-1 text-bone"
                    >
                      {t}
                      <button onClick={() => removeTag(t)} className="text-muted-bone hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </Field>
            <Field label="Custom fields" hint="e.g. region, race, session_number. Shown in the entry header.">
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={metaKey}
                  onChange={(e) => setMetaKey(e.target.value)}
                  placeholder="key"
                  data-testid="field-meta-key"
                  className="flex-1 px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
                />
                <input
                  type="text"
                  value={metaValue}
                  onChange={(e) => setMetaValue(e.target.value)}
                  placeholder="value"
                  data-testid="field-meta-value"
                  className="flex-1 px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addMeta}
                  data-testid="add-meta-btn"
                  className="px-3 py-2 border border-rust text-bone hover:border-[#FBBF24]/50 text-xs tracking-widest uppercase"
                >
                  Add
                </button>
              </div>
              {Object.entries(draft.metadata).length > 0 ? (
                <div className="space-y-1.5">
                  {Object.entries(draft.metadata).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-sm border border-rust/60 px-2.5 py-1.5">
                      <span className="text-lantern uppercase tracking-wider text-[10px]">{k}</span>
                      <span className="text-bone flex-1 truncate">{String(v)}</span>
                      <button onClick={() => removeMeta(k)} className="text-muted-bone hover:text-red-400">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-[11px] text-muted-bone italic">No custom fields yet.</span>
              )}
            </Field>
          </Section>

          {/* --- Section: Visibility --- */}
          <Section title="Visibility" subtitle="Who can see this entry, and where it appears.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`flex items-start gap-3 cursor-pointer p-3 border transition-colors ${
                  draft.pinned
                    ? "border-[#F59E0B]/50 bg-[#F59E0B]/5"
                    : "border-rust hover:border-[#FBBF24]/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={draft.pinned}
                  onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })}
                  data-testid="field-pinned"
                  className="accent-[#F59E0B] mt-0.5"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm text-bone font-semibold">
                    <Pin className={`w-3.5 h-3.5 ${draft.pinned ? "text-[#F59E0B]" : "text-muted-bone"}`} />
                    Pin to top of list
                  </div>
                  <div className="text-[11px] text-muted-bone mt-1">
                    Bumps this entry above non-pinned ones on category pages.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 cursor-pointer p-3 border transition-colors ${
                  draft.is_private
                    ? "border-[#FBBF24]/50 bg-[#FBBF24]/5"
                    : "border-rust hover:border-[#FBBF24]/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={draft.is_private}
                  onChange={(e) => setDraft({ ...draft, is_private: e.target.checked })}
                  data-testid="field-is-private"
                  className="accent-[#FBBF24] mt-0.5"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <Lock className={`w-3.5 h-3.5 ${draft.is_private ? "text-[#FBBF24]" : "text-muted-bone"}`} />
                    <span className={draft.is_private ? "text-lantern" : "text-bone"}>DM Only</span>
                  </div>
                  <div className="text-[11px] text-muted-bone mt-1">
                    Hidden from players. Direct URL shows the sealed page.
                  </div>
                </div>
              </label>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section className="space-y-4">
      <div className="border-l-2 border-[#FBBF24]/60 pl-3">
        <div className="text-[10px] tracking-[0.35em] uppercase text-lantern">{title}</div>
        {subtitle && <p className="text-[11px] text-muted-bone mt-0.5">{subtitle}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <div>
      <label className="block text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-bone mt-1">{hint}</p>}
    </div>
  );
}
