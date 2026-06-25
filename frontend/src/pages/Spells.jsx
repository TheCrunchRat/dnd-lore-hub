import React, { useEffect, useMemo, useState } from "react";
import { Search, Filter, Sparkles, Plus, Pencil, Trash2, X, Save, BookOpen } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

const SCHOOLS = ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"];
const LEVEL_LABEL = (lvl) => (lvl === 0 ? "Cantrip" : `Lv ${lvl}`);

const EMPTY_DRAFT = {
  name: "",
  level: 0,
  school: "",
  casting_time: "1 action",
  range: "",
  components: "",
  duration: "",
  classes: [],
  description: "",
  source: "homebrew",
};

export default function Spells() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [spells, setSpells] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [school, setSchool] = useState("");
  const [level, setLevel] = useState("");
  const [klass, setKlass] = useState("");
  const [showHomebrewOnly, setShowHomebrewOnly] = useState(false);
  const [editing, setEditing] = useState(null); // spell being edited, or {} for new
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = () => {
    setLoading(true);
    api.get("/spells/library")
      .then((r) => setSpells(r.data || []))
      .catch((e) => toast.error(formatApiError(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const allClasses = useMemo(() => {
    const s = new Set();
    spells.forEach((sp) => (sp.classes || []).forEach((c) => s.add(c)));
    return [...s].sort();
  }, [spells]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return spells
      .filter((sp) => !showHomebrewOnly || sp.source === "homebrew")
      .filter((sp) => !school || sp.school === school)
      .filter((sp) => level === "" || String(sp.level) === level)
      .filter((sp) => !klass || (sp.classes || []).includes(klass))
      .filter((sp) => {
        if (!q) return true;
        return (
          sp.name?.toLowerCase().includes(q) ||
          sp.description?.toLowerCase().includes(q) ||
          sp.school?.toLowerCase().includes(q) ||
          (sp.classes || []).some((c) => c.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));
  }, [spells, query, school, level, klass, showHomebrewOnly]);

  const clearFilters = () => { setQuery(""); setSchool(""); setLevel(""); setKlass(""); setShowHomebrewOnly(false); };
  const anyFilter = !!(query || school || level !== "" || klass || showHomebrewOnly);

  const handleSave = async (draft) => {
    try {
      if (draft.id) {
        await api.put(`/rules/spells/${draft.id}`, draft);
        toast.success("Spell updated");
      } else {
        await api.post(`/rules/spells`, draft);
        toast.success("Homebrew spell forged");
      }
      setEditing(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/rules/spells/${id}`);
      toast.success("Spell deleted");
      setConfirmDelete(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs tracking-[0.3em] uppercase text-lantern inline-flex items-center gap-2 mb-2">
            <BookOpen className="w-3.5 h-3.5" /> Rules Library
          </div>
          <h2 className="font-serif-display text-3xl sm:text-4xl text-bone leading-tight">Spell Compendium</h2>
          <p className="text-sm text-muted-bone italic mt-2 max-w-2xl">
            Every cantrip and incantation known to the realm, alongside any spell-marked nodes from the magic trees.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setEditing({ ...EMPTY_DRAFT })}
            data-testid="spell-new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-sm hover:bg-[#F59E0B]"
          >
            <Plus className="w-4 h-4" /> Forge Homebrew Spell
          </button>
        )}
      </div>

        {/* Filter bar */}
        <div className="lantern-card p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-bone" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, school, description…"
                data-testid="spell-search"
                className="w-full pl-9 pr-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none text-sm"
              />
            </div>
            <select value={level} onChange={(e) => setLevel(e.target.value)} data-testid="filter-level"
              className="px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none text-sm">
              <option value="">All levels</option>
              {[0,1,2,3,4,5,6,7,8,9].map((l) => <option key={l} value={l}>{LEVEL_LABEL(l)}</option>)}
            </select>
            <select value={school} onChange={(e) => setSchool(e.target.value)} data-testid="filter-school"
              className="px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none text-sm">
              <option value="">All schools</option>
              {SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={klass} onChange={(e) => setKlass(e.target.value)} data-testid="filter-class"
              className="px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none text-sm">
              <option value="">Any class</option>
              {allClasses.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={() => setShowHomebrewOnly((b) => !b)}
              data-testid="filter-homebrew"
              className={`px-3 py-2 text-xs tracking-widest uppercase border ${
                showHomebrewOnly ? "border-[#FBBF24] text-lantern bg-[#FBBF24]/10" : "border-rust text-bone hover:border-[#FBBF24]/50"
              }`}
            >
              Homebrew only
            </button>
            {anyFilter && (
              <button onClick={clearFilters} data-testid="clear-filters" className="text-xs uppercase tracking-widest text-muted-bone hover:text-lantern inline-flex items-center gap-1">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
          <div className="text-[11px] text-muted-bone mt-3 tracking-wide inline-flex items-center gap-2">
            <Filter className="w-3 h-3 text-lantern" />
            Showing <span className="text-lantern">{filtered.length}</span> of {spells.length} spells
          </div>
        </div>

        {/* Spell grid */}
        {loading ? (
          <div className="text-center text-muted-bone py-20">Gathering incantations…</div>
        ) : filtered.length === 0 ? (
          <div className="lantern-card p-10 text-center text-muted-bone italic">
            No spells match. Try clearing a filter or {isAdmin && "forging your own"}{!isAdmin && "ask your DM to forge one"}.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((sp) => (
              <SpellCard
                key={sp.id}
                spell={sp}
                isAdmin={isAdmin}
                onEdit={() => setEditing(sp)}
                onDelete={() => setConfirmDelete(sp)}
              />
            ))}
          </div>
        )}

      {editing && (
        <SpellEditor
          initial={editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDelete
          spell={confirmDelete}
          onConfirm={() => handleDelete(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function SpellCard({ spell, isAdmin, onEdit, onDelete }) {
  const isHomebrew = spell.source === "homebrew";
  const isMagicNode = spell.source === "magic-node";
  const borderColor = isMagicNode ? `${spell.accent_color || "#FBBF24"}AA` : isHomebrew ? "#F97316AA" : null;
  return (
    <div
      className="lantern-card vine-frame p-4 h-full flex flex-col"
      style={borderColor ? { borderColor } : {}}
      data-testid={`spell-card-${spell.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="font-serif-display text-lg text-bone leading-tight truncate">{spell.name}</h3>
          <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mt-0.5 inline-flex items-center gap-2 flex-wrap">
            <span>{LEVEL_LABEL(spell.level || 0)}</span>
            {spell.school && <span className="text-muted-bone">·</span>}
            <span>{spell.school || "Unknown school"}</span>
            {isHomebrew && (
              <>
                <span className="text-muted-bone">·</span>
                <span className="text-[#F97316]" data-testid="homebrew-badge">Homebrew</span>
              </>
            )}
            {isMagicNode && (
              <>
                <span className="text-muted-bone">·</span>
                <a
                  href={`/magic/${spell.tree_slug}`}
                  className="hover:underline"
                  style={{ color: spell.accent_color || "#FBBF24" }}
                  data-testid="magic-node-badge"
                  title={`From magic tree: ${spell.tree_name}`}
                >
                  {spell.tree_name}
                </a>
              </>
            )}
          </div>
        </div>
        {isAdmin && isHomebrew && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEdit} data-testid={`edit-spell-${spell.id}`} className="p-1.5 text-muted-bone hover:text-lantern" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={onDelete} data-testid={`delete-spell-${spell.id}`} className="p-1.5 text-muted-bone hover:text-red-400" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-bone mb-2">
        {spell.casting_time && <div><span className="text-lantern/70 mr-1">Cast:</span>{spell.casting_time}</div>}
        {spell.range && <div><span className="text-lantern/70 mr-1">Range:</span>{spell.range}</div>}
        {spell.components && <div><span className="text-lantern/70 mr-1">Comp:</span>{spell.components}</div>}
        {spell.duration && <div><span className="text-lantern/70 mr-1">Dur:</span>{spell.duration}</div>}
      </div>

      {spell.description && (
        <p className="text-xs text-bone/80 leading-relaxed flex-1">{spell.description}</p>
      )}

      {spell.classes?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3 pt-2 border-t border-rust/40">
          {spell.classes.map((c) => (
            <span key={c} className="text-[9px] tracking-widest uppercase px-1.5 py-0.5 border border-rust text-muted-bone">{c}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function SpellEditor({ initial, onSave, onClose }) {
  const [draft, setDraft] = useState(initial);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const submit = () => {
    if (!draft.name?.trim()) { toast.error("Name is required"); return; }
    onSave({ ...draft, name: draft.name.trim(), source: "homebrew" });
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0E0C]/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="lantern-card vine-frame w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()} data-testid="spell-editor">
        <div className="px-5 py-4 border-b border-rust flex items-center justify-between">
          <h3 className="font-serif-display text-2xl text-bone inline-flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-lantern" /> {draft.id ? "Edit Spell" : "Forge Homebrew Spell"}
          </h3>
          <button onClick={onClose} className="p-1 text-muted-bone hover:text-bone"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <Row>
            <Field label="Name" wide>
              <Inp v={draft.name} on={(v) => set("name", v)} testid="editor-name" />
            </Field>
            <Field label="Level">
              <select value={draft.level} onChange={(e) => set("level", parseInt(e.target.value, 10))} data-testid="editor-level" className={inputCx}>
                {[0,1,2,3,4,5,6,7,8,9].map((l) => <option key={l} value={l}>{LEVEL_LABEL(l)}</option>)}
              </select>
            </Field>
            <Field label="School">
              <select value={draft.school} onChange={(e) => set("school", e.target.value)} data-testid="editor-school" className={inputCx}>
                <option value="">—</option>
                {SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="Casting Time"><Inp v={draft.casting_time} on={(v) => set("casting_time", v)} placeholder="1 action" /></Field>
            <Field label="Range"><Inp v={draft.range} on={(v) => set("range", v)} placeholder="60 feet" /></Field>
          </Row>
          <Row>
            <Field label="Components"><Inp v={draft.components} on={(v) => set("components", v)} placeholder="V, S, M (a pinch of soot)" /></Field>
            <Field label="Duration"><Inp v={draft.duration} on={(v) => set("duration", v)} placeholder="Instantaneous" /></Field>
          </Row>
          <Field label="Classes (comma-separated)">
            <Inp
              v={(draft.classes || []).join(", ")}
              on={(v) => set("classes", v.split(",").map((s) => s.trim()).filter(Boolean))}
              placeholder="Wizard, Sorcerer, Wickfire Keeper"
              testid="editor-classes"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={draft.description || ""}
              onChange={(e) => set("description", e.target.value)}
              rows={6}
              data-testid="editor-description"
              className={`${inputCx} resize-y`}
              placeholder="What does the spell do?"
            />
          </Field>
        </div>
        <div className="px-5 py-3 border-t border-rust flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-xs tracking-widest uppercase text-muted-bone hover:text-bone">Cancel</button>
          <button onClick={submit} data-testid="editor-save" className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-sm hover:bg-[#F59E0B]">
            <Save className="w-4 h-4" /> {draft.id ? "Save Changes" : "Forge Spell"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDelete({ spell, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0B0E0C]/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCancel}>
      <div className="lantern-card vine-frame max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif-display text-xl text-bone mb-2">Banish this spell?</h3>
        <p className="text-sm text-muted-bone mb-5">
          <span className="text-bone">{spell.name}</span> will be removed from the compendium. Characters keep their currently-known spell names but will no longer find details here.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 text-xs tracking-widest uppercase text-muted-bone hover:text-bone">Cancel</button>
          <button onClick={onConfirm} data-testid="confirm-delete-spell" className="px-4 py-2 bg-red-500/80 text-bone text-xs tracking-widest uppercase hover:bg-red-500">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCx = "w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none text-sm";

function Inp({ v, on, type = "text", placeholder, testid }) {
  return <input type={type} value={v ?? ""} onChange={(e) => on(e.target.value)} placeholder={placeholder} data-testid={testid} className={inputCx} />;
}
function Field({ label, wide, children }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <label className="block text-[10px] tracking-[0.3em] uppercase text-lantern mb-1">{label}</label>
      {children}
    </div>
  );
}
function Row({ children }) { return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>; }
