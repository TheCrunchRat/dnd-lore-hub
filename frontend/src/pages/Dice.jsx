import React, { useState, useRef } from "react";
import { Dices, RotateCcw, Trash2, Plus, Minus } from "lucide-react";

const DIE_TYPES = [4, 6, 8, 10, 12, 20, 100];

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

export default function Dice() {
  const [history, setHistory] = useState([]); // [{id, label, rolls, modifier, total, ts, crit}]
  const [currentRoll, setCurrentRoll] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [counts, setCounts] = useState({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 1, 100: 0 });
  const [modifier, setModifier] = useState(0);
  const rollIdRef = useRef(0);

  const adjust = (sides, delta) => {
    setCounts((c) => ({ ...c, [sides]: Math.max(0, Math.min(20, (c[sides] || 0) + delta)) }));
  };

  const quickRoll = (sides) => {
    performRoll({ [sides]: 1 }, 0);
  };

  const performRoll = (diceMap, mod) => {
    const entries = Object.entries(diceMap).filter(([, n]) => n > 0);
    if (entries.length === 0) return;
    setRolling(true);
    // Quick animated "tumble" — flicker random results, then settle
    let ticks = 0;
    const tickInterval = setInterval(() => {
      const tempRolls = entries.flatMap(([s, n]) =>
        Array.from({ length: n }, () => ({ sides: Number(s), value: rollDie(Number(s)) }))
      );
      setCurrentRoll({ rolls: tempRolls, total: 0, modifier: mod, settled: false });
      ticks += 1;
      if (ticks >= 8) {
        clearInterval(tickInterval);
        // Final settled roll
        const finalRolls = entries.flatMap(([s, n]) =>
          Array.from({ length: n }, () => ({ sides: Number(s), value: rollDie(Number(s)) }))
        );
        const sum = finalRolls.reduce((a, r) => a + r.value, 0) + mod;
        const label = entries.map(([s, n]) => `${n}d${s}`).join(" + ") + (mod ? (mod > 0 ? ` + ${mod}` : ` − ${Math.abs(mod)}`) : "");
        const crit = finalRolls.some((r) => r.sides === 20 && r.value === 20);
        const fumble = finalRolls.some((r) => r.sides === 20 && r.value === 1);
        const id = ++rollIdRef.current;
        setCurrentRoll({ id, label, rolls: finalRolls, total: sum, modifier: mod, settled: true, crit, fumble });
        setHistory((h) => [{ id, label, rolls: finalRolls, total: sum, modifier: mod, ts: Date.now(), crit, fumble }, ...h].slice(0, 20));
        setRolling(false);
      }
    }, 60);
  };

  const rollBuilder = () => {
    performRoll(counts, modifier);
  };

  const resetCounts = () => {
    setCounts({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 });
    setModifier(0);
  };

  const clearHistory = () => setHistory([]);

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16" data-testid="dice-page">
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-3">
          <span className="block w-10 h-px bg-[#FBBF24]/60" />
          <span className="text-xs tracking-[0.35em] uppercase text-lantern">The Lanternkeeper&rsquo;s Bones</span>
        </div>
        <h1 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-bone leading-none ember-glow mb-3">
          Roll the Bones
        </h1>
        <p className="text-muted-bone max-w-2xl leading-relaxed">
          Cast the dice by lantern-light. Tap a die for a single roll, or build a hand of dice with a modifier
          for the more complex throws the world sometimes asks of you.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        {/* LEFT: Roll Display + Quick + Builder */}
        <div className="space-y-8">
          {/* Display */}
          <div className="lantern-card vine-frame p-10 min-h-[280px] flex flex-col items-center justify-center text-center" data-testid="dice-display">
            {!currentRoll ? (
              <div className="text-muted-bone">
                <Dices className="w-16 h-16 mx-auto mb-4 text-lantern/40 ember-pulse" strokeWidth={1.25} />
                <p className="font-serif-display text-2xl text-bone">The bones rest unrolled</p>
                <p className="text-sm mt-2">Pick a die below — the lantern will tell you what fate brings.</p>
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

          {/* Quick roll */}
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

          {/* Builder */}
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
                  <button
                    onClick={() => adjust(s, -1)}
                    data-testid={`dec-d${s}`}
                    className="p-1 text-muted-bone hover:text-lantern"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-serif-display text-bone text-lg">
                    <span className="text-lantern" data-testid={`count-d${s}`}>{counts[s]}</span>
                    <span className="text-muted-bone mx-1">×</span>
                    d{s}
                  </span>
                  <button
                    onClick={() => adjust(s, 1)}
                    data-testid={`inc-d${s}`}
                    className="p-1 text-muted-bone hover:text-lantern"
                  >
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

        {/* RIGHT: History */}
        <aside className="lantern-card p-6 self-start" data-testid="dice-history">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs tracking-[0.3em] uppercase text-lantern">Recent throws</div>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                data-testid="clear-history"
                className="text-[10px] tracking-widest uppercase text-muted-bone hover:text-red-400 inline-flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-muted-bone">No rolls yet — the lantern is patient.</p>
          ) : (
            <ul className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              {history.map((h) => (
                <li
                  key={h.id}
                  data-testid={`history-${h.id}`}
                  className="border-l-2 border-[#2C362F] pl-3 py-1 hover:border-[#FBBF24]/60 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[10px] tracking-[0.25em] uppercase text-muted-bone">{h.label}</span>
                    <span
                      className={`font-serif-display text-2xl leading-none ${
                        h.crit ? "text-[#FBBF24] ember-glow" : h.fumble ? "text-red-400" : "text-bone"
                      }`}
                    >
                      {h.total}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-bone mt-1">
                    {h.rolls.map((r) => r.value).join(" + ")}
                    {h.modifier !== 0 && (h.modifier > 0 ? ` + ${h.modifier}` : ` − ${Math.abs(h.modifier)}`)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
