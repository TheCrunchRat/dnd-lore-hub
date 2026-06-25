import React from "react";
import * as Icons from "lucide-react";
import { X, Plus, Minus, Trash2, Lock } from "lucide-react";
import { ICON_OPTIONS } from "./constants";

/**
 * Side-panel editor / viewer for a single skill-tree node.
 *  - Always shows: rank progression, description, per-rank effects, level requirement badge.
 *  - Edit mode adds: name input, description editor, max-rank, tier size, color, icon picker,
 *    position numeric inputs, link-to / delete buttons.
 */
export default function NodeEditor({
  node,
  accent,
  editMode,
  tree,
  onChange,
  onDelete,
  onStartLink,
  linkingFromId,
  onClose,
  onCycleRank,
}) {
  const Icon = Icons[node.icon] || Icons.Sparkles;
  const parents = tree.nodes.filter((n) => node.requires.includes(n.id));
  const maxRank = Math.max(1, node.max_rank || 1);
  const curRank = Math.max(0, Math.min(maxRank, node.current_rank || 0));
  const nodeColor = node.color || accent;

  return (
    <div data-testid={`node-editor-${node.id}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border flex items-center justify-center" style={{ borderColor: nodeColor }}>
            <Icon size={18} style={{ color: nodeColor }} strokeWidth={1.5} />
          </div>
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: nodeColor }}>Ability</div>
            {editMode ? (
              <input
                value={node.name}
                onChange={(e) => onChange({ name: e.target.value })}
                data-testid="edit-node-name"
                className="font-serif-display text-xl text-bone bg-transparent border-b border-rust focus:border-[#FBBF24] focus:outline-none"
              />
            ) : (
              <h3 className="font-serif-display text-xl text-bone">{node.name}</h3>
            )}
          </div>
        </div>
        <button onClick={onClose} data-testid="close-node-panel" className="p-1 text-muted-bone hover:text-bone">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Rank progression — available to everyone (player and DM) */}
      <div className="lantern-card p-3 mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] tracking-[0.3em] uppercase text-lantern">Rank</span>
          <div className="flex gap-1">
            {Array.from({ length: maxRank }).map((_, i) => (
              <span
                key={i}
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: i < curRank ? nodeColor : "transparent", border: `1px solid ${nodeColor}` }}
              />
            ))}
          </div>
          <span className="text-sm text-bone ml-1">{curRank}/{maxRank}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onCycleRank(-1)}
            data-testid="rank-minus"
            className="p-1.5 border border-rust text-muted-bone hover:text-bone disabled:opacity-30"
            disabled={curRank === 0}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onCycleRank(+1)}
            data-testid="rank-plus"
            className="p-1.5 border border-rust text-muted-bone hover:text-lantern disabled:opacity-30"
            disabled={curRank === maxRank}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {editMode ? (
        <textarea
          rows={4}
          value={node.description}
          onChange={(e) => onChange({ description: e.target.value })}
          data-testid="edit-node-description"
          className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y text-sm leading-relaxed mb-4"
        />
      ) : (
        <p className="text-sm text-bone leading-relaxed mb-4">
          {node.description || <span className="text-muted-bone italic">No description yet.</span>}
        </p>
      )}

      {/* Per-rank descriptions */}
      {((node.rank_descriptions && node.rank_descriptions.length) || editMode) && (
        <div className="mb-4">
          <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">Per-rank effect</div>
          {editMode ? (
            <textarea
              rows={Math.max(2, maxRank)}
              value={(node.rank_descriptions || []).join("\n")}
              onChange={(e) => onChange({ rank_descriptions: e.target.value.split("\n") })}
              placeholder={"One line per rank — e.g.\nRank 1: +1 to attack\nRank 2: +2 to attack\n…"}
              className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y text-sm"
            />
          ) : (
            <ol className="space-y-1 text-sm">
              {(node.rank_descriptions || []).map((rd, i) => (
                <li key={i} className={`flex items-start gap-2 ${i < curRank ? "text-bone" : "text-muted-bone"}`}>
                  <span className={`text-[10px] tracking-widest uppercase mt-1 ${i < curRank ? "text-lantern" : "text-muted-bone"}`}>
                    R{i + 1}
                  </span>
                  <span>{rd}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Level requirement */}
      {(node.level_required || editMode) && (
        <div className="mb-4">
          <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-1.5">Level requirement</div>
          {editMode ? (
            <input
              type="number" min={1} max={20}
              value={node.level_required || ""}
              onChange={(e) => onChange({ level_required: e.target.value ? parseInt(e.target.value, 10) : null })}
              data-testid="edit-level-required"
              placeholder="None"
              className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          ) : (
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-[#FBBF24]/40 bg-[#FBBF24]/5 text-lantern text-xs tracking-widest uppercase"
              data-testid="level-req-badge"
            >
              <Lock className="w-3.5 h-3.5" /> Requires Level {node.level_required}
            </div>
          )}
        </div>
      )}

      {editMode && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-1.5">Max rank (1-5)</div>
              <input
                type="number" min={1} max={5}
                value={maxRank}
                onChange={(e) => onChange({ max_rank: Math.max(1, Math.min(5, parseInt(e.target.value || "1", 10))) })}
                data-testid="edit-max-rank"
                className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
              />
            </div>
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-1.5">Node size</div>
              <select
                value={node.tier_size || "normal"}
                onChange={(e) => onChange({ tier_size: e.target.value })}
                data-testid="edit-tier-size"
                className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
              >
                <option value="small">Small</option>
                <option value="normal">Normal</option>
                <option value="large">Large (keystone)</option>
                <option value="huge">Huge (capstone)</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-1.5">Node color (override)</div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={node.color || accent}
                onChange={(e) => onChange({ color: e.target.value })}
                className="w-12 h-9 bg-transparent border border-rust cursor-pointer"
              />
              <input
                type="text"
                value={node.color || ""}
                onChange={(e) => onChange({ color: e.target.value || null })}
                placeholder="(uses tree accent)"
                className="flex-1 px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none font-mono text-xs"
              />
              {node.color && (
                <button
                  onClick={() => onChange({ color: null })}
                  className="text-[10px] uppercase tracking-widest text-muted-bone hover:text-bone"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">Icon</div>
          <div className="grid grid-cols-8 gap-1 mb-4 max-h-32 overflow-y-auto" data-testid="icon-picker">
            {ICON_OPTIONS.map((name) => {
              const I = Icons[name] || Icons.Sparkles;
              const active = node.icon === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onChange({ icon: name })}
                  title={name}
                  data-testid={`icon-${name}`}
                  className={`p-1.5 border ${active ? "border-[#FBBF24] bg-[#FBBF24]/10" : "border-rust hover:border-[#FBBF24]/40"}`}
                >
                  <I size={16} style={{ color: active ? nodeColor : "#9CA3AF" }} strokeWidth={1.5} />
                </button>
              );
            })}
          </div>

          <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">Position</div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <NumInput label="X" value={node.x} onChange={(v) => onChange({ x: Math.max(0, Math.min(1, v)) })} step={0.01} />
            <NumInput label="Y" value={node.y} onChange={(v) => onChange({ y: Math.max(0, Math.min(1, v)) })} step={0.01} />
          </div>

          <div className="flex gap-2 mb-4">
            <button
              onClick={onStartLink}
              data-testid="start-link-btn"
              className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs tracking-widest uppercase border ${
                linkingFromId === node.id
                  ? "border-[#FBBF24] text-lantern bg-[#FBBF24]/10"
                  : "border-rust text-bone hover:border-[#FBBF24]/50"
              }`}
            >
              {linkingFromId === node.id ? "Cancel" : "Link to…"}
            </button>
            <button
              onClick={onDelete}
              data-testid="delete-node-btn"
              className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs tracking-widest uppercase border border-rust text-muted-bone hover:text-red-400 hover:border-red-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ---- Spell fields ---- */}
          <SpellFields node={node} onChange={onChange} />

          {/* ---- Stat modifiers ---- */}
          <ModifiersEditor node={node} onChange={onChange} />
        </>
      )}

      {parents.length > 0 && (
        <>
          <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">Requires</div>
          <div className="flex flex-wrap gap-1.5">
            {parents.map((p) => (
              <span
                key={p.id}
                className="text-xs uppercase tracking-wider border border-rust px-2 py-1 text-bone"
              >
                {p.name}
              </span>
            ))}
          </div>
        </>
      )}

      {/* View-mode spell info */}
      {!editMode && node.spell_level !== null && node.spell_level !== undefined && (
        <div className="mt-4 lantern-card p-3" style={{ borderColor: `${nodeColor}55` }} data-testid="node-spell-summary">
          <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-1.5 inline-flex items-center gap-2">
            <Icons.Sparkles className="w-3 h-3" />
            Also a spell · {node.spell_level === 0 ? "Cantrip" : `Lv ${node.spell_level}`}
            {node.school ? ` · ${node.school}` : ""}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-bone">
            {node.casting_time && <div><span className="text-lantern/70 mr-1">Cast:</span>{node.casting_time}</div>}
            {node.spell_range && <div><span className="text-lantern/70 mr-1">Range:</span>{node.spell_range}</div>}
            {node.components && <div><span className="text-lantern/70 mr-1">Comp:</span>{node.components}</div>}
            {node.duration && <div><span className="text-lantern/70 mr-1">Dur:</span>{node.duration}</div>}
          </div>
        </div>
      )}

      {/* View-mode modifier badges */}
      {!editMode && (node.modifiers || []).length > 0 && (
        <div className="mt-3" data-testid="node-modifiers-summary">
          <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-1.5">Grants</div>
          <div className="flex flex-wrap gap-1.5">
            {node.modifiers.map((m, i) => (
              <span key={i}
                className={`text-[11px] px-2 py-0.5 border ${
                  m.value > 0 ? "border-emerald-400/40 text-emerald-300" : "border-red-400/40 text-red-300"
                }`}>
                {m.value > 0 ? "+" : ""}{m.value} {String(m.stat || "").toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const STATS = [
  { key: "str", label: "STR" }, { key: "dex", label: "DEX" }, { key: "con", label: "CON" },
  { key: "int", label: "INT" }, { key: "wis", label: "WIS" }, { key: "cha", label: "CHA" },
  { key: "hp", label: "HP" }, { key: "ac", label: "AC" }, { key: "speed", label: "Speed" }, { key: "init", label: "Init" },
];
const SCHOOLS = ["", "Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"];

function SpellFields({ node, onChange }) {
  const enabled = node.spell_level !== null && node.spell_level !== undefined;
  return (
    <div className="border border-rust p-3 mb-4" data-testid="node-spell-fields">
      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked
            ? { spell_level: 0, casting_time: node.casting_time || "1 action" }
            : { spell_level: null }
          )}
          data-testid="toggle-as-spell"
          className="accent-[#FBBF24]"
        />
        <span className="text-[11px] tracking-[0.25em] uppercase text-lantern">Also publish as a spell</span>
      </label>
      {enabled && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] tracking-widest uppercase text-muted-bone">Spell Level</span>
              <select value={node.spell_level ?? 0} onChange={(e) => onChange({ spell_level: parseInt(e.target.value, 10) })}
                data-testid="node-spell-level"
                className="px-2 py-1.5 bg-[#0B0E0C] border border-rust text-bone text-sm">
                {[0,1,2,3,4,5,6,7,8,9].map((l) => <option key={l} value={l}>{l === 0 ? "Cantrip" : `Lv ${l}`}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] tracking-widest uppercase text-muted-bone">School</span>
              <select value={node.school || ""} onChange={(e) => onChange({ school: e.target.value })}
                data-testid="node-school"
                className="px-2 py-1.5 bg-[#0B0E0C] border border-rust text-bone text-sm">
                {SCHOOLS.map((s) => <option key={s} value={s}>{s || "—"}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <TinyInput label="Casting Time" v={node.casting_time} on={(v) => onChange({ casting_time: v })} placeholder="1 action" />
            <TinyInput label="Range" v={node.spell_range} on={(v) => onChange({ spell_range: v })} placeholder="60 feet" />
            <TinyInput label="Components" v={node.components} on={(v) => onChange({ components: v })} placeholder="V, S" />
            <TinyInput label="Duration" v={node.duration} on={(v) => onChange({ duration: v })} placeholder="Instantaneous" />
          </div>
          <TinyInput
            label="Available to classes (comma sep)"
            v={(node.spell_classes || []).join(", ")}
            on={(v) => onChange({ spell_classes: v.split(",").map((s) => s.trim()).filter(Boolean) })}
            placeholder="Wizard, Sorcerer"
          />
        </>
      )}
    </div>
  );
}

function ModifiersEditor({ node, onChange }) {
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

function TinyInput({ label, v, on, placeholder }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] tracking-widest uppercase text-muted-bone">{label}</span>
      <input value={v || ""} onChange={(e) => on(e.target.value)} placeholder={placeholder}
        className="px-2 py-1.5 bg-[#0B0E0C] border border-rust text-bone text-sm" />
    </label>
  );
}

function NumInput({ label, value, onChange, step = 0.01 }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] tracking-[0.3em] uppercase text-muted-bone">{label}</span>
      <input
        type="number"
        min={0}
        max={1}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value || "0"))}
        className="px-2 py-1.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none text-sm font-mono"
      />
    </label>
  );
}
