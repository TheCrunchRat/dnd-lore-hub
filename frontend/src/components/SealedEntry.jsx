import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/**
 * Full-page placeholder shown when a player tries to view a Codex entry the DM has
 * marked as DM-only. Renders a watchful eye at the centre with vines/plants sprawling
 * outward — a "this knowledge is sealed" visual instead of a generic 404.
 */
export default function SealedEntry({ backTo = "/", backLabel = "Return to the Codex" }) {
  return (
    <div
      className="min-h-[85vh] flex flex-col items-center justify-end px-6 pt-10 pb-20 relative overflow-hidden"
      data-testid="sealed-entry"
    >
      <svg
        viewBox="0 0 800 600"
        className="absolute inset-x-0 top-0 w-full h-[60vh]"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="sealed-glow" cx="50%" cy="48%" r="42%">
            <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.18" />
            <stop offset="55%" stopColor="#FBBF24" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#FBBF24" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sealed-vine" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4A7C59" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#2C362F" stopOpacity="0.35" />
          </linearGradient>
          <radialGradient id="iris-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FBBF24" stopOpacity="1" />
            <stop offset="55%" stopColor="#B45309" stopOpacity="1" />
            <stop offset="100%" stopColor="#0B0E0C" stopOpacity="1" />
          </radialGradient>
        </defs>

        {/* Faint warm glow behind the eye */}
        <ellipse cx="400" cy="288" rx="320" ry="200" fill="url(#sealed-glow)" />

        {/* Sprawling vines — emanating outward from the eye */}
        <g stroke="url(#sealed-vine)" fill="none" strokeWidth="2" strokeLinecap="round">
          {/* upper-left */}
          <path d="M 320 240 C 240 200, 180 160, 90 100" />
          <path d="M 320 240 C 250 220, 200 200, 130 200" />
          {/* upper-right */}
          <path d="M 480 240 C 560 200, 620 160, 710 100" />
          <path d="M 480 240 C 550 220, 600 200, 670 200" />
          {/* lower-left */}
          <path d="M 340 340 C 270 380, 200 430, 70 510" />
          <path d="M 340 340 C 280 400, 240 450, 180 540" />
          {/* lower-right */}
          <path d="M 460 340 C 530 380, 600 430, 730 510" />
          <path d="M 460 340 C 520 400, 560 450, 620 540" />
          {/* mid-laterals */}
          <path d="M 305 290 C 220 290, 140 290, 50 290" />
          <path d="M 495 290 C 580 290, 660 290, 750 290" />
        </g>

        {/* Leaves along the vines */}
        {[
          [120, 140, -45], [170, 180, -25], [220, 210, -15],
          [680, 140, 45], [630, 180, 25], [580, 210, 15],
          [120, 460, 35], [170, 430, 20], [220, 400, 10],
          [680, 460, -35], [630, 430, -20], [580, 400, -10],
          [70, 290, 0], [730, 290, 180],
        ].map(([cx, cy, rot], i) => (
          <g key={i} transform={`translate(${cx} ${cy}) rotate(${rot})`}>
            <path d="M 0 0 Q 14 -8 28 0 Q 14 8 0 0 Z" fill="#4A7C59" opacity="0.7" />
            <path d="M 0 0 L 24 0" stroke="#2C362F" strokeWidth="0.8" />
          </g>
        ))}

        {/* Tiny moss/lichen flecks */}
        {Array.from({ length: 40 }).map((_, i) => {
          const x = ((i * 137) % 800);
          const y = ((i * 71) % 600);
          return <circle key={i} cx={x} cy={y} r="1.2" fill="#4A7C59" opacity="0.18" />;
        })}

        {/* The Watchful Eye */}
        <g transform="translate(400 290)">
          {/* outer eye-shape */}
          <path
            d="M -130 0 C -90 -75, 90 -75, 130 0 C 90 75, -90 75, -130 0 Z"
            fill="#0B0E0C"
            stroke="#FBBF24"
            strokeOpacity="0.85"
            strokeWidth="1.6"
          />
          {/* upper lash flourish */}
          <path
            d="M -125 -10 C -100 -60, 100 -60, 125 -10"
            fill="none" stroke="#FBBF24" strokeOpacity="0.4" strokeWidth="1"
          />
          {/* iris with ember gradient */}
          <circle r="46" fill="url(#iris-grad)" />
          {/* pupil */}
          <circle r="14" fill="#0B0E0C" />
          {/* glint */}
          <circle cx="-10" cy="-10" r="3.5" fill="#FBBF24" opacity="0.95">
            <animate attributeName="opacity" values="0.6;1;0.6" dur="3.6s" repeatCount="indefinite" />
          </circle>
          {/* iris fibres */}
          {Array.from({ length: 16 }).map((_, i) => {
            const a = (i / 16) * Math.PI * 2;
            const r1 = 16;
            const r2 = 42;
            return (
              <line
                key={i}
                x1={Math.cos(a) * r1} y1={Math.sin(a) * r1}
                x2={Math.cos(a) * r2} y2={Math.sin(a) * r2}
                stroke="#0B0E0C" strokeWidth="1" opacity="0.55"
              />
            );
          })}
          {/* slow breathing ring */}
          <circle r="64" fill="none" stroke="#FBBF24" strokeOpacity="0.18" strokeWidth="1">
            <animate attributeName="r" values="58;68;58" dur="5.5s" repeatCount="indefinite" />
            <animate attributeName="stroke-opacity" values="0.08;0.22;0.08" dur="5.5s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* Climbing tendrils over the eye corners */}
        <g stroke="url(#sealed-vine)" fill="none" strokeWidth="1.4" opacity="0.85">
          <path d="M 270 290 C 290 270, 300 245, 320 240" />
          <path d="M 530 290 C 510 270, 500 245, 480 240" />
          <path d="M 270 290 C 290 310, 300 335, 320 340" />
          <path d="M 530 290 C 510 310, 500 335, 480 340" />
        </g>
      </svg>

      <div className="relative z-10 text-center max-w-xl">
        <div className="text-[10px] tracking-[0.45em] uppercase text-lantern mb-4" data-testid="sealed-overline">
          Sealed by the Lanternkeeper
        </div>
        <h2 className="font-serif-display text-4xl md:text-5xl text-bone ember-glow mb-4 leading-tight">
          This page is not yours to&nbsp;read
        </h2>
        <p className="text-sm md:text-base text-muted-bone italic leading-relaxed mb-8">
          The eye is watching, the vines have grown over the binding. Walk the realm a
          while longer — the keeper will unseal these pages in their own time.
        </p>
        <Link
          to={backTo}
          data-testid="sealed-back-link"
          className="inline-flex items-center gap-2 px-5 py-3 border border-rust text-bone hover:border-[#FBBF24]/60 hover:text-lantern text-xs tracking-[0.3em] uppercase transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
