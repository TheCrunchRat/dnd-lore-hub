import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Minus, Settings2, X, Save, Flame, Trash2 } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";

/**
 * Multi-resource bar for a PC (mana / sorcery points / wickfire / lantern charges / …).
 *
 * Data shape on `entry.metadata`:
 *   resources: [{ id, name, max, current, color }]
 *
 * Backwards compatibility: if `metadata.resources` is absent but the legacy
 * single-resource fields (`resource_name` + `resource_max`) exist, we
 * synthesise a one-item list on read. On the first save we persist as a real
 * `resources` array; the legacy fields stay untouched until explicitly cleared.
 */
const newId = () => `r-${Math.random().toString(36).slice(2, 9)}`;

const readResources = (m) => {
  if (Array.isArray(m.resources) && m.resources.length > 0) {
    return m.resources.map((r, i) => ({
      id: r.id || `r-${i}`,
      name: r.name || "Resource",
      max: Number.isFinite(r.max) ? r.max : 0,
      current: Number.isFinite(r.current) ? r.current : (r.max || 0),
      color: r.color || "#FBBF24",
    }));
  }
  if (m.resource_name) {
    return [{
      id: "legacy",
      name: m.resource_name,
      max: Number.isFinite(m.resource_max) ? m.resource_max : 0,
      current: Number.isFinite(m.resource_current) ? m.resource_current : (m.resource_max || 0),
      color: m.resource_color || "#FBBF24",
    }];
  }
  return [];
};

export default function ResourceBar({ entry, canEdit, onUpdated }) {
  const m = entry?.metadata || {};
  const resources = useMemo(() => readResources(m), [m]);
  const [editing, setEditing] = useState(null); // resource object being edited, or {} for new

  const persistResources = async (next, opts = {}) => {
    try {
      const payload = {
        name: entry.title,
        player_name: m.owner || m.player_name || entry.title,
        ...m,
        resources: next,
      };
      // Clear legacy single-resource fields once we move to the array form
      if (next.length > 0 && m.resource_name) {
        payload.resource_name = "";
        payload.resource_max = null;
        payload.resource_current = null;
        payload.resource_color = "";
      }
      const { data } = await api.put(`/pcs/${entry.id}`, payload);
      onUpdated?.(data);
      if (opts.toast) toast.success(opts.toast);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const stepResource = (rid, delta) => {
    const next = resources.map((r) => r.id === rid
      ? { ...r, current: Math.max(0, Math.min(r.max, (r.current || 0) + delta)) }
      : r);
    persistResources(next);
  };

  const saveEdit = (draft) => {
    const cleaned = {
      id: draft.id || newId(),
      name: (draft.name || "Resource").trim(),
      max: Math.max(1, parseInt(draft.max || 1, 10)),
      current: Math.max(0, Math.min(parseInt(draft.max || 1, 10), parseInt(draft.current ?? draft.max, 10))),
      color: draft.color || "#FBBF24",
    };
    const exists = resources.some((r) => r.id === cleaned.id);
    const next = exists
      ? resources.map((r) => r.id === cleaned.id ? cleaned : r)
      : [...resources, cleaned];
    persistResources(next, { toast: exists ? "Resource updated" : "Resource added" });
    setEditing(null);
  };

  const removeResource = (rid) => {
    const next = resources.filter((r) => r.id !== rid);
    persistResources(next, { toast: "Resource removed" });
    setEditing(null);
  };

  if (resources.length === 0 && !canEdit) return null;

  return (
    <div className="space-y-2 mb-6" data-testid="resource-bars">
      {resources.map((r) => (
        <ResourceRow
          key={r.id}
          r={r}
          canEdit={canEdit}
          onStep={(d) => stepResource(r.id, d)}
          onEdit={() => setEditing(r)}
        />
      ))}
      {canEdit && (
        <button
          onClick={() => setEditing({ id: "", name: "", max: 8, current: 8, color: "#FBBF24" })}
          data-testid="add-resource-btn"
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs tracking-widest uppercase border border-dashed border-rust text-muted-bone hover:text-lantern hover:border-[#FBBF24]/60"
        >
          <Plus className="w-3.5 h-3.5" /> {resources.length === 0 ? "Add your first resource" : "Add resource"}
        </button>
      )}

      {editing && (
        <ResourceConfig
          initial={editing}
          isExisting={resources.some((r) => r.id === editing.id)}
          onSave={saveEdit}
          onRemove={() => removeResource(editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ResourceRow({ r, canEdit, onStep, onEdit }) {
  const pct = r.max > 0 ? Math.max(0, Math.min(100, ((r.current || 0) / r.max) * 100)) : 0;
  return (
    <div
      className="lantern-card p-3 relative overflow-hidden"
      style={{ borderColor: `${r.color}55` }}
      data-testid={`resource-${(r.name || "").replace(/\s+/g, "-").toLowerCase()}`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex items-center gap-2 min-w-[120px]">
          <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />
          <span className="text-xs tracking-[0.25em] uppercase text-bone truncate">{r.name}</span>
        </div>
        <div className="font-serif-display text-bone text-base tabular-nums">
          {r.current} <span className="text-muted-bone">/ {r.max}</span>
        </div>
        {canEdit && (
          <div className="ml-auto inline-flex items-center gap-1">
            <button onClick={() => onStep(-1)} data-testid={`resource-${r.id}-minus`} className="p-1.5 border border-rust text-muted-bone hover:text-bone hover:border-[#FBBF24]/50">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onStep(1)} data-testid={`resource-${r.id}-plus`} className="p-1.5 border border-rust text-muted-bone hover:text-bone hover:border-[#FBBF24]/50">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button onClick={onEdit} data-testid={`resource-${r.id}-config`} className="p-1.5 border border-rust text-muted-bone hover:text-lantern hover:border-[#FBBF24]/50">
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="mt-2 h-1.5 bg-[#0B0E0C] border border-rust/40 overflow-hidden">
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${r.color}, ${r.color}99)` }}
        />
      </div>
    </div>
  );
}

function ResourceConfig({ initial, isExisting, onSave, onRemove, onClose }) {
  const [draft, setDraft] = useState(initial);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-[#0B0E0C]/85 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onClose}
      data-testid="resource-config-overlay"
    >
      <div className="lantern-card vine-frame w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-rust flex items-center justify-between">
          <h3 className="font-serif-display text-2xl text-bone inline-flex items-center gap-2">
            <Flame className="w-5 h-5 text-lantern" /> {isExisting ? "Edit Resource" : "New Resource"}
          </h3>
          <button onClick={onClose} className="p-1 text-muted-bone hover:text-bone"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Name">
            <input value={draft.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="Mana"
              data-testid="resource-name-input"
              className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone text-sm focus:border-[#FBBF24] focus:outline-none" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max">
              <input type="number" min={1} value={draft.max ?? 1} onChange={(e) => set("max", parseInt(e.target.value || 1, 10))}
                data-testid="resource-max-input"
                className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone text-sm font-mono focus:border-[#FBBF24] focus:outline-none" />
            </Field>
            <Field label="Color">
              <input type="color" value={draft.color || "#FBBF24"} onChange={(e) => set("color", e.target.value)}
                data-testid="resource-color-input"
                className="w-full h-[38px] bg-[#0B0E0C] border border-rust cursor-pointer" />
            </Field>
          </div>
          <Field label="Current value">
            <input type="number" min={0} max={draft.max ?? 1} value={draft.current ?? draft.max ?? 0} onChange={(e) => set("current", parseInt(e.target.value || 0, 10))}
              data-testid="resource-current-input"
              className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone text-sm font-mono focus:border-[#FBBF24] focus:outline-none" />
          </Field>
        </div>
        <div className="px-5 py-3 border-t border-rust flex justify-between items-center gap-2">
          {isExisting ? (
            <button onClick={onRemove} data-testid="resource-remove"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs tracking-widest uppercase border border-rust text-muted-bone hover:text-red-400 hover:border-red-700">
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 text-xs tracking-widest uppercase text-muted-bone hover:text-bone">Cancel</button>
            <button onClick={() => onSave(draft)} data-testid="resource-save"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-sm hover:bg-[#F59E0B]">
              <Save className="w-4 h-4" /> {isExisting ? "Save" : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[10px] tracking-[0.3em] uppercase text-lantern mb-1">{label}</span>
      {children}
    </label>
  );
}
