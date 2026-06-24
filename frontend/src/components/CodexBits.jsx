import React from "react";
import { Link } from "react-router-dom";
import { Flame, Lock } from "lucide-react";

export function EntryCard({ entry, basePath }) {
  return (
    <Link
      to={`${basePath}/${entry.slug}`}
      data-testid={`entry-card-${entry.slug}`}
      className="lantern-card group block p-6 vine-frame"
    >
      {entry.image_url ? (
        <div className="relative -mx-6 -mt-6 mb-5 h-44 overflow-hidden">
          <img
            src={entry.image_url}
            alt={entry.title}
            className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#151B17] via-[#151B17]/30 to-transparent" />
        </div>
      ) : (
        <div className="relative -mx-6 -mt-6 mb-5 h-32 flex items-center justify-center bg-stone-light">
          <Flame className="w-10 h-10 text-lantern/40 ember-pulse" strokeWidth={1} />
        </div>
      )}

      {entry.pinned && (
        <div className="absolute top-3 right-3 text-[10px] tracking-[0.25em] uppercase text-lantern bg-[#0B0E0C]/80 px-2 py-1 border border-[#FBBF24]/30">
          Pinned
        </div>
      )}
      {entry.is_private && (
        <div
          className="absolute top-3 left-3 inline-flex items-center gap-1 text-[10px] tracking-[0.25em] uppercase text-[#FBBF24] bg-[#0B0E0C]/85 px-2 py-1 border border-[#FBBF24]/40"
          data-testid={`card-dm-only-${entry.slug}`}
        >
          <Lock className="w-3 h-3" /> DM Only
        </div>
      )}

      <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">{entry.category}</div>
      <h3 className="font-serif-display text-2xl text-bone mb-1 group-hover:text-lantern transition-colors">
        {entry.title}
      </h3>
      {entry.subtitle && <p className="text-sm text-muted-bone italic mb-3">{entry.subtitle}</p>}
      {entry.summary && <p className="text-sm text-muted-bone leading-relaxed line-clamp-3">{entry.summary}</p>}

      {entry.tags?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {entry.tags.slice(0, 4).map((t) => (
            <span key={t} className="text-[10px] tracking-wider uppercase border border-rust px-2 py-0.5 text-muted-bone">
              {t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

export function SectionHeader({ overline, title, subtitle, children }) {
  return (
    <div className="mb-12">
      <div className="flex items-center gap-3 mb-3">
        <span className="block w-10 h-px bg-[#FBBF24]/60" />
        <span className="text-xs tracking-[0.35em] uppercase text-lantern">{overline}</span>
      </div>
      <h1 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-bone leading-none ember-glow mb-3">
        {title}
      </h1>
      {subtitle && <p className="text-muted-bone max-w-2xl leading-relaxed">{subtitle}</p>}
      {children}
    </div>
  );
}

export function EmptyState({ category, isAdmin }) {
  return (
    <div className="lantern-card p-12 text-center" data-testid="empty-state">
      <Flame className="w-12 h-12 text-lantern/40 mx-auto mb-4 ember-pulse" strokeWidth={1} />
      <h3 className="font-serif-display text-2xl text-bone mb-2">No {category} have been chronicled yet</h3>
      <p className="text-sm text-muted-bone">
        {isAdmin
          ? "Open the Admin panel to inscribe the first entry."
          : "The lantern flickers. Return soon — the keepers are still writing."}
      </p>
    </div>
  );
}
