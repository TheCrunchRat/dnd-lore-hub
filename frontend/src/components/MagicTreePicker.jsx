import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Lock, Check, Sparkles, Flame, GitBranch } from "lucide-react";
import api from "../lib/api";

/**
 * Reusable picker modal for selecting nodes from magic trees of a given category.
 *
 * Props:
 *  - open: bool
 *  - category: "origin" | "foundation" | "class"
 *  - pcLevel: int (used for level-gate display)
 *  - unlocks: array — current selections
 *      origin:     [{tree_id, node_id, as_spell: bool}]
 *      foundation: [{tree_id, node_id}]
 *      class:      n/a (single class_tree_id, handled separately)
 *  - onChange: (newUnlocks) => void  // called when user toggles
 *  - onClose: () => void
 *
 * For "class" category the picker is in single-select mode (pickOne).
 *  - selectedTreeId: string
 *  - onSelectTree: (treeId) => void
 */

const ICON = { origin: Flame, foundation: GitBranch, class: Sparkles };
const COLOR = { origin: "#FBBF24", foundation: "#86EFAC", class: "#FCA5A5" };
const LABEL = {
  origin: { title: "Origin Magic", help: "Tap a node to bind it. Toggle the lantern to mark it castable as a spell." },
  foundation: { title: "Foundation Training", help: "Tap a node to add it to your character's training." },
  class: { title: "Class Path", help: "Pick one path. Nodes will reveal as you level up." },
};

export default function MagicTreePicker({
  open, onClose, category, pcLevel = 1,
  unlocks = [], onChange,
  selectedTreeId, onSelectTree,
}) {
  const [trees, setTrees] = useState([]);
  const [busy, setBusy] = useState(false);
  const [activeTreeId, setActiveTreeId] = useState(null);

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    api.get("/magic/trees")
      .then((r) => {
        const filtered = r.data.filter((t) => (t.tree_category || "origin") === category);
        setTrees(filtered);
        if (filtered.length > 0) {
          setActiveTreeId(selectedTreeId || filtered[0].id);
        }
      })
      .finally(() => setBusy(false));
  }, [open, category, selectedTreeId]);

  const activeTree = useMemo(() => trees.find((t) => t.id === activeTreeId), [trees, activeTreeId]);
  const isPickOne = category === "class";

  const isUnlocked = (treeId, nodeId) =>
    unlocks.some((u) => u.tree_id === treeId && u.node_id === nodeId);

  const isAsSpell = (treeId, nodeId) =>
    unlocks.find((u) => u.tree_id === treeId && u.node_id === nodeId)?.as_spell === true;

  const toggleNode = (tree, node) => {
    if (isPickOne) return;
    const exists = isUnlocked(tree.id, node.id);
    let next;
    if (exists) {
      next = unlocks.filter((u) => !(u.tree_id === tree.id && u.node_id === node.id));
    } else {
      const entry = { tree_id: tree.id, node_id: node.id };
      if (category === "origin") entry.as_spell = false;
      next = [...unlocks, entry];
    }
    onChange?.(next);
  };

  const toggleAsSpell = (tree, node, e) => {
    e.stopPropagation();
    if (!isUnlocked(tree.id, node.id)) return;
    const next = unlocks.map((u) =>
      u.tree_id === tree.id && u.node_id === node.id
        ? { ...u, as_spell: !u.as_spell }
        : u
    );
    onChange?.(next);
  };

  if (!open) return null;

  const Icon = ICON[category] || Sparkles;
  const accent = COLOR[category];
  const meta = LABEL[category];

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-[#0B0E0C]/85 backdrop-blur-sm flex items-center justify-center px-4 py-8"
      onClick={onClose}
      data-testid={`tree-picker-${category}`}
    >
      <div
        className="lantern-card vine-frame w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
        style={{ borderColor: `${accent}55` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-rust flex items-center justify-between" style={{ background: `linear-gradient(90deg, ${accent}11, transparent)` }}>
          <div className="flex items-center gap-3 min-w-0">
            <Icon className="w-5 h-5 shrink-0" style={{ color: accent }} />
            <div className="min-w-0">
              <h3 className="font-serif-display text-2xl text-bone leading-tight truncate">{meta.title}</h3>
              <div className="text-[10px] tracking-widest uppercase text-muted-bone">{meta.help}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-muted-bone hover:text-bone" data-testid="tree-picker-close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {busy ? (
          <div className="p-10 text-center text-muted-bone text-sm">Gathering the trees…</div>
        ) : trees.length === 0 ? (
          <div className="p-10 text-center text-muted-bone text-sm italic">
            No {category} trees exist yet. Ask your DM to forge one in the <span className="text-lantern">/magic</span> page.
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Tree list sidebar */}
            <div className="w-44 border-r border-rust overflow-y-auto shrink-0">
              {trees.map((t) => {
                const taken = unlocks.filter((u) => u.tree_id === t.id).length;
                const isActive = t.id === activeTreeId;
                const isSelected = isPickOne && selectedTreeId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTreeId(t.id)}
                    data-testid={`tree-tab-${t.slug}`}
                    className={`w-full text-left px-3 py-2.5 border-b border-rust/40 transition-colors ${
                      isActive ? "bg-[#FBBF24]/[0.06]" : "hover:bg-[#FBBF24]/[0.03]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: isSelected ? accent : t.accent_color || accent }}
                      />
                      <span className={`text-sm font-serif-display truncate ${isActive ? "text-bone" : "text-muted-bone"}`}>
                        {t.name}
                      </span>
                    </div>
                    {!isPickOne && taken > 0 && (
                      <div className="text-[9px] tracking-widest uppercase mt-1 ml-4" style={{ color: accent }}>
                        {taken} bound
                      </div>
                    )}
                    {isPickOne && isSelected && (
                      <div className="text-[9px] tracking-widest uppercase mt-1 ml-4 inline-flex items-center gap-1" style={{ color: accent }}>
                        <Check className="w-3 h-3" /> chosen
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Node grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTree && (
                <>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] tracking-[0.3em] uppercase text-lantern">{activeTree.subtitle || "skill tree"}</div>
                      <h4 className="font-serif-display text-xl text-bone truncate">{activeTree.name}</h4>
                    </div>
                    {isPickOne && (
                      <button
                        onClick={() => onSelectTree?.(selectedTreeId === activeTree.id ? "" : activeTree.id)}
                        data-testid={`pick-tree-${activeTree.slug}`}
                        className={`px-3 py-1.5 text-[10px] tracking-widest uppercase border transition-colors ${
                          selectedTreeId === activeTree.id
                            ? "border-[#FBBF24] text-lantern bg-[#FBBF24]/10"
                            : "border-rust text-bone hover:border-[#FBBF24]/50"
                        }`}
                      >
                        {selectedTreeId === activeTree.id ? "✓ Chosen as class" : "Choose as class"}
                      </button>
                    )}
                  </div>

                  {(activeTree.nodes || []).length === 0 ? (
                    <div className="text-muted-bone text-sm italic">No nodes in this tree yet.</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {activeTree.nodes.map((n) => {
                        const taken = isUnlocked(activeTree.id, n.id);
                        const gated = n.level_required && n.level_required > pcLevel;
                        const asSpell = isAsSpell(activeTree.id, n.id);
                        return (
                          <div
                            key={n.id}
                            onClick={() => !isPickOne && toggleNode(activeTree, n)}
                            data-testid={`node-${activeTree.slug}-${n.id}`}
                            className={`relative border p-3 transition-all ${isPickOne ? "cursor-default" : "cursor-pointer"} ${
                              taken
                                ? "border-[#FBBF24] bg-[#FBBF24]/[0.05]"
                                : "border-rust hover:border-[#FBBF24]/50"
                            } ${gated && taken ? "opacity-70" : ""}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-serif-display text-base text-bone truncate">{n.name}</div>
                                {n.description && (
                                  <div className="text-xs text-muted-bone mt-1 line-clamp-2">{n.description}</div>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {n.level_required && (
                                  <span
                                    className={`text-[9px] tracking-widest uppercase px-1.5 py-0.5 border inline-flex items-center gap-1 ${
                                      gated ? "text-red-400/80 border-red-400/40" : "text-muted-bone border-rust"
                                    }`}
                                    title={gated ? `Locked — need level ${n.level_required}` : `Min level ${n.level_required}`}
                                  >
                                    {gated && <Lock className="w-2.5 h-2.5" />} L{n.level_required}
                                  </span>
                                )}
                                {taken && !isPickOne && <Check className="w-4 h-4" style={{ color: accent }} />}
                              </div>
                            </div>

                            {/* Origin: per-node spell-castable toggle */}
                            {taken && category === "origin" && (
                              <button
                                onClick={(e) => toggleAsSpell(activeTree, n, e)}
                                data-testid={`as-spell-${n.id}`}
                                className={`mt-2 inline-flex items-center gap-1.5 text-[10px] tracking-widest uppercase px-2 py-1 border ${
                                  asSpell
                                    ? "border-[#FBBF24] text-lantern bg-[#FBBF24]/[0.08]"
                                    : "border-rust text-muted-bone hover:text-bone"
                                }`}
                              >
                                <Sparkles className="w-3 h-3" />
                                {asSpell ? "Castable spell" : "Mark as spell"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div className="px-5 py-3 border-t border-rust flex items-center justify-end">
          <button
            onClick={onClose}
            data-testid="tree-picker-done"
            className="px-4 py-2 text-xs tracking-widest uppercase bg-[#FBBF24] text-[#0B0E0C] font-semibold hover:bg-[#F59E0B]"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
