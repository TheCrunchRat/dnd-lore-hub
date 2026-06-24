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
    </div>
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
