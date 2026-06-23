import React from "react";
import { Heart, Shield, Footprints, Sparkles, BookOpen, Sword } from "lucide-react";

const ABILITIES = [
  { key: "str", label: "STR" }, { key: "dex", label: "DEX" }, { key: "con", label: "CON" },
  { key: "int", label: "INT" }, { key: "wis", label: "WIS" }, { key: "cha", label: "CHA" },
];

const SKILL_ABILITIES = {
  "Acrobatics": "dex", "Animal Handling": "wis", "Arcana": "int", "Athletics": "str",
  "Deception": "cha", "History": "int", "Insight": "wis", "Intimidation": "cha",
  "Investigation": "int", "Medicine": "wis", "Nature": "int", "Perception": "wis",
  "Performance": "cha", "Persuasion": "cha", "Religion": "int", "Sleight of Hand": "dex",
  "Stealth": "dex", "Survival": "wis",
};

const mod = (s) => Math.floor((s - 10) / 2);
const fmtMod = (m) => (m >= 0 ? `+${m}` : `${m}`);
const profBonus = (level) => 2 + Math.floor((Math.max(1, level || 1) - 1) / 4);

export default function CharacterSheet({ entry }) {
  const m = entry?.metadata || {};
  if (m.role !== "PC") return null;
  const scores = m.ability_scores || {};
  const pb = profBonus(m.level);
  const profs = new Set(m.proficiencies || []);
  const saves = new Set(m.saving_throws || []);

  return (
    <div className="mb-10" data-testid="character-sheet">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatBlock icon={Heart} label="HP" value={`${m.current_hp ?? m.max_hp ?? "—"} / ${m.max_hp ?? "—"}`} />
        <StatBlock icon={Shield} label="AC" value={m.armor_class ?? "—"} />
        <StatBlock icon={Footprints} label="Speed" value={m.speed ? `${m.speed} ft` : "—"} />
        <StatBlock icon={Sparkles} label="Prof Bonus" value={`+${pb}`} />
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
        {ABILITIES.map((a) => {
          const score = scores[a.key];
          const mv = score != null ? mod(score) : null;
          return (
            <div key={a.key} className="lantern-card p-3 text-center" data-testid={`sheet-ability-${a.key}`}>
              <div className="text-[10px] tracking-[0.3em] uppercase text-lantern">{a.label}</div>
              <div className="font-serif-display text-3xl text-bone leading-none my-1">{score ?? "—"}</div>
              <div className="text-xs text-muted-bone">{mv != null ? fmtMod(mv) : "—"}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="lantern-card p-4">
          <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-3 inline-flex items-center gap-2"><Shield className="w-3.5 h-3.5"/> Saving Throws</div>
          <ul className="space-y-1 text-sm">
            {ABILITIES.map((a) => {
              const base = scores[a.key] != null ? mod(scores[a.key]) : 0;
              const total = base + (saves.has(a.key) ? pb : 0);
              return (
                <li key={a.key} className="flex items-center justify-between" data-testid={`sheet-save-${a.key}`}>
                  <span className={`text-bone ${saves.has(a.key) ? "" : "text-muted-bone"}`}>
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${saves.has(a.key) ? "bg-[#FBBF24]" : "bg-[#2C362F]"}`}></span>
                    {a.label}
                  </span>
                  <span className="font-mono text-bone">{scores[a.key] != null ? fmtMod(total) : "—"}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="lantern-card p-4">
          <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-3 inline-flex items-center gap-2"><Sparkles className="w-3.5 h-3.5"/> Skills</div>
          <ul className="space-y-1 text-sm max-h-72 overflow-y-auto pr-2">
            {Object.entries(SKILL_ABILITIES).map(([skill, ab]) => {
              const base = scores[ab] != null ? mod(scores[ab]) : 0;
              const total = base + (profs.has(skill) ? pb : 0);
              const has = profs.has(skill);
              return (
                <li key={skill} className="flex items-center justify-between" data-testid={`sheet-skill-${skill.replace(/\s+/g,"-")}`}>
                  <span className={`text-bone ${has ? "" : "text-muted-bone"}`}>
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${has ? "bg-[#FBBF24]" : "bg-[#2C362F]"}`}></span>
                    {skill} <span className="text-muted-bone text-[10px]">({ab.toUpperCase()})</span>
                  </span>
                  <span className="font-mono text-bone">{scores[ab] != null ? fmtMod(total) : "—"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {(m.spell_slots && Object.keys(m.spell_slots).length > 0) && (
        <div className="lantern-card p-4 mb-6">
          <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-3">Spell Slots</div>
          <div className="grid grid-cols-3 sm:grid-cols-9 gap-2">
            {Object.entries(m.spell_slots).sort(([a],[b]) => +a - +b).map(([lvl, s]) => (
              <div key={lvl} className="border border-rust p-2 text-center" data-testid={`sheet-slot-${lvl}`}>
                <div className="text-[10px] tracking-widest uppercase text-lantern">Lv {lvl}</div>
                <div className="font-serif-display text-xl text-bone">{(s.max || 0) - (s.used || 0)}<span className="text-muted-bone text-base">/{s.max || 0}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(m.spells_known && m.spells_known.length > 0) && (
        <div className="lantern-card p-4 mb-6">
          <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-3 inline-flex items-center gap-2"><BookOpen className="w-3.5 h-3.5"/> Spells</div>
          <div className="flex flex-wrap gap-1.5">
            {m.spells_known.map((s) => (
              <span key={s} className="text-xs border border-rust px-2 py-1 text-bone">{s}</span>
            ))}
          </div>
        </div>
      )}

      {(m.equipment && m.equipment.length > 0) && (
        <div className="lantern-card p-4 mb-6">
          <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-3 inline-flex items-center gap-2"><Sword className="w-3.5 h-3.5"/> Equipment</div>
          <ul className="text-sm text-bone columns-1 sm:columns-2 gap-x-6">
            {m.equipment.map((eq, i) => <li key={i} className="mb-1">· {eq}</li>)}
          </ul>
        </div>
      )}

      {(m.features && m.features.length > 0) && (
        <div className="lantern-card p-4 mb-6">
          <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-3">Features & Traits</div>
          <ul className="text-sm text-bone space-y-1">
            {m.features.map((f, i) => <li key={i}>· {f}</li>)}
          </ul>
        </div>
      )}

      {(m.languages && m.languages.length > 0) && (
        <div className="text-xs text-muted-bone mb-6" data-testid="sheet-languages">
          <span className="text-lantern tracking-widest uppercase mr-2">Languages</span>
          {m.languages.join(", ")}
        </div>
      )}
    </div>
  );
}

function StatBlock({ icon: Icon, label, value }) {
  return (
    <div className="lantern-card p-4 text-center">
      <Icon className="w-4 h-4 text-lantern mx-auto mb-1" strokeWidth={1.5} />
      <div className="text-[10px] tracking-[0.3em] uppercase text-muted-bone">{label}</div>
      <div className="font-serif-display text-2xl text-bone leading-none mt-1">{value}</div>
    </div>
  );
}
