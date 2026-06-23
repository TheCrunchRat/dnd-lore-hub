import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api, { CATEGORIES } from "../lib/api";
import { SectionHeader, EntryCard, EmptyState } from "../components/CodexBits";
import { useAuth } from "../contexts/AuthContext";
import { Search, UserPlus } from "lucide-react";
import PCEditor from "../components/PCEditor";
import CharacterBuilder from "../components/CharacterBuilder";

const COPY = {
  location: {
    overline: "The Cartographer's Tome",
    title: "Locations & Regions",
    subtitle:
      "Cities clinging to lantern-light. Ruined keeps half-eaten by moss. Forest paths that change their minds. Every place in the Realm is a story still being written.",
  },
  character: {
    overline: "The Roll of Names",
    title: "Player Characters & NPCs",
    subtitle:
      "The keepers, the killers, the lost. Every soul the party has met — and a few they would rather forget.",
  },
  faction: {
    overline: "The Banner Ledger",
    title: "Factions & Orders",
    subtitle: "Who pulls the strings, who tends the lanterns, who sharpens the knives in the dark.",
  },
  lore: {
    overline: "The Long Dusk Chronicle",
    title: "Lore & History",
    subtitle: "Eras, calamities, and quiet turning points. A timeline assembled from fragments.",
  },
  session: {
    overline: "The Hearth Journal",
    title: "Session Log",
    subtitle: "Recaps from each night at the table — what the party did, what they almost did, and who limped home.",
  },
  bestiary: {
    overline: "The Watcher's Compendium",
    title: "Bestiary",
    subtitle: "Things that hunt by lantern-light. Things that hate it.",
  },
  overview: {
    overline: "Foundations",
    title: "World Overview",
    subtitle: "The opening pages of the codex — themes, tone, and the shape of the world.",
  },
};

export default function CategoryList({ category, basePath }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [charTab, setCharTab] = useState("pc"); // characters-only tab
  const [pcEditorOpen, setPcEditorOpen] = useState(false);

  const cat = useMemo(() => CATEGORIES.find((c) => c.key === category), [category]);
  const copy = COPY[category] || COPY.location;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .get("/entries", { params: { category, q: q || undefined } })
      .then((r) => { if (alive) setEntries(r.data || []); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [category, q]);

  // Character split (PC vs NPC based on metadata.role)
  const isCharacterPage = category === "character";
  const roleOf = (e) => {
    const r = String(e?.metadata?.role || "").trim().toLowerCase();
    if (!r) return "other";
    if (r === "pc" || r.startsWith("player")) return "pc";
    if (r === "npc" || r === "non-player" || r === "non player") return "npc";
    return "other";
  };
  const filteredEntries = useMemo(() => {
    if (!isCharacterPage || charTab === "all") return entries;
    return entries.filter((e) => roleOf(e) === charTab);
  }, [entries, isCharacterPage, charTab]);

  const charCounts = useMemo(() => {
    if (!isCharacterPage) return null;
    const counts = { pc: 0, npc: 0, other: 0 };
    for (const e of entries) counts[roleOf(e)] += 1;
    return counts;
  }, [entries, isCharacterPage]);

  if (!cat) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h2 className="font-serif-display text-3xl text-bone">Unknown tome</h2>
        <button onClick={() => navigate("/")} className="mt-6 text-lantern hover:underline" data-testid="back-home">
          Back to the Codex
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-20" data-testid={`page-${category}`}>
      <SectionHeader overline={copy.overline} title={copy.title} subtitle={copy.subtitle} />

      <div className="flex items-center gap-3 mb-6 max-w-2xl flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-bone" />
          <input
            type="text"
            placeholder={`Search ${copy.title.toLowerCase()}...`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid={`search-${category}`}
            className="w-full pl-10 pr-3 py-2.5 bg-stone-deep border border-rust text-bone placeholder:text-muted-bone focus:border-[#FBBF24] focus:outline-none transition-colors"
          />
        </div>
        {isCharacterPage && (
          <button
            onClick={() => setPcEditorOpen(true)}
            data-testid="create-pc-btn"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-sm tracking-wide hover:bg-[#F59E0B] transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Create your character
          </button>
        )}
      </div>

      {isCharacterPage && (
        <div className="flex gap-1 mb-10 border-b border-rust" data-testid="character-tabs">
          {[
            { k: "pc", label: "Player Characters", count: charCounts.pc },
            { k: "npc", label: "NPCs", count: charCounts.npc },
            { k: "all", label: "All", count: entries.length },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setCharTab(t.k)}
              data-testid={`char-tab-${t.k}`}
              className={`px-5 py-3 text-xs tracking-[0.3em] uppercase border-b-2 -mb-px transition-colors ${
                charTab === t.k ? "text-lantern border-[#FBBF24]" : "text-muted-bone border-transparent hover:text-bone"
              }`}
            >
              {t.label} <span className="ml-1 text-[10px] text-muted-bone">({t.count})</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-muted-bone text-sm" data-testid="loading-state">Drawing the lantern closer…</div>
      ) : filteredEntries.length === 0 ? (
        <EmptyState
          category={isCharacterPage && charTab === "pc" ? "player characters" : isCharacterPage && charTab === "npc" ? "NPCs" : copy.title.toLowerCase()}
          isAdmin={!!user}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="entries-grid">
          {filteredEntries.map((e) => (
            <EntryCard key={e.id} entry={e} basePath={basePath} />
          ))}
        </div>
      )}

      {isCharacterPage && (
        <CharacterBuilder
          open={pcEditorOpen}
          onClose={() => setPcEditorOpen(false)}
          onSaved={(saved) => {
            setCharTab("pc");
            api.get("/entries", { params: { category, q: q || undefined } })
              .then((r) => setEntries(r.data || []))
              .then(() => {
                if (saved?.slug) navigate(`${basePath}/${saved.slug}`);
              });
          }}
        />
      )}
    </div>
  );
}
