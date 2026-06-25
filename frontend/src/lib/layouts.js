import { useEffect, useState } from "react";
import api from "./api";

/** Block keys + human labels for the layout editor. Each `kind` matches what
 *  the host pages know how to render. */
export const BLOCKS = {
  character_sheet: [
    { key: "portrait",     label: "Portrait & Header",   note: "image + title + race/class line" },
    { key: "equip",        label: "Equip Banner",         note: "claim/equip controls" },
    { key: "resources",    label: "Resources",            note: "mana / wickfire / charges bars" },
    { key: "rest",         label: "Rest Controls",        note: "long + short rest buttons" },
    { key: "modifiers",    label: "Active Modifiers",     note: "stat-mod breakdown" },
    { key: "rollers",      label: "Roll Buttons",         note: "checks / saves / init / skills" },
    { key: "stats",        label: "Stat Blocks Row",      note: "HP / AC / Speed / Init / Prof" },
    { key: "abilities",    label: "Ability Scores",       note: "STR / DEX / CON / INT / WIS / CHA" },
    { key: "spells",       label: "Spell Manager",        note: "known / prepared / cast buttons" },
    { key: "treesections", label: "Magic-Tree Sections",  note: "Class Path / Foundation / Origin" },
    { key: "content",      label: "Description",          note: "markdown body" },
  ],
  dice_page: [
    { key: "active_pc",    label: "Active PC Banner",     note: "embedded sheet rollers" },
    { key: "display",      label: "Dice Display",         note: "current roll readout" },
    { key: "quick",        label: "Quick Dice",           note: "1-click die buttons" },
    { key: "builder",      label: "Dice Builder",         note: "stack & modifier picker" },
    { key: "live_feed",    label: "Live Roll Feed",       note: "party rolls in real time" },
  ],
};

export const BLOCK_LABEL = (page, key) =>
  (BLOCKS[page] || []).find((b) => b.key === key)?.label || key;

/** Fetch the realm layout. Returns a `{ character_sheet, dice_page }` map plus
 *  a `reload` callback. Safe defaults applied if the server hasn't returned yet. */
export function useRealmLayout() {
  const [layout, setLayout] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/layouts");
      setLayout(data);
    } catch { /* keep null → host falls back to default ordering */ }
  };

  useEffect(() => { load(); }, []);

  return { layout, reload: load };
}

/** Returns the *displayed* keys for a slot ("left"|"right") of a page,
 *  defaulting to the default ordering if the layout hasn't loaded. */
export const slotKeys = (layout, page, slot, defaults) => {
  if (!layout || !layout[page]) return defaults[slot] || [];
  return layout[page][slot] || [];
};

/** Per-block config lookup with safe defaults. */
export const blockConfig = (layout, page, key, fallback = {}) => {
  if (!layout || !layout[page]) return fallback;
  return { ...fallback, ...((layout[page].configs || {})[key] || {}) };
};
