import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  BookOpen, Plus, Pencil, Trash2, Save, X, Pin, PinOff, ChevronRight,
} from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import MarkdownView from "../components/MarkdownView";
import MarkdownEditor from "../components/MarkdownEditor";
import ConfirmDialog from "../components/ConfirmDialog";

/**
 * /guide and /guide/:slug — a small wiki for explaining things, with the same
 * markdown + image-upload editor that the codex uses.
 *
 * Public read (any visitor). Write/edit/delete is DM-only (matches the codex
 * convention; the backend enforces auth on POST/PUT/DELETE).
 */
export default function Guide() {
  const { user } = useAuth();
  const { slug } = useParams();
  const navigate = useNavigate();

  const [guides, setGuides] = useState([]);
  const [entries, setEntries] = useState([]); // for [[wiki]] resolution
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState(null); // "new" | <id> | null
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [g, e] = await Promise.all([
        api.get("/guides"),
        api.get("/entries", { params: { limit: 500 } }).catch(() => ({ data: [] })),
      ]);
      setGuides(g.data || []);
      setEntries(e.data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const active = useMemo(() => {
    if (!guides.length) return null;
    if (slug) return guides.find((g) => g.slug === slug) || null;
    return guides[0];
  }, [guides, slug]);

  // If we landed on /guide without a slug, push the user to the first guide's URL
  useEffect(() => {
    if (!slug && active) navigate(`/guide/${active.slug}`, { replace: true });
  }, [slug, active, navigate]);

  // ---------- Editor ops ----------
  const openNew = () => {
    setEditingId("new");
    setDraft({ title: "", subtitle: "", content: "", sort_order: guides.length, is_pinned: false });
  };
  const openEdit = (g) => {
    setEditingId(g.id);
    setDraft({
      title: g.title, subtitle: g.subtitle || "", content: g.content || "",
      sort_order: g.sort_order ?? 0, is_pinned: !!g.is_pinned,
    });
  };
  const closeEditor = () => { setEditingId(null); setDraft(null); };

  const save = async () => {
    if (!draft?.title?.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      if (editingId === "new") {
        const { data } = await api.post("/guides", draft);
        toast.success("Guide created");
        await load();
        navigate(`/guide/${data.slug}`);
      } else {
        const { data } = await api.put(`/guides/${editingId}`, draft);
        toast.success("Guide updated");
        await load();
        if (data.slug !== slug) navigate(`/guide/${data.slug}`, { replace: true });
      }
      closeEditor();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (g) => {
    try {
      await api.delete(`/guides/${g.id}`);
      toast.success(`Erased "${g.title}"`);
      // Pick the next guide to land on
      const remaining = guides.filter((x) => x.id !== g.id);
      await load();
      if (remaining[0]) navigate(`/guide/${remaining[0].slug}`, { replace: true });
      else navigate("/guide", { replace: true });
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const togglePin = async (g) => {
    try {
      await api.put(`/guides/${g.id}`, { ...g, is_pinned: !g.is_pinned });
      await load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-12" data-testid="guide-page">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="text-xs tracking-[0.35em] uppercase text-lantern mb-2">The Lanternkeeper&rsquo;s Notes</div>
          <h1 className="font-serif-display text-4xl md:text-5xl text-bone leading-none ember-glow">
            Guides &amp; Explanations
          </h1>
          <p className="text-sm text-muted-bone mt-2 max-w-xl">
            Long-form notes from the keeper — house rules, walkthroughs, lore primers. Easy to write,
            easy to read. Cross-links to the codex with <code>[[Entry]]</code>; images drop right in.
          </p>
        </div>
        {user && (
          <button
            onClick={openNew}
            data-testid="new-guide-btn"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FBBF24] text-[#0B0E0C] font-semibold tracking-wide hover:bg-[#F59E0B] transition-colors shadow-[0_0_24px_rgba(251,191,36,0.25)]"
          >
            <Plus className="w-4 h-4" /> New Guide
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-muted-bone">Unfolding the keeper&rsquo;s notes…</p>
      ) : guides.length === 0 ? (
        <div className="lantern-card p-12 text-center" data-testid="guides-empty">
          <BookOpen className="w-10 h-10 text-lantern/40 mx-auto mb-3 ember-pulse" strokeWidth={1} />
          <p className="font-serif-display text-2xl text-bone mb-2">No guides yet</p>
          <p className="text-sm text-muted-bone">
            {user ? "Click \u201CNew Guide\u201D above to write the first one." : "The keeper has not written anything here yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          {/* Sidebar */}
          <aside className="lantern-card p-4 self-start" data-testid="guide-sidebar">
            <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-3 px-1">
              All Guides
            </div>
            <ul className="space-y-0.5">
              {guides.map((g) => {
                const isActive = active?.id === g.id;
                return (
                  <li key={g.id}>
                    <Link
                      to={`/guide/${g.slug}`}
                      data-testid={`guide-nav-${g.slug}`}
                      className={`flex items-start gap-2 px-2 py-1.5 transition-colors ${
                        isActive
                          ? "bg-[#FBBF24]/10 text-lantern border-l-2 border-[#FBBF24] -ml-px"
                          : "text-bone hover:text-lantern hover:bg-[#FBBF24]/[0.03]"
                      }`}
                    >
                      <ChevronRight className={`w-3.5 h-3.5 mt-0.5 shrink-0 transition-transform ${isActive ? "rotate-90 text-lantern" : "text-muted-bone"}`} />
                      <span className="text-sm leading-tight flex-1 truncate">
                        {g.is_pinned && <Pin className="w-3 h-3 inline mr-1 text-[#F59E0B]" />}
                        {g.title}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Active guide */}
          <article data-testid="guide-article">
            {!active ? (
              <p className="text-muted-bone italic">Pick a guide from the left.</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="min-w-0">
                    {active.is_pinned && (
                      <div className="text-[10px] tracking-[0.3em] uppercase text-[#F59E0B] mb-2 flex items-center gap-1">
                        <Pin className="w-3 h-3" /> Pinned
                      </div>
                    )}
                    <h2 className="font-serif-display text-3xl md:text-4xl text-bone leading-tight">
                      {active.title}
                    </h2>
                    {active.subtitle && (
                      <p className="font-serif-display italic text-lg text-muted-bone mt-1">
                        {active.subtitle}
                      </p>
                    )}
                  </div>
                  {user && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => togglePin(active)}
                        data-testid={`pin-guide-${active.slug}`}
                        className={`p-2 transition-colors ${active.is_pinned ? "text-[#F59E0B]" : "text-muted-bone hover:text-[#F59E0B]"}`}
                        title={active.is_pinned ? "Unpin" : "Pin to top"}
                      >
                        {active.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => openEdit(active)}
                        data-testid={`edit-guide-${active.slug}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-widest uppercase border border-rust text-bone hover:border-[#FBBF24]/50 hover:text-lantern transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => setConfirmDelete(active)}
                        data-testid={`delete-guide-${active.slug}`}
                        className="p-2 transition-colors inline-flex items-center gap-1.5 text-muted-bone hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="border-b border-rust/60 mb-6" />

                {active.content?.trim() ? (
                  <MarkdownView source={active.content} entries={entries} />
                ) : (
                  <p className="text-muted-bone italic">This page is still blank.</p>
                )}
              </>
            )}
          </article>
        </div>
      )}

      {editingId && draft && (
        <GuideEditor
          isNew={editingId === "new"}
          draft={draft}
          setDraft={setDraft}
          entries={entries}
          saving={saving}
          onSave={save}
          onClose={closeEditor}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={`Erase the guide "${confirmDelete?.title || ""}"?`}
        body="The page, its images, and its cross-links vanish from the keeper's notes. This can't be undone."
        confirmLabel="Erase guide"
        onConfirm={() => { const g = confirmDelete; setConfirmDelete(null); if (g) remove(g); }}
        onCancel={() => setConfirmDelete(null)}
        testid="confirm-delete-guide"
      />
    </div>
  );
}

function GuideEditor({ isNew, draft, setDraft, entries, saving, onSave, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B0E0C]/80 backdrop-blur-sm"
      onClick={onClose}
      data-testid="guide-editor-overlay"
    >
      <div
        className="absolute right-0 top-0 h-full w-full max-w-3xl bg-stone-deep border-l border-rust overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="guide-editor"
      >
        <div className="sticky top-0 z-10 bg-stone-deep/95 backdrop-blur-sm border-b border-rust px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.3em] uppercase text-lantern">{isNew ? "New Guide" : "Editing"}</div>
            <h2 className="font-serif-display text-2xl text-bone truncate">{draft.title || "Untitled"}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onSave}
              disabled={saving}
              data-testid="guide-editor-save"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-sm hover:bg-[#F59E0B] disabled:opacity-60"
            >
              <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={onClose}
              data-testid="guide-editor-close"
              className="p-2 text-muted-bone hover:text-bone"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              data-testid="field-guide-title"
              placeholder="e.g. House Rules for Wickfire"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">
              Subtitle
            </label>
            <input
              type="text"
              value={draft.subtitle}
              onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
              data-testid="field-guide-subtitle"
              placeholder="A short tagline below the title"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">
              Content
            </label>
            <MarkdownEditor
              value={draft.content}
              onChange={(v) => setDraft({ ...draft, content: v })}
              entries={entries}
              rows={20}
              testid="field-guide-content"
              placeholder="Write the guide. Drop images in, use [[Entry]] to cross-link to the codex."
            />
            <p className="text-[11px] text-muted-bone mt-1">
              Tip: use the image icon in the toolbar (or drag-and-drop) to upload images.
            </p>
          </div>
          <div>
            <label className="block text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">
              Sort order
            </label>
            <input
              type="number"
              value={draft.sort_order ?? 0}
              onChange={(e) => setDraft({ ...draft, sort_order: parseInt(e.target.value || "0", 10) })}
              data-testid="field-guide-sort"
              className="w-32 px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
            <p className="text-[11px] text-muted-bone mt-1">Lower numbers appear first in the sidebar.</p>
          </div>
          <label
            className={`flex items-start gap-3 cursor-pointer p-3 border transition-colors ${
              draft.is_pinned ? "border-[#F59E0B]/50 bg-[#F59E0B]/5" : "border-rust hover:border-[#FBBF24]/30"
            }`}
          >
            <input
              type="checkbox"
              checked={draft.is_pinned}
              onChange={(e) => setDraft({ ...draft, is_pinned: e.target.checked })}
              data-testid="field-guide-pinned"
              className="accent-[#F59E0B] mt-0.5"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm text-bone font-semibold">
                <Pin className={`w-3.5 h-3.5 ${draft.is_pinned ? "text-[#F59E0B]" : "text-muted-bone"}`} />
                Pin to top of sidebar
              </div>
              <div className="text-[11px] text-muted-bone mt-1">
                Useful for &ldquo;Welcome&rdquo; or &ldquo;Read this first&rdquo; pages.
              </div>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
