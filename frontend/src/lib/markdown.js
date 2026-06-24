// Lightweight markdown pipeline for the Lantern Realm codex.
// - marked for standard markdown → HTML
// - DOMPurify sanitises the result (HTML strings only, no React injection)
// - [[wiki-link]] cross-references are processed BEFORE marked so they survive
//   as plain anchor tags through marked/sanitiser.

import { marked } from "marked";
import DOMPurify from "dompurify";

// ----- marked config -----
marked.setOptions({
  gfm: true,        // sensible defaults but we'll lean toward a minimal feature set
  breaks: false,    // require blank line for paragraph break (matches our writing convention)
  smartypants: false,
});

const CODEX_PATHS = {
  overview: "/world",
  location: "/locations",
  character: "/characters",
  faction: "/factions",
  lore: "/lore",
  session: "/sessions",
  bestiary: "/bestiary",
};

/**
 * Slugify exactly the way the backend does so [[Mirewatch]] matches the entry
 * whose slug is "mirewatch".
 */
export function slugify(text) {
  const s = String(text || "")
    .split("")
    .map((c) => (c.match(/[a-zA-Z0-9]/) ? c.toLowerCase() : "-"))
    .join("");
  let out = s;
  while (out.includes("--")) out = out.replaceAll("--", "-");
  return out.replace(/^-+|-+$/g, "");
}

/**
 * Replace [[target]] and [[target|label]] tokens with anchor tags BEFORE markdown
 * processing — but ONLY outside of code spans / code blocks, so authors can show
 * the literal syntax in docs without it being converted.
 */
function expandCodexLinks(src, entries) {
  if (!src) return "";
  const bySlug = new Map();
  const byTitle = new Map();
  for (const e of entries || []) {
    if (e?.slug) bySlug.set(e.slug.toLowerCase(), e);
    if (e?.title) byTitle.set(e.title.toLowerCase(), e);
  }
  // Mask out fenced code blocks (```...```) and inline code spans (`...`) so we
  // don't expand wiki-tokens that the author intentionally quoted.
  const placeholders = [];
  const mask = (m) => {
    const i = placeholders.push(m) - 1;
    return `\u0000CODE${i}\u0000`;
  };
  let masked = src
    .replace(/```[\s\S]*?```/g, mask)
    .replace(/`[^`\n]+`/g, mask);

  masked = masked.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, rawTarget, rawLabel) => {
    const target = rawTarget.trim();
    const label = (rawLabel ?? rawTarget).trim();
    const hit =
      bySlug.get(target.toLowerCase()) ||
      bySlug.get(slugify(target)) ||
      byTitle.get(target.toLowerCase());
    if (hit) {
      const base = CODEX_PATHS[hit.category] || "/";
      const href = `${base}/${hit.slug}`;
      return `<a class="codex-link" data-codex-slug="${hit.slug}" href="${href}">${escapeHtml(label)}</a>`;
    }
    return `<span class="codex-link-broken" title="No entry named &quot;${escapeHtml(target)}&quot;">${escapeHtml(label)}?</span>`;
  });

  // Restore code spans / blocks exactly as the author wrote them.
  return masked.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => placeholders[Number(i)]);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Render markdown source to a sanitised HTML string with [[wiki-links]] resolved.
 */
export function renderMarkdown(src, entries) {
  const withLinks = expandCodexLinks(src || "", entries || []);
  const html = marked.parse(withLinks);
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "s", "del", "ins",
      "h1", "h2", "h3", "h4",
      "ul", "ol", "li",
      "blockquote", "hr",
      "a", "code", "pre", "span", "img",
    ],
    ALLOWED_ATTR: ["href", "title", "class", "data-codex-slug", "src", "alt", "loading"],
    ALLOW_DATA_ATTR: false,
    // Block javascript: URLs etc.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data):|\/[^/]|#)/i,
  });
}

/**
 * Plain-text excerpt of markdown for card previews and `og:description` style use.
 * Strips [[wiki]] markers (keeping the visible label) and all markdown syntax.
 */
export function markdownToPlain(src, max = 240) {
  if (!src) return "";
  let s = src
    // [[target|label]] → label;   [[target]] → target
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t, l) => (l ?? t).trim())
    // headings, blockquote markers
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    // bold / italic / code wrappers
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    // markdown links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // list bullets
    .replace(/^[-*+]\s+/gm, "• ")
    .replace(/^\d+\.\s+/gm, "")
    // collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + "…";
  return s;
}
