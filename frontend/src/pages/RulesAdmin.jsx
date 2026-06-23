import React, { useEffect, useState } from "react";
import { Plus, Save, Trash2, X, BookOpen } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";

const TABS = [
  { key: "races", label: "Races" },
  { key: "classes", label: "Classes" },
  { key: "spells", label: "Spells" },
  { key: "skills", label: "Skills" },
];

const TEMPLATES = {
  races: { name: "", ability_bonuses: {}, speed: 30, size: "Medium", traits: [], languages: [], source: "homebrew" },
  classes: { name: "", hit_die: 8, primary_ability: "str", saving_throws: [], skill_choices: 2, skill_options: [], spellcasting: null, features: [], source: "homebrew" },
  spells: { name: "", level: 0, school: "", casting_time: "1 action", range: "", components: "", duration: "", classes: [], description: "", source: "homebrew" },
  skills: { name: "", ability: "wis", source: "homebrew" },
};

export default function RulesAdmin() {
  const [tab, setTab] = useState("races");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = async (kind) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/rules/${kind}`);
      setItems(data || []);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(tab); setEditing(null); setSearch(""); }, [tab]);

  const filtered = items.filter((i) => !search.trim() || i.name?.toLowerCase().includes(search.toLowerCase()));

  const openNew = () => { setDraft({ ...TEMPLATES[tab] }); setEditing("new"); };
  const openEdit = (it) => { setDraft({ ...it }); setEditing(it.id); };
  const close = () => { setEditing(null); setDraft(null); };

  const save = async () => {
    if (!draft.name?.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      if (editing === "new") await api.post(`/rules/${tab}`, draft);
      else await api.put(`/rules/${tab}/${editing}`, draft);
      toast.success("Saved");
      close();
      await load(tab);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const remove = async (it) => {
    if (!window.confirm(`Delete ${it.name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/rules/${tab}/${it.id}`);
      toast.success("Removed");
      await load(tab);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-10 py-16" data-testid="rules-admin-page">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="block w-10 h-px bg-[#FBBF24]/60" />
            <span className="text-xs tracking-[0.35em] uppercase text-lantern">DM Rules Library</span>
          </div>
          <h1 className="font-serif-display text-4xl md:text-5xl text-bone leading-none ember-glow mb-3">
            <BookOpen className="inline w-8 h-8 mr-2 text-lantern" /> Rules &amp; Lookup
          </h1>
          <p className="text-muted-bone max-w-2xl">
            Add, edit, or remove the 5e SRD building blocks. Anything you add here appears in the player&rsquo;s
            character builder dropdowns.
          </p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-2 px-5 py-3 bg-[#FBBF24] text-[#0B0E0C] font-semibold tracking-wide hover:bg-[#F59E0B]" data-testid="new-rule-btn">
          <Plus className="w-4 h-4"/> New {tab.slice(0,-1)}
        </button>
      </div>

      <div className="flex gap-1 mb-6 border-b border-rust">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`tab-${t.key}`}
            className={`px-5 py-3 text-xs tracking-[0.3em] uppercase border-b-2 -mb-px ${
              tab === t.key ? "text-lantern border-[#FBBF24]" : "text-muted-bone border-transparent hover:text-bone"
            }`}>
            {t.label} <span className="text-[10px] text-muted-bone ml-1">({items.length})</span>
          </button>
        ))}
      </div>

      <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${tab}…`}
        className="w-full max-w-md mb-6 px-3 py-2 bg-stone-deep border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
        data-testid="rules-search" />

      {loading ? <div className="text-muted-bone">Loading…</div> : (
        <div className="lantern-card divide-y divide-[#2C362F]">
          {filtered.length === 0 && <div className="p-6 text-center text-muted-bone">Nothing matches.</div>}
          {filtered.map((it) => (
            <div key={it.id} className="p-4 flex items-start gap-4" data-testid={`rule-row-${it.id}`}>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-serif-display text-lg text-bone">{it.name}</span>
                  <span className={`text-[10px] tracking-widest uppercase px-1.5 py-0.5 border ${it.source === "srd" ? "border-[#FBBF24]/40 text-lantern" : "border-rust text-muted-bone"}`}>
                    {it.source || "homebrew"}
                  </span>
                  {tab === "spells" && <span className="text-[10px] text-muted-bone">Lv {it.level} · {it.school}</span>}
                  {tab === "classes" && <span className="text-[10px] text-muted-bone">d{it.hit_die} · {it.primary_ability?.toUpperCase()}</span>}
                  {tab === "skills" && <span className="text-[10px] text-muted-bone">{it.ability?.toUpperCase()}</span>}
                </div>
                {tab === "spells" && it.description && <p className="text-xs text-muted-bone mt-1 line-clamp-2">{it.description}</p>}
                {tab === "races" && it.ability_bonuses && (
                  <p className="text-xs text-muted-bone mt-1">
                    {Object.entries(it.ability_bonuses).map(([k,v]) => `${k.toUpperCase()} ${typeof v === "number" ? (v>=0?`+${v}`:v) : v}`).join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(it)} data-testid={`edit-rule-${it.id}`} className="px-2 py-1 text-xs uppercase tracking-widest text-muted-bone hover:text-lantern">Edit</button>
                <button onClick={() => remove(it)} data-testid={`delete-rule-${it.id}`} className="p-2 text-muted-bone hover:text-red-400"><Trash2 className="w-4 h-4"/></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-[#0B0E0C]/80 backdrop-blur-sm overflow-y-auto" onClick={close}>
          <div className="min-h-screen flex items-start justify-center py-8 px-4">
            <div className="w-full max-w-2xl bg-stone-deep border border-rust" onClick={(e) => e.stopPropagation()} data-testid="rule-editor">
              <div className="sticky top-0 bg-stone-deep border-b border-rust px-6 py-4 flex items-center justify-between">
                <h2 className="font-serif-display text-2xl text-bone">{draft.name || "New"}</h2>
                <div className="flex gap-2">
                  <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-sm" data-testid="save-rule-btn"><Save className="w-4 h-4"/>{saving ? "…" : "Save"}</button>
                  <button onClick={close} className="p-2 text-muted-bone hover:text-bone"><X className="w-5 h-5"/></button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <RuleFields kind={tab} draft={draft} setDraft={setDraft} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RuleFields({ kind, draft, setDraft }) {
  const set = (k, v) => setDraft({ ...draft, [k]: v });

  if (kind === "skills") return (
    <>
      <Field label="Name"><Inp v={draft.name} on={(v) => set("name", v)} /></Field>
      <Field label="Ability">
        <Sel v={draft.ability} on={(v) => set("ability", v)} opts={["str","dex","con","int","wis","cha"].map((a) => ({value: a, label: a.toUpperCase()}))} />
      </Field>
    </>
  );

  if (kind === "races") return (
    <>
      <Field label="Name"><Inp v={draft.name} on={(v) => set("name", v)} /></Field>
      <Field label="Ability bonuses (comma list, e.g. str+2, con+1)">
        <Inp v={Object.entries(draft.ability_bonuses || {}).map(([k,v]) => `${k}${typeof v === "number" ? (v>=0?`+${v}`:v) : `:${v}`}`).join(", ")}
          on={(v) => {
            const obj = {};
            v.split(",").map((s) => s.trim()).filter(Boolean).forEach((p) => {
              const m = p.match(/^([a-z_]+)\s*([+-]?\d+)$/i);
              if (m) obj[m[1].toLowerCase()] = parseInt(m[2], 10);
            });
            set("ability_bonuses", obj);
          }} placeholder="dex+2, int+1" />
      </Field>
      <FieldRow>
        <Field label="Speed (ft)"><Inp type="number" v={draft.speed} on={(v) => set("speed", parseInt(v||"30",10))} /></Field>
        <Field label="Size"><Inp v={draft.size} on={(v) => set("size", v)} /></Field>
      </FieldRow>
      <Field label="Traits (comma-separated)">
        <Inp v={(draft.traits || []).join(", ")} on={(v) => set("traits", v.split(",").map((s) => s.trim()).filter(Boolean))} />
      </Field>
      <Field label="Languages (comma-separated)">
        <Inp v={(draft.languages || []).join(", ")} on={(v) => set("languages", v.split(",").map((s) => s.trim()).filter(Boolean))} />
      </Field>
    </>
  );

  if (kind === "classes") return (
    <>
      <Field label="Name"><Inp v={draft.name} on={(v) => set("name", v)} /></Field>
      <FieldRow>
        <Field label="Hit Die"><Sel v={draft.hit_die} on={(v) => set("hit_die", parseInt(v,10))} opts={[6,8,10,12].map((d) => ({value: d, label: `d${d}`}))} /></Field>
        <Field label="Primary Ability"><Sel v={draft.primary_ability} on={(v) => set("primary_ability", v)} opts={["str","dex","con","int","wis","cha"].map((a) => ({value:a, label:a.toUpperCase()}))} /></Field>
      </FieldRow>
      <Field label="Saving Throws (comma-separated, e.g. str, con)">
        <Inp v={(draft.saving_throws || []).join(", ")} on={(v) => set("saving_throws", v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))} />
      </Field>
      <FieldRow>
        <Field label="Skill Choices"><Inp type="number" v={draft.skill_choices} on={(v) => set("skill_choices", parseInt(v||"2",10))} /></Field>
        <Field label="Spellcasting Ability (or empty)"><Inp v={draft.spellcasting?.ability || ""} on={(v) => set("spellcasting", v ? { ...(draft.spellcasting || {}), ability: v } : null)} placeholder="wis / int / cha" /></Field>
      </FieldRow>
      <Field label="Features (comma-separated)">
        <Inp v={(draft.features || []).join(", ")} on={(v) => set("features", v.split(",").map((s) => s.trim()).filter(Boolean))} />
      </Field>
    </>
  );

  if (kind === "spells") return (
    <>
      <Field label="Name"><Inp v={draft.name} on={(v) => set("name", v)} /></Field>
      <FieldRow>
        <Field label="Level (0–9)"><Inp type="number" v={draft.level} on={(v) => set("level", parseInt(v||"0",10))} /></Field>
        <Field label="School"><Inp v={draft.school} on={(v) => set("school", v)} placeholder="Evocation" /></Field>
      </FieldRow>
      <FieldRow>
        <Field label="Casting Time"><Inp v={draft.casting_time} on={(v) => set("casting_time", v)} /></Field>
        <Field label="Range"><Inp v={draft.range} on={(v) => set("range", v)} /></Field>
      </FieldRow>
      <FieldRow>
        <Field label="Components"><Inp v={draft.components} on={(v) => set("components", v)} placeholder="V, S, M" /></Field>
        <Field label="Duration"><Inp v={draft.duration} on={(v) => set("duration", v)} /></Field>
      </FieldRow>
      <Field label="Classes (comma-separated)">
        <Inp v={(draft.classes || []).join(", ")} on={(v) => set("classes", v.split(",").map((s) => s.trim()).filter(Boolean))} />
      </Field>
      <Field label="Description">
        <textarea rows={6} value={draft.description || ""} onChange={(e) => set("description", e.target.value)} className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y" />
      </Field>
    </>
  );

  return null;
}

function FieldRow({ children }) { return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>; }
function Field({ label, children }) {
  return <div><label className="block text-[10px] tracking-[0.3em] uppercase text-lantern mb-1.5">{label}</label>{children}</div>;
}
function Inp({ v, on, type = "text", placeholder }) {
  return <input type={type} value={v ?? ""} onChange={(e) => on(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none" />;
}
function Sel({ v, on, opts }) {
  return <select value={v ?? ""} onChange={(e) => on(e.target.value)} className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none">
    {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>;
}
