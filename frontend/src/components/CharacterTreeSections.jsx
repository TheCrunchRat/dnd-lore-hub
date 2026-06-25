import React, { useEffect, useMemo, useState } from "react";
import { Flame, GitBranch, Sparkles, PenSquare, Lock } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import MagicTreePicker from "./MagicTreePicker";

/**
 * Renders the three magic-tree-driven sections on a character sheet:
 *  - Foundation Training (list of unlocked foundation nodes, level-gated)
 *  - Origin Powers (list of unlocked origin nodes that are NOT marked as castable spells)
 *  - Class Features (nodes from the selected class tree, auto-revealed as level increases)
 *
 * Origin spells (`as_spell == true`) are NOT rendered here — they merge into
 * SpellManager so they can share the spell-prep flow.
 */
export default function CharacterTreeSections({ entry, canEdit, onUpdated }) {
  const m = entry?.metadata || {};
  const pcLevel = Math.max(1, m.level || 1);
  const originUnlocks = m.origin_unlocks || [];
  const foundationUnlocks = m.foundation_unlocks || [];
  const classTreeId = m.class_tree_id || "";

  const [trees, setTrees] = useState([]);
  const [pickerCat, setPickerCat] = useState(null); // "origin" | "foundation" | "class" | null

  useEffect(() => {
    api.get("/magic/trees").then((r) => setTrees(r.data)).catch(() => {});
  }, []);

  const treeMap = useMemo(() => {
    const out = {};
    for (const t of trees) out[t.id] = t;
    return out;
  }, [trees]);

  const persist = async (patch, toastMsg) => {
    try {
      const payload = {
        name: entry.title,
        player_name: m.owner || m.player_name || entry.title,
        ...m,
        ...patch,
      };
      const { data } = await api.put(`/pcs/${entry.id}`, payload);
      onUpdated?.(data);
      if (toastMsg) toast.success(toastMsg);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  // Resolve a node — returns null if tree or node is gone
  const resolveNode = (treeId, nodeId) => {
    const tree = treeMap[treeId];
    if (!tree) return null;
    const node = (tree.nodes || []).find((n) => n.id === nodeId);
    if (!node) return null;
    return { tree, node };
  };

  // ----- Foundation -----
  const foundationItems = foundationUnlocks
    .map((u) => resolveNode(u.tree_id, u.node_id))
    .filter(Boolean);

  // ----- Origin (only non-spell powers; spells are handled by SpellManager) -----
  const originItems = originUnlocks
    .filter((u) => !u.as_spell)
    .map((u) => resolveNode(u.tree_id, u.node_id))
    .filter(Boolean);

  // ----- Class features -----
  const classTree = classTreeId ? treeMap[classTreeId] : null;
  const classNodes = (classTree?.nodes || []).filter(
    (n) => !n.level_required || n.level_required <= pcLevel
  );

  if (!canEdit && foundationItems.length === 0 && originItems.length === 0 && classNodes.length === 0) {
    return null;
  }

  return (
    <>
      {/* Class Features (auto by level) */}
      {(classTree || canEdit) && (
        <Section
          icon={Sparkles}
          color="#FCA5A5"
          label={classTree ? `Class Path · ${classTree.name}` : "Class Path"}
          edit={canEdit ? () => setPickerCat("class") : null}
          editLabel={classTree ? "Change" : "Choose"}
          empty={classTree
            ? (classNodes.length === 0 ? "No features unlocked at this level yet. Level up to reveal more." : null)
            : "No class path chosen. Pick a homebrew class tree."}
        >
          {classNodes.length > 0 && (
            <ul className="space-y-2">
              {classNodes.sort((a, b) => (a.level_required || 0) - (b.level_required || 0)).map((n) => (
                <li key={n.id} className="border-l-2 border-[#FCA5A5]/50 pl-3 py-1" data-testid={`class-feat-${n.id}`}>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-serif-display text-base text-bone">{n.name}</span>
                    {n.level_required && (
                      <span className="text-[9px] tracking-widest uppercase text-muted-bone">Lv {n.level_required}+</span>
                    )}
                  </div>
                  {n.description && <div className="text-xs text-muted-bone mt-0.5">{n.description}</div>}
                </li>
              ))}
            </ul>
          )}
          {classTree && pcLevel < (classTree.nodes || []).reduce((mx, n) => Math.max(mx, n.level_required || 0), 0) && (
            <div className="text-[10px] tracking-widest uppercase text-muted-bone mt-3 inline-flex items-center gap-1">
              <Lock className="w-3 h-3" /> More features unlock as you level
            </div>
          )}
        </Section>
      )}

      {/* Foundation Training (manual picks, level-gated for display) */}
      {(foundationItems.length > 0 || canEdit) && (
        <Section
          icon={GitBranch}
          color="#86EFAC"
          label="Foundation Training"
          edit={canEdit ? () => setPickerCat("foundation") : null}
          empty="No foundation training acquired."
        >
          {foundationItems.length > 0 && (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {foundationItems.map(({ tree, node }) => {
                const gated = node.level_required && node.level_required > pcLevel;
                return (
                  <li
                    key={`${tree.id}-${node.id}`}
                    className={`border p-2.5 ${gated ? "border-red-400/40 opacity-60" : "border-rust"}`}
                    style={!gated ? { borderColor: `${tree.accent_color || "#86EFAC"}55` } : {}}
                    data-testid={`foundation-${node.id}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-serif-display text-sm text-bone">{node.name}</span>
                      {gated ? (
                        <span className="text-[9px] tracking-widest uppercase text-red-400/80 inline-flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> Lv {node.level_required}
                        </span>
                      ) : (
                        <span className="text-[9px] tracking-widest uppercase text-muted-bone">{tree.name}</span>
                      )}
                    </div>
                    {node.description && (
                      <div className="text-[11px] text-muted-bone mt-1 line-clamp-2">{node.description}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      {/* Origin Powers (non-spell entries) */}
      {(originItems.length > 0 || canEdit) && (
        <Section
          icon={Flame}
          color="#FBBF24"
          label="Origin Powers"
          edit={canEdit ? () => setPickerCat("origin") : null}
          empty="No origin powers bound."
        >
          {originItems.length > 0 && (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {originItems.map(({ tree, node }) => {
                const gated = node.level_required && node.level_required > pcLevel;
                return (
                  <li
                    key={`${tree.id}-${node.id}`}
                    className={`border p-2.5 ${gated ? "border-red-400/40 opacity-60" : "border-rust"}`}
                    style={!gated ? { borderColor: `${tree.accent_color || "#FBBF24"}55` } : {}}
                    data-testid={`origin-${node.id}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-serif-display text-sm text-bone">{node.name}</span>
                      {gated ? (
                        <span className="text-[9px] tracking-widest uppercase text-red-400/80 inline-flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> Lv {node.level_required}
                        </span>
                      ) : (
                        <span className="text-[9px] tracking-widest uppercase text-muted-bone">{tree.name}</span>
                      )}
                    </div>
                    {node.description && (
                      <div className="text-[11px] text-muted-bone mt-1 line-clamp-2">{node.description}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      <MagicTreePicker
        open={!!pickerCat}
        category={pickerCat || "origin"}
        pcLevel={pcLevel}
        unlocks={pickerCat === "origin" ? originUnlocks : pickerCat === "foundation" ? foundationUnlocks : []}
        selectedTreeId={classTreeId}
        onChange={(next) => {
          if (pickerCat === "origin") persist({ origin_unlocks: next });
          else if (pickerCat === "foundation") persist({ foundation_unlocks: next });
        }}
        onSelectTree={(treeId) => persist({ class_tree_id: treeId || "" }, treeId ? "Class path chosen" : "Class cleared")}
        onClose={() => setPickerCat(null)}
      />
    </>
  );
}

function Section({ icon: Icon, color, label, edit, editLabel = "Edit", empty, children }) {
  const hasChildren = React.Children.count(children) > 0;
  return (
    <div className="lantern-card p-4 mb-6" style={{ borderColor: `${color}33` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs tracking-[0.3em] uppercase inline-flex items-center gap-2" style={{ color }}>
          <Icon className="w-3.5 h-3.5" /> {label}
        </div>
        {edit && (
          <button
            onClick={edit}
            data-testid={`edit-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] tracking-widest uppercase border border-rust text-muted-bone hover:text-bone hover:border-[#FBBF24]/50"
          >
            <PenSquare className="w-3 h-3" /> {editLabel}
          </button>
        )}
      </div>
      {hasChildren ? children : <div className="text-xs text-muted-bone italic">{empty}</div>}
    </div>
  );
}
