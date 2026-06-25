import React, { useEffect, useMemo, useState } from "react";
import { Heart, Shield, Footprints, Sparkles, Sword, Zap } from "lucide-react";
import api from "../lib/api";
import { computeModifiers } from "../lib/statModifiers";
import ResourceBar from "./ResourceBar";
import SpellManager from "./SpellManager";
import RestManager from "./RestManager";
import CharacterTreeSections from "./CharacterTreeSections";

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

export default function CharacterSheet({ entry, canEdit = false, onUpdated }) {
  const m = entry?.metadata || {};
  const [trees, setTrees] = useState([]);
  useEffect(() => {
    api.get("/magic/trees").then((r) => setTrees(r.data || [])).catch(() => {});
  }, []);

  const { totals: modTotals, byStat } = useMemo(
    () => computeModifiers(entry, trees),
    [entry, trees]
  );

  if (m.role !== "PC") return null;
  const rawScores = m.ability_scores || {};
  const scores = Object.fromEntries(
    Object.entries(rawScores).map(([k, v]) => [k, (v || 0) + (modTotals[k] || 0)])
  );
  const pb = profBonus(m.level);
  const profs = new Set(m.proficiencies || []);
  const saves = new Set(m.saving_throws || []);

  const maxHp = (m.max_hp ?? null) === null ? null : (m.max_hp || 0) + (modTotals.hp || 0);
  const curHp = (m.current_hp ?? m.max_hp ?? null) === null
    ? null
    : Math.min(maxHp ?? 999, (m.current_hp ?? m.max_hp ?? 0) + (modTotals.hp || 0));
  const ac = (m.armor_class ?? null) === null ? null : (m.armor_class || 0) + (modTotals.ac || 0);
  const speedV = (m.speed ?? null) === null ? null : (m.speed || 0) + (modTotals.speed || 0);
  const initBonus = (rawScores.dex != null ? mod(scores.dex) : 0) + (modTotals.init || 0);

  return (
    <div className="mb-10" data-testid="character-sheet">
      <ResourceBar entry={entry} canEdit={canEdit} onUpdated={onUpdated} />
      <RestManager entry={entry} canEdit={canEdit} onUpdated={onUpdated} />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <StatBlock icon={Heart} label="HP" value={`${curHp ?? "—"} / ${maxHp ?? "—"}`} mod={modTotals.hp} sources={byStat.hp} />
        <StatBlock icon={Shield} label="AC" value={ac ?? "—"} mod={modTotals.ac} sources={byStat.ac} />
        <StatBlock icon={Footprints} label="Speed" value={speedV != null ? `${speedV} ft` : "—"} mod={modTotals.speed} sources={byStat.speed} />
        <StatBlock icon={Zap} label="Init" value={fmtMod(initBonus)} mod={modTotals.init} sources={byStat.init} />
        <StatBlock icon={Sparkles} label="Prof Bonus" value={`+${pb}`} />
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
        {ABILITIES.map((a) => {
          const score = scores[a.key];
          const baseScore = rawScores[a.key];
          const bonus = modTotals[a.key] || 0;
          const mv = score != null ? mod(score) : null;
          return (
            <div
              key={a.key}
              className="lantern-card p-3 text-center relative"
              data-testid={`sheet-ability-${a.key}`}
              title={bonus !== 0 && byStat[a.key]?.length
                ? `Base ${baseScore} ${bonus > 0 ? "+" : ""}${bonus} from:\n` + byStat[a.key].map((s) => ` · ${s.tree}: ${s.node} (${s.value > 0 ? "+" : ""}${s.value})`).join("\n")
                : undefined}
            >
              <div className="text-[10px] tracking-[0.3em] uppercase text-lantern">{a.label}</div>
              <div className="font-serif-display text-3xl text-bone leading-none my-1">{score ?? "—"}</div>
              <div className="text-xs text-muted-bone">{mv != null ? fmtMod(mv) : "—"}</div>
              {bonus !== 0 && (
                <div className={`absolute top-1 right-1 text-[9px] tracking-widest uppercase ${bonus > 0 ? "text-emerald-300" : "text-red-300"}`}>
                  {bonus > 0 ? "+" : ""}{bonus}
                </div>
              )}
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

      {((m.spells_known && m.spells_known.length > 0) || (m.origin_unlocks || []).some((u) => u.as_spell)) ? (
        <SpellManager entry={entry} canEdit={canEdit} onUpdated={onUpdated} />
      ) : null}

      <CharacterTreeSections entry={entry} canEdit={canEdit} onUpdated={onUpdated} />

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

function StatBlock({ icon: Icon, label, value, mod, sources }) {
  const hasMod = mod && mod !== 0;
  const title = hasMod && sources?.length
    ? `From:\n` + sources.map((s) => ` · ${s.tree}: ${s.node} (${s.value > 0 ? "+" : ""}${s.value})`).join("\n")
    : undefined;
  return (
    <div className="lantern-card p-4 text-center relative" title={title}>
      <Icon className="w-4 h-4 text-lantern mx-auto mb-1" strokeWidth={1.5} />
      <div className="text-[10px] tracking-[0.3em] uppercase text-muted-bone">{label}</div>
      <div className="font-serif-display text-2xl text-bone leading-none mt-1">{value}</div>
      {hasMod && (
        <div className={`absolute top-1 right-1 text-[9px] tracking-widest uppercase ${mod > 0 ? "text-emerald-300" : "text-red-300"}`}>
          {mod > 0 ? "+" : ""}{mod}
        </div>
      )}
    </div>
  );
}
