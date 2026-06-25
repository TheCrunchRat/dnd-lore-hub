/**
 * Compute stat modifiers (bonuses & penalties) for a PC based on all unlocked
 * magic-tree nodes that pass the level gate.
 *
 *   computeModifiers(entry, trees) -> { totals: { str: 2, hp: 10, ... }, byStat: { str: [{value, source}], ... } }
 *
 * `byStat` is useful for tooltips listing each contributing node.
 *
 * Origin & Foundation unlocks: the player picked them. Modifiers apply when
 * level_required <= pc.level (or no requirement).
 *
 * Class tree (single class_tree_id): every node in the chosen tree applies
 * when level_required <= pc.level. No manual pick needed.
 */
export const STAT_KEYS = ["str", "dex", "con", "int", "wis", "cha", "hp", "ac", "speed", "init"];

const emptyAggregate = () => ({
  totals: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
  byStat: Object.fromEntries(STAT_KEYS.map((k) => [k, []])),
});

function addNodeMods(agg, tree, node, pcLevel) {
  if (!node || !Array.isArray(node.modifiers) || node.modifiers.length === 0) return;
  const gate = node.level_required || 0;
  if (gate > pcLevel) return; // level-gated, not active yet
  for (const m of node.modifiers) {
    if (!m || !m.stat || typeof m.value !== "number") continue;
    const k = String(m.stat).toLowerCase();
    if (!STAT_KEYS.includes(k)) continue;
    agg.totals[k] = (agg.totals[k] || 0) + m.value;
    agg.byStat[k].push({ value: m.value, tree: tree.name, node: node.name, color: tree.accent_color });
  }
}

export function computeModifiers(entry, trees) {
  const agg = emptyAggregate();
  if (!entry || !trees || trees.length === 0) return agg;
  const m = entry.metadata || {};
  const pcLevel = Math.max(1, m.level || 1);
  const treeMap = Object.fromEntries(trees.map((t) => [t.id, t]));

  // Origin + Foundation: player-picked unlocks
  for (const u of (m.origin_unlocks || [])) {
    const t = treeMap[u.tree_id];
    if (!t) continue;
    const n = (t.nodes || []).find((x) => x.id === u.node_id);
    addNodeMods(agg, t, n, pcLevel);
  }
  for (const u of (m.foundation_unlocks || [])) {
    const t = treeMap[u.tree_id];
    if (!t) continue;
    const n = (t.nodes || []).find((x) => x.id === u.node_id);
    addNodeMods(agg, t, n, pcLevel);
  }

  // Class tree: auto-unlock all gated-passable nodes
  if (m.class_tree_id) {
    const t = treeMap[m.class_tree_id];
    if (t) for (const n of (t.nodes || [])) addNodeMods(agg, t, n, pcLevel);
  }

  return agg;
}
