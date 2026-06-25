import React, { useEffect, useRef, useState } from "react";
import { Dices, Sparkles } from "lucide-react";
import api from "../lib/api";

/**
 * Compact live roll feed widget — shows the latest N party rolls and polls
 * `/api/dice/rolls` for new ones. Used inline on the character sheet so
 * players don't have to navigate to `/dice` to see what the party is doing.
 *
 *   <LiveRollFeed limit={10} pollMs={4000} />
 */
const REL = (iso) => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

const KIND_TINT = {
  ability: "#A78BFA",
  save: "#FBBF24",
  skill: "#86EFAC",
  init: "#F87171",
  spell: "#F97316",
  custom: "#9CA3AF",
};

export default function LiveRollFeed({ limit = 10, pollMs = 4500, title = "Live Rolls" }) {
  const [feed, setFeed] = useState([]);
  const timerRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/dice/rolls?limit=${limit}`);
      setFeed(data || []);
    } catch {/* silent */}
  };

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, pollMs);
    return () => clearInterval(timerRef.current);
  }, [limit, pollMs]);

  return (
    <div className="lantern-card p-4 mb-6" data-testid="live-roll-feed">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs tracking-[0.3em] uppercase text-lantern inline-flex items-center gap-2">
          <Dices className="w-3.5 h-3.5" /> {title}
        </div>
        <span className="text-[10px] tracking-widest uppercase text-muted-bone">live</span>
      </div>
      {feed.length === 0 ? (
        <div className="text-[11px] text-muted-bone italic">No rolls yet — be the first.</div>
      ) : (
        <ul className="space-y-1 max-h-60 overflow-y-auto">
          {feed.slice(0).reverse().map((r) => {
            const tint = KIND_TINT[r.kind] || "#9CA3AF";
            return (
              <li key={r.id} className="text-[11px] flex items-center gap-2 py-1 border-b border-rust/30 last:border-none" data-testid={`feed-row-${r.id}`}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tint }} />
                <span className="text-bone truncate">{r.pc_name || r.player_name}</span>
                <span className="text-muted-bone truncate">· {r.label}</span>
                <span className={`ml-auto font-mono ${r.crit ? "text-emerald-300" : r.fumble ? "text-red-400" : "text-lantern"}`}>
                  {r.crit && <Sparkles className="inline w-3 h-3 mr-1" />}
                  {r.total}
                </span>
                <span className="text-[9px] tracking-widest uppercase text-muted-bone shrink-0">{REL(r.created_at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
