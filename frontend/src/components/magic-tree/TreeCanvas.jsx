import React from "react";
import * as Icons from "lucide-react";
import { Lock } from "lucide-react";
import { CANVAS_W, CANVAS_H, SIZE_RADIUS, SIZE_ICON, SIZE_FONT, curvedPath, hexToRgb } from "./constants";

/**
 * The SVG canvas that renders the skill tree:
 *   constellation dots → connection lines → linking preview → nodes → hover lock tooltip.
 *
 * All event handlers (drag, click, hover, link) are passed down from MagicTree so this
 * stays a presentation component (no state of its own beyond the svg ref).
 */
export default function TreeCanvas({
  svgRef,
  tree,
  accent,
  accentRGB,
  editMode,
  selectedNodeId,
  hoveredNodeId,
  highlightedNodeId,
  linkingFromId,
  draggingId,
  onPointerMove,
  onPointerUp,
  onCanvasClick,
  onNodePointerDown,
  onNodeEnter,
  onNodeLeave,
  onNodeClick,
}) {
  return (
    <div
      className="lantern-card overflow-hidden relative"
      style={{
        aspectRatio: `${CANVAS_W}/${CANVAS_H}`,
        background: `radial-gradient(ellipse at center, rgba(${accentRGB},0.08) 0%, #0B0E0C 70%)`,
      }}
      data-testid="tree-canvas"
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className={`w-full h-full ${editMode ? "cursor-default" : ""}`}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClick={onCanvasClick}
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
              selectedNodeId && (selectedNodeId === n.id || selectedNodeId === parent.id);
            return (
              <path
                key={`${parentId}-${n.id}`}
                d={curvedPath(x1, y1, x2, y2)}
                stroke={isHighlight ? accent : `rgba(${hexToRgb(accent)}, 0.45)`}
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
          const isHighlighted = highlightedNodeId === n.id;
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
              className={
                editMode && draggingId === n.id
                  ? "cursor-grabbing"
                  : editMode
                    ? "cursor-grab"
                    : "cursor-pointer"
              }
              onPointerDown={(e) => onNodePointerDown(e, n.id)}
              onPointerEnter={() => onNodeEnter(n.id)}
              onPointerLeave={() => onNodeLeave()}
              onClick={(e) => onNodeClick(e, n)}
              data-testid={`node-${n.id}`}
            >
              <circle
                r={isSelected || isHovered ? r + 18 : r + 10}
                fill="url(#nodeGlow)"
                opacity={isHovered || isSelected ? 1 : 0.7}
              />
              {isHighlighted && (
                <circle
                  r={r + 12}
                  fill="none"
                  stroke={nodeColor}
                  strokeWidth={2}
                  data-testid={`node-pulse-${n.id}`}
                  style={{ animation: "tree-node-pulse 1.2s ease-out infinite", transformOrigin: "center" }}
                />
              )}
              <circle
                r={r}
                fill="#0B0E0C"
                stroke={isLinkTarget ? "#FBBF24" : nodeColor}
                strokeWidth={isSelected ? 3 : isMaxed ? 2.5 : 1.5}
                strokeDasharray={isLinkTarget ? "4 3" : ""}
              />
              <circle
                r={r - 6}
                fill="none"
                stroke={nodeColor}
                strokeOpacity={isMaxed ? "0.6" : "0.22"}
              />
              <foreignObject
                x={-iconSize / 2}
                y={-iconSize / 2}
                width={iconSize}
                height={iconSize}
                style={{ pointerEvents: "none" }}
              >
                <div
                  style={{
                    width: iconSize,
                    height: iconSize,
                    color: nodeColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon size={iconSize - 4} strokeWidth={1.5} />
                </div>
              </foreignObject>
              {/* Rank pips around the bottom-arc */}
              {maxRank > 1 && (() => {
                const pips = [];
                const arc = Math.PI * 0.6;
                const startAngle = Math.PI / 2 - arc / 2;
                const stepAngle = arc / Math.max(1, maxRank - 1);
                for (let i = 0; i < maxRank; i++) {
                  const a = startAngle + stepAngle * i;
                  const pr = r + 8;
                  const px = Math.cos(a) * pr;
                  const py = Math.sin(a) * pr;
                  const filled = i < curRank;
                  pips.push(
                    <circle
                      key={i}
                      cx={px}
                      cy={py}
                      r={3.5}
                      fill={filled ? nodeColor : "#0B0E0C"}
                      stroke={nodeColor}
                      strokeWidth={1}
                      style={{ filter: filled ? `drop-shadow(0 0 3px ${nodeColor})` : "none" }}
                    />
                  );
                }
                return pips;
              })()}
              {/* Lock badge for level-restricted nodes */}
              {n.level_required && (
                <g transform={`translate(${r - 6}, ${-r + 6})`}>
                  <circle r={9} fill="#0B0E0C" stroke={nodeColor} strokeWidth={1.2} />
                  <text
                    x="0"
                    y="3"
                    textAnchor="middle"
                    fontSize="10"
                    fontFamily="'Manrope', sans-serif"
                    fontWeight="600"
                    fill={nodeColor}
                  >
                    {n.level_required}
                  </text>
                </g>
              )}
              <text
                x="0"
                y={r + (maxRank > 1 ? 26 : 18)}
                textAnchor="middle"
                fontFamily="'Cormorant Garamond', serif"
                fontSize={fontSize}
                fill={isSelected || isHovered ? "#FBBF24" : "#E6E3D8"}
                style={{ pointerEvents: "none", transition: "fill 200ms" }}
              >
                {n.name}
                {maxRank > 1 ? ` · ${curRank}/${maxRank}` : ""}
              </text>
            </g>
          );
        })}

        {/* Hover tooltip for level-locked nodes */}
        {(() => {
          const h = tree.nodes.find((n) => n.id === hoveredNodeId);
          if (!h || !h.level_required || editMode) return null;
          const size = h.tier_size || "normal";
          const r = SIZE_RADIUS[size] || SIZE_RADIUS.normal;
          const cx = h.x * CANVAS_W;
          const cy = h.y * CANVAS_H;
          const text = `Requires Level ${h.level_required}`;
          const tw = Math.max(150, text.length * 9 + 36);
          const th = 32;
          const above = cy - r - 14 > th + 6;
          const bx = Math.max(8, Math.min(CANVAS_W - tw - 8, cx - tw / 2));
          const by = above ? (cy - r - 14 - th) : (cy + r + 14);
          const ptx = cx;
          const pty = above ? (by + th) : by;
          const ptDir = above ? 1 : -1;
          return (
            <g style={{ pointerEvents: "none" }} data-testid="node-lock-tooltip">
              <rect
                x={bx} y={by} width={tw} height={th} rx={2}
                fill="#0B0E0C" stroke="#FBBF24" strokeOpacity="0.55" strokeWidth="1"
              />
              <path
                d={`M ${ptx - 6} ${pty} L ${ptx} ${pty + 6 * ptDir} L ${ptx + 6} ${pty} Z`}
                fill="#0B0E0C" stroke="#FBBF24" strokeOpacity="0.55" strokeWidth="1"
              />
              <circle cx={bx + 14} cy={by + th / 2} r="3" fill="#FBBF24" opacity="0.9">
                <animate attributeName="opacity" values="0.6;1;0.6" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <text
                x={bx + 24} y={by + th / 2 + 4}
                fontFamily="'Manrope', sans-serif" fontSize="12"
                fontWeight="600" letterSpacing="2.5" fill="#FBBF24"
              >
                {text.toUpperCase()}
              </text>
            </g>
          );
        })()}
      </svg>

      {tree.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Icons.Sparkles className="w-12 h-12 text-lantern/40 mx-auto mb-3 ember-pulse" strokeWidth={1} />
            <p className="font-serif-display text-2xl text-bone">An empty grimoire</p>
            <p className="text-sm text-muted-bone mt-2">Enter edit mode and add the first ability.</p>
          </div>
        </div>
      )}
    </div>
  );
}
