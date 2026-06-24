import React, { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { renderMarkdown } from "../lib/markdown";

/**
 * Renders sanitised markdown HTML and delegates clicks on internal anchor tags
 * (the [[wiki-links]] we expand into `<a class="codex-link">`) to React Router
 * so we keep the SPA navigation feel — no full page reloads.
 *
 * Props:
 *   source   — raw markdown string
 *   entries  — full /api/entries list, used to resolve [[wiki-links]]
 *   compact  — if true, no drop-cap & tighter spacing (cards & summaries)
 */
export default function MarkdownView({ source, entries, compact = false, className = "" }) {
  const ref = useRef(null);
  const navigate = useNavigate();
  const html = useMemo(() => renderMarkdown(source, entries), [source, entries]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onClick = (e) => {
      // Find the nearest anchor inside this view
      const a = e.target.closest && e.target.closest("a");
      if (!a || !root.contains(a)) return;
      const href = a.getAttribute("href") || "";
      // Only intercept same-origin, in-app links (relative starting with / and no protocol)
      if (href.startsWith("/") && !a.target) {
        e.preventDefault();
        navigate(href);
      }
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [html, navigate]);

  return (
    <div
      ref={ref}
      data-testid="markdown-view"
      className={`prose-tome ${compact ? "prose-compact" : ""} ${className}`}
      // Sanitised in renderMarkdown via DOMPurify — safe to inject.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
