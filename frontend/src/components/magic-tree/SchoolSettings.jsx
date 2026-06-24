import React from "react";
import { X, Trash2 } from "lucide-react";

/**
 * Slide-over panel for school-level details: name, subtitle, summary, content, accent color,
 * category. Includes a two-click confirm delete (no native window.confirm — those silently break).
 */
export default function SchoolSettings({ tree, onChange, onClose, onDeleteClick, confirmDelete }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B0E0C]/80 backdrop-blur-sm"
      onClick={onClose}
      data-testid="settings-overlay"
    >
      <div
        className="absolute right-0 top-0 h-full w-full max-w-md bg-stone-deep border-l border-rust overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-stone-deep border-b border-rust px-6 py-4 flex items-center justify-between">
          <h2 className="font-serif-display text-2xl text-bone">School Details</h2>
          <button onClick={onClose} data-testid="close-settings" className="p-2 text-muted-bone hover:text-bone">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Name">
            <input
              value={tree.name}
              onChange={(e) => onChange({ name: e.target.value })}
              data-testid="settings-name"
              className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </Field>
          <Field label="Subtitle">
            <input
              value={tree.subtitle || ""}
              onChange={(e) => onChange({ subtitle: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </Field>
          <Field label="Summary">
            <textarea
              rows={3}
              value={tree.summary || ""}
              onChange={(e) => onChange({ summary: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y"
            />
          </Field>
          <Field label="Long lore / content">
            <textarea
              rows={5}
              value={tree.content || ""}
              onChange={(e) => onChange({ content: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y"
            />
          </Field>
          <Field label="Accent color (hex)">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={tree.accent_color || "#FBBF24"}
                onChange={(e) => onChange({ accent_color: e.target.value })}
                data-testid="settings-color"
                className="w-12 h-10 bg-transparent border border-rust cursor-pointer"
              />
              <input
                type="text"
                value={tree.accent_color || "#FBBF24"}
                onChange={(e) => onChange({ accent_color: e.target.value })}
                className="flex-1 px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none font-mono text-sm"
              />
            </div>
          </Field>

          <Field label="Category">
            <select
              value={tree.tree_category || "origin"}
              onChange={(e) => onChange({ tree_category: e.target.value })}
              data-testid="settings-category"
              className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            >
              <option value="origin">Origin Magic (school)</option>
              <option value="foundation">Foundation (constellation)</option>
              <option value="class">Class (skill path)</option>
            </select>
          </Field>

          <button
            onClick={onDeleteClick}
            data-testid="delete-tree-btn"
            className={`w-full mt-6 inline-flex items-center justify-center gap-2 px-4 py-2 border text-xs tracking-widest uppercase ${
              confirmDelete
                ? "border-red-700 text-red-300 bg-red-950/30 hover:bg-red-900/40"
                : "border-rust text-muted-bone hover:text-red-400 hover:border-red-800"
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {confirmDelete ? "Click again to confirm deletion" : "Delete this school"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] tracking-[0.3em] uppercase text-lantern mb-1.5">{label}</label>
      {children}
    </div>
  );
}
