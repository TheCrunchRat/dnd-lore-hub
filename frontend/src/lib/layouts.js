import { useEffect, useState } from "react";
import api from "./api";

/** Frontend mirror of the backend DEFAULT_LAYOUTS — used as a fallback when
 *  the layout has not loaded yet, when all slots are empty (DM reset), or when
 *  a saved layout is missing a recently-added block. */
export const DEFAULT_LAYOUTS = {
  character_sheet: {
    left: [
      "portrait", "equip", "resources", "rest", "modifiers",
      "rollers", "stats", "abilities", "saves_skills", "spells",
      "treesections", "gear", "content",
    ],
    right: [],
    hidden: [],
    configs: { portrait: { size: "medium" } },
  },
  dice_page: {
    left: ["active_pc", "display", "quick", "builder"],
    right: ["live_feed"],
    hidden: [],
    configs: { live_feed: { limit: 50 } },
  },
};

/** Block keys + human labels for the layout editor. Each `key` matches what
 *  the host page knows how to render. */
export const BLOCKS = {
  character_sheet: [
    { key: "portrait",     label: "Portrait & Header",   note: "image + title + race/class line" },
    { key: "equip",        label: "Equip Banner",         note: "claim / unequip controls" },
    { key: "resources",    label: "Resources",            note: "mana / wickfire / charges bars" },
    { key: "rest",         label: "Rest Controls",        note: "long + short rest buttons" },
    { key: "modifiers",    label: "Active Modifiers",     note: "stat-mod breakdown" },
    { key: "rollers",      label: "Roll Buttons",         note: "checks / saves / init / skills" },
    { key: "stats",        label: "Stat Blocks Row",      note: "HP / AC / Speed / Init / Prof" },
    { key: "abilities",    label: "Ability Scores",       note: "STR / DEX / CON / INT / WIS / CHA" },
    { key: "saves_skills", label: "Saves & Skills",       note: "side-by-side save + skill lists" },
    { key: "spells",       label: "Spell Manager",        note: "known / prepared / cast buttons" },
    { key: "treesections", label: "Magic-Tree Sections",  note: "Class Path / Foundation / Origin" },
    { key: "gear",         label: "Gear & Traits",        note: "equipment, features, languages" },
    { key: "content",      label: "Description",          note: "markdown body" },
  ],
  dice_page: [
    { key: "active_pc",    label: "Active PC Banner",     note: "embedded sheet rollers" },
    { key: "display",      label: "Dice Display",         note: "current roll readout" },
    { key: "quick",        label: "Quick Dice",           note: "1-click die buttons" },
    { key: "builder",      label: "Dice Builder",         note: "stack & modifier picker" },
    { key: "live_feed",    label: "Live Roll Feed",       note: "shared party rolls" },
  ],
};

export const BLOCK_LABEL = (page, key) =>
  (BLOCKS[page] || []).find((b) => b.key === key)?.label || key;

/** Fetch the realm layout once. Returns `{ layout, reload }`. The layout will
 *  be `null` until the first response. */
export function useRealmLayout() {
  const [layout, setLayout] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/layouts");
      setLayout(data);
    } catch { /* keep null → callers fall back to default ordering */ }
  };

  useEffect(() => { load(); }, []);

  return { layout, reload: load };
}

/** Resolve the effective page config:
 *  - if `layout` is still loading → default
 *  - if a page is missing → default
 *  - if all three slots are empty (e.g. DM "reset") → default
 *  Reconciles against the BLOCKS registry: blocks not assigned to any slot
 *  get appended to `left`; saved keys not in the registry are dropped. */
export const effectivePage = (layout, page) => {
  const def = DEFAULT_LAYOUTS[page] || { left: [], right: [], hidden: [], configs: {} };
  const known = new Set((BLOCKS[page] || []).map((b) => b.key));
  let src;
  if (!layout || !layout[page]) {
    src = def;
  } else {
    const p = layout[page];
    const totalKeys = (p.left?.length || 0) + (p.right?.length || 0) + (p.hidden?.length || 0);
    src = totalKeys === 0 ? def : p;
  }
  const left = (src.left || []).filter((k) => known.has(k));
  const right = (src.right || []).filter((k) => known.has(k));
  const hidden = (src.hidden || []).filter((k) => known.has(k));
  const placed = new Set([...left, ...right, ...hidden]);
  // Append any registered blocks that the saved layout missed (e.g. new blocks added after save)
  for (const k of known) if (!placed.has(k)) left.push(k);
  return {
    left, right, hidden,
    configs: { ...(def.configs || {}), ...(src.configs || {}) },
  };
};

/** Per-block config lookup with safe fallback. */
export const blockConfig = (layout, page, key, fallback = {}) => {
  const p = effectivePage(layout, page);
  return { ...fallback, ...(p.configs?.[key] || {}) };
};
