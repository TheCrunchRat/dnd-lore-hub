import React, { useEffect, useMemo, useState } from "react";
import { Heart, Shield, Footprints, Sparkles, Sword, Zap } from "lucide-react";
import api from "../lib/api";
import { computeModifiers } from "../lib/statModifiers";
import { effectivePage, blockConfig, useRealmLayout } from "../lib/layouts";
import ResourceBar from "./ResourceBar";
import SpellManager from "./SpellManager";
import RestManager from "./RestManager";
import CharacterTreeSections from "./CharacterTreeSections";
import ActiveModifiersPanel from "./ActiveModifiersPanel";
import SheetRollers from "./SheetRollers";
import ImageUploader from "./ImageUploader";

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

const PORTRAIT_DIM = { small: "w-24 h-24", medium: "w-32 h-32 sm:w-40 sm:h-40", large: "w-48 h-48 sm:w-56 sm:h-56" };

const mod = (s) => Math.floor((s - 10) / 2);
const fmtMod = (m) => (m >= 0 ? `+${m}` : `${m}`);
const profBonus = (level) => 2 + Math.floor((Math.max(1, level || 1) - 1) / 4);

export default function CharacterSheet({ entry, canEdit = false, onUpdated, equipNode = null, contentNode = null }) {
  const m = entry?.metadata || {};
  const [trees, setTrees] = useState([]);
  const { layout } = useRealmLayout();
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

  // --- One render function per block key ----------------------------------
  const portraitSize = blockConfig(layout, "character_sheet", "portrait", { size: "medium" }).size;
  const renderBlock = (k) => {
    switch (k) {
      case "portrait":
        return (
          <div className="lantern-card vine-frame p-4 sm:p-6 mb-6" style={{ borderColor: "#FBBF2455" }} data-testid="character-portrait-frame">
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <CharacterPortrait entry={entry} canEdit={canEdit} onUpdated={onUpdated} size={portraitSize} />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] tracking-[0.3em] uppercase text-lantern">
                  {m.race || m.class ? `${m.race || ""}${m.race && m.class ? " · " : ""}${m.class || ""}` : "Player Character"}
                  {m.level ? ` · Level ${m.level}` : ""}
                </div>
                <h2 className="font-serif-display text-3xl sm:text-4xl text-bone leading-tight mt-1">{entry.title}</h2>
                {entry.subtitle && <div className="text-sm text-muted-bone italic mt-1">{entry.subtitle}</div>}
                {m.alignment && <div className="text-[10px] tracking-widest uppercase text-muted-bone mt-2">{m.alignment}</div>}
              </div>
            </div>
          </div>
        );
      case "equip":
        return equipNode ? <div className="mb-6" data-testid="block-equip">{equipNode}</div> : null;
      case "resources":
        return <ResourceBar entry={entry} canEdit={canEdit} onUpdated={onUpdated} />;
      case "rest":
        return <RestManager entry={entry} canEdit={canEdit} onUpdated={onUpdated} />;
      case "modifiers":
        return <ActiveModifiersPanel entry={entry} trees={trees} />;
      case "rollers":
        return <SheetRollers entry={entry} modTotals={modTotals} />;
      case "stats":
        return (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6" data-testid="block-stats">
            <StatBlock icon={Heart} label="HP" value={`${curHp ?? "—"} / ${maxHp ?? "—"}`} mod={modTotals.hp} sources={byStat.hp} />
            <StatBlock icon={Shield} label="AC" value={ac ?? "—"} mod={modTotals.ac} sources={byStat.ac} />
            <StatBlock icon={Footprints} label="Speed" value={speedV != null ? `${speedV} ft` : "—"} mod={modTotals.speed} sources={byStat.speed} />
            <StatBlock icon={Zap} label="Init" value={fmtMod(initBonus)} mod={modTotals.init} sources={byStat.init} />
            <StatBlock icon={Sparkles} label="Prof Bonus" value={`+${pb}`} />
          </div>
        );
      case "abilities":
        return (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6" data-testid="block-abilities">
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
        );
      case "saves_skills":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6" data-testid="block-saves-skills">
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
        );
      case "spells":
        if (!((m.spells_known && m.spells_known.length > 0) || (m.origin_unlocks || []).some((u) => u.as_spell))) return null;
        return <SpellManager entry={entry} canEdit={canEdit} onUpdated={onUpdated} />;
      case "treesections":
        return <CharacterTreeSections entry={entry} canEdit={canEdit} onUpdated={onUpdated} />;
      case "gear": {
        const hasEq = (m.equipment && m.equipment.length > 0);
        const hasFt = (m.features && m.features.length > 0);
        const hasLang = (m.languages && m.languages.length > 0);
        if (!hasEq && !hasFt && !hasLang) return null;
        return (
          <div data-testid="block-gear">
            {hasEq && (
              <div className="lantern-card p-4 mb-6">
                <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-3 inline-flex items-center gap-2"><Sword className="w-3.5 h-3.5"/> Equipment</div>
                <ul className="text-sm text-bone columns-1 sm:columns-2 gap-x-6">
                  {m.equipment.map((eq, i) => <li key={i} className="mb-1">· {eq}</li>)}
                </ul>
              </div>
            )}
            {hasFt && (
              <div className="lantern-card p-4 mb-6">
                <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-3">Features & Traits</div>
                <ul className="text-sm text-bone space-y-1">
                  {m.features.map((f, i) => <li key={i}>· {f}</li>)}
                </ul>
              </div>
            )}
            {hasLang && (
              <div className="text-xs text-muted-bone mb-6" data-testid="sheet-languages">
                <span className="text-lantern tracking-widest uppercase mr-2">Languages</span>
                {m.languages.join(", ")}
              </div>
            )}
          </div>
        );
      }
      case "content":
        return contentNode ? <div className="mb-6" data-testid="block-content">{contentNode}</div> : null;
      default:
        return null;
    }
  };

  const page = effectivePage(layout, "character_sheet");
  const renderSlot = (slot) => slot.map((k) => {
    const node = renderBlock(k);
    return node ? <React.Fragment key={k}>{node}</React.Fragment> : null;
  });

  const hasRight = (page.right?.length || 0) > 0;

  return (
    <div className="mb-10" data-testid="character-sheet">
      {hasRight ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <div>{renderSlot(page.left)}</div>
          <div>{renderSlot(page.right)}</div>
        </div>
      ) : (
        renderSlot(page.left)
      )}
    </div>
  );
}

function StatBlock({ icon: Icon, label, value, mod, sources }) {
  const hasMod = Boolean(mod);
  const title = hasMod && sources?.length
    ? `From:\n` + sources.map((s) => ` · ${s.tree}: ${s.node} (${s.value > 0 ? "+" : ""}${s.value})`).join("\n")
    : undefined;
  return (
    <div className="lantern-card p-4 text-center relative" title={title}>
      <Icon className="w-4 h-4 text-lantern mx-auto mb-1" strokeWidth={1.5} />
      <div className="text-[10px] tracking-[0.3em] uppercase text-muted-bone">{label}</div>
      <div className="font-serif-display text-2xl text-bone leading-none mt-1">{value}</div>
      {hasMod ? (
        <div className={`absolute top-1 right-1 text-[9px] tracking-widest uppercase ${mod > 0 ? "text-emerald-300" : "text-red-300"}`}>
          {mod > 0 ? "+" : ""}{mod}
        </div>
      ) : null}
    </div>
  );
}

function CharacterPortrait({ entry, canEdit, onUpdated, size = "medium" }) {
  const m = entry?.metadata || {};
  const portrait = m.portrait_url || entry.image_url || "";
  const [uploading, setUploading] = useState(false);

  const persist = async (newPortrait) => {
    setUploading(true);
    try {
      const payload = {
        name: entry.title,
        player_name: m.owner || m.player_name || entry.title,
        ...m,
        portrait_url: newPortrait,
      };
      const { data } = await api.put(`/pcs/${entry.id}`, payload);
      onUpdated?.(data);
    } finally { setUploading(false); }
  };

  const dim = PORTRAIT_DIM[size] || PORTRAIT_DIM.medium;

  return (
    <div className="shrink-0 relative" data-testid="character-portrait">
      <div
        className={`${dim} border-2 border-[#FBBF24]/40 overflow-hidden flex items-center justify-center bg-[#0B0E0C]`}
        style={{ boxShadow: "0 0 24px rgba(251, 191, 36, 0.10), inset 0 0 0 4px rgba(251,191,36,0.08)" }}
      >
        {portrait ? (
          <img src={portrait} alt={entry.title} className="w-full h-full object-cover" />
        ) : (
          <div className="text-center px-2">
            <div className="text-3xl font-serif-display text-muted-bone">{(entry.title || "?").slice(0, 1).toUpperCase()}</div>
            <div className="text-[9px] tracking-widest uppercase text-muted-bone mt-1">No portrait</div>
          </div>
        )}
      </div>
      {canEdit && (
        <div className="mt-2 flex flex-col gap-1">
          <ImageUploader
            value=""
            onUploaded={(url) => persist(url)}
            compact
            testid="upload-portrait"
          />
          {portrait && (
            <button
              onClick={() => persist("")}
              data-testid="clear-portrait"
              disabled={uploading}
              className="text-[9px] tracking-widest uppercase text-muted-bone hover:text-red-400 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}
