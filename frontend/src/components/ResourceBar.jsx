import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, Minus, Settings2, X, Save, Flame } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";

/**
 * Per-character custom resource bar (mana / sorcery points / wickfire / lantern charges).
 * One per character; the name, max, and color are all author-configurable.
 *
 * Persists via PUT /api/pcs/:id. The parent passes the entry and a canEdit boolean.
 */
export default function ResourceBar({ entry, canEdit, onUpdated }) {
  const m = entry?.metadata || {};
  const initialName = m.resource_name || "";
  const initialMax = Number.isFinite(m.resource_max) ? m.resource_max : 0;
  const initialCurrent = Number.isFinite(m.resource_current) ? m.resource_current : initialMax;
  const color = m.resource_color || "#FBBF24";

  const [current, setCurrent] = useState(initialCurrent);
  const [busy, setBusy] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  useEffect(() => {
    setCurrent(Number.isFinite(m.resource_current) ? m.resource_current : (m.resource_max ?? 0));
  }, [m.resource_current, m.resource_max]);

  const persist = async (patch, opts = {}) => {
    setBusy(true);
    try {
      const payload = {
        // Send the whole metadata so the backend keeps everything intact
        name: entry.title,
        player_name: m.owner || m.player_name || entry.title,
        ...m,
        ...patch,
      };
      const { data } = await api.put(`/pcs/${entry.id}`, payload);
      onUpdated?.(data);
      if (opts.toast) toast.success(opts.toast);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const clamp = (n) => Math.max(0, Math.min(initialMax || 0, n));
  const setValue = (n) => {
    const v = clamp(parseInt(n, 10));
    if (Number.isNaN(v)) return;
    setCurrent(v);
    persist({ resource_current: v });
  };
  const step = (delta) => setValue((current ?? 0) + delta);

  if (!initialName && !canEdit) return null; // hidden if neither configured nor editable

  if (!initialName) {
    // Owner/admin sees an inviting "add a resource" stub
    return (
      <div className="lantern-card p-4 mb-6 flex items-center justify-between gap-3" data-testid="resource-bar-empty">
        <div className="flex items-center gap-3 text-muted-bone">
          <Flame className="w-4 h-4 text-lantern/60" />
          <span className="text-sm italic">No custom resource set up yet.</span>
        </div>
        <button
          onClick={() => setConfigOpen(true)}
          data-testid="resource-configure"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-widest uppercase border border-rust text-bone hover:border-[#FBBF24]/50 hover:text-lantern"
        >
          <Settings2 className="w-3.5 h-3.5" /> Add a resource
        </button>
        {configOpen && (
          <ResourceConfig
            initialName={initialName}
            initialMax={initialMax}
            initialColor={color}
            onClose={() => setConfigOpen(false)}
            onSave={(cfg) => {
              persist(
                { resource_name: cfg.name, resource_max: cfg.max, resource_current: cfg.max, resource_color: cfg.color },
                { toast: "Resource configured" }
              );
              setConfigOpen(false);
            }}
          />
        )}
      </div>
    );
  }

  const pct = initialMax > 0 ? Math.round((current / initialMax) * 100) : 0;

  return (
    <div
      className="lantern-card p-4 mb-6 relative overflow-hidden"
      style={{ borderColor: `${color}66` }}
      data-testid="resource-bar"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: color, boxShadow: `0 0 8px ${color}` }}
          />
          <span
            className="text-[10px] tracking-[0.35em] uppercase shrink-0"
            style={{ color }}
            data-testid="resource-name"
          >
            {initialName}
          </span>
          <span className="font-serif-display text-2xl text-bone leading-none" data-testid="resource-current-over-max">
            {current} <span className="text-muted-bone">/</span> {initialMax}
          </span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => step(-1)}
              disabled={busy || current <= 0}
              data-testid="resource-minus"
              className="p-1.5 border border-rust text-muted-bone hover:text-bone disabled:opacity-30"
              title="Spend 1"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => step(+1)}
              disabled={busy || current >= initialMax}
              data-testid="resource-plus"
              className="p-1.5 border border-rust text-muted-bone hover:text-lantern disabled:opacity-30"
              title="Restore 1"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setValue(initialMax)}
              disabled={busy || current === initialMax}
              data-testid="resource-fill"
              className="px-2 py-1 text-[10px] tracking-widest uppercase border border-rust text-muted-bone hover:text-lantern hover:border-[#FBBF24]/40 disabled:opacity-30"
              title="Long rest — refill"
            >
              Fill
            </button>
            <button
              onClick={() => setConfigOpen(true)}
              data-testid="resource-configure"
              className="p-1.5 text-muted-bone hover:text-lantern"
              title="Configure"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2.5 bg-[#0B0E0C] border border-rust/60 overflow-hidden">
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}88 0%, ${color} 100%)`,
            boxShadow: `0 0 12px ${color}`,
          }}
          data-testid="resource-fill-bar"
        />
      </div>

      {canEdit && (
        <input
          type="range" min={0} max={initialMax || 0} step={1} value={current}
          onChange={(e) => setCurrent(parseInt(e.target.value, 10))}
          onMouseUp={(e) => setValue(e.target.value)}
          onTouchEnd={(e) => setValue(e.target.value)}
          data-testid="resource-slider"
          className="w-full mt-2 accent-[var(--res-color,#FBBF24)] h-1"
          style={{ "--res-color": color }}
        />
      )}

      {configOpen && (
        <ResourceConfig
          initialName={initialName}
          initialMax={initialMax}
          initialColor={color}
          onClose={() => setConfigOpen(false)}
          onSave={(cfg) => {
            const newCurrent = Math.min(current, cfg.max);
            persist(
              { resource_name: cfg.name, resource_max: cfg.max, resource_current: newCurrent, resource_color: cfg.color },
              { toast: "Resource updated" }
            );
            setConfigOpen(false);
          }}
          onRemove={() => {
            persist(
              { resource_name: "", resource_max: null, resource_current: null, resource_color: null },
              { toast: "Resource removed" }
            );
            setConfigOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ResourceConfig({ initialName, initialMax, initialColor, onClose, onSave, onRemove }) {
  const [name, setName] = useState(initialName || "Mana");
  const [max, setMax] = useState(initialMax || 8);
  const [color, setColor] = useState(initialColor || "#FBBF24");
  return createPortal(
    <div className="fixed inset-0 z-50 bg-[#0B0E0C]/80 backdrop-blur-sm flex items-center justify-center px-4" onClick={onClose} data-testid="resource-config-overlay">
      <div className="lantern-card vine-frame p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="resource-config">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif-display text-2xl text-bone">Configure Resource</h3>
          <button onClick={onClose} className="p-1 text-muted-bone hover:text-bone"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              data-testid="resource-name-input"
              placeholder="Mana, Wickfire, Sorcery Points…"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">Maximum</label>
            <input type="number" min={0} max={999} value={max}
              onChange={(e) => setMax(Math.max(0, parseInt(e.target.value || "0", 10)))}
              data-testid="resource-max-input"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">Colour</label>
            <div className="flex items-center gap-3">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                data-testid="resource-color-input"
                className="w-12 h-10 bg-transparent border border-rust cursor-pointer"
              />
              <input type="text" value={color} onChange={(e) => setColor(e.target.value)}
                className="flex-1 px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none font-mono text-sm"
              />
              <div className="w-8 h-8 border border-rust" style={{ background: `linear-gradient(90deg, ${color}88, ${color})`, boxShadow: `0 0 12px ${color}` }} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-6">
          {onRemove ? (
            <button onClick={onRemove} data-testid="resource-remove" className="text-xs tracking-widest uppercase text-muted-bone hover:text-red-400">
              Remove resource
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-2 text-xs tracking-widest uppercase text-muted-bone hover:text-bone">Cancel</button>
            <button
              onClick={() => onSave({ name: name.trim() || "Mana", max, color })}
              data-testid="resource-config-save"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-sm hover:bg-[#F59E0B]"
            >
              <Save className="w-4 h-4" /> Save
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
