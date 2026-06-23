import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { CATEGORIES } from "../lib/api";
import { Flame, ChevronRight } from "lucide-react";
import * as Icons from "lucide-react";

const CAT_PATH = {
  overview: "/world",
  location: "/locations",
  character: "/characters",
  faction: "/factions",
  lore: "/lore",
  session: "/sessions",
  bestiary: "/bestiary",
};

export default function Home() {
  const [overview, setOverview] = useState(null);
  const [recent, setRecent] = useState([]);
  const [stats, setStats] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const [ov, rec, st] = await Promise.all([
          api.get("/entries", { params: { category: "overview", limit: 1 } }),
          api.get("/entries", { params: { limit: 6 } }),
          api.get("/stats"),
        ]);
        setOverview(ov.data?.[0] || null);
        setRecent(rec.data || []);
        setStats(st.data || {});
      } catch (e) { /* noop */ }
    })();
  }, []);

  const heroImg = overview?.image_url || "https://images.pexels.com/photos/20461910/pexels-photo-20461910.jpeg";

  return (
    <div data-testid="home-page">
      {/* HERO */}
      <section className="relative min-h-[88vh] flex items-end overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroImg} alt="The Lantern Realm" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0E0C] via-[#0B0E0C]/85 to-[#0B0E0C]/40" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B0E0C]/90 via-transparent to-transparent" />
        </div>

        {/* Lantern motif accents */}
        <div className="absolute top-24 right-10 hidden md:flex flex-col items-center gap-2 text-lantern/70">
          <Flame className="w-8 h-8 ember-pulse" strokeWidth={1} />
          <div className="w-px h-32 bg-gradient-to-b from-[#FBBF24]/60 to-transparent" />
        </div>
        <div className="absolute top-40 right-32 hidden lg:flex flex-col items-center gap-2 text-lantern/40">
          <Flame className="w-5 h-5 ember-pulse" strokeWidth={1} style={{ animationDelay: "1.2s" }} />
          <div className="w-px h-20 bg-gradient-to-b from-[#FBBF24]/30 to-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 py-20 w-full">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <span className="block w-12 h-px bg-[#FBBF24]" />
              <span className="text-xs tracking-[0.4em] uppercase text-lantern">The Codex Opens</span>
            </div>
            <h1 className="font-serif-display text-5xl sm:text-6xl lg:text-8xl text-bone leading-[0.95] ember-glow mb-6">
              {overview?.title || "The Lantern Realm"}
            </h1>
            {overview?.subtitle && (
              <p className="font-serif-display text-2xl text-lantern/90 italic mb-6">{overview.subtitle}</p>
            )}
            <p className="text-base lg:text-lg text-bone/85 leading-relaxed max-w-2xl mb-10">
              {overview?.summary ||
                "A campaign chronicle written in lantern oil and moss. Walk the sunken roads. Read the names the forests have not yet swallowed."}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/locations"
                data-testid="cta-explore"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#FBBF24] text-[#0B0E0C] font-semibold tracking-wide hover:bg-[#F59E0B] transition-colors"
              >
                Walk the Realm
                <ChevronRight className="w-4 h-4" />
              </Link>
              {overview && (
                <Link
                  to={`/world/${overview.slug}`}
                  data-testid="cta-overview"
                  className="inline-flex items-center gap-2 px-6 py-3 border border-[#FBBF24]/40 text-lantern hover:bg-[#FBBF24]/10 transition-colors"
                >
                  Read the Opening
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORY BENTO */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-24">
        <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
          <div>
            <div className="text-xs tracking-[0.35em] uppercase text-lantern mb-2">The Seven Tomes</div>
            <h2 className="font-serif-display text-3xl md:text-4xl text-bone">Choose where to wander</h2>
          </div>
          <p className="text-sm text-muted-bone max-w-md">
            Each tome holds a different memory of the Realm — the places, the people, the powers, and the
            things that watch from the trees.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {CATEGORIES.filter((c) => c.key !== "overview").map((c) => {
            const Icon = Icons[c.icon] || Flame;
            const count = stats[c.key] || 0;
            return (
              <Link
                key={c.key}
                to={CAT_PATH[c.key]}
                data-testid={`tome-${c.key}`}
                className="lantern-card group p-8 vine-frame flex flex-col gap-3 min-h-[200px]"
              >
                <div className="flex items-center justify-between">
                  <Icon className="w-7 h-7 text-lantern" strokeWidth={1.25} />
                  <span className="text-xs tracking-[0.25em] uppercase text-muted-bone">{count} entries</span>
                </div>
                <h3 className="font-serif-display text-2xl text-bone group-hover:text-lantern transition-colors mt-auto">
                  {c.plural}
                </h3>
                <div className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase text-muted-bone group-hover:text-lantern transition-colors">
                  Open the tome <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* RECENT */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pb-32">
        <div className="lantern-divider mb-16" />
        <div className="text-xs tracking-[0.35em] uppercase text-lantern mb-2">Recently Inscribed</div>
        <h2 className="font-serif-display text-3xl md:text-4xl text-bone mb-10">Newest pages in the codex</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recent.map((e) => {
            const base = CAT_PATH[e.category] || "/";
            return (
              <Link
                key={e.id}
                to={`${base}/${e.slug}`}
                data-testid={`recent-${e.slug}`}
                className="lantern-card group p-6 flex flex-col gap-2"
              >
                <span className="text-[10px] tracking-[0.3em] uppercase text-lantern">{e.category}</span>
                <h4 className="font-serif-display text-xl text-bone group-hover:text-lantern transition-colors">
                  {e.title}
                </h4>
                <p className="text-sm text-muted-bone line-clamp-2">{e.summary}</p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
