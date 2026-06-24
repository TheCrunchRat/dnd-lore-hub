// Shared constants & utilities for the Magic Tree system.

export const CANVAS_W = 1400;
export const CANVAS_H = 1000;

export const SIZE_RADIUS = { small: 22, normal: 32, large: 44, huge: 56 };
export const SIZE_ICON = { small: 16, normal: 22, large: 30, huge: 38 };
export const SIZE_FONT = { small: 13, normal: 16, large: 20, huge: 24 };

export const ICON_OPTIONS = [
  "Sparkles", "Flame", "Eye", "Shield", "Compass", "Zap", "Sun", "Moon", "Star",
  "Leaf", "Footprints", "Heart", "BookOpen", "Bird", "Skull", "Swords", "Wand",
  "Snowflake", "Droplet", "Wind", "Mountain", "Trees", "Bone", "Crown", "Key",
  "Sword", "Axe", "Hammer", "Bow", "Target", "Anchor", "Feather", "Cross",
  "Castle", "Gem", "Coins", "Scroll", "Lock", "Unlock", "Hourglass", "Map",
  "Telescope", "Cloud", "CloudLightning", "CloudRain", "Sunrise", "Sunset",
  "Crosshair", "Aperture", "Atom", "Bug", "Cat", "Dog", "Egg", "Fish",
  "Flower2", "GitBranch", "Globe", "Hand", "Hexagon", "Lightbulb", "Music",
  "Pickaxe", "Pyramid", "Rocket", "Ship", "Spade", "TentTree", "Trophy",
];

export function uid() {
  return "n_" + Math.random().toString(36).slice(2, 9);
}

export function curvedPath(x1, y1, x2, y2) {
  // Smooth bezier curve between two nodes
  const dy = y2 - y1;
  const cy1 = y1 + dy * 0.5;
  const cy2 = y2 - dy * 0.5;
  return `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`;
}

export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return "251, 191, 36";
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
}

export function createsCycle(nodes, fromId, toId) {
  // Returns true if adding edge fromId -> toId (toId.requires += fromId) would form a cycle.
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const stack = [fromId];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (cur === toId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const node = byId[cur];
    if (!node) continue;
    for (const r of node.requires || []) stack.push(r);
  }
  return false;
}
