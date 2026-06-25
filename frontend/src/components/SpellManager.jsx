import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Flame, ExternalLink, Dices } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { rollPool, postRoll } from "../lib/dice";
import { toast } from "sonner";

/**
 * Prepared/known spell manager (spell slots removed in favor of RestManager).
 *
 * Origin-tree spells: any `origin_unlocks` entry with `as_spell: true` is also
 * displayed in the spells list (badge: Flame). They are level-gated: if the PC's
 * level is below `node.level_required`, the spell does not appear. Toggling
 * prepared on an origin spell adds its node name into `spells_prepared`.
 */
export default function SpellManager({ entry, canEdit, onUpdated }) {
  const m = entry?.metadata || {};
  const knownSpells = m.spells_known || [];
  const prepared = m.spells_prepared;
  const pcLevel = Math.max(1, m.level || 1);
  const originUnlocks = m.origin_unlocks || [];

  // Resolve origin-as-spell nodes (level-gated)
  const [trees, setTrees] = useState([]);
  const [library, setLibrary] = useState([]);
  useEffect(() => {
    if ((originUnlocks || []).some((u) => u.as_spell)) {
      api.get("/magic/trees").then((r) => setTrees(r.data)).catch(() => {});
    }
    api.get("/spells/library").then((r) => setLibrary(r.data || [])).catch(() => {});
  }, [originUnlocks]);

  // Look up dice config for a spell name (case-insensitive match)
  const diceFor = (name) => {
    const sp = library.find((s) => (s.name || "").toLowerCase() === name.toLowerCase());
    if (!sp || !sp.dice_count || !sp.dice_size) return null;
    return { count: sp.dice_count, sides: sp.dice_size, bonus: sp.bonus || 0 };
  };

  const originSpells = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const u of originUnlocks) {
      if (!u.as_spell) continue;
      const tree = trees.find((t) => t.id === u.tree_id);
      if (!tree) continue;
      const node = (tree.nodes || []).find((n) => n.id === u.node_id);
      if (!node) continue;
      if (node.level_required && node.level_required > pcLevel) continue;
      if (seen.has(node.name)) continue;
      seen.add(node.name);
      out.push({ name: node.name, tree, node });
    }
    return out;
  }, [originUnlocks, trees, pcLevel]);

  // Merge known spells + origin spells into a unified display list
  const allSpells = useMemo(() => {
    const knownSet = new Set(knownSpells);
    const result = knownSpells.map((s) => ({ name: s, origin: null }));
    for (const o of originSpells) {
      if (!knownSet.has(o.name)) result.push({ name: o.name, origin: { tree: o.tree, node: o.node } });
    }
    return result;
  }, [knownSpells, originSpells]);

  if (allSpells.length === 0) return null;

  const persist = async (patch) => {
    try {
      const payload = {
        name: entry.title,
        player_name: m.owner || m.player_name || entry.title,
        ...m,
        ...patch,
      };
      const { data } = await api.put(`/pcs/${entry.id}`, payload);
      onUpdated?.(data);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const togglePrepared = (spell) => {
    const allNames = allSpells.map((s) => s.name);
    const cur = Array.isArray(prepared) ? prepared : allNames; // default: all prepared
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
      <div className="lantern-card p-4 mb-6" data-testid="spells-list">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs tracking-[0.3em] uppercase text-lantern inline-flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5" /> Spells
              {Array.isArray(prepared) && (
                <span className="text-[10px] tracking-widest text-muted-bone normal-case ml-1">
                  · {prepared.length} prepared / {allSpells.length} known
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
            {allSpells.map(({ name, origin }) => {
              const isP = isPrepared(name);
              const dice = diceFor(name);
              const castSpell = async () => {
                if (!dice) return;
                const pool = rollPool({ count: dice.count, sides: dice.sides, modifier: dice.bonus });
                await postRoll({
                  pc: entry,
                  label: `${name} (${dice.count}d${dice.sides}${dice.bonus ? (dice.bonus > 0 ? `+${dice.bonus}` : dice.bonus) : ""})`,
                  kind: "spell",
                  pool,
                });
                const breakdown = pool.rolls.map((r) => r.value).join(" + ");
                toast(`${name}: ${pool.total}`, { description: `${breakdown}${dice.bonus ? (dice.bonus > 0 ? ` + ${dice.bonus}` : ` − ${Math.abs(dice.bonus)}`) : ""}` });
              };
              return (
                <li key={name} className="inline-flex items-stretch">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => togglePrepared(name)}
                    data-testid={`spell-${name.replace(/\s+/g, "-").toLowerCase()}`}
                    className={`text-xs px-2 py-1 border transition-all inline-flex items-center gap-1 ${
                      isP
                        ? "border-[#FBBF24] text-lantern bg-[#FBBF24]/[0.08] shadow-[0_0_8px_rgba(251,191,36,0.2)]"
                        : "border-rust text-muted-bone line-through opacity-60"
                    } ${canEdit ? "cursor-pointer hover:border-[#FBBF24]/60" : "cursor-default"} ${
                      origin || dice ? "rounded-l-sm border-r-0" : ""
                    }`}
                    title={origin
                      ? `Origin spell from ${origin.tree.name}${isP ? " — prepared" : " — not prepared"}`
                      : isP ? "Prepared — tap to un-prepare" : "Known but not prepared — tap to prepare"}
                  >
                    {origin && <Flame className="w-3 h-3" style={{ color: origin.tree.accent_color || "#FBBF24" }} />}
                    {name}
                  </button>
                  {dice && (
                    <button
                      onClick={castSpell}
                      data-testid={`cast-spell-${name.replace(/\s+/g, "-").toLowerCase()}`}
                      title={`Roll ${dice.count}d${dice.sides}${dice.bonus ? (dice.bonus > 0 ? `+${dice.bonus}` : dice.bonus) : ""}`}
                      className={`text-xs px-1.5 border ${origin ? "border-l-0" : "border-l-0"} inline-flex items-center transition-colors ${
                        isP ? "border-[#FBBF24] text-lantern bg-[#FBBF24]/[0.08]" : "border-rust text-muted-bone"
                      } hover:text-lantern hover:border-[#FBBF24]/60`}
                    >
                      <Dices className="w-3 h-3" />
                    </button>
                  )}
                  {origin && (
                    <Link
                      to={`/magic/${origin.tree.slug}?node=${origin.node.id}`}
                      data-testid={`view-on-tree-${name.replace(/\s+/g, "-").toLowerCase()}`}
                      title={`View on ${origin.tree.name} tree`}
                      className={`text-xs px-1.5 border border-l-0 inline-flex items-center transition-colors ${
                        isP ? "border-[#FBBF24] text-lantern bg-[#FBBF24]/[0.08]" : "border-rust text-muted-bone"
                      } hover:text-lantern hover:border-[#FBBF24]/60`}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
    </>
  );
}
