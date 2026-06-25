import React, { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Dices, RotateCcw, Trash2, Plus, Minus, User, Users, X } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import SheetRollers from "../components/SheetRollers";
import { computeModifiers } from "../lib/statModifiers";

const DIE_TYPES = [4, 6, 8, 10, 12, 20, 100];
const POLL_MS = 2000;
const NAME_KEY = "lantern.diceName";

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function timeAgo(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 5) return "just now";
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Dice() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const characterId = searchParams.get("character");
  const [playerName, setPlayerName] = useState(() => localStorage.getItem(NAME_KEY) || "");
  const [nameDraft, setNameDraft] = useState("");
  const [currentRoll, setCurrentRoll] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [counts, setCounts] = useState({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 1, 100: 0 });
  const [modifier, setModifier] = useState(0);
  const [feed, setFeed] = useState([]); // shared roll feed (chronological asc, newest at end)
  const lastTsRef = useRef(null);

  // Active character (from ?character= query OR a manual pick)
  const [pcEntry, setPcEntry] = useState(null);
  const [pcTrees, setPcTrees] = useState([]);
  useEffect(() => {
    if (!characterId) { setPcEntry(null); return; }
    api.get(`/entries/${characterId}`).then((r) => setPcEntry(r.data)).catch(() => setPcEntry(null));
    api.get("/magic/trees").then((r) => setPcTrees(r.data || [])).catch(() => setPcTrees([]));
  }, [characterId]);
  const pcModTotals = pcEntry ? computeModifiers(pcEntry, pcTrees).totals : null;
  // When a PC is selected and we don't have a player name yet, prefer the PC's owner
  useEffect(() => {
    if (pcEntry && !playerName) {
      const owner = pcEntry.metadata?.owner || pcEntry.metadata?.player_name;
      if (owner) setPlayerName(owner);
    }
  }, [pcEntry, playerName]);
  const clearCharacter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("character");
    setSearchParams(next, { replace: true });
  };

  // -------- Polling for shared feed --------
  const fetchFeed = useCallback(async (initial = false) => {
    try {
      if (initial) {
        const { data } = await api.get("/dice/rolls", { params: { limit: 50 } });
        setFeed(data);
        if (data.length > 0) lastTsRef.current = data[data.length - 1].created_at;
      } else {
        const { data } = await api.get("/dice/rolls", {
          params: { since: lastTsRef.current || undefined, limit: 50 },
        });
        if (data.length > 0) {
          setFeed((prev) => {
            const seen = new Set(prev.map((r) => r.id));
            const merged = [...prev];
            for (const r of data) if (!seen.has(r.id)) merged.push(r);
            return merged.slice(-100);
          });
          lastTsRef.current = data[data.length - 1].created_at;
        }
      }
    } catch (_e) { /* ignore polling errors */ }
  }, []);

  useEffect(() => {
    fetchFeed(true);
    const t = setInterval(() => fetchFeed(false), POLL_MS);
    return () => clearInterval(t);
  }, [fetchFeed]);

  const saveName = (name) => {
    const v = (name || "").trim().slice(0, 40);
    if (!v) return;
    localStorage.setItem(NAME_KEY, v);
    setPlayerName(v);
    setNameDraft("");
  };

  const adjust = (sides, delta) => {
    setCounts((c) => ({ ...c, [sides]: Math.max(0, Math.min(20, (c[sides] || 0) + delta)) }));
  };

  const quickRoll = (sides) => performRoll({ [sides]: 1 }, 0);

  const performRoll = (diceMap, mod) => {
    if (!playerName) {
      toast.error("Pick a name first so the party knows whose dice these are");
      return;
    }
    const entries = Object.entries(diceMap).filter(([, n]) => n > 0);
    if (entries.length === 0) return;
    setRolling(true);
    let ticks = 0;
    const tickInterval = setInterval(() => {
      const tempRolls = entries.flatMap(([s, n]) =>
        Array.from({ length: n }, () => ({ sides: Number(s), value: rollDie(Number(s)) }))
      );
      setCurrentRoll({ rolls: tempRolls, total: 0, modifier: mod, settled: false });
      ticks += 1;
      if (ticks >= 8) {
        clearInterval(tickInterval);
        const finalRolls = entries.flatMap(([s, n]) =>
          Array.from({ length: n }, () => ({ sides: Number(s), value: rollDie(Number(s)) }))
        );
        const sum = finalRolls.reduce((a, r) => a + r.value, 0) + mod;
        const label =
          entries.map(([s, n]) => `${n}d${s}`).join(" + ") +
          (mod ? (mod > 0 ? ` + ${mod}` : ` − ${Math.abs(mod)}`) : "");
        const crit = finalRolls.some((r) => r.sides === 20 && r.value === 20);
        const fumble = finalRolls.some((r) => r.sides === 20 && r.value === 1);

        const payload = {
          player_name: playerName,
          label,
          rolls: finalRolls,
          modifier: mod,
          total: sum,
          crit,
          fumble,
        };

        setCurrentRoll({ ...payload, settled: true });
        setRolling(false);

        // Post to shared feed (don't block UI on failure)
        api.post("/dice/rolls", payload).catch((e) => {
          toast.error(formatApiError(e));
        });
      }
    }, 60);
  };

  const rollBuilder = () => performRoll(counts, modifier);
  const resetCounts = () => {
    setCounts({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 });
    setModifier(0);
  };

  const clearFeed = async () => {
    if (!window.confirm("Clear the shared dice log for the whole party?")) return;
    try {
      await api.delete("/dice/rolls");
      setFeed([]);
      lastTsRef.current = null;
      toast.success("Log cleared");
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  // ---------- Render ----------
  if (!playerName) {
    return (
      <div className="max-w-md mx-auto px-6 py-24" data-testid="dice-name-prompt">
        <div className="lantern-card vine-frame p-8 text-center">
          <Dices className="w-12 h-12 text-lantern mx-auto ember-pulse mb-4" strokeWidth={1.25} />
          <div className="text-xs tracking-[0.35em] uppercase text-lantern mb-2">Around the Lantern</div>
          <h1 className="font-serif-display text-3xl text-bone mb-3">Who&rsquo;s rolling tonight?</h1>
          <p className="text-sm text-muted-bone mb-6">
            Tell the party your name. Every die you cast lights up the shared log for everyone watching.
          </p>
          <input
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveName(nameDraft); }}
            placeholder={user?.name || "Your name at the table"}
            data-testid="name-input"
            className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none mb-4"
            autoFocus
          />
          <button
            onClick={() => saveName(nameDraft || user?.name || "")}
            disabled={!(nameDraft || user?.name)}
            data-testid="name-submit"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#FBBF24] text-[#0B0E0C] font-semibold tracking-wide hover:bg-[#F59E0B] disabled:opacity-50 transition-colors"
          >
            Step to the table
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16" data-testid="dice-page">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-12">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="block w-10 h-px bg-[#FBBF24]/60" />
            <span className="text-xs tracking-[0.35em] uppercase text-lantern">The Lanternkeeper&rsquo;s Bones</span>
          </div>
          <h1 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-bone leading-none ember-glow mb-3">
            Roll the Bones
          </h1>
          <p className="text-muted-bone max-w-2xl leading-relaxed">
            Cast the dice by lantern-light. Every throw is shared with the rest of the party in real time —
            the shared log on the right updates as the table rolls.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-2 border border-rust">
            <User className="w-3.5 h-3.5 text-lantern" />
            <span className="text-sm text-bone" data-testid="current-name">{playerName}</span>
            <button
              onClick={() => { localStorage.removeItem(NAME_KEY); setPlayerName(""); }}
              data-testid="change-name"
              className="text-[10px] tracking-widest uppercase text-muted-bone hover:text-lantern ml-2"
            >
              Change
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
        {/* LEFT: Display + Quick + Builder */}
        <div className="space-y-8">
          {pcEntry && (
            <div className="lantern-card p-4" data-testid="active-pc-banner" style={{ borderColor: "#FBBF24AA" }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[10px] tracking-[0.3em] uppercase text-lantern">Rolling as</div>
                  <div className="font-serif-display text-2xl text-bone leading-tight">{pcEntry.title}</div>
                  <div className="text-xs text-muted-bone">
                    {pcEntry.metadata?.character_class || pcEntry.metadata?.class}
                    {pcEntry.metadata?.level ? ` · Level ${pcEntry.metadata.level}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link to={`/characters/${pcEntry.slug}`} className="text-[10px] tracking-widest uppercase text-muted-bone hover:text-lantern">
                    Sheet ↗
                  </Link>
                  <button onClick={clearCharacter} data-testid="clear-active-pc" className="p-1 text-muted-bone hover:text-bone" title="Stop rolling as this character">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <SheetRollers entry={pcEntry} modTotals={pcModTotals || {}} />
            </div>
          )}
          <div className="lantern-card vine-frame p-10 min-h-[300px] flex flex-col items-center justify-center text-center" data-testid="dice-display">
            {!currentRoll ? (
              <div className="text-muted-bone">
                <Dices className="w-16 h-16 mx-auto mb-4 text-lantern/40 ember-pulse" strokeWidth={1.25} />
                <p className="font-serif-display text-2xl text-bone">The bones rest unrolled</p>
                <p className="text-sm mt-2">Pick a die below — the table will see what fate brings.</p>
              </div>
            ) : (
              <>
                <div className="text-[10px] tracking-[0.4em] uppercase text-lantern mb-2" data-testid="roll-label">
                  {currentRoll.label || "Rolling…"}
                </div>
                <div
                  className={`font-serif-display text-7xl md:text-8xl leading-none ember-glow transition-all duration-300 ${
                    currentRoll.settled ? "text-bone" : "text-lantern/60 scale-90 blur-[1px]"
                  } ${currentRoll.crit ? "text-[#FBBF24]" : ""} ${currentRoll.fumble ? "text-red-400" : ""}`}
                  data-testid="roll-total"
                >
                  {currentRoll.total || currentRoll.rolls.reduce((a, r) => a + r.value, 0) + (currentRoll.modifier || 0)}
                </div>
                {currentRoll.settled && currentRoll.crit && (
                  <div className="mt-3 text-xs tracking-[0.3em] uppercase text-lantern animate-pulse" data-testid="crit-banner">
                    Natural 20 — The lantern flares
                  </div>
                )}
                {currentRoll.settled && currentRoll.fumble && (
                  <div className="mt-3 text-xs tracking-[0.3em] uppercase text-red-400 animate-pulse" data-testid="fumble-banner">
                    Natural 1 — The lantern gutters
                  </div>
                )}
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2 max-w-xl">
                  {currentRoll.rolls.map((r, i) => (
                    <div
                      key={i}
                      data-testid={`die-${r.sides}-${i}`}
                      className={`inline-flex flex-col items-center justify-center min-w-[52px] px-3 py-2 border ${
                        currentRoll.settled
                          ? "border-rust bg-stone-light text-bone"
                          : "border-[#FBBF24]/30 text-lantern animate-pulse"
                      }`}
                    >
                      <span className="text-[9px] tracking-widest text-muted-bone">d{r.sides}</span>
                      <span className="font-serif-display text-2xl leading-none">{r.value}</span>
                    </div>
                  ))}
                  {currentRoll.modifier !== 0 && currentRoll.settled && (
                    <div className="inline-flex flex-col items-center justify-center min-w-[52px] px-3 py-2 border border-[#FBBF24]/40 text-lantern">
                      <span className="text-[9px] tracking-widest text-muted-bone">MOD</span>
                      <span className="font-serif-display text-2xl leading-none">
                        {currentRoll.modifier > 0 ? `+${currentRoll.modifier}` : currentRoll.modifier}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div>
            <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-4">Tap a single die</div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
              {DIE_TYPES.map((s) => (
                <button
                  key={s}
                  onClick={() => quickRoll(s)}
                  disabled={rolling}
                  data-testid={`quick-d${s}`}
                  className="group lantern-card aspect-square flex flex-col items-center justify-center hover:bg-stone-light transition-colors disabled:opacity-60"
                >
                  <span className="font-serif-display text-3xl text-bone group-hover:text-lantern transition-colors">d{s}</span>
                  <span className="text-[9px] tracking-widest uppercase text-muted-bone mt-1">roll</span>
                </button>
              ))}
            </div>
          </div>

          <div className="lantern-card p-6" data-testid="dice-builder">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs tracking-[0.3em] uppercase text-lantern">Build a hand</div>
              <button
                onClick={resetCounts}
                data-testid="reset-builder"
                className="text-[10px] tracking-widest uppercase text-muted-bone hover:text-bone inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {DIE_TYPES.map((s) => (
                <div key={s} className="flex items-center justify-between border border-rust px-3 py-2">
                  <button onClick={() => adjust(s, -1)} data-testid={`dec-d${s}`} className="p-1 text-muted-bone hover:text-lantern">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-serif-display text-bone text-lg">
                    <span className="text-lantern" data-testid={`count-d${s}`}>{counts[s]}</span>
                    <span className="text-muted-bone mx-1">×</span>
                    d{s}
                  </span>
                  <button onClick={() => adjust(s, 1)} data-testid={`inc-d${s}`} className="p-1 text-muted-bone hover:text-lantern">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-4 mt-5 flex-wrap">
              <div className="flex items-center gap-3">
                <label className="text-[10px] tracking-[0.3em] uppercase text-lantern">Modifier</label>
                <div className="flex items-center border border-rust">
                  <button onClick={() => setModifier((m) => m - 1)} data-testid="mod-dec" className="px-2 py-1 text-muted-bone hover:text-lantern">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    value={modifier}
                    onChange={(e) => setModifier(parseInt(e.target.value || "0", 10))}
                    data-testid="mod-input"
                    className="w-16 bg-transparent text-bone text-center py-1 font-serif-display text-lg focus:outline-none"
                  />
                  <button onClick={() => setModifier((m) => m + 1)} data-testid="mod-inc" className="px-2 py-1 text-muted-bone hover:text-lantern">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <button
                onClick={rollBuilder}
                disabled={rolling || Object.values(counts).every((n) => n === 0)}
                data-testid="roll-builder"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#FBBF24] text-[#0B0E0C] font-semibold tracking-wide hover:bg-[#F59E0B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Dices className="w-4 h-4" />
                {rolling ? "Rolling…" : "Roll the bones"}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Shared Feed */}
        <aside className="lantern-card p-6 self-start" data-testid="dice-feed">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs tracking-[0.3em] uppercase text-lantern inline-flex items-center gap-2">
              <Users className="w-3.5 h-3.5" /> Around the Table
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#4A7C59] animate-pulse ml-1" title="live" />
            </div>
            {user && feed.length > 0 && (
              <button
                onClick={clearFeed}
                data-testid="clear-feed"
                className="text-[10px] tracking-widest uppercase text-muted-bone hover:text-red-400 inline-flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
          {feed.length === 0 ? (
            <p className="text-sm text-muted-bone">No rolls yet. Be the first to cast.</p>
          ) : (
            <ul className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
              {[...feed].reverse().map((h) => {
                const mine = h.player_name === playerName;
                return (
                  <li
                    key={h.id}
                    data-testid={`feed-${h.id}`}
                    className={`border-l-2 pl-3 py-1.5 transition-colors ${
                      mine ? "border-[#FBBF24]/60 bg-[#FBBF24]/5" : "border-[#2C362F] hover:border-[#FBBF24]/40"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={`text-sm font-serif-display ${mine ? "text-lantern" : "text-bone"}`}>
                        {h.player_name}
                        {mine && <span className="ml-1.5 text-[9px] tracking-[0.25em] uppercase text-muted-bone">you</span>}
                      </span>
                      <span
                        className={`font-serif-display text-2xl leading-none ${
                          h.crit ? "text-[#FBBF24] ember-glow" : h.fumble ? "text-red-400" : "text-bone"
                        }`}
                      >
                        {h.total}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 mt-0.5">
                      <span className="text-[10px] tracking-[0.25em] uppercase text-muted-bone">{h.label}</span>
                      <span className="text-[10px] text-muted-bone">{timeAgo(h.created_at)}</span>
                    </div>
                    <div className="text-[11px] text-muted-bone mt-1">
                      {h.rolls.map((r) => r.value).join(" + ")}
                      {h.modifier !== 0 && (h.modifier > 0 ? ` + ${h.modifier}` : ` − ${Math.abs(h.modifier)}`)}
                      {h.crit && <span className="ml-2 text-lantern">★ Nat 20</span>}
                      {h.fumble && <span className="ml-2 text-red-400">✕ Nat 1</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
