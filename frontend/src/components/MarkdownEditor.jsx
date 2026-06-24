import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bold, Italic, Heading, Heading2, List, ListOrdered, Quote, Link as LinkIcon,
  Code, Eye, EyeOff, BookOpen,
} from "lucide-react";
import MarkdownView from "./MarkdownView";
import ImageUploader from "./ImageUploader";

/**
 * Markdown text editor with:
 *  - inline toolbar (B / I / H1 / H2 / list / ordered list / quote / link / code / [[wiki]])
 *  - live preview toggle (split view)
 *  - [[ autocomplete: when the cursor sits right after "[[", a popup lists matching codex entries
 *
 * Props:
 *   value, onChange   — controlled text
 *   entries           — codex entries for wiki-link autocomplete and preview
 *   rows, minRows     — sizing hints
 *   testid            — base data-testid (defaults to "md-editor")
 *   placeholder       — textarea placeholder
 *   helpHint          — small text under the toolbar
 */
export default function MarkdownEditor({
  value = "",
  onChange,
  entries = [],
  rows = 10,
  placeholder = "Write in markdown… use [[Entry Name]] to link.",
  testid = "md-editor",
  helpHint = "Markdown: **bold** *italic* # heading > quote - bullet · link with [[Entry Title]]",
}) {
  const taRef = useRef(null);
  const [showPreview, setShowPreview] = useState(false);
  const [acState, setAcState] = useState(null); // {open:bool, query:string, start:int, items:[]}

  // ---------- Toolbar helpers ----------
  const surround = (left, right = left) => {
    const ta = taRef.current; if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const before = value.slice(0, start);
    const sel = value.slice(start, end) || "";
    const after = value.slice(end);
    const next = before + left + sel + right + after;
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const caret = sel ? (start + left.length + sel.length + right.length) : (start + left.length);
      ta.selectionStart = ta.selectionEnd = caret;
    });
  };
  const prefixLines = (prefix) => {
    const ta = taRef.current; if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const block = value.slice(lineStart, end);
    const transformed = block.split("\n").map((ln) => (ln.startsWith(prefix) ? ln : prefix + ln)).join("\n");
    const next = value.slice(0, lineStart) + transformed + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = lineStart;
      ta.selectionEnd = lineStart + transformed.length;
    });
  };
  const insertAtCursor = (text, selectInside = null) => {
    const ta = taRef.current; if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      if (selectInside) {
        const i = text.indexOf(selectInside);
        if (i >= 0) {
          ta.selectionStart = start + i;
          ta.selectionEnd = start + i + selectInside.length;
          return;
        }
      }
      ta.selectionStart = ta.selectionEnd = start + text.length;
    });
  };

  const tools = [
    { icon: Bold, label: "Bold (Ctrl+B)", action: () => surround("**"), testid: "md-bold" },
    { icon: Italic, label: "Italic (Ctrl+I)", action: () => surround("*"), testid: "md-italic" },
    { icon: Heading, label: "Heading 1", action: () => prefixLines("# "), testid: "md-h1" },
    { icon: Heading2, label: "Heading 2", action: () => prefixLines("## "), testid: "md-h2" },
    { icon: List, label: "Bullet list", action: () => prefixLines("- "), testid: "md-ul" },
    { icon: ListOrdered, label: "Numbered list", action: () => prefixLines("1. "), testid: "md-ol" },
    { icon: Quote, label: "Blockquote", action: () => prefixLines("> "), testid: "md-quote" },
    { icon: LinkIcon, label: "Markdown link", action: () => insertAtCursor("[text](https://)", "text"), testid: "md-link" },
    { icon: Code, label: "Inline code", action: () => surround("`"), testid: "md-code" },
    { icon: BookOpen, label: "Codex link [[Entry]]", action: () => insertAtCursor("[[Entry]]", "Entry"), testid: "md-codex" },
  ];

  // ---------- [[ autocomplete ----------
  const recompAutocomplete = () => {
    const ta = taRef.current; if (!ta) { setAcState(null); return; }
    const caret = ta.selectionStart;
    if (caret !== ta.selectionEnd) { setAcState(null); return; }
    // find last unclosed [[ before caret on this line
    const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
    const segment = value.slice(lineStart, caret);
    const lastOpen = segment.lastIndexOf("[[");
    if (lastOpen < 0) { setAcState(null); return; }
    const afterOpen = segment.slice(lastOpen + 2);
    // if user already closed it (]]) on the same line within this token — bail
    if (afterOpen.includes("]]") || afterOpen.includes("\n")) { setAcState(null); return; }
    const query = afterOpen;
    const tokenStart = lineStart + lastOpen + 2;
    const q = query.trim().toLowerCase();
    const items = (entries || [])
      .filter((e) => {
        if (!q) return true;
        return (e.title || "").toLowerCase().includes(q) || (e.slug || "").toLowerCase().includes(q);
      })
      .slice(0, 6);
    setAcState({ open: items.length > 0, query, start: tokenStart, items, hover: 0 });
  };

  useEffect(() => { recompAutocomplete(); }, [value]);

  const acceptAutocomplete = (entry) => {
    if (!acState || !entry) return;
    const ta = taRef.current; if (!ta) return;
    const before = value.slice(0, acState.start);
    const after = value.slice(ta.selectionStart);
    const closing = after.startsWith("]]") ? "" : "]]";
    const insertion = entry.title + closing;
    const next = before + insertion + after;
    onChange(next);
    setAcState(null);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = (before + insertion).length;
      ta.selectionStart = ta.selectionEnd = pos + (closing ? 0 : 2); // jump past ]] if it already existed
    });
  };

  // ---------- Keyboard shortcuts ----------
  const onKeyDown = (e) => {
    // Autocomplete navigation
    if (acState?.open) {
      if (e.key === "ArrowDown") { e.preventDefault(); setAcState((s) => ({ ...s, hover: (s.hover + 1) % s.items.length })); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setAcState((s) => ({ ...s, hover: (s.hover - 1 + s.items.length) % s.items.length })); return; }
      if (e.key === "Enter")     { e.preventDefault(); acceptAutocomplete(acState.items[acState.hover]); return; }
      if (e.key === "Escape")    { e.preventDefault(); setAcState(null); return; }
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); surround("**"); }
      else if (k === "i") { e.preventDefault(); surround("*"); }
      else if (k === "k") { e.preventDefault(); insertAtCursor("[[Entry]]", "Entry"); }
    }
  };

  const wordCount = useMemo(() => {
    const trimmed = (value || "").trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [value]);

  return (
    <div className="border border-rust focus-within:border-[#FBBF24]/60 bg-[#0B0E0C]" data-testid={testid}>
      {/* Toolbar */}
      <div className="flex items-center flex-wrap gap-0.5 border-b border-rust px-1.5 py-1 bg-[#151B17]" data-testid={`${testid}-toolbar`}>
        {tools.map((t) => (
          <ToolBtn key={t.testid} {...t} />
        ))}
        <ImageUploader
          compact
          testid={`${testid}-img`}
          onUploaded={(url) => insertAtCursor(`![image](${url})`, "image")}
        />
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          data-testid={`${testid}-toggle-preview`}
          className={`inline-flex items-center gap-1.5 px-2 py-1 text-[10px] tracking-widest uppercase border transition-colors ${
            showPreview
              ? "border-[#FBBF24]/50 text-lantern bg-[#FBBF24]/10"
              : "border-rust text-muted-bone hover:text-lantern hover:border-[#FBBF24]/40"
          }`}
          title={showPreview ? "Hide preview" : "Show preview"}
        >
          {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          Preview
        </button>
      </div>

      {/* Editor + (optional) preview */}
      <div className={`grid ${showPreview ? "grid-cols-1 md:grid-cols-2 divide-x divide-rust" : "grid-cols-1"}`}>
        <div className="relative">
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onClick={recompAutocomplete}
            onKeyUp={recompAutocomplete}
            rows={rows}
            placeholder={placeholder}
            data-testid={`${testid}-textarea`}
            className="w-full px-3 py-2.5 bg-transparent text-bone focus:outline-none resize-y font-mono text-sm leading-relaxed"
            spellCheck="false"
          />
          {acState?.open && (
            <Autocomplete
              items={acState.items}
              hover={acState.hover}
              onPick={acceptAutocomplete}
              testid={`${testid}-autocomplete`}
            />
          )}
        </div>
        {showPreview && (
          <div className="px-4 py-3 max-h-[420px] overflow-y-auto" data-testid={`${testid}-preview`}>
            {value.trim() ? (
              <MarkdownView source={value} entries={entries} compact />
            ) : (
              <p className="text-xs text-muted-bone italic">The preview lantern is unlit — start writing to see it glow.</p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-rust px-3 py-1.5 flex items-center justify-between text-[10px] text-muted-bone bg-[#0B0E0C]/60">
        <span>{helpHint}</span>
        <span>{wordCount.toLocaleString()} word{wordCount === 1 ? "" : "s"} · {value.length.toLocaleString()} chars</span>
      </div>
    </div>
  );
}

function ToolBtn({ icon: Icon, label, action, testid }) {
  return (
    <button
      type="button"
      onClick={action}
      title={label}
      data-testid={testid}
      className="p-1.5 text-muted-bone hover:text-lantern hover:bg-[#FBBF24]/5 transition-colors"
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
    </button>
  );
}

function Autocomplete({ items, hover, onPick, testid }) {
  return (
    <div
      className="absolute left-3 top-2 z-20 mt-7 w-80 max-w-[90%] border border-[#FBBF24]/40 bg-[#0B0E0C] shadow-[0_0_30px_rgba(11,14,12,0.9)]"
      data-testid={testid}
    >
      <div className="px-3 py-1.5 text-[10px] tracking-[0.3em] uppercase text-lantern border-b border-rust">
        Link to a codex entry
      </div>
      <ul className="max-h-64 overflow-y-auto">
        {items.map((e, i) => (
          <li key={e.id || e.slug}>
            <button
              type="button"
              onMouseDown={(ev) => { ev.preventDefault(); onPick(e); }}
              data-testid={`${testid}-item-${e.slug}`}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                i === hover ? "bg-[#FBBF24]/10" : "hover:bg-[#FBBF24]/5"
              }`}
            >
              <span className="text-[9px] tracking-[0.25em] uppercase text-muted-bone">{e.category}</span>
              <span className="text-sm text-bone truncate">{e.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
