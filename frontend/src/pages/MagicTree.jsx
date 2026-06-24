import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import * as Icons from "lucide-react";
import { ArrowLeft, Plus, Save, X, Pencil, Trash2, Link2, Unlink, Settings2, Minus } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

const CANVAS_W = 1400;
const CANVAS_H = 1000;

const SIZE_RADIUS = { small: 22, normal: 32, large: 44, huge: 56 };
const SIZE_ICON = { small: 16, normal: 22, large: 30, huge: 38 };
const SIZE_FONT = { small: 13, normal: 16, large: 20, huge: 24 };

const ICON_OPTIONS = [
  "Sparkles", "Flame", "Eye", "Shield", "Compass", "Zap", "Sun", "Moon", "Star",
  "Leaf", "Footprints", "Heart", "BookOpen", "Bird", "Skull", "Swords", "Wand",
  "Snowflake", "Droplet", "Wind", "Mountain", "Trees", "Bone", "Crown", "Key",
];

function uid() {
  return "n_" + Math.random().toString(36).slice(2, 9);
}

function curvedPath(x1, y1, x2, y2) {
  // Smooth bezier curve between two nodes
  const dy = y2 - y1;
  const cy1 = y1 + dy * 0.5;
  const cy2 = y2 - dy * 0.5;
  return `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`;
}

export default function MagicTree() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [linkingFromId, setLinkingFromId] = useState(null); // when connecting
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const svgRef = useRef(null);

  // ---------- Load ----------
  useEffect(() => {
    setLoading(true);
    api.get(`/magic/trees/${slug}`)
      .then((r) => { setTree(r.data); setDirty(false); })
      .catch(() => setTree(null))
      .finally(() => setLoading(false));
  }, [slug]);

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
    // Prevent immediate cycle: don't allow target to require source if source already requires target chain
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

  const onPointerDownNode = (e, id) => {
    if (!editMode) return;
    if (linkingFromId) {
      // finalize/cancel link
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
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-12" data-testid="magic-tree-page">
      <Link to="/magic" className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-muted-bone hover:text-lantern mb-6" data-testid="back-to-magic">
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
          {tree.subtitle && <p className="font-serif-display italic text-xl text-muted-bone mb-3">{tree.subtitle}</p>}
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
              {linkingFromId ? <><Unlink className="w-3.5 h-3.5" /> Cancel link</> : <><Link2 className="w-3.5 h-3.5" /> Link from selected</>}
            </button>
          )}
          <p className="text-[11px] text-muted-bone ml-auto">
            Click a node to select · drag to move · use &ldquo;Link&rdquo; to connect prerequisites
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* CANVAS */}
        <div
          className="lantern-card overflow-hidden relative"
          style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}`, background: "radial-gradient(ellipse at center, rgba(" + accentRGB + ",0.08) 0%, #0B0E0C 70%)" }}
          data-testid="tree-canvas"
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            className={`w-full h-full ${editMode ? "cursor-default" : ""}`}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onClick={() => { if (linkingFromId) setLinkingFromId(null); }}
          >
            <defs>
              <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={accent} stopOpacity="0.7" />
                <stop offset="60%" stopColor={accent} stopOpacity="0.15" />
                <stop offset="100%" stopColor={accent} stopOpacity="0" />
              </radialGradient>
              <linearGradient id="lineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={accent} stopOpacity="0.7" />
                <stop offset="100%" stopColor={accent} stopOpacity="0.2" />
              </linearGradient>
              <filter id="nodeShadow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="8" />
              </filter>
            </defs>

            {/* Subtle constellation dots */}
            {Array.from({ length: 40 }).map((_, i) => {
              const x = ((i * 73) % 100) / 100 * CANVAS_W;
              const y = ((i * 113) % 100) / 100 * CANVAS_H;
              return <circle key={i} cx={x} cy={y} r="0.6" fill="#E6E3D8" opacity="0.08" />;
            })}

            {/* Connection lines */}
            {tree.nodes.map((n) =>
              n.requires.map((parentId) => {
                const parent = tree.nodes.find((p) => p.id === parentId);
                if (!parent) return null;
                const x1 = parent.x * CANVAS_W;
                const y1 = parent.y * CANVAS_H;
                const x2 = n.x * CANVAS_W;
                const y2 = n.y * CANVAS_H;
                const isHighlight =
                  selectedNodeId &&
                  (selectedNodeId === n.id || selectedNodeId === parent.id);
                return (
                  <path
                    key={`${parentId}-${n.id}`}
                    d={curvedPath(x1, y1, x2, y2)}
                    stroke={isHighlight ? accent : `rgba(${accentRGB}, 0.45)`}
                    strokeWidth={isHighlight ? 2 : 1.2}
                    fill="none"
                    strokeDasharray={isHighlight ? "" : "1 4"}
                    strokeLinecap="round"
                    style={{ transition: "stroke 200ms" }}
                  />
                );
              })
            )}

            {/* Linking-in-progress preview */}
            {linkingFromId && hoveredNodeId && linkingFromId !== hoveredNodeId && (() => {
              const a = tree.nodes.find((n) => n.id === linkingFromId);
              const b = tree.nodes.find((n) => n.id === hoveredNodeId);
              if (!a || !b) return null;
              return (
                <path
                  d={curvedPath(a.x * CANVAS_W, a.y * CANVAS_H, b.x * CANVAS_W, b.y * CANVAS_H)}
                  stroke={accent}
                  strokeWidth="2"
                  fill="none"
                  strokeDasharray="6 6"
                  strokeLinecap="round"
                  opacity="0.8"
                />
              );
            })()}

            {/* Nodes */}
            {tree.nodes.map((n) => {
              const cx = n.x * CANVAS_W;
              const cy = n.y * CANVAS_H;
              const isSelected = selectedNodeId === n.id;
              const isHovered = hoveredNodeId === n.id;
              const isLinkTarget = linkingFromId && linkingFromId !== n.id;
              const Icon = Icons[n.icon] || Icons.Sparkles;
              const size = n.tier_size || "normal";
              const r = SIZE_RADIUS[size] || SIZE_RADIUS.normal;
              const iconSize = SIZE_ICON[size] || 22;
              const fontSize = SIZE_FONT[size] || 16;
              const nodeColor = n.color || accent;
              const maxRank = Math.max(1, n.max_rank || 1);
              const curRank = Math.max(0, Math.min(maxRank, n.current_rank || 0));
              const isMaxed = curRank >= maxRank;
              return (
                <g
                  key={n.id}
                  transform={`translate(${cx}, ${cy})`}
                  className={editMode && draggingId === n.id ? "cursor-grabbing" : editMode ? "cursor-grab" : "cursor-pointer"}
                  onPointerDown={(e) => onPointerDownNode(e, n.id)}
                  onPointerEnter={() => setHoveredNodeId(n.id)}
                  onPointerLeave={() => setHoveredNodeId(null)}
                  onClick={(e) => { if (!editMode) { e.stopPropagation(); setSelectedNodeId(n.id); } }}
                  data-testid={`node-${n.id}`}
                >
                  <circle r={isSelected || isHovered ? r + 18 : r + 10} fill="url(#nodeGlow)" opacity={isHovered || isSelected ? 1 : 0.7} />
                  <circle
                    r={r}
                    fill="#0B0E0C"
                    stroke={isLinkTarget ? "#FBBF24" : nodeColor}
                    strokeWidth={isSelected ? 3 : isMaxed ? 2.5 : 1.5}
                    strokeDasharray={isLinkTarget ? "4 3" : ""}
                  />
                  <circle r={r - 6} fill="none" stroke={nodeColor} strokeOpacity={isMaxed ? "0.6" : "0.22"} />
                  <foreignObject x={-iconSize/2} y={-iconSize/2} width={iconSize} height={iconSize} style={{ pointerEvents: "none" }}>
                    <div style={{ width: iconSize, height: iconSize, color: nodeColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={iconSize - 4} strokeWidth={1.5} />
                    </div>
                  </foreignObject>
                  {/* Rank pips around the bottom-arc */}
                  {maxRank > 1 && (() => {
                    const pips = [];
                    const arc = Math.PI * 0.6; // 108deg arc at bottom
                    const startAngle = Math.PI / 2 - arc / 2; // start to the right-below
                    const stepAngle = arc / Math.max(1, maxRank - 1);
                    for (let i = 0; i < maxRank; i++) {
                      const a = startAngle + stepAngle * i;
                      const pr = r + 8;
                      const px = Math.cos(a) * pr;
                      const py = Math.sin(a) * pr;
                      const filled = i < curRank;
                      pips.push(
                        <circle key={i} cx={px} cy={py} r={3.5}
                          fill={filled ? nodeColor : "#0B0E0C"}
                          stroke={nodeColor} strokeWidth={1}
                          style={{ filter: filled ? `drop-shadow(0 0 3px ${nodeColor})` : "none" }} />
                      );
                    }
                    return pips;
                  })()}
                  <text
                    x="0" y={r + (maxRank > 1 ? 26 : 18)}
                    textAnchor="middle"
                    fontFamily="'Cormorant Garamond', serif"
                    fontSize={fontSize}
                    fill={isSelected || isHovered ? "#FBBF24" : "#E6E3D8"}
                    style={{ pointerEvents: "none", transition: "fill 200ms" }}
                  >
                    {n.name}{maxRank > 1 ? ` · ${curRank}/${maxRank}` : ""}
                  </text>
                </g>
              );
            })}
          </svg>

          {tree.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <Icons.Sparkles className="w-12 h-12 text-lantern/40 mx-auto mb-3 ember-pulse" strokeWidth={1} />
                <p className="font-serif-display text-2xl text-bone">An empty grimoire</p>
                {user && <p className="text-sm text-muted-bone mt-2">Enter edit mode and add the first ability.</p>}
              </div>
            </div>
          )}
        </div>

        {/* SIDE PANEL */}
        <aside className="lantern-card p-6 self-start" data-testid="node-detail-panel">
          {selected ? (
            <NodeEditor
              key={selected.id}
              node={selected}
              accent={accent}
              editMode={editMode && !!user}
              tree={tree}
              onChange={(patch) => updateNode(selected.id, patch)}
              onDelete={() => deleteNode(selected.id)}
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

      {showSettings && (
        <SchoolSettings
          tree={tree}
          onChange={updateTree}
          onClose={() => setShowSettings(false)}
          onDelete={async () => {
            if (!window.confirm(`Delete the entire ${tree.name} school?`)) return;
            try {
              await api.delete(`/magic/trees/${tree.id}`);
              toast.success("School deleted");
              navigate("/magic");
            } catch (e) { toast.error(formatApiError(e)); }
          }}
        />
      )}
    </div>
  );
}

function NodeEditor({ node, accent, editMode, tree, onChange, onDelete, onStartLink, linkingFromId, onClose, onCycleRank }) {
  const Icon = Icons[node.icon] || Icons.Sparkles;
  const parents = tree.nodes.filter((n) => node.requires.includes(n.id));
  const maxRank = Math.max(1, node.max_rank || 1);
  const curRank = Math.max(0, Math.min(maxRank, node.current_rank || 0));
  const nodeColor = node.color || accent;

  return (
    <div data-testid={`node-editor-${node.id}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border flex items-center justify-center" style={{ borderColor: nodeColor }}>
            <Icon size={18} style={{ color: nodeColor }} strokeWidth={1.5} />
          </div>
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: nodeColor }}>Ability</div>
            {editMode ? (
              <input
                value={node.name}
                onChange={(e) => onChange({ name: e.target.value })}
                data-testid="edit-node-name"
                className="font-serif-display text-xl text-bone bg-transparent border-b border-rust focus:border-[#FBBF24] focus:outline-none"
              />
            ) : (
              <h3 className="font-serif-display text-xl text-bone">{node.name}</h3>
            )}
          </div>
        </div>
        <button onClick={onClose} data-testid="close-node-panel" className="p-1 text-muted-bone hover:text-bone">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Rank progression — available to everyone (player and DM) */}
      <div className="lantern-card p-3 mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] tracking-[0.3em] uppercase text-lantern">Rank</span>
          <div className="flex gap-1">
            {Array.from({ length: maxRank }).map((_, i) => (
              <span key={i} className="w-2.5 h-2.5 rounded-full" style={{ background: i < curRank ? nodeColor : "transparent", border: `1px solid ${nodeColor}` }} />
            ))}
          </div>
          <span className="text-sm text-bone ml-1">{curRank}/{maxRank}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onCycleRank(-1)} data-testid="rank-minus" className="p-1.5 border border-rust text-muted-bone hover:text-bone disabled:opacity-30" disabled={curRank === 0}>
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onCycleRank(+1)} data-testid="rank-plus" className="p-1.5 border border-rust text-muted-bone hover:text-lantern disabled:opacity-30" disabled={curRank === maxRank}>
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {editMode ? (
        <textarea
          rows={4}
          value={node.description}
          onChange={(e) => onChange({ description: e.target.value })}
          data-testid="edit-node-description"
          className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y text-sm leading-relaxed mb-4"
        />
      ) : (
        <p className="text-sm text-bone leading-relaxed mb-4">{node.description || <span className="text-muted-bone italic">No description yet.</span>}</p>
      )}

      {/* Per-rank descriptions (read-only show, edit-mode input) */}
      {((node.rank_descriptions && node.rank_descriptions.length) || editMode) && (
        <div className="mb-4">
          <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">Per-rank effect</div>
          {editMode ? (
            <textarea
              rows={Math.max(2, maxRank)}
              value={(node.rank_descriptions || []).join("\n")}
              onChange={(e) => onChange({ rank_descriptions: e.target.value.split("\n") })}
              placeholder={`One line per rank — e.g.\nRank 1: +1 to attack\nRank 2: +2 to attack\n…`}
              className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y text-sm"
            />
          ) : (
            <ol className="space-y-1 text-sm">
              {(node.rank_descriptions || []).map((rd, i) => (
                <li key={i} className={`flex items-start gap-2 ${i < curRank ? "text-bone" : "text-muted-bone"}`}>
                  <span className={`text-[10px] tracking-widest uppercase mt-1 ${i < curRank ? "text-lantern" : "text-muted-bone"}`}>R{i+1}</span>
                  <span>{rd}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {editMode && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-1.5">Max rank (1-5)</div>
              <input
                type="number" min={1} max={5}
                value={maxRank}
                onChange={(e) => onChange({ max_rank: Math.max(1, Math.min(5, parseInt(e.target.value || "1", 10))) })}
                data-testid="edit-max-rank"
                className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
              />
            </div>
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-1.5">Node size</div>
              <select
                value={node.tier_size || "normal"}
                onChange={(e) => onChange({ tier_size: e.target.value })}
                data-testid="edit-tier-size"
                className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
              >
                <option value="small">Small</option>
                <option value="normal">Normal</option>
                <option value="large">Large (keystone)</option>
                <option value="huge">Huge (capstone)</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-1.5">Node color (override)</div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={node.color || accent}
                onChange={(e) => onChange({ color: e.target.value })}
                className="w-12 h-9 bg-transparent border border-rust cursor-pointer"
              />
              <input
                type="text"
                value={node.color || ""}
                onChange={(e) => onChange({ color: e.target.value || null })}
                placeholder="(uses tree accent)"
                className="flex-1 px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none font-mono text-xs"
              />
              {node.color && (
                <button onClick={() => onChange({ color: null })} className="text-[10px] uppercase tracking-widest text-muted-bone hover:text-bone">Reset</button>
              )}
            </div>
          </div>

          <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">Icon</div>
          <div className="grid grid-cols-8 gap-1 mb-4 max-h-32 overflow-y-auto" data-testid="icon-picker">
            {ICON_OPTIONS.map((name) => {
              const I = Icons[name] || Icons.Sparkles;
              const active = node.icon === name;
              return (
                <button key={name} type="button" onClick={() => onChange({ icon: name })} title={name} data-testid={`icon-${name}`}
                  className={`p-1.5 border ${active ? "border-[#FBBF24] bg-[#FBBF24]/10" : "border-rust hover:border-[#FBBF24]/40"}`}>
                  <I size={16} style={{ color: active ? nodeColor : "#9CA3AF" }} strokeWidth={1.5} />
                </button>
              );
            })}
          </div>

          <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">Position</div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <NumInput label="X" value={node.x} onChange={(v) => onChange({ x: Math.max(0, Math.min(1, v)) })} step={0.01} />
            <NumInput label="Y" value={node.y} onChange={(v) => onChange({ y: Math.max(0, Math.min(1, v)) })} step={0.01} />
          </div>

          <div className="flex gap-2 mb-4">
            <button
              onClick={onStartLink}
              data-testid="start-link-btn"
              className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs tracking-widest uppercase border ${
                linkingFromId === node.id
                  ? "border-[#FBBF24] text-lantern bg-[#FBBF24]/10"
                  : "border-rust text-bone hover:border-[#FBBF24]/50"
              }`}
            >
              {linkingFromId === node.id ? "Cancel" : "Link to…"}
            </button>
            <button
              onClick={onDelete}
              data-testid="delete-node-btn"
              className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs tracking-widest uppercase border border-rust text-muted-bone hover:text-red-400 hover:border-red-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}

      {parents.length > 0 && (
        <>
          <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">Requires</div>
          <div className="flex flex-wrap gap-1.5">
            {parents.map((p) => (
              <span key={p.id} className="text-xs uppercase tracking-wider border border-rust px-2 py-1 text-bone">
                {p.name}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SchoolSettings({ tree, onChange, onClose, onDelete }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0B0E0C]/80 backdrop-blur-sm" onClick={onClose} data-testid="settings-overlay">
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
            onClick={onDelete}
            data-testid="delete-tree-btn"
            className="w-full mt-6 inline-flex items-center justify-center gap-2 px-4 py-2 border border-rust text-muted-bone hover:text-red-400 hover:border-red-800 text-xs tracking-widest uppercase"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete this school
          </button>
        </div>
      </div>
    </div>
  );
}

function NumInput({ label, value, onChange, step = 0.01 }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] tracking-[0.3em] uppercase text-muted-bone">{label}</span>
      <input
        type="number"
        min={0}
        max={1}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value || "0"))}
        className="px-2 py-1.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none text-sm font-mono"
      />
    </label>
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

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return "251, 191, 36";
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
}

function createsCycle(nodes, fromId, toId) {
  // Returns true if adding edge fromId -> toId (toId.requires += fromId) would form a cycle
  // Walk from `fromId` via requires edges; if we encounter `toId`, that's a cycle.
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
