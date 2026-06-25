import React, { useEffect, useState } from "react";
import { ArrowLeft, ChevronUp, ChevronDown, ArrowRight, EyeOff, Eye, Save, RotateCcw, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import api, { formatApiError } from "../lib/api";
import { BLOCKS, effectivePage } from "../lib/layouts";
import { toast } from "sonner";

const PAGES = [
  { key: "character_sheet", label: "Character Sheet" },
  { key: "dice_page", label: "Dice Page" },
];

const SLOT_LABELS = { left: "Main column", right: "Side rail", hidden: "Hidden" };

export default function AdminLayouts() {
  const { user } = useAuth();
  const [layout, setLayout] = useState(null);
  const [busy, setBusy] = useState(false);
  const [activePage, setActivePage] = useState("character_sheet");

  const load = async () => {
    try {
      const { data } = await api.get("/layouts");
      // Reconcile against the BLOCKS registry so new blocks always appear in the editor
      const reconciled = {
        character_sheet: effectivePage(data, "character_sheet"),
        dice_page: effectivePage(data, "dice_page"),
      };
      setLayout(reconciled);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  if (!user || user.role !== "admin") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h1 className="font-serif-display text-3xl text-bone">DM only</h1>
        <p className="text-muted-bone mt-2">You need the keeper&rsquo;s seal to edit page layouts.</p>
      </div>
    );
  }
  if (!layout) return <div className="p-10 text-center text-muted-bone">Loading layout…</div>;

  const cur = layout[activePage];
  const update = (next) => setLayout((l) => ({ ...l, [activePage]: { ...l[activePage], ...next } }));

  const move = (slot, idx, dir) => {
    const arr = [...cur[slot]];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    update({ [slot]: arr });
  };

  const moveToSlot = (fromSlot, idx, toSlot) => {
    if (fromSlot === toSlot) return;
    const fromArr = [...cur[fromSlot]];
    const [k] = fromArr.splice(idx, 1);
    const toArr = [...cur[toSlot], k];
    update({ [fromSlot]: fromArr, [toSlot]: toArr });
  };

  const setConfig = (key, patch) => {
    const configs = { ...(cur.configs || {}) };
    configs[key] = { ...(configs[key] || {}), ...patch };
    update({ configs });
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/layouts", layout);
      toast.success("Layout saved — players will see it on next load");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const resetToDefault = async () => {
    setBusy(true);
    try {
      // Save an empty page so the server falls back to defaults
      const empty = { left: [], right: [], hidden: [], configs: {} };
      await api.put("/layouts", { [activePage]: { ...empty, left: [] } });
      await load();
      toast.success("Reset — page now uses the realm default ordering");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <Link to="/admin" className="text-[10px] tracking-[0.3em] uppercase text-muted-bone hover:text-lantern inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="w-3 h-3" /> Back to Admin
      </Link>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-2">Realm Settings</div>
          <h1 className="font-serif-display text-4xl text-bone">Page Layouts</h1>
          <p className="text-sm text-muted-bone italic mt-2 max-w-2xl">
            Re-order, hide, or relocate the building blocks of the Character Sheet and the Dice Page.
            Whatever you save here is what every player sees.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={resetToDefault} disabled={busy} data-testid="reset-layout-btn"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[10px] tracking-widest uppercase border border-rust text-muted-bone hover:text-bone hover:border-[#FBBF24]/50">
            <RotateCcw className="w-3 h-3" /> Reset Page
          </button>
          <button onClick={save} disabled={busy} data-testid="save-layout-btn"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-sm hover:bg-[#F59E0B] disabled:opacity-50">
            <Save className="w-4 h-4" /> Save Layout
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-rust">
        {PAGES.map((p) => (
          <button
            key={p.key}
            onClick={() => setActivePage(p.key)}
            data-testid={`tab-${p.key}`}
            className={`px-4 py-2 text-xs tracking-widest uppercase border-b-2 transition-colors ${
              activePage === p.key ? "border-[#FBBF24] text-lantern" : "border-transparent text-muted-bone hover:text-bone"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {["left", "right", "hidden"].map((slot) => (
          <SlotCard
            key={slot}
            slot={slot}
            label={SLOT_LABELS[slot]}
            page={activePage}
            keys={cur[slot]}
            allConfigs={cur.configs}
            onMove={move}
            onMoveSlot={moveToSlot}
            onConfigChange={setConfig}
          />
        ))}
      </div>
    </div>
  );
}

function SlotCard({ slot, label, page, keys, allConfigs, onMove, onMoveSlot, onConfigChange }) {
  const allBlocks = BLOCKS[page] || [];
  const slotIsHidden = slot === "hidden";
  return (
    <div className={`lantern-card p-3 ${slotIsHidden ? "opacity-80" : ""}`} data-testid={`slot-${slot}`}>
      <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-3 flex items-center gap-2">
        {slot === "hidden" ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />} {label}
        <span className="text-muted-bone normal-case">· {keys.length} block{keys.length !== 1 ? "s" : ""}</span>
      </div>
      {keys.length === 0 && (
        <div className="text-[11px] text-muted-bone italic text-center py-4">empty</div>
      )}
      <ul className="space-y-1.5">
        {keys.map((k, i) => {
          const block = allBlocks.find((b) => b.key === k);
          if (!block) return null;
          return (
            <BlockRow
              key={k}
              block={block}
              slot={slot}
              index={i}
              total={keys.length}
              config={(allConfigs || {})[k]}
              onMove={onMove}
              onMoveSlot={onMoveSlot}
              onConfigChange={onConfigChange}
            />
          );
        })}
      </ul>
    </div>
  );
}

function BlockRow({ block, slot, index, total, config, onMove, onMoveSlot, onConfigChange }) {
  const [open, setOpen] = useState(false);
  const hasConfig = block.key === "live_feed" || block.key === "portrait";
  return (
    <li className="border border-rust/60 bg-[#0B0E0C]/40" data-testid={`block-row-${block.key}`}>
      <div className="px-2 py-1.5 flex items-center gap-1.5">
        <div className="flex flex-col">
          <button disabled={index === 0} onClick={() => onMove(slot, index, -1)} data-testid={`up-${block.key}`}
            className="text-muted-bone hover:text-lantern disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
          <button disabled={index === total - 1} onClick={() => onMove(slot, index, 1)} data-testid={`down-${block.key}`}
            className="text-muted-bone hover:text-lantern disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-bone truncate">{block.label}</div>
          <div className="text-[10px] text-muted-bone truncate">{block.note}</div>
        </div>
        {hasConfig && (
          <button onClick={() => setOpen((v) => !v)} data-testid={`cfg-${block.key}`}
            className="p-1 text-muted-bone hover:text-lantern" title="Block settings">
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        )}
        <select
          value={slot}
          onChange={(e) => onMoveSlot(slot, index, e.target.value)}
          data-testid={`slot-select-${block.key}`}
          className="text-[10px] tracking-widest uppercase bg-[#0B0E0C] border border-rust text-bone px-1.5 py-1"
          title="Move to slot"
        >
          <option value="left">Main</option>
          <option value="right">Side</option>
          <option value="hidden">Hidden</option>
        </select>
      </div>
      {open && hasConfig && (
        <div className="border-t border-rust/40 px-2 py-2 bg-[#0B0E0C]/50">
          {block.key === "live_feed" && (
            <label className="text-[10px] tracking-widest uppercase text-muted-bone flex items-center gap-2">
              Feed rows
              <input type="number" min={1} max={50}
                value={(config?.limit) ?? 8}
                onChange={(e) => onConfigChange(block.key, { limit: parseInt(e.target.value || 8, 10) })}
                data-testid={`cfg-${block.key}-limit`}
                className="w-20 px-2 py-1 bg-[#0B0E0C] border border-rust text-bone font-mono text-xs" />
            </label>
          )}
          {block.key === "portrait" && (
            <label className="text-[10px] tracking-widest uppercase text-muted-bone flex items-center gap-2">
              Portrait size
              <select value={config?.size || "medium"}
                onChange={(e) => onConfigChange(block.key, { size: e.target.value })}
                data-testid={`cfg-${block.key}-size`}
                className="px-2 py-1 bg-[#0B0E0C] border border-rust text-bone text-xs">
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </label>
          )}
        </div>
      )}
    </li>
  );
}
