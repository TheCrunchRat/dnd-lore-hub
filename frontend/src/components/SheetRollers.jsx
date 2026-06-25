import React, { useMemo, useState } from "react";
import { Dices, Shield, Zap, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import {
  abilityMod, profBonus, rollAndPost, SKILLS_5E, ABILITY_LABEL,
} from "../lib/dice";

/**
 * Sheet-roller panel.
 * Provides one-click rollers for:
 *  - Ability checks (1d20 + ability mod)
 *  - Saving throws (1d20 + ability mod + prof if proficient)
 *  - Initiative   (1d20 + DEX mod + any init modifier)
 *  - Skills       (1d20 + ability mod + prof if proficient, double if expert)
 *
 * `modTotals` is the same per-stat dict already computed by the sheet, so
 * modifier bonuses from magic-tree nodes flow into every roll automatically.
 *
 * Skills the PC is proficient in are read from `metadata.skill_profs`
 * (list of skill names). Experts are in `metadata.skill_experts`.
 */
function formatPoolToast(label, pool) {
  const breakdown = pool.rolls.map((r) => r.value).join(" + ");
  const modStr = pool.modifier ? (pool.modifier >= 0 ? ` + ${pool.modifier}` : ` − ${Math.abs(pool.modifier)}`) : "";
  const crit = pool.crit ? "  ✦ CRIT!" : (pool.fumble ? "  ☠ Fumble" : "");
  toast(`${label}: ${pool.total}`, { description: `${breakdown}${modStr}${crit}` });
}

export default function SheetRollers({ entry, modTotals }) {
  const m = entry?.metadata || {};
  const rawScores = m.ability_scores || {};
  const scores = useMemo(() => {
    return Object.fromEntries(
      Object.keys(ABILITY_LABEL).map((k) => [k, (rawScores[k] || 0) + (modTotals?.[k] || 0)])
    );
  }, [rawScores, modTotals]);

  const pb = profBonus(m.level);
  const saves = new Set(m.saving_throws || []);
  const skillProfs = new Set(m.skill_profs || []);
  const skillExperts = new Set(m.skill_experts || []);
  const [skillsOpen, setSkillsOpen] = useState(false);

  const rollAbility = async (key) => {
    const score = scores[key];
    if (score == null) { toast.error("No ability score set"); return; }
    const mod = abilityMod(score);
    const pool = await rollAndPost({
      pc: entry, label: `${ABILITY_LABEL[key]} check`, modifier: mod, kind: "ability",
    });
    formatPoolToast(`${ABILITY_LABEL[key]} check`, pool);
  };

  const rollSave = async (key) => {
    const score = scores[key];
    if (score == null) { toast.error("No ability score set"); return; }
    const isProf = saves.has(key) || saves.has(ABILITY_LABEL[key]);
    const mod = abilityMod(score) + (isProf ? pb : 0);
    const pool = await rollAndPost({
      pc: entry, label: `${ABILITY_LABEL[key]} save`, modifier: mod, kind: "save",
    });
    formatPoolToast(`${ABILITY_LABEL[key]} save`, pool);
  };

  const rollInit = async () => {
    const dex = scores.dex;
    if (dex == null) { toast.error("No DEX score set"); return; }
    const mod = abilityMod(dex) + (modTotals?.init || 0);
    const pool = await rollAndPost({
      pc: entry, label: "Initiative", modifier: mod, kind: "init",
    });
    formatPoolToast("Initiative", pool);
  };

  const rollSkill = async ({ name, ability }) => {
    const score = scores[ability];
    if (score == null) { toast.error(`No ${ABILITY_LABEL[ability]} score set`); return; }
    const isExpert = skillExperts.has(name);
    const isProf = skillProfs.has(name) || isExpert;
    const mod = abilityMod(score) + (isProf ? pb : 0) + (isExpert ? pb : 0);
    const pool = await rollAndPost({
      pc: entry, label: `${name} (${ABILITY_LABEL[ability].slice(0,3)})`, modifier: mod, kind: "skill",
    });
    formatPoolToast(`${name}`, pool);
  };

  return (
    <div className="lantern-card p-4 mb-6" data-testid="sheet-rollers">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs tracking-[0.3em] uppercase text-lantern inline-flex items-center gap-2">
          <Dices className="w-3.5 h-3.5" /> Rolls
        </div>
        <button
          onClick={rollInit}
          data-testid="roll-init"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-widest uppercase border border-rust text-lantern hover:bg-[#FBBF24]/[0.06] hover:border-[#FBBF24]/60"
        >
          <Zap className="w-3 h-3" /> Initiative
        </button>
      </div>

      {/* Ability check + Save grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        {Object.entries(ABILITY_LABEL).map(([key, label]) => {
          const score = scores[key];
          const mod = score != null ? abilityMod(score) : null;
          const isProf = saves.has(key) || saves.has(label);
          const saveMod = mod != null ? mod + (isProf ? pb : 0) : null;
          return (
            <div key={key} className="border border-rust p-2 flex items-center gap-2" data-testid={`roller-${key}`}>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] tracking-widest uppercase text-lantern">{label.slice(0,3)}</div>
                <div className="text-[10px] text-muted-bone">
                  Score {score ?? "—"} ({mod != null ? (mod >= 0 ? `+${mod}` : mod) : "—"})
                </div>
              </div>
              <button
                onClick={() => rollAbility(key)}
                data-testid={`roll-ability-${key}`}
                className="px-2 py-1 text-[10px] tracking-widest uppercase border border-rust text-bone hover:border-[#FBBF24]/60 hover:text-lantern"
                title={`Roll ${label} check (1d20${mod != null ? (mod >= 0 ? `+${mod}` : mod) : ""})`}
              >
                Check
              </button>
              <button
                onClick={() => rollSave(key)}
                data-testid={`roll-save-${key}`}
                className={`px-2 py-1 text-[10px] tracking-widest uppercase border inline-flex items-center gap-1 ${
                  isProf ? "border-[#FBBF24]/60 text-lantern bg-[#FBBF24]/[0.05]" : "border-rust text-bone hover:border-[#FBBF24]/60 hover:text-lantern"
                }`}
                title={`Roll ${label} save${isProf ? ` (proficient +${pb})` : ""} (1d20${saveMod != null ? (saveMod >= 0 ? `+${saveMod}` : saveMod) : ""})`}
              >
                {isProf && <Shield className="w-2.5 h-2.5" />} Save
              </button>
            </div>
          );
        })}
      </div>

      {/* Skills */}
      <div>
        <button
          onClick={() => setSkillsOpen((v) => !v)}
          data-testid="skills-toggle"
          className="w-full flex items-center justify-between px-2 py-2 text-[10px] tracking-widest uppercase text-muted-bone hover:text-lantern"
        >
          <span className="inline-flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> Skills · {skillProfs.size} proficient{skillExperts.size ? ` · ${skillExperts.size} expert` : ""}</span>
          {skillsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {skillsOpen && (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2" data-testid="skills-list">
            {SKILLS_5E.map((s) => {
              const score = scores[s.ability];
              const ab = score != null ? abilityMod(score) : null;
              const isExpert = skillExperts.has(s.name);
              const isProf = skillProfs.has(s.name) || isExpert;
              const total = ab != null ? ab + (isProf ? pb : 0) + (isExpert ? pb : 0) : null;
              return (
                <li key={s.name}>
                  <button
                    onClick={() => rollSkill(s)}
                    data-testid={`roll-skill-${s.name.replace(/\s+/g,"-").toLowerCase()}`}
                    className={`w-full flex items-center justify-between px-2 py-1.5 text-xs border transition-colors ${
                      isProf ? "border-[#FBBF24]/40 text-bone bg-[#FBBF24]/[0.03]" : "border-rust text-muted-bone hover:border-[#FBBF24]/40 hover:text-bone"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5 truncate">
                      {isProf && <Shield className="w-2.5 h-2.5 text-lantern shrink-0" />}
                      <span className="truncate">{s.name}</span>
                      <span className="text-[9px] tracking-widest uppercase text-muted-bone">{s.ability.toUpperCase()}</span>
                    </span>
                    <span className="font-mono text-bone">{total != null ? (total >= 0 ? `+${total}` : total) : "—"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
