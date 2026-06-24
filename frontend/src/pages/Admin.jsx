import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { CATEGORIES, formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Plus, Trash2, Save, X, Pin, PinOff, Pencil, Lock, Unlock } from "lucide-react";
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

export default function Admin() {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyEntry);
  const [tagInput, setTagInput] = useState("");
  const [metaKey, setMetaKey] = useState("");
  const [metaValue, setMetaValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchParams] = useSearchParams();

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

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => e.category === filter);
  }, [entries, filter]);

  const openNew = () => {
    setEditing("new");
    setDraft({ ...emptyEntry });
    setTagInput("");
  };

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

  const closeEditor = () => {
    setEditing(null);
    setDraft(emptyEntry);
  };

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
    if (!draft.title.trim()) {
      toast.error("Title is required");
      return;
    }
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

  const togglePin = async (e) => {
    try {
      await api.put(`/entries/${e.id}`, { ...e, pinned: !e.pinned });
      await fetchEntries();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const togglePrivate = async (e) => {
    try {
      await api.put(`/entries/${e.id}`, { ...e, is_private: !e.is_private });
      toast.success(!e.is_private ? "Entry sealed (DM only)" : "Entry unsealed (public)");
      await fetchEntries();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const [confirmingDelete, setConfirmingDelete] = useState(null); // entry id awaiting confirm

  const remove = async (e) => {
    if (confirmingDelete !== e.id) {
      setConfirmingDelete(e.id);
      // Auto-cancel the confirmation after 4 seconds
      setTimeout(() => setConfirmingDelete((cur) => (cur === e.id ? null : cur)), 4000);
      return;
    }
    setConfirmingDelete(null);
    try {
      await api.delete(`/entries/${e.id}`);
      toast.success(`Erased "${e.title}"`);
      await fetchEntries();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16" data-testid="admin-page">
      <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
        <div>
          <div className="text-xs tracking-[0.35em] uppercase text-lantern mb-2">Admin · Lanternkeeper</div>
          <h1 className="font-serif-display text-4xl md:text-5xl text-bone">Inscribe the Codex</h1>
          <p className="text-sm text-muted-bone mt-2">Signed in as {user?.name} ({user?.email})</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => window.location.assign("/admin/rules")}
          data-testid="rules-admin-link"
          className="inline-flex items-center gap-2 px-4 py-3 border border-rust text-bone hover:border-[#FBBF24]/50 text-xs tracking-[0.25em] uppercase"
        >
          Rules Library
        </button>
        <button
          onClick={openNew}
          data-testid="new-entry-btn"
          className="inline-flex items-center gap-2 px-5 py-3 bg-[#FBBF24] text-[#0B0E0C] font-semibold tracking-wide hover:bg-[#F59E0B] transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Entry
        </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-8" data-testid="filter-bar">
        <button
          onClick={() => setFilter("all")}
          data-testid="filter-all"
          className={`px-3 py-1.5 text-xs tracking-[0.2em] uppercase border ${
            filter === "all" ? "border-[#FBBF24] text-lantern" : "border-rust text-muted-bone hover:text-bone"
          }`}
        >
          All ({entries.length})
        </button>
        {CATEGORIES.map((c) => {
          const count = entries.filter((e) => e.category === c.key).length;
          return (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              data-testid={`filter-${c.key}`}
              className={`px-3 py-1.5 text-xs tracking-[0.2em] uppercase border ${
                filter === c.key ? "border-[#FBBF24] text-lantern" : "border-rust text-muted-bone hover:text-bone"
              }`}
            >
              {c.label} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-muted-bone">Drawing the lantern closer…</div>
      ) : (
        <div className="lantern-card divide-y divide-[#2C362F]" data-testid="entries-table">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-muted-bone">No entries match this filter.</div>
          )}
          {filtered.map((e) => (
            <div key={e.id} className="p-5 flex items-start gap-4 group" data-testid={`row-${e.slug}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] tracking-[0.3em] uppercase text-lantern">{e.category}</span>
                  {e.pinned && <span className="text-[10px] tracking-[0.25em] uppercase text-[#FBBF24]/80">· pinned</span>}
                  {e.is_private && (
                    <span
                      className="text-[10px] tracking-[0.25em] uppercase text-[#FBBF24] border border-[#FBBF24]/40 bg-[#FBBF24]/5 px-1.5 py-0.5 inline-flex items-center gap-1"
                      data-testid={`dm-only-${e.slug}`}
                    >
                      <Lock className="w-2.5 h-2.5" /> DM Only
                    </span>
                  )}
                </div>
                <div className="font-serif-display text-xl text-bone">{e.title}</div>
                {e.subtitle && <div className="text-sm text-muted-bone italic">{e.subtitle}</div>}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => togglePrivate(e)}
                  data-testid={`toggle-private-${e.slug}`}
                  className={`p-2 transition-colors ${
                    e.is_private ? "text-[#FBBF24] hover:text-[#F59E0B]" : "text-muted-bone hover:text-lantern"
                  }`}
                  title={e.is_private ? "Unseal (make public)" : "Seal (DM only)"}
                >
                  {e.is_private ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => togglePin(e)}
                  data-testid={`pin-${e.slug}`}
                  className="p-2 text-muted-bone hover:text-lantern transition-colors"
                  title={e.pinned ? "Unpin" : "Pin"}
                >
                  {e.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => openEdit(e)}
                  data-testid={`edit-${e.slug}`}
                  className="p-2 text-muted-bone hover:text-lantern transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => remove(e)}
                  data-testid={`delete-${e.slug}`}
                  className={`px-2 py-2 transition-colors inline-flex items-center gap-1.5 ${
                    confirmingDelete === e.id
                      ? "text-red-400 border border-red-400 bg-red-950/20"
                      : "text-muted-bone hover:text-red-400"
                  }`}
                  title={confirmingDelete === e.id ? "Click again to confirm" : "Delete"}
                >
                  <Trash2 className="w-4 h-4" />
                  {confirmingDelete === e.id && (
                    <span className="text-[10px] tracking-widest uppercase">Click to confirm</span>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Drawer */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-[#0B0E0C]/80 backdrop-blur-sm" onClick={closeEditor} data-testid="editor-overlay">
          <div
            className="absolute right-0 top-0 h-full w-full max-w-2xl bg-stone-deep border-l border-rust overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            data-testid="editor-drawer"
          >
            <div className="sticky top-0 z-10 bg-stone-deep border-b border-rust px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] tracking-[0.3em] uppercase text-lantern">{editing === "new" ? "New" : "Editing"}</div>
                <h2 className="font-serif-display text-2xl text-bone">{draft.title || "Untitled"}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  data-testid="save-btn"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-sm hover:bg-[#F59E0B] disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={closeEditor}
                  data-testid="close-editor"
                  className="p-2 text-muted-bone hover:text-bone"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
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

              <Field label="Title">
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  data-testid="field-title"
                  className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
                />
              </Field>

              <Field label="Subtitle">
                <input
                  type="text"
                  value={draft.subtitle}
                  onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                  data-testid="field-subtitle"
                  className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
                />
              </Field>

              <Field label="Summary (1-2 sentences)">
                <textarea
                  rows={3}
                  value={draft.summary}
                  onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                  data-testid="field-summary"
                  className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y"
                />
              </Field>

              <Field label="Content (full body — blank line for new paragraph)">
                <textarea
                  rows={10}
                  value={draft.content}
                  onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                  data-testid="field-content"
                  className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y font-mono text-sm"
                />
              </Field>

              <Field label="Image URL">
                <input
                  type="text"
                  value={draft.image_url}
                  onChange={(e) => setDraft({ ...draft, image_url: e.target.value })}
                  data-testid="field-image"
                  placeholder="https://…"
                  className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
                />
                {draft.image_url && (
                  <img src={draft.image_url} alt="" className="mt-3 h-32 w-full object-cover border border-rust" />
                )}
              </Field>

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
                  <button type="button" onClick={addTag} data-testid="add-tag-btn" className="px-3 py-2 border border-rust text-bone hover:border-[#FBBF24]/50">
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {draft.tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider border border-rust px-2 py-1 text-bone">
                      {t}
                      <button onClick={() => removeTag(t)} className="text-muted-bone hover:text-red-400"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </Field>

              <Field label="Metadata (custom fields — e.g. region, race, session_number)">
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
                  <button type="button" onClick={addMeta} data-testid="add-meta-btn" className="px-3 py-2 border border-rust text-bone hover:border-[#FBBF24]/50">Add</button>
                </div>
                {Object.entries(draft.metadata).length > 0 && (
                  <div className="space-y-1.5">
                    {Object.entries(draft.metadata).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 text-sm">
                        <span className="text-lantern uppercase tracking-wider text-xs">{k}</span>
                        <span className="text-bone flex-1">{String(v)}</span>
                        <button onClick={() => removeMeta(k)} className="text-muted-bone hover:text-red-400">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.pinned}
                    onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })}
                    data-testid="field-pinned"
                    className="accent-[#FBBF24]"
                  />
                  <span className="text-sm text-bone">Pin to top of list</span>
                </label>
                <label
                  className={`flex items-center gap-2 cursor-pointer p-2 border transition-colors ${
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
                    className="accent-[#FBBF24]"
                  />
                  <Lock className={`w-3.5 h-3.5 ${draft.is_private ? "text-[#FBBF24]" : "text-muted-bone"}`} />
                  <span className={`text-sm ${draft.is_private ? "text-lantern" : "text-bone"}`}>
                    DM Only (hide from players)
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">{label}</label>
      {children}
    </div>
  );
}
