import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Save, Pencil, Link2, Unlink, Settings2 } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import MagicBackdrop from "../components/MagicBackdrop";
import TreeCanvas from "../components/magic-tree/TreeCanvas";
import NodeEditor from "../components/magic-tree/NodeEditor";
import SchoolSettings from "../components/magic-tree/SchoolSettings";
import LockedNodeModal from "../components/magic-tree/LockedNodeModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { CANVAS_W, CANVAS_H, uid, hexToRgb, createsCycle } from "../components/magic-tree/constants";

export default function MagicTree() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState(null);
  const [linkingFromId, setLinkingFromId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lockedModalNode, setLockedModalNode] = useState(null);
  const [confirmNodeDelete, setConfirmNodeDelete] = useState(null);
  const [confirmSchoolDelete, setConfirmSchoolDelete] = useState(false);
  const svgRef = useRef(null);

  // ---------- Load ----------
  useEffect(() => {
    setLoading(true);
    api.get(`/magic/trees/${slug}`)
      .then((r) => { setTree(r.data); setDirty(false); })
      .catch(() => setTree(null))
      .finally(() => setLoading(false));
  }, [slug]);

  // ---------- Deep-link: ?node=<id> opens the panel and pulses the node ----------
  useEffect(() => {
    const nodeParam = searchParams.get("node");
    if (!tree || !nodeParam) return;
    const exists = (tree.nodes || []).some((n) => n.id === nodeParam);
    if (!exists) return;
    setSelectedNodeId(nodeParam);
    setHighlightedNodeId(nodeParam);
    // Strip the param after consuming it so refreshes don't keep pulsing
    const next = new URLSearchParams(searchParams);
    next.delete("node");
    setSearchParams(next, { replace: true });
    const t = setTimeout(() => setHighlightedNodeId(null), 2400);
    return () => clearTimeout(t);
  }, [tree, searchParams, setSearchParams]);

  const accent = tree?.accent_color || "#FBBF24";
  const accentRGB = useMemo(() => hexToRgb(accent), [accent]);
  const selected = tree?.nodes?.find((n) => n.id === selectedNodeId) || null;

  // ---------- Persistence ----------
  const persist = useCallback(async (next) => {
    setSaving(true);
    try {
      const payload = {
        name: next.name,
        subtitle: next.subtitle,
        summary: next.summary,
        content: next.content,
        accent_color: next.accent_color,
        image_url: next.image_url,
        tree_category: next.tree_category || "origin",
        nodes: next.nodes,
      };
      const { data } = await api.put(`/magic/trees/${next.id}`, payload);
      setTree(data);
      setDirty(false);
      if (data.slug !== slug) navigate(`/magic/${data.slug}`, { replace: true });
      toast.success("Saved");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  }, [slug, navigate]);

  const updateTree = (patch) => {
    setTree((t) => ({ ...t, ...patch }));
    setDirty(true);
  };

  // ---------- Node ops ----------
  const updateNode = (id, patch) => {
    setTree((t) => ({
      ...t,
      nodes: t.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
    setDirty(true);
  };

  const addNode = () => {
    const newNode = {
      id: uid(),
      name: "New Ability",
      description: "Describe what this unlocks.",
      icon: "Sparkles",
      x: 0.5,
      y: 0.5,
      requires: [],
      max_rank: 1,
      current_rank: 0,
      tier_size: "normal",
      color: null,
      rank_descriptions: [],
    };
    setTree((t) => ({ ...t, nodes: [...(t.nodes || []), newNode] }));
    setSelectedNodeId(newNode.id);
    setDirty(true);
  };

  const cycleRank = (id, delta) => {
    setTree((t) => ({
      ...t,
      nodes: t.nodes.map((n) => {
        if (n.id !== id) return n;
        const max = n.max_rank || 1;
        const next = Math.max(0, Math.min(max, (n.current_rank || 0) + delta));
        return { ...n, current_rank: next };
      }),
    }));
    setDirty(true);
  };

  const deleteNode = (id) => {
    setTree((t) => ({
      ...t,
      nodes: t.nodes
        .filter((n) => n.id !== id)
        .map((n) => ({ ...n, requires: n.requires.filter((r) => r !== id) })),
    }));
    setSelectedNodeId(null);
    setLinkingFromId(null);
    setDirty(true);
  };

  const toggleConnection = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    if (createsCycle(tree.nodes, fromId, toId)) {
      toast.error("That would form a loop");
      return;
    }
    setTree((t) => ({
      ...t,
      nodes: t.nodes.map((n) => {
        if (n.id !== toId) return n;
        const has = n.requires.includes(fromId);
        return { ...n, requires: has ? n.requires.filter((r) => r !== fromId) : [...n.requires, fromId] };
      }),
    }));
    setDirty(true);
  };

  // ---------- Drag ----------
  const getSvgPoint = (clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    return pt.matrixTransform(ctm.inverse());
  };

  const onNodePointerDown = (e, id) => {
    if (!editMode) return;
    if (linkingFromId) {
      if (linkingFromId === id) {
        setLinkingFromId(null);
      } else {
        toggleConnection(linkingFromId, id);
        setLinkingFromId(null);
      }
      return;
    }
    e.stopPropagation();
    setSelectedNodeId(id);
    setDraggingId(id);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!draggingId) return;
    const p = getSvgPoint(e.clientX, e.clientY);
    if (!p) return;
    const x = Math.max(0.03, Math.min(0.97, p.x / CANVAS_W));
    const y = Math.max(0.05, Math.min(0.95, p.y / CANVAS_H));
    updateNode(draggingId, { x, y });
  };

  const onPointerUp = () => {
    setDraggingId(null);
  };

  const onNodeClick = (e, n) => {
    if (editMode) return;
    e.stopPropagation();
    setSelectedNodeId(n.id);
    if (n.level_required) setLockedModalNode(n);
  };

  // ---------- Render ----------
  if (loading) return <div className="max-w-3xl mx-auto px-6 py-24 text-muted-bone">Drawing the lines of power…</div>;
  if (!tree) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h2 className="font-serif-display text-3xl text-bone mb-4">This school was lost to the long dusk</h2>
        <Link to="/magic" className="text-lantern hover:underline">Back to the Arcane Atlas</Link>
      </div>
    );
  }

  return (
    <div className="relative" data-testid="magic-tree-page-wrap">
      <MagicBackdrop side="left" />
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 py-12" data-testid="magic-tree-page">
        <Link
          to="/magic"
          className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-muted-bone hover:text-lantern mb-6"
          data-testid="back-to-magic"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to the Atlas
        </Link>

        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div className="max-w-2xl">
            <div className="text-xs tracking-[0.35em] uppercase mb-2" style={{ color: accent }}>
              School of Magic
            </div>
            <h1 className="font-serif-display text-4xl md:text-5xl text-bone leading-none ember-glow mb-2">
              {tree.name}
            </h1>
            {tree.subtitle && (
              <p className="font-serif-display italic text-xl text-muted-bone mb-3">{tree.subtitle}</p>
            )}
            {tree.summary && <p className="text-sm text-muted-bone leading-relaxed">{tree.summary}</p>}
          </div>

          {user && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowSettings(true)}
                data-testid="settings-btn"
                className="inline-flex items-center gap-2 px-3 py-2 border border-rust text-bone hover:border-[#FBBF24]/50 text-xs tracking-[0.25em] uppercase"
              >
                <Settings2 className="w-3.5 h-3.5" /> School Details
              </button>
              <button
                onClick={() => { setEditMode((v) => !v); setSelectedNodeId(null); setLinkingFromId(null); }}
                data-testid="toggle-edit-btn"
                className={`inline-flex items-center gap-2 px-3 py-2 text-xs tracking-[0.25em] uppercase border ${
                  editMode ? "border-[#FBBF24] text-lantern bg-[#FBBF24]/10" : "border-rust text-bone hover:border-[#FBBF24]/50"
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
                {editMode ? "Editing" : "Edit Tree"}
              </button>
              {dirty && (
                <button
                  onClick={() => persist(tree)}
                  disabled={saving}
                  data-testid="save-tree-btn"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-xs tracking-[0.2em] uppercase hover:bg-[#F59E0B] disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              )}
            </div>
          )}
        </div>

        {editMode && (
          <div className="lantern-card p-4 mb-4 flex flex-wrap items-center gap-3" data-testid="edit-toolbar">
            <button
              onClick={addNode}
              data-testid="add-node-btn"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-xs tracking-widest uppercase"
            >
              <Plus className="w-3.5 h-3.5" /> Add Ability
            </button>
            {selected && (
              <button
                onClick={() => setLinkingFromId(linkingFromId === selected.id ? null : selected.id)}
                data-testid="link-mode-btn"
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs tracking-widest uppercase border ${
                  linkingFromId ? "border-[#FBBF24] text-lantern" : "border-rust text-bone hover:border-[#FBBF24]/50"
                }`}
              >
                {linkingFromId ? (
                  <><Unlink className="w-3.5 h-3.5" /> Cancel link</>
                ) : (
                  <><Link2 className="w-3.5 h-3.5" /> Link from selected</>
                )}
              </button>
            )}
            <p className="text-[11px] text-muted-bone ml-auto">
              Click a node to select · drag to move · use &ldquo;Link&rdquo; to connect prerequisites
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          <TreeCanvas
            svgRef={svgRef}
            tree={tree}
            accent={accent}
            accentRGB={accentRGB}
            editMode={editMode}
            selectedNodeId={selectedNodeId}
            hoveredNodeId={hoveredNodeId}
            highlightedNodeId={highlightedNodeId}
            linkingFromId={linkingFromId}
            draggingId={draggingId}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onCanvasClick={() => { if (linkingFromId) setLinkingFromId(null); }}
            onNodePointerDown={onNodePointerDown}
            onNodeEnter={(id) => setHoveredNodeId(id)}
            onNodeLeave={() => setHoveredNodeId(null)}
            onNodeClick={onNodeClick}
          />

          <aside className="lantern-card p-6 self-start" data-testid="node-detail-panel">
            {selected ? (
              <NodeEditor
                key={selected.id}
                node={selected}
                accent={accent}
                editMode={editMode && !!user}
                tree={tree}
                onChange={(patch) => updateNode(selected.id, patch)}
                onDelete={() => setConfirmNodeDelete(selected)}
                onStartLink={() => setLinkingFromId(linkingFromId === selected.id ? null : selected.id)}
                linkingFromId={linkingFromId}
                onClose={() => setSelectedNodeId(null)}
                onCycleRank={(delta) => cycleRank(selected.id, delta)}
              />
            ) : (
              <div>
                <div className="text-xs tracking-[0.3em] uppercase mb-3" style={{ color: accent }}>
                  The Tree of {tree.name}
                </div>
                <p className="text-sm text-muted-bone leading-relaxed mb-4">
                  {tree.content || "Tap a node to read its description, or unfold a path from root to leaf."}
                </p>
                <div className="text-[10px] tracking-[0.3em] uppercase text-muted-bone mb-2">Abilities</div>
                <ul className="space-y-1.5 max-h-[420px] overflow-y-auto">
                  {tree.nodes.map((n) => (
                    <li key={n.id}>
                      <button
                        onClick={() => setSelectedNodeId(n.id)}
                        data-testid={`list-node-${n.id}`}
                        className="text-left w-full text-sm text-bone hover:text-lantern transition-colors flex items-center gap-2"
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
                        {n.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>

      {showSettings && (
        <SchoolSettings
          tree={tree}
          onChange={updateTree}
          onClose={() => setShowSettings(false)}
          onDeleteClick={() => setConfirmSchoolDelete(true)}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmNodeDelete)}
        title={`Delete node "${confirmNodeDelete?.name || ""}"?`}
        body="The node, its rank tiers, spell links, and any connections into or out of it will be pruned from the tree."
        confirmLabel="Delete node"
        onConfirm={() => { const n = confirmNodeDelete; setConfirmNodeDelete(null); if (n) deleteNode(n.id); }}
        onCancel={() => setConfirmNodeDelete(null)}
        testid="confirm-delete-node"
      />

      <ConfirmDialog
        open={confirmSchoolDelete}
        title={`Delete the "${tree?.name || ""}" school?`}
        body="Every node, every connection, and the school itself will vanish from the party's magic. This can't be undone."
        confirmLabel="Delete school"
        onConfirm={async () => {
          setConfirmSchoolDelete(false);
          try {
            await api.delete(`/magic/trees/${tree.id}`);
            toast.success("School deleted");
            navigate("/magic");
          } catch (e) { toast.error(formatApiError(e)); }
        }}
        onCancel={() => setConfirmSchoolDelete(false)}
        testid="confirm-delete-school"
      />

      {lockedModalNode && (
        <LockedNodeModal
          node={lockedModalNode}
          accent={accent}
          onClose={() => setLockedModalNode(null)}
        />
      )}
    </div>
  );
}
