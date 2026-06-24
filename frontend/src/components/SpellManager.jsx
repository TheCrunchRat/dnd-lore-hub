import React, { useMemo } from "react";
import { Sparkles, BookOpen, RotateCcw } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";

/**
 * Interactive spell-slot tracker + prepared/known toggle for a PC.
 *
 * Slot model (backwards compatible):
 *  - `metadata.spell_slots` may be either {1: 4} (number) OR {1: {max:4, used:0}} (object).
 *    We normalise to {level → {max, used}} for display.
 *  - `metadata.spell_slots_used` is a separate level→int map (newer schema).
 *    When BOTH exist, slot_used wins.
 *
 * Prepared model:
 *  - `metadata.spells_known` — the full list (canonical).
 *  - `metadata.spells_prepared` — subset that are prepared today. If absent, ALL
 *    spells are treated as prepared (back-compat: nothing breaks for old PCs).
 */
export default function SpellManager({ entry, canEdit, onUpdated }) {
  const m = entry?.metadata || {};
  const slotsRaw = m.spell_slots || {};
  const slotsUsed = m.spell_slots_used || {};
  const spells = m.spells_known || [];
  const prepared = m.spells_prepared;

  const slots = useMemo(() => {
    const out = {};
    for (const [lvl, v] of Object.entries(slotsRaw)) {
      if (v && typeof v === "object") {
        out[lvl] = { max: v.max || 0, used: slotsUsed[lvl] ?? v.used ?? 0 };
      } else {
        out[lvl] = { max: Number(v) || 0, used: slotsUsed[lvl] ?? 0 };
      }
    }
    return out;
  }, [slotsRaw, slotsUsed]);

  const hasSlots = Object.keys(slots).length > 0;
  const hasSpells = spells.length > 0;
  if (!hasSlots && !hasSpells) return null;

  const persist = async (patch, opts = {}) => {
    try {
      const payload = {
        name: entry.title,
        player_name: m.owner || m.player_name || entry.title,
        ...m,
        ...patch,
      };
      const { data } = await api.put(`/pcs/${entry.id}`, payload);
      onUpdated?.(data);
      if (opts.toast) toast.success(opts.toast);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const toggleSlot = (lvl, idx) => {
    const cur = slots[lvl];
    const newUsed = idx < (cur.used || 0) ? idx : idx + 1; // clicking a filled pip sets used = idx; clicking an empty pip sets used = idx + 1
    const next = { ...slotsUsed, [lvl]: Math.max(0, Math.min(cur.max, newUsed)) };
    persist({ spell_slots_used: next });
  };

  const longRest = () => {
    persist({ spell_slots_used: {} }, { toast: "Long rest — all slots restored" });
  };

  const togglePrepared = (spell) => {
    const cur = Array.isArray(prepared) ? prepared : [...spells]; // default: all prepared
    const isPrepared = cur.includes(spell);
    const next = isPrepared ? cur.filter((s) => s !== spell) : [...cur, spell];
    persist({ spells_prepared: next });
  };

  const isPrepared = (spell) => {
    if (!Array.isArray(prepared)) return true; // legacy: assume prepared
    return prepared.includes(spell);
  };

  return (
    <>
      {hasSlots && (
        <div className="lantern-card p-4 mb-6" data-testid="spell-slots">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs tracking-[0.3em] uppercase text-lantern inline-flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" /> Spell Slots
            </div>
            {canEdit && (
              <button
                onClick={longRest}
                data-testid="slot-long-rest"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] tracking-widest uppercase border border-rust text-muted-bone hover:text-lantern hover:border-[#FBBF24]/40"
                title="Reset all slots"
              >
                <RotateCcw className="w-3 h-3" /> Long Rest
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-9 gap-2">
            {Object.entries(slots).sort(([a], [b]) => +a - +b).map(([lvl, s]) => {
              const remaining = s.max - s.used;
              return (
                <div key={lvl} className="border border-rust p-2 text-center" data-testid={`sheet-slot-${lvl}`}>
                  <div className="text-[10px] tracking-widest uppercase text-lantern">Lv {lvl}</div>
                  <div className="font-serif-display text-xl text-bone leading-none mt-1">
                    {remaining}<span className="text-muted-bone text-base">/{s.max}</span>
                  </div>
                  <div className="flex justify-center gap-1 mt-1.5">
                    {Array.from({ length: s.max }).map((_, i) => {
                      const filled = i >= s.used;
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => toggleSlot(lvl, i)}
                          data-testid={`slot-pip-${lvl}-${i}`}
                          className={`w-2.5 h-2.5 rounded-full transition-all ${
                            filled
                              ? "bg-[#FBBF24] shadow-[0_0_6px_#FBBF24]"
                              : "bg-transparent border border-rust"
                          } ${canEdit ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                          title={filled ? "Available — click to spend" : "Spent — click to restore"}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasSpells && (
        <div className="lantern-card p-4 mb-6" data-testid="spells-list">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs tracking-[0.3em] uppercase text-lantern inline-flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5" /> Spells
              {Array.isArray(prepared) && (
                <span className="text-[10px] tracking-widest text-muted-bone normal-case ml-1">
                  · {prepared.length} prepared / {spells.length} known
                </span>
              )}
            </div>
            {canEdit && (
              <div className="text-[10px] text-muted-bone italic">
                Tap a spell to toggle prepared
              </div>
            )}
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {spells.map((s) => {
              const isP = isPrepared(s);
              return (
                <li key={s}>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => togglePrepared(s)}
                    data-testid={`spell-${s.replace(/\s+/g, "-").toLowerCase()}`}
                    className={`text-xs px-2 py-1 border transition-all ${
                      isP
                        ? "border-[#FBBF24] text-lantern bg-[#FBBF24]/[0.08] shadow-[0_0_8px_rgba(251,191,36,0.2)]"
                        : "border-rust text-muted-bone line-through opacity-60"
                    } ${canEdit ? "cursor-pointer hover:border-[#FBBF24]/60" : "cursor-default"}`}
                    title={isP ? "Prepared — tap to un-prepare" : "Known but not prepared — tap to prepare"}
                  >
                    {s}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
