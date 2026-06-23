import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import * as Icons from "lucide-react";
import { ArrowLeft, Plus, Save, X, Pencil, Trash2, Link2, Unlink, Settings2 } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

const CANVAS_W = 1100;
const CANVAS_H = 760;

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
    };
    setTree((t) => ({ ...t, nodes: [...(t.nodes || []), newNode] }));
    setSelectedNodeId(newNode.id);
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
                  {/* glow halo */}
                  <circle r={isSelected || isHovered ? 56 : 42} fill="url(#nodeGlow)" opacity={isHovered || isSelected ? 1 : 0.7} />
                  {/* node body */}
                  <circle
                    r="28"
                    fill="#0B0E0C"
                    stroke={isLinkTarget ? "#FBBF24" : accent}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    strokeDasharray={isLinkTarget ? "4 3" : ""}
                  />
                  {/* inner ring */}
                  <circle r="22" fill="none" stroke={accent} strokeOpacity="0.25" />
                  {/* icon — render lucide via foreignObject */}
                  <foreignObject x={-12} y={-12} width="24" height="24" style={{ pointerEvents: "none" }}>
                    <div style={{ width: 24, height: 24, color: accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={20} strokeWidth={1.5} />
                    </div>
                  </foreignObject>
                  {/* name label */}
                  <text
                    x="0"
                    y="48"
                    textAnchor="middle"
                    fontFamily="'Cormorant Garamond', serif"
                    fontSize="16"
                    fill={isSelected || isHovered ? "#FBBF24" : "#E6E3D8"}
                    style={{ pointerEvents: "none", transition: "fill 200ms" }}
                  >
                    {n.name}
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

function NodeEditor({ node, accent, editMode, tree, onChange, onDelete, onStartLink, linkingFromId, onClose }) {
  const Icon = Icons[node.icon] || Icons.Sparkles;
  const parents = tree.nodes.filter((n) => node.requires.includes(n.id));

  return (
    <div data-testid={`node-editor-${node.id}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border flex items-center justify-center" style={{ borderColor: accent }}>
            <Icon size={18} style={{ color: accent }} strokeWidth={1.5} />
          </div>
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: accent }}>Ability</div>
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

      {editMode ? (
        <textarea
          rows={6}
          value={node.description}
          onChange={(e) => onChange({ description: e.target.value })}
          data-testid="edit-node-description"
          className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y text-sm leading-relaxed mb-4"
        />
      ) : (
        <p className="text-sm text-bone leading-relaxed mb-4">{node.description || <span className="text-muted-bone italic">No description yet.</span>}</p>
      )}

      {editMode && (
        <>
          <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">Icon</div>
          <div className="grid grid-cols-8 gap-1 mb-4 max-h-32 overflow-y-auto" data-testid="icon-picker">
            {ICON_OPTIONS.map((name) => {
              const I = Icons[name] || Icons.Sparkles;
              const active = node.icon === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onChange({ icon: name })}
                  title={name}
                  data-testid={`icon-${name}`}
                  className={`p-1.5 border ${active ? "border-[#FBBF24] bg-[#FBBF24]/10" : "border-rust hover:border-[#FBBF24]/40"}`}
                >
                  <I size={16} style={{ color: active ? accent : "#9CA3AF" }} strokeWidth={1.5} />
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
