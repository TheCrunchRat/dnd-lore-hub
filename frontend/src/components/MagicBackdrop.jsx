import React from "react";

/**
 * Decorative background for Magic pages: a hanging chain with a vine-wrapped lantern.
 * Renders as an absolutely-positioned, low-opacity SVG that sits behind page content.
 * Place once near the top of the Magic page; uses pointer-events: none.
 */
export default function MagicBackdrop({ side = "right" }) {
  const isRight = side === "right";
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* Right (and left mirrored) hanging lantern */}
      <svg
        viewBox="0 0 200 700"
        preserveAspectRatio="xMidYMin meet"
        className={`absolute top-0 ${isRight ? "right-0 sm:right-6" : "left-0 sm:left-6"} h-[80vh] w-[180px] opacity-[0.20]`}
        style={{ transform: isRight ? "" : "scaleX(-1)" }}
      >
        <defs>
          <linearGradient id="bd-vine" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#4A7C59" stopOpacity="0" />
            <stop offset="40%" stopColor="#4A7C59" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#2C362F" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="bd-chain" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6B7280" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#9CA3AF" stopOpacity="0.8" />
          </linearGradient>
          <radialGradient id="bd-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.6" />
            <stop offset="60%" stopColor="#F59E0B" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#FBBF24" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Chain links — series of small ellipses down the upper portion */}
        <g stroke="url(#bd-chain)" fill="none" strokeWidth="1.6">
          {Array.from({ length: 26 }).map((_, i) => {
            const cy = 8 + i * 14;
            const rotate = i % 2 === 0 ? 0 : 90;
            return (
              <ellipse key={i} cx="100" cy={cy} rx="5" ry="8" transform={`rotate(${rotate} 100 ${cy})`} />
            );
          })}
        </g>

        {/* Vines twisting around the chain */}
        <path
          d="M 100 0 C 80 60, 120 120, 100 180 S 80 280, 100 360 S 120 440, 100 500"
          stroke="url(#bd-vine)" strokeWidth="2.5" fill="none" strokeLinecap="round"
        />
        <path
          d="M 100 0 C 120 50, 85 110, 100 170 S 125 270, 100 340 S 75 420, 100 490"
          stroke="url(#bd-vine)" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.7"
        />

        {/* Small leaves along the vine */}
        {[80, 145, 215, 290, 360, 430].map((y, i) => (
          <g key={i} transform={`translate(${i % 2 === 0 ? 88 : 112} ${y}) rotate(${i % 2 === 0 ? -30 : 30})`}>
            <path d="M 0 0 Q 6 -4 12 0 Q 6 4 0 0 Z" fill="#4A7C59" opacity="0.65" />
          </g>
        ))}

        {/* Lantern */}
        <g transform="translate(60 500)">
          {/* hook/bail */}
          <path d="M 40 0 Q 40 -10 50 -10 Q 60 -10 60 0" stroke="url(#bd-chain)" strokeWidth="2" fill="none" />
          {/* lantern body */}
          <rect x="20" y="0" width="60" height="14" fill="#2C362F" stroke="#6B7280" strokeWidth="1.2" />
          {/* glass panes — ember-lit */}
          <g>
            <circle cx="50" cy="55" r="34" fill="url(#bd-glow)" />
            <rect x="22" y="14" width="56" height="80" fill="#0B0E0C" stroke="#6B7280" strokeWidth="1.2" />
            <path d="M 22 30 H 78 M 22 50 H 78 M 22 78 H 78" stroke="#6B7280" strokeWidth="0.6" />
            <path d="M 50 14 V 94 M 30 14 V 94 M 70 14 V 94" stroke="#6B7280" strokeWidth="0.6" />
            {/* flame */}
            <path d="M 50 78 Q 44 70 50 60 Q 56 50 50 38 Q 46 50 50 60 Q 56 68 50 78 Z" fill="#FBBF24" opacity="0.85">
              <animate attributeName="opacity" values="0.7;0.95;0.7" dur="3.4s" repeatCount="indefinite" />
            </path>
          </g>
          {/* base */}
          <rect x="20" y="94" width="60" height="10" fill="#2C362F" stroke="#6B7280" strokeWidth="1.2" />
          {/* trailing vines from base */}
          <path d="M 25 104 Q 18 130 28 160 Q 36 195 22 230" stroke="url(#bd-vine)" strokeWidth="1.6" fill="none" />
          <path d="M 75 104 Q 82 135 72 170 Q 64 200 78 235" stroke="url(#bd-vine)" strokeWidth="1.6" fill="none" />
        </g>
      </svg>

      {/* Mirror on the other side for symmetry */}
      <svg
        viewBox="0 0 200 700"
        preserveAspectRatio="xMidYMin meet"
        className={`absolute top-0 ${isRight ? "left-0 sm:left-6" : "right-0 sm:right-6"} h-[80vh] w-[180px] opacity-[0.13]`}
        style={{ transform: isRight ? "scaleX(-1)" : "" }}
      >
        <g stroke="#6B7280" strokeOpacity="0.6" fill="none" strokeWidth="1.4">
          {Array.from({ length: 22 }).map((_, i) => {
            const cy = 8 + i * 14;
            const rotate = i % 2 === 0 ? 0 : 90;
            return (
              <ellipse key={i} cx="100" cy={cy} rx="4" ry="7" transform={`rotate(${rotate} 100 ${cy})`} />
            );
          })}
        </g>
        <path d="M 100 0 C 80 50, 120 110, 100 170 S 80 270, 100 320" stroke="#4A7C59" strokeOpacity="0.6" strokeWidth="2" fill="none" />
      </svg>
    </div>
  );
}
