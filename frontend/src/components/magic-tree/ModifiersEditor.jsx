import React from "react";
import { Plus, Trash2 } from "lucide-react";

const STATS = [
  { key: "str", label: "STR" }, { key: "dex", label: "DEX" }, { key: "con", label: "CON" },
  { key: "int", label: "INT" }, { key: "wis", label: "WIS" }, { key: "cha", label: "CHA" },
  { key: "hp",  label: "HP"  }, { key: "ac",  label: "AC"  },
  { key: "speed", label: "Speed" }, { key: "init", label: "Init" },
];

/**
 * Editor for the `modifiers` list on a magic-tree node. Each row is
 * `{stat, value}`; when the node is unlocked the values are summed into the
 * PC's stats via `computeModifiers`. Pure UI, no API calls.
 */
export default function ModifiersEditor({ node, onChange }) {
  const mods = node.modifiers || [];
  const update = (i, patch) => {
    const next = mods.map((m, j) => j === i ? { ...m, ...patch } : m);
    onChange({ modifiers: next });
  };
  const add = () => onChange({ modifiers: [...mods, { stat: "str", value: 1 }] });
  const remove = (i) => onChange({ modifiers: mods.filter((_, j) => j !== i) });

  return (
    <div className="border border-rust p-3 mb-4" data-testid="node-modifiers">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] tracking-[0.25em] uppercase text-lantern">Stat Modifiers</span>
        <button onClick={add} data-testid="add-modifier"
          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] tracking-widest uppercase border border-rust text-bone hover:border-[#FBBF24]/50 hover:text-lantern">
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
      {mods.length === 0 ? (
        <div className="text-[11px] text-muted-bone italic">No modifiers. Add one to grant a bonus or penalty when this node is unlocked.</div>
      ) : (
        <ul className="space-y-1.5">
          {mods.map((m, i) => (
            <li key={i} className="flex items-center gap-2" data-testid={`modifier-row-${i}`}>
              <select value={m.stat} onChange={(e) => update(i, { stat: e.target.value })}
                data-testid={`modifier-stat-${i}`}
                className="px-2 py-1 bg-[#0B0E0C] border border-rust text-bone text-sm flex-1">
                {STATS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <input type="number" value={m.value ?? 0}
                onChange={(e) => update(i, { value: parseInt(e.target.value || "0", 10) })}
                data-testid={`modifier-value-${i}`}
                className="w-16 px-2 py-1 bg-[#0B0E0C] border border-rust text-bone text-sm font-mono text-center" />
              <button onClick={() => remove(i)} data-testid={`modifier-remove-${i}`} className="p-1 text-muted-bone hover:text-red-400">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
