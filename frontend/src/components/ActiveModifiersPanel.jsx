import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, Sparkles, Lock } from "lucide-react";
import { computeModifiers, STAT_KEYS } from "../lib/statModifiers";

/**
 * Visible breakdown of every stat modifier currently applied to the PC, with
 * the source node and tree. Companion to the inline +/- badges and the title
 * tooltips on the StatBlocks/ability boxes — gives a single place to audit
 * "where does my +3 STR come from?".
 *
 * Pending modifiers (gated by level_required > pc.level) are listed in a
 * collapsed "Upcoming" section so players can see what they're working toward.
 */
const STAT_LABEL = {
  str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
  hp: "HP", ac: "AC", speed: "Speed", init: "Init",
};

export default function ActiveModifiersPanel({ entry, trees }) {
  const [expanded, setExpanded] = useState(false);
  const m = entry?.metadata || {};
  const pcLevel = Math.max(1, m.level || 1);

  // Active modifiers
  const { totals, byStat } = useMemo(() => computeModifiers(entry, trees), [entry, trees]);

  // Pending (gated) modifiers: same scan but only those above current level
  const pending = useMemo(() => {
    const out = [];
    if (!entry || !trees || trees.length === 0) return out;
    const treeMap = Object.fromEntries(trees.map((t) => [t.id, t]));

    const collect = (treeId, nodeId) => {
      const t = treeMap[treeId]; if (!t) return;
      const n = (t.nodes || []).find((x) => x.id === nodeId); if (!n) return;
      const gate = n.level_required || 0;
      if (gate <= pcLevel) return;
      if (!Array.isArray(n.modifiers) || n.modifiers.length === 0) return;
      for (const mm of n.modifiers) {
        out.push({ stat: mm.stat, value: mm.value, tree: t, node: n, levelGate: gate });
      }
    };
    for (const u of (m.origin_unlocks || [])) collect(u.tree_id, u.node_id);
    for (const u of (m.foundation_unlocks || [])) collect(u.tree_id, u.node_id);
    if (m.class_tree_id) {
      const t = treeMap[m.class_tree_id];
      if (t) for (const n of (t.nodes || [])) {
        const gate = n.level_required || 0;
        if (gate <= pcLevel || !Array.isArray(n.modifiers)) continue;
        for (const mm of n.modifiers) out.push({ stat: mm.stat, value: mm.value, tree: t, node: n, levelGate: gate });
      }
    }
    out.sort((a, b) => a.levelGate - b.levelGate);
    return out;
  }, [entry, trees, m, pcLevel]);

  const activeCount = STAT_KEYS.reduce((n, k) => n + (byStat[k] || []).length, 0);
  if (activeCount === 0 && pending.length === 0) return null;

  return (
    <div className="lantern-card mb-6" data-testid="active-modifiers-panel">
      <button
        onClick={() => setExpanded((v) => !v)}
        data-testid="active-modifiers-toggle"
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#FBBF24]/[0.03]"
      >
        <div className="inline-flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-lantern" />
          <span className="text-xs tracking-[0.3em] uppercase text-lantern">Active Modifiers</span>
          <span className="text-[10px] tracking-widest uppercase text-muted-bone ml-1">
            · {activeCount} active{pending.length > 0 ? ` · ${pending.length} pending` : ""}
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-bone" /> : <ChevronDown className="w-4 h-4 text-muted-bone" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {activeCount > 0 && (
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-muted-bone mb-2">Affecting your stats now</div>
              <ul className="space-y-1.5">
                {STAT_KEYS.filter((k) => (byStat[k] || []).length > 0).map((k) => (
                  <li key={k} className="text-xs" data-testid={`modifier-group-${k}`}>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-[10px] tracking-widest uppercase text-lantern w-12">{STAT_LABEL[k]}</span>
                      <span className={`font-mono ${totals[k] > 0 ? "text-emerald-300" : "text-red-300"}`}>
                        {totals[k] > 0 ? "+" : ""}{totals[k]}
                      </span>
                      <span className="text-muted-bone text-[10px]">total</span>
                    </div>
                    <ul className="pl-14 space-y-0.5">
                      {byStat[k].map((s, i) => (
                        <li key={i} className="text-[11px] text-muted-bone flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color || "#FBBF24" }} />
                          <span className="text-bone">{s.tree}</span>
                          <span>·</span>
                          <span>{s.node}</span>
                          <span className={`ml-auto font-mono ${s.value > 0 ? "text-emerald-300" : "text-red-300"}`}>
                            {s.value > 0 ? "+" : ""}{s.value}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pending.length > 0 && (
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-muted-bone mb-2 inline-flex items-center gap-1">
                <Lock className="w-3 h-3" /> Unlocks at higher levels
              </div>
              <ul className="space-y-1">
                {pending.map((p, i) => (
                  <li key={i} className="text-[11px] flex items-center gap-2" data-testid={`pending-modifier-${i}`}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.tree.accent_color || "#FBBF24" }} />
                    <span className="text-bone">{p.tree.name}</span>
                    <span className="text-muted-bone">·</span>
                    <Link to={`/magic/${p.tree.slug}?node=${p.node.id}`} className="text-muted-bone hover:text-lantern">
                      {p.node.name}
                    </Link>
                    <span className="text-red-400/80 text-[9px] tracking-widest uppercase ml-1">Lv {p.levelGate}</span>
                    <span className={`ml-auto font-mono ${p.value > 0 ? "text-emerald-300" : "text-red-300"}`}>
                      {p.value > 0 ? "+" : ""}{p.value} {STAT_LABEL[p.stat]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
