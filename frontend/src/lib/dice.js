import api, { formatApiError } from "./api";
import { toast } from "sonner";

/** Random integer in [1, sides]. */
export const rollDie = (sides) => Math.floor(Math.random() * sides) + 1;

/**
 * Roll a pool of dice and return a result object compatible with the dice-feed
 * schema.
 *
 *   rollPool({ count: 3, sides: 6, modifier: 2, kind: "spell" })
 *   → { rolls: [{sides:6,result:..},{...}], modifier: 2, total: ..., crit, fumble }
 */
export const rollPool = ({ count = 1, sides = 20, modifier = 0 }) => {
  const safeCount = Math.max(1, parseInt(count || 1, 10));
  const safeSides = parseInt(sides || 20, 10);
  const safeMod = parseInt(modifier || 0, 10) || 0;
  const rolls = Array.from({ length: safeCount }, () => ({
    sides: safeSides,
    value: rollDie(safeSides),
  }));
  const subtotal = rolls.reduce((s, r) => s + r.value, 0);
  const total = subtotal + safeMod;
  const crit = safeSides === 20 && safeCount === 1 && rolls[0].value === 20;
  const fumble = safeSides === 20 && safeCount === 1 && rolls[0].value === 1;
  return { rolls, modifier: safeMod, total, crit, fumble };
};

/** Ability modifier: floor((score - 10) / 2). */
export const abilityMod = (score) =>
  score == null ? 0 : Math.floor((Number(score) - 10) / 2);

/** D&D 5e proficiency bonus by level. */
export const profBonus = (level) =>
  Math.max(2, 2 + Math.floor((Math.max(1, Number(level) || 1) - 1) / 4));

/**
 * Post a roll to the shared dice feed so it shows up live on /dice.
 *  - `pc`: { id, title, metadata.owner } (optional; supplies pc_id / pc_name)
 *  - `playerName`: fallback name if no PC
 */
export const postRoll = async ({
  pc, playerName,
  label, kind = "custom",
  pool, // result of rollPool()
}) => {
  if (!pool) throw new Error("postRoll: pool required");
  const name = (pc?.metadata?.owner || playerName || pc?.title || "Anonymous").slice(0, 40);
  try {
    await api.post("/dice/rolls", {
      player_name: name,
      label,
      rolls: pool.rolls,
      modifier: pool.modifier || 0,
      total: pool.total,
      crit: pool.crit,
      fumble: pool.fumble,
      pc_id: pc?.id || null,
      pc_name: pc?.title || null,
      kind,
    });
  } catch (e) {
    toast.error(formatApiError(e));
  }
};

/**
 * Roll a single check (1d20 + modifier) for a PC and post to the feed.
 * Returns the pool so the caller can toast it.
 */
export const rollAndPost = async ({ pc, label, modifier = 0, count = 1, sides = 20, kind = "ability" }) => {
  const pool = rollPool({ count, sides, modifier });
  await postRoll({ pc, label, kind, pool });
  return pool;
};

/** D&D 5e skills table — name → ability key. */
export const SKILLS_5E = [
  { name: "Acrobatics", ability: "dex" },
  { name: "Animal Handling", ability: "wis" },
  { name: "Arcana", ability: "int" },
  { name: "Athletics", ability: "str" },
  { name: "Deception", ability: "cha" },
  { name: "History", ability: "int" },
  { name: "Insight", ability: "wis" },
  { name: "Intimidation", ability: "cha" },
  { name: "Investigation", ability: "int" },
  { name: "Medicine", ability: "wis" },
  { name: "Nature", ability: "int" },
  { name: "Perception", ability: "wis" },
  { name: "Performance", ability: "cha" },
  { name: "Persuasion", ability: "cha" },
  { name: "Religion", ability: "int" },
  { name: "Sleight of Hand", ability: "dex" },
  { name: "Stealth", ability: "dex" },
  { name: "Survival", ability: "wis" },
];

export const ABILITY_LABEL = {
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};
