import React, { useState, useEffect, useMemo } from "react";
import { X, Save, ChevronLeft, ChevronRight, Dices, Shuffle, Plus, Minus, Trash2 } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

const NAME_KEY = "lantern.diceName";
const ABILITIES = [
  { key: "str", label: "Strength" }, { key: "dex", label: "Dexterity" }, { key: "con", label: "Constitution" },
  { key: "int", label: "Intelligence" }, { key: "wis", label: "Wisdom" }, { key: "cha", label: "Charisma" },
];
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const STEPS = ["identity", "abilities", "skills", "combat", "spells", "story"];

const mod = (score) => Math.floor((score - 10) / 2);
const profBonus = (level) => 2 + Math.floor((Math.max(1, level) - 1) / 4);

function roll4d6dl() {
  const rolls = [0, 0, 0, 0].map(() => Math.floor(Math.random() * 6) + 1);
  rolls.sort((a, b) => b - a);
  return rolls[0] + rolls[1] + rolls[2];
}

export default function CharacterBuilder({ open, onClose, onSaved, existing }) {
  const { user } = useAuth();
  const isEdit = !!existing;
  const meta = existing?.metadata || {};

  const [step, setStep] = useState(0);
  const [name, setName] = useState(existing?.title || "");
  const [subtitle, setSubtitle] = useState(existing?.subtitle || "");
  const [pronouns, setPronouns] = useState(meta.pronouns || "");
  const [alignment, setAlignment] = useState(meta.alignment || "");
  const [level, setLevel] = useState(meta.level || 1);
  const [raceId, setRaceId] = useState(meta.race_id || "");
  const [raceText, setRaceText] = useState(meta.race || "");
  const [classId, setClassId] = useState(meta.class_id || "");
  const [classText, setClassText] = useState(meta.class || "");
  const [background, setBackground] = useState(meta.background || "");
  const [scoreMethod, setScoreMethod] = useState("standard");
  const [scores, setScores] = useState(meta.ability_scores || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
  const [profs, setProfs] = useState(meta.proficiencies || []);
  const [saves, setSaves] = useState(meta.saving_throws || []);
  const [langs, setLangs] = useState((meta.languages || []).join(", "));
  const [maxHp, setMaxHp] = useState(meta.max_hp || 10);
  const [curHp, setCurHp] = useState(meta.current_hp ?? meta.max_hp ?? 10);
  const [ac, setAc] = useState(meta.armor_class || 10);
  const [speed, setSpeed] = useState(meta.speed || 30);
  const [spellsKnown, setSpellsKnown] = useState(meta.spells_known || []);
  const [spellSlots, setSpellSlots] = useState(meta.spell_slots || {});
  const [equipment, setEquipment] = useState((meta.equipment || []).join("\n"));
  const [features, setFeatures] = useState((meta.features || []).join("\n"));
  const [content, setContent] = useState(existing?.content || "");
  const [summary, setSummary] = useState(existing?.summary || "");
  const [imageUrl, setImageUrl] = useState(existing?.image_url || "");
  const [playerName, setPlayerName] = useState(user?.name || meta.owner || localStorage.getItem(NAME_KEY) || "");

  // Rules library
  const [races, setRaces] = useState([]);
  const [classes, setClasses] = useState([]);
  const [skills, setSkills] = useState([]);
  const [spellsLib, setSpellsLib] = useState([]);
  const [slotsTable, setSlotsTable] = useState({});
  const [saving, setSavingState] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api.get("/rules/races"), api.get("/rules/classes"),
      api.get("/rules/skills"), api.get("/rules/spells"),
      api.get("/rules/_computed/spell_slots"),
    ]).then(([r, c, sk, sp, sl]) => {
      setRaces(r.data); setClasses(c.data); setSkills(sk.data); setSpellsLib(sp.data); setSlotsTable(sl.data);
    }).catch(() => {});
  }, [open]);

  const race = useMemo(() => races.find((r) => r.id === raceId), [races, raceId]);
  const klass = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);
  const finalScores = useMemo(() => {
    const f = { ...scores };
    if (race?.ability_bonuses) for (const [k, v] of Object.entries(race.ability_bonuses)) if (typeof v === "number") f[k] = (f[k] || 0) + v;
    return f;
  }, [scores, race]);

  // Auto-populate saves when class is picked (only first time)
  useEffect(() => {
    if (klass && saves.length === 0) setSaves(klass.saving_throws || []);
    if (klass && !meta.spell_slots && klass.spellcasting) {
      const table = slotsTable[level] || [];
      const obj = {};
      table.forEach((max, i) => { obj[i + 1] = { max, used: 0 }; });
      setSpellSlots(obj);
    }
    if (klass && speed === 30 && race?.speed) setSpeed(race.speed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klass, race, level]);

  if (!open) return null;

  const applyArray = () => setScores({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });
  const rollAll = () => setScores({ str: roll4d6dl(), dex: roll4d6dl(), con: roll4d6dl(), int: roll4d6dl(), wis: roll4d6dl(), cha: roll4d6dl() });
  const pointBuyCost = (s) => ({ 8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9 }[s] ?? 999);
  const pointsUsed = ABILITIES.reduce((sum, a) => sum + pointBuyCost(scores[a.key]), 0);

  const toggleProf = (skill) => setProfs((p) => p.includes(skill) ? p.filter((x) => x !== skill) : [...p, skill]);
  const toggleSave = (a) => setSaves((s) => s.includes(a) ? s.filter((x) => x !== a) : [...s, a]);
  const toggleSpell = (n) => setSpellsKnown((s) => s.includes(n) ? s.filter((x) => x !== n) : [...s, n]);

  const adjustSlot = (lvl, key, delta) => setSpellSlots((s) => ({
    ...s,
    [lvl]: { ...(s[lvl] || { max: 0, used: 0 }), [key]: Math.max(0, ((s[lvl] || {})[key] || 0) + delta) },
  }));

  const save = async () => {
    if (!name.trim() || !playerName.trim()) { toast.error("Name and player name are required"); return; }
    setSavingState(true);
    try {
      const payload = {
        player_name: playerName,
        name, subtitle, summary, content, image_url: imageUrl,
        race: race?.name || raceText, char_class: klass?.name || classText,
        level, alignment, pronouns,
        race_id: raceId || null, class_id: classId || null, background,
        ability_scores: finalScores, max_hp: maxHp, current_hp: curHp,
        armor_class: ac, speed,
        proficiencies: profs, saving_throws: saves,
        languages: langs.split(",").map((s) => s.trim()).filter(Boolean),
        spells_known: spellsKnown, spell_slots: spellSlots,
        equipment: equipment.split("\n").map((s) => s.trim()).filter(Boolean),
        features: features.split("\n").map((s) => s.trim()).filter(Boolean),
      };
      const { data } = isEdit ? await api.put(`/pcs/${existing.id}`, payload) : await api.post("/pcs", payload);
      localStorage.setItem(NAME_KEY, playerName);
      toast.success(isEdit ? "Character updated" : "Character forged");
      onSaved?.(data); onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSavingState(false); }
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    setSavingState(true);
    try {
      // Try the admin route first (works for DM), fall back to player route
      if (user?.role === "admin") {
        await api.delete(`/entries/${existing.id}`);
      } else {
        await api.delete(`/pcs/${existing.id}`, { params: playerName ? { player_name: playerName } : {} });
      }
      toast.success("Character deleted");
      onSaved?.({ _deleted: true, id: existing.id });
      onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSavingState(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0E0C]/85 backdrop-blur-sm overflow-y-auto" onClick={onClose} data-testid="builder-overlay">
      <div className="min-h-screen flex items-start justify-center py-8 px-4">
        <div className="w-full max-w-4xl bg-stone-deep border border-rust" onClick={(e) => e.stopPropagation()} data-testid="character-builder">
          <div className="sticky top-0 z-10 bg-stone-deep border-b border-rust px-6 py-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-lantern">{isEdit ? "Editing" : "Forging a character"}</div>
              <h2 className="font-serif-display text-2xl text-bone">{name || "Untitled"}</h2>
            </div>
            <button onClick={onClose} className="p-2 text-muted-bone hover:text-bone"><X className="w-5 h-5" /></button>
          </div>

          <div className="px-6 py-3 border-b border-rust flex gap-1 overflow-x-auto" data-testid="builder-steps">
            {STEPS.map((s, i) => (
              <button key={s} onClick={() => setStep(i)} data-testid={`step-${s}`}
                className={`px-3 py-1.5 text-[10px] tracking-[0.25em] uppercase whitespace-nowrap ${
                  step === i ? "text-lantern border-b border-[#FBBF24]" : "text-muted-bone hover:text-bone"
                }`}>
                {i + 1}. {s}
              </button>
            ))}
          </div>

          <div className="p-6 space-y-5">
            {STEPS[step] === "identity" && (
              <>
                <FieldRow>
                  <Field label="Character Name"><Inp v={name} on={setName} /></Field>
                  <Field label="Your Player Name (locked when signed in)">
                    <Inp v={playerName} on={setPlayerName} disabled={!!user} />
                  </Field>
                </FieldRow>
                <Field label="Subtitle / Epithet"><Inp v={subtitle} on={setSubtitle} placeholder="e.g. Wickfire initiate of the Brass Cloister" /></Field>
                <FieldRow>
                  <Field label="Race (5e SRD)">
                    <Sel v={raceId} on={setRaceId} opts={[{value:"", label:"-- Homebrew (use text below) --"}, ...races.map(r=>({value:r.id, label:r.name}))]} />
                  </Field>
                  <Field label="Race (free text — used when no SRD pick)"><Inp v={raceText} on={setRaceText} placeholder="Lanternkin" /></Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Class (5e SRD)">
                    <Sel v={classId} on={setClassId} opts={[{value:"", label:"-- Homebrew --"}, ...classes.map(c=>({value:c.id, label:c.name}))]} />
                  </Field>
                  <Field label="Class (free text)"><Inp v={classText} on={setClassText} placeholder="Wickfire Keeper" /></Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Level"><Inp v={level} on={(v) => setLevel(parseInt(v||"1",10))} type="number" min={1} max={20} /></Field>
                  <Field label="Alignment"><Inp v={alignment} on={setAlignment} placeholder="CN" /></Field>
                  <Field label="Pronouns"><Inp v={pronouns} on={setPronouns} placeholder="they/them" /></Field>
                </FieldRow>
                <Field label="Background"><Inp v={background} on={setBackground} placeholder="Acolyte, Outlander, Folk Hero…" /></Field>
              </>
            )}

            {STEPS[step] === "abilities" && (
              <>
                <div className="flex flex-wrap gap-2 mb-4">
                  {["standard", "pointbuy", "roll", "manual"].map((m) => (
                    <button key={m} onClick={() => setScoreMethod(m)} data-testid={`method-${m}`}
                      className={`px-3 py-1.5 text-xs tracking-widest uppercase border ${
                        scoreMethod === m ? "border-[#FBBF24] text-lantern" : "border-rust text-bone hover:border-[#FBBF24]/50"
                      }`}>
                      {m === "standard" ? "Standard Array" : m === "pointbuy" ? "Point Buy" : m === "roll" ? "4d6 drop lowest" : "Manual"}
                    </button>
                  ))}
                  {scoreMethod === "standard" && <button onClick={applyArray} className="text-xs uppercase tracking-widest text-lantern hover:underline">Apply 15/14/13/12/10/8</button>}
                  {scoreMethod === "roll" && <button onClick={rollAll} data-testid="roll-all" className="inline-flex items-center gap-1 text-xs uppercase tracking-widest text-lantern hover:underline"><Dices className="w-3.5 h-3.5"/>Roll all six</button>}
                </div>
                {scoreMethod === "pointbuy" && (
                  <div className={`text-xs mb-2 ${pointsUsed > 27 ? "text-red-400" : "text-muted-bone"}`}>
                    Points used: <span className="text-lantern">{pointsUsed}</span> / 27 · Each score must be 8–15.
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {ABILITIES.map((a) => {
                    const bonus = race?.ability_bonuses?.[a.key] || 0;
                    const finalS = finalScores[a.key];
                    return (
                      <div key={a.key} className="lantern-card p-4 text-center" data-testid={`ability-${a.key}`}>
                        <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-1">{a.label}</div>
                        <div className="flex items-center justify-center gap-2 my-2">
                          <button onClick={() => setScores({...scores, [a.key]: Math.max(3, scores[a.key]-1)})} className="p-1 text-muted-bone hover:text-lantern"><Minus className="w-3.5 h-3.5"/></button>
                          <span className="font-serif-display text-3xl text-bone w-12">{scores[a.key]}</span>
                          <button onClick={() => setScores({...scores, [a.key]: Math.min(20, scores[a.key]+1)})} className="p-1 text-muted-bone hover:text-lantern"><Plus className="w-3.5 h-3.5"/></button>
                        </div>
                        {bonus !== 0 && <div className="text-[10px] text-lantern">{bonus > 0 ? `+${bonus}` : bonus} from race</div>}
                        <div className="text-xs text-muted-bone mt-1">Final {finalS} · mod {mod(finalS) >= 0 ? `+${mod(finalS)}` : mod(finalS)}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {STEPS[step] === "skills" && (
              <>
                <div className="text-xs text-muted-bone mb-3">
                  Proficiency bonus: <span className="text-lantern">+{profBonus(level)}</span>
                  {klass?.skill_choices && <span className="ml-3">Class allows: <span className="text-lantern">{klass.skill_choices}</span> skill proficiencies</span>}
                </div>
                <Field label="Saving Throws (class default highlighted)">
                  <div className="flex flex-wrap gap-2">
                    {ABILITIES.map((a) => (
                      <button key={a.key} onClick={() => toggleSave(a.key)} data-testid={`save-${a.key}`}
                        className={`px-3 py-1.5 text-xs uppercase tracking-widest border ${
                          saves.includes(a.key) ? "border-[#FBBF24] text-lantern bg-[#FBBF24]/10" : "border-rust text-bone"
                        }`}>{a.label}</button>
                    ))}
                  </div>
                </Field>
                <Field label="Skill Proficiencies">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {skills.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={profs.includes(s.name)} onChange={() => toggleProf(s.name)} data-testid={`prof-${s.name.replace(/\s+/g,"-")}`} className="accent-[#FBBF24]" />
                        <span className="text-sm text-bone">{s.name} <span className="text-muted-bone text-[10px]">({s.ability.toUpperCase()})</span></span>
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Languages (comma-separated)"><Inp v={langs} on={setLangs} placeholder="Common, Elvish, Sylvan" /></Field>
              </>
            )}

            {STEPS[step] === "combat" && (
              <>
                <FieldRow>
                  <Field label="Max HP"><Inp type="number" v={maxHp} on={(v) => setMaxHp(parseInt(v||"0",10))} /></Field>
                  <Field label="Current HP"><Inp type="number" v={curHp} on={(v) => setCurHp(parseInt(v||"0",10))} /></Field>
                  <Field label="Armor Class"><Inp type="number" v={ac} on={(v) => setAc(parseInt(v||"0",10))} /></Field>
                  <Field label="Speed (ft)"><Inp type="number" v={speed} on={(v) => setSpeed(parseInt(v||"0",10))} /></Field>
                </FieldRow>
                {klass && <div className="text-xs text-muted-bone">Hit die: <span className="text-lantern">d{klass.hit_die}</span> per level</div>}
                <Field label="Equipment (one per line)">
                  <textarea rows={6} value={equipment} onChange={(e) => setEquipment(e.target.value)} className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y" />
                </Field>
                <Field label="Class & Race Features (one per line)">
                  <textarea rows={5} value={features} onChange={(e) => setFeatures(e.target.value)} className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y" />
                </Field>
              </>
            )}

            {STEPS[step] === "spells" && (
              <>
                {!klass?.spellcasting ? (
                  <p className="text-sm text-muted-bone">{klass ? `${klass.name} is not a spellcasting class.` : "Pick a class on the Identity step first."}</p>
                ) : (
                  <>
                    <Field label="Spell Slots (max / used)">
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {Object.entries(spellSlots).sort(([a], [b]) => +a - +b).map(([lvl, s]) => (
                          <div key={lvl} className="border border-rust p-2 text-center">
                            <div className="text-[10px] tracking-widest uppercase text-lantern mb-1">Lv {lvl}</div>
                            <div className="flex items-center justify-center gap-1 text-sm">
                              <button onClick={() => adjustSlot(lvl, "used", 1)} className="text-muted-bone hover:text-red-400" data-testid={`use-slot-${lvl}`}><Minus className="w-3 h-3"/></button>
                              <span className="text-bone">{(s.max||0) - (s.used||0)}/{s.max||0}</span>
                              <button onClick={() => adjustSlot(lvl, "used", -1)} className="text-muted-bone hover:text-lantern" data-testid={`free-slot-${lvl}`}><Plus className="w-3 h-3"/></button>
                            </div>
                            <div className="flex items-center justify-center gap-1 mt-1 text-[10px] text-muted-bone">
                              max <button onClick={() => adjustSlot(lvl, "max", -1)} className="hover:text-lantern">−</button>
                              {s.max||0}
                              <button onClick={() => adjustSlot(lvl, "max", 1)} className="hover:text-lantern">+</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Field>
                    <Field label="Spells Known / Prepared">
                      <div className="max-h-64 overflow-y-auto border border-rust p-3 grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {spellsLib.filter((s) => !klass || (s.classes || []).includes(klass.name)).sort((a,b) => a.level - b.level || a.name.localeCompare(b.name)).map((s) => (
                          <label key={s.id} className="flex items-start gap-2 cursor-pointer hover:bg-[#0B0E0C]/40 p-1">
                            <input type="checkbox" checked={spellsKnown.includes(s.name)} onChange={() => toggleSpell(s.name)} className="accent-[#FBBF24] mt-0.5" data-testid={`spell-${s.name.replace(/\s+/g,"-")}`} />
                            <div className="text-xs">
                              <div className="text-bone">{s.name} <span className="text-muted-bone">· {s.level === 0 ? "Cantrip" : `Lv ${s.level}`} · {s.school}</span></div>
                              <div className="text-muted-bone text-[10px] line-clamp-2">{s.description}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </Field>
                  </>
                )}
              </>
            )}

            {STEPS[step] === "story" && (
              <>
                <Field label="One-line summary"><Inp v={summary} on={setSummary} placeholder="The party's quietest hand…" /></Field>
                <Field label="Backstory / bio">
                  <textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y" />
                </Field>
                <Field label="Portrait URL"><Inp v={imageUrl} on={setImageUrl} placeholder="https://…" /></Field>
              </>
            )}
          </div>

          <div className="sticky bottom-0 bg-stone-deep border-t border-rust px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <button onClick={() => setStep(Math.max(0, step-1))} disabled={step === 0} className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-muted-bone hover:text-bone disabled:opacity-30" data-testid="builder-back">
                <ChevronLeft className="w-4 h-4"/> Back
              </button>
              {isEdit && (user || playerName) && (
                <button onClick={handleDelete} data-testid="builder-delete" className="inline-flex items-center gap-1.5 text-xs tracking-widest uppercase text-muted-bone hover:text-red-400">
                  <Trash2 className="w-3.5 h-3.5"/> Delete character
                </button>
              )}
            </div>
            <div className="text-[10px] tracking-widest uppercase text-muted-bone">Step {step+1} of {STEPS.length}</div>
            {step < STEPS.length - 1 ? (
              <button onClick={() => setStep(Math.min(STEPS.length-1, step+1))} className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-lantern hover:underline" data-testid="builder-next">
                Next <ChevronRight className="w-4 h-4"/>
              </button>
            ) : (
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-sm hover:bg-[#F59E0B] disabled:opacity-50" data-testid="builder-save">
                <Save className="w-4 h-4"/> {saving ? "Saving…" : "Save Character"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ children }) { return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>; }
function Field({ label, children }) {
  return <div><label className="block text-[10px] tracking-[0.3em] uppercase text-lantern mb-1.5">{label}</label>{children}</div>;
}
function Inp({ v, on, type = "text", placeholder, disabled, min, max }) {
  return <input type={type} value={v} onChange={(e) => on(e.target.value)} placeholder={placeholder} disabled={disabled} min={min} max={max}
    className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none disabled:opacity-70" />;
}
function Sel({ v, on, opts }) {
  return <select value={v} onChange={(e) => on(e.target.value)} className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none">
    {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>;
}
