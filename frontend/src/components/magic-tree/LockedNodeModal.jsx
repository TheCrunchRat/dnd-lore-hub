import React from "react";
import * as Icons from "lucide-react";
import { X, Lock } from "lucide-react";

/**
 * Popup shown when a player clicks a node that has a level requirement.
 * Displays node name, lock-badged icon, "Requires Level N" banner, description,
 * per-rank effects (if any), and a flavour-text closer.
 */
export default function LockedNodeModal({ node, accent, onClose }) {
  const Icon = Icons[node.icon] || Icons.Sparkles;
  const nodeColor = node.color || accent;
  const maxRank = Math.max(1, node.max_rank || 1);
  const curRank = Math.max(0, Math.min(maxRank, node.current_rank || 0));
  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B0E0C]/85 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onClose}
      data-testid="locked-node-modal"
    >
      <div
        className="lantern-card vine-frame p-7 w-full max-w-md relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ember glow behind icon */}
        <div
          className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-30"
          style={{ background: nodeColor }}
        />
        <div className="relative">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full border-2 flex items-center justify-center relative"
                style={{ borderColor: nodeColor }}
              >
                <Icon size={22} style={{ color: nodeColor }} strokeWidth={1.5} />
                <span
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#0B0E0C] border flex items-center justify-center"
                  style={{ borderColor: nodeColor }}
                >
                  <Lock className="w-3 h-3" style={{ color: nodeColor }} />
                </span>
              </div>
              <div>
                <div
                  className="text-[10px] tracking-[0.3em] uppercase"
                  style={{ color: nodeColor }}
                >
                  Sealed Ability
                </div>
                <h3 className="font-serif-display text-2xl text-bone leading-tight">
                  {node.name}
                </h3>
              </div>
            </div>
            <button
              onClick={onClose}
              data-testid="locked-modal-close"
              className="p-1 text-muted-bone hover:text-bone"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div
            className="border border-[#FBBF24]/40 bg-[#FBBF24]/5 px-4 py-3 mb-5 flex items-center gap-3"
            data-testid="locked-modal-level"
          >
            <Lock className="w-4 h-4 text-lantern shrink-0" />
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-lantern">
                Level Requirement
              </div>
              <div className="font-serif-display text-xl text-bone">
                Requires Level {node.level_required}
              </div>
            </div>
          </div>

          {node.description && (
            <p className="text-sm text-muted-bone leading-relaxed mb-4">
              {node.description}
            </p>
          )}

          {node.rank_descriptions && node.rank_descriptions.length > 0 && (
            <div className="mb-4">
              <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">
                Per-rank effect
              </div>
              <ol className="space-y-1 text-sm">
                {node.rank_descriptions.map((rd, i) => (
                  <li
                    key={i}
                    className={`flex items-start gap-2 ${i < curRank ? "text-bone" : "text-muted-bone"}`}
                  >
                    <span
                      className={`text-[10px] tracking-widest uppercase mt-1 ${i < curRank ? "text-lantern" : "text-muted-bone"}`}
                    >
                      R{i + 1}
                    </span>
                    <span>{rd}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <p className="text-xs italic text-muted-bone leading-relaxed border-t border-rust/60 pt-3">
            The lantern&rsquo;s glow does not yet reach this path. Walk the realm a while longer.
          </p>
        </div>
      </div>
    </div>
  );
}
