import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Moon, Coffee, Settings2, X, Save } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";

/**
 * Long-Rest & Short-Rest control with editable recovery amounts (flat or %).
 *
 * Reads/writes `entry.metadata.rest_config`:
 *   {
 *     long:  { hp_value: 100, hp_is_percent: true,  resource_value: 100, resource_is_percent: true },
 *     short: { hp_value: 25,  hp_is_percent: true,  resource_value: 50,  resource_is_percent: true }
 *   }
 *
 * If rest_config is absent, the defaults above are used. Resting computes the
 * actual recovery, applies it to current_hp / resource_current (clamped to
 * the configured max), and persists via PUT /api/pcs/{id}.
 */

const DEFAULTS = {
  long: { hp_value: 100, hp_is_percent: true, resource_value: 100, resource_is_percent: true },
  short: { hp_value: 25, hp_is_percent: true, resource_value: 50, resource_is_percent: true },
};

const cfg = (rest, kind) => ({ ...DEFAULTS[kind], ...((rest || {})[kind] || {}) });

const applyRecover = (cur, max, value, isPercent) => {
  if (max == null) return cur;
  if (cur == null) cur = 0;
  const delta = isPercent ? Math.floor((value / 100) * max) : value;
  return Math.max(0, Math.min(max, cur + delta));
};

export default function RestManager({ entry, canEdit, onUpdated }) {
  const m = entry?.metadata || {};
  const [configOpen, setConfigOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rest = m.rest_config || {};

  // Pull both new (resources array) and legacy single-resource shapes
  const resources = Array.isArray(m.resources) && m.resources.length > 0
    ? m.resources
    : (m.resource_name ? [{ id: "legacy", name: m.resource_name, max: m.resource_max, current: m.resource_current ?? m.resource_max, color: m.resource_color }] : []);
  const hasAnyStat = (m.max_hp != null) || resources.length > 0;
  if (!hasAnyStat && !canEdit) return null;

  const persist = async (patch, msg) => {
    setBusy(true);
    try {
      const payload = {
        name: entry.title,
        player_name: m.owner || m.player_name || entry.title,
        ...m,
        ...patch,
      };
      const { data } = await api.put(`/pcs/${entry.id}`, payload);
      onUpdated?.(data);
      if (msg) toast.success(msg);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const rest_take = (kind) => {
    const c = cfg(rest, kind);
    const patch = {};
    if (m.max_hp != null) {
      patch.current_hp = applyRecover(m.current_hp ?? m.max_hp, m.max_hp, c.hp_value, c.hp_is_percent);
    }
    if (resources.length > 0) {
      const recovered = resources.map((r) => ({
        ...r,
        current: applyRecover(r.current ?? r.max, r.max, c.resource_value, c.resource_is_percent),
      }));
      if (Array.isArray(m.resources)) {
        patch.resources = recovered;
      } else {
        // legacy single resource → write back to legacy fields
        patch.resource_current = recovered[0].current;
      }
    }
    if (kind === "long") patch.spell_slots_used = {};
    persist(patch, kind === "long" ? "Long rest — restored" : "Short rest — restored");
  };

  return (
    <div className="lantern-card p-3 mb-6 flex items-center gap-2 flex-wrap" data-testid="rest-manager">
      <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mr-1 inline-flex items-center gap-2">
        <Moon className="w-3.5 h-3.5" /> Rest
      </div>
      <RestButton
        icon={Moon}
        label="Long Rest"
        kind="long"
        rest={rest}
        canEdit={canEdit}
        busy={busy}
        onClick={() => rest_take("long")}
        accent="#FBBF24"
      />
      <RestButton
        icon={Coffee}
        label="Short Rest"
        kind="short"
        rest={rest}
        canEdit={canEdit}
        busy={busy}
        onClick={() => rest_take("short")}
        accent="#A78BFA"
      />
      {canEdit && (
        <button
          onClick={() => setConfigOpen(true)}
          data-testid="rest-config-btn"
          className="ml-auto p-1.5 text-muted-bone hover:text-lantern"
          title="Configure recovery amounts"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      )}

      {configOpen && (
        <RestConfig
          initial={rest}
          hasResource={resources.length > 0}
          resourceName={resources.length === 1 ? resources[0].name : (resources.length > 1 ? "All resources" : "")}
          onSave={(next) => { persist({ rest_config: next }, "Rest config saved"); setConfigOpen(false); }}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}

function RestButton({ icon: Icon, label, kind, rest, canEdit, busy, onClick, accent }) {
  const c = cfg(rest, kind);
  return (
    <button
      onClick={onClick}
      disabled={!canEdit || busy}
      data-testid={`take-${kind}-rest`}
      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs tracking-widest uppercase border transition-colors disabled:opacity-50"
      style={{ borderColor: `${accent}55`, color: canEdit ? accent : "#9CA3AF" }}
      title={canEdit
        ? `HP +${c.hp_value}${c.hp_is_percent ? "%" : ""}, Resource +${c.resource_value}${c.resource_is_percent ? "%" : ""}`
        : "Only the character owner or DM can rest"}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function RestConfig({ initial, hasResource, resourceName, onSave, onClose }) {
  const [draft, setDraft] = useState({
    long: cfg(initial, "long"),
    short: cfg(initial, "short"),
  });

  const setKind = (kind, patch) => setDraft((d) => ({ ...d, [kind]: { ...d[kind], ...patch } }));

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-[#0B0E0C]/85 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onClose}
      data-testid="rest-config-overlay"
    >
      <div className="lantern-card vine-frame w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-rust flex items-center justify-between">
          <h3 className="font-serif-display text-2xl text-bone inline-flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-lantern" /> Configure Rest Recovery
          </h3>
          <button onClick={onClose} className="p-1 text-muted-bone hover:text-bone"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-5">
          <RestForm
            kind="long"
            label="Long Rest"
            color="#FBBF24"
            cfg={draft.long}
            onChange={(patch) => setKind("long", patch)}
            hasResource={hasResource}
            resourceName={resourceName}
          />
          <RestForm
            kind="short"
            label="Short Rest"
            color="#A78BFA"
            cfg={draft.short}
            onChange={(patch) => setKind("short", patch)}
            hasResource={hasResource}
            resourceName={resourceName}
          />
        </div>
        <div className="px-5 py-3 border-t border-rust flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-xs tracking-widest uppercase text-muted-bone hover:text-bone">Cancel</button>
          <button
            onClick={() => onSave(draft)}
            data-testid="rest-config-save"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-sm hover:bg-[#F59E0B]"
          >
            <Save className="w-4 h-4" /> Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function RestForm({ kind, label, color, cfg, onChange, hasResource, resourceName }) {
  return (
    <div className="border p-3" style={{ borderColor: `${color}55` }} data-testid={`rest-form-${kind}`}>
      <div className="text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color }}>{label} Recovery</div>
      <RecoveryRow
        label="HP"
        value={cfg.hp_value}
        isPercent={cfg.hp_is_percent}
        onChange={(v, p) => onChange({ hp_value: v, hp_is_percent: p })}
        testid={`${kind}-hp`}
      />
      {hasResource && (
        <RecoveryRow
          label={resourceName || "Resource"}
          value={cfg.resource_value}
          isPercent={cfg.resource_is_percent}
          onChange={(v, p) => onChange({ resource_value: v, resource_is_percent: p })}
          testid={`${kind}-resource`}
        />
      )}
    </div>
  );
}

function RecoveryRow({ label, value, isPercent, onChange, testid }) {
  return (
    <div className="flex items-center gap-2 mb-2 last:mb-0">
      <span className="text-xs text-muted-bone w-20 shrink-0">{label}</span>
      <input
        type="number"
        min={0}
        max={isPercent ? 100 : 9999}
        value={value ?? 0}
        onChange={(e) => onChange(parseInt(e.target.value || "0", 10), isPercent)}
        data-testid={`${testid}-value`}
        className="flex-1 px-2 py-1.5 bg-[#0B0E0C] border border-rust text-bone text-sm focus:border-[#FBBF24] focus:outline-none"
      />
      <div className="inline-flex border border-rust">
        <button
          type="button"
          onClick={() => onChange(value, false)}
          data-testid={`${testid}-flat`}
          className={`px-3 py-1.5 text-[10px] tracking-widest uppercase transition-colors ${
            !isPercent ? "bg-[#FBBF24] text-[#0B0E0C]" : "text-muted-bone hover:text-bone"
          }`}
        >
          Flat
        </button>
        <button
          type="button"
          onClick={() => onChange(value, true)}
          data-testid={`${testid}-percent`}
          className={`px-3 py-1.5 text-[10px] tracking-widest uppercase transition-colors ${
            isPercent ? "bg-[#FBBF24] text-[#0B0E0C]" : "text-muted-bone hover:text-bone"
          }`}
        >
          %
        </button>
      </div>
    </div>
  );
}
