import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Sparkles, Plus, ChevronRight, Star, BookOpen, Swords } from "lucide-react";
import { toast } from "sonner";
import MagicBackdrop from "../components/MagicBackdrop";

const CATEGORIES = [
  { key: "origin", label: "Origin Magic", singular: "School", icon: Sparkles,
    overline: "Schools of the Realm",
    blurb: "The native magics that grew in this world — taught, hoarded, feared." },
  { key: "foundation", label: "Foundation", singular: "Constellation", icon: Star,
    overline: "Foundation Constellations",
    blurb: "Older than the kingdoms. Each constellation is a wheel of stars — open its tree to read the bargain each one asks." },
  { key: "class", label: "Classes", singular: "Class", icon: Swords,
    overline: "Class Trees",
    blurb: "Class-specific skill paths. Build a path for any class your players walk." },
];

export default function MagicList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState("origin");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/magic/trees");
      setTrees(data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const cat = CATEGORIES.find((c) => c.key === tab);
  const filtered = useMemo(
    () => trees.filter((t) => (t.tree_category || "origin") === tab),
    [trees, tab]
  );

  const openNew = () => { setNewName(""); setShowNew(true); };
  const createNew = async () => {
    const name = newName.trim();
    if (!name) { toast.error("Give it a name first"); return; }
    setCreating(true);
    try {
      const { data } = await api.post("/magic/trees", {
        name, subtitle: "", summary: "", content: "",
        accent_color: "#FBBF24", nodes: [],
        tree_category: tab,
      });
      setShowNew(false);
      navigate(`/magic/${data.slug}`);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setCreating(false); }
  };

  return (
    <div className="relative" data-testid="magic-list-page">
      <MagicBackdrop side="right" />
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 py-16">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="block w-10 h-px bg-[#FBBF24]/60" />
            <span className="text-xs tracking-[0.35em] uppercase text-lantern">The Arcane Atlas</span>
          </div>
          <h1 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-bone leading-none ember-glow mb-3">
            Schools of Magic
          </h1>
          <p className="text-muted-bone max-w-2xl leading-relaxed">
            Three branches of the atlas: the realm&rsquo;s native schools, the older constellations of
            Foundation magic, and the class-specific skill paths.
          </p>
        </div>
        {user && (
          <button
            onClick={openNew}
            disabled={creating}
            data-testid="new-tree-btn"
            className="inline-flex items-center gap-2 px-5 py-3 bg-[#FBBF24] text-[#0B0E0C] font-semibold tracking-wide hover:bg-[#F59E0B] transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> New {cat?.singular}
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-8 border-b border-rust overflow-x-auto" data-testid="magic-tabs">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const count = trees.filter((t) => (t.tree_category || "origin") === c.key).length;
          return (
            <button key={c.key} onClick={() => setTab(c.key)} data-testid={`magic-tab-${c.key}`}
              className={`inline-flex items-center gap-2 px-5 py-3 text-xs tracking-[0.3em] uppercase border-b-2 -mb-px whitespace-nowrap transition-colors ${
                tab === c.key ? "text-lantern border-[#FBBF24]" : "text-muted-bone border-transparent hover:text-bone"
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {c.label}
              <span className="text-[10px] text-muted-bone">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="mb-8">
        <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-1">{cat?.overline}</div>
        <p className="text-sm text-muted-bone max-w-3xl">{cat?.blurb}</p>
      </div>

      {loading ? (
        <div className="text-muted-bone">Unfolding the arcane atlas…</div>
      ) : filtered.length === 0 ? (
        <div className="lantern-card p-12 text-center" data-testid="empty-state">
          {React.createElement(cat?.icon || Sparkles, { className: "w-12 h-12 text-lantern/40 mx-auto mb-4 ember-pulse", strokeWidth: 1 })}
          <p className="font-serif-display text-2xl text-bone">No {cat?.singular.toLowerCase()}s here yet</p>
          <p className="text-sm text-muted-bone mt-2">
            {user ? `Click "New ${cat?.singular}" above to create the first one.` : "The keepers are still drafting this branch."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map((t) => (
            <Link
              key={t.id}
              to={`/magic/${t.slug}`}
              data-testid={`tree-card-${t.slug}`}
              className="lantern-card vine-frame p-8 group block relative overflow-hidden"
            >
              <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity"
                style={{ background: t.accent_color || "#FBBF24" }} />
              <div className="relative">
                <div className="flex items-center gap-2 mb-4">
                  {React.createElement(cat?.icon || Sparkles, { className: "w-5 h-5", style: { color: t.accent_color || "#FBBF24" }, strokeWidth: 1.5 })}
                  <span className="text-[10px] tracking-[0.3em] uppercase text-muted-bone">
                    {t.nodes?.length || 0} {tab === "foundation" ? "stars" : "abilities"}
                  </span>
                </div>
                <h3 className="font-serif-display text-3xl text-bone group-hover:text-lantern transition-colors mb-1">
                  {t.name}
                </h3>
                {t.subtitle && <p className="text-sm italic text-muted-bone mb-3">{t.subtitle}</p>}
                {t.summary && <p className="text-sm text-muted-bone leading-relaxed line-clamp-3 mb-4">{t.summary}</p>}
                <div className="inline-flex items-center gap-1 text-xs tracking-[0.25em] uppercase text-lantern">
                  {tab === "foundation" ? "Walk the constellation" : "Walk the tree"} <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 bg-[#0B0E0C]/80 backdrop-blur-sm flex items-center justify-center px-4" onClick={() => setShowNew(false)} data-testid="new-tree-modal">
          <div className="lantern-card vine-frame p-8 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="text-[10px] tracking-[0.35em] uppercase text-lantern mb-2">{cat?.overline}</div>
            <h2 className="font-serif-display text-2xl text-bone mb-4">Name your new {cat?.singular.toLowerCase()}</h2>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createNew(); }}
              placeholder={tab === "foundation" ? "e.g. The Hollow Crown" : tab === "class" ? "e.g. Wickwarden" : "e.g. Hollowsong"}
              autoFocus
              data-testid="new-tree-name-input"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none mb-5"
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setShowNew(false)}
                data-testid="cancel-new-tree"
                className="px-4 py-2 text-xs tracking-widest uppercase text-muted-bone hover:text-bone"
              >
                Cancel
              </button>
              <button
                onClick={createNew}
                disabled={creating || !newName.trim()}
                data-testid="confirm-new-tree"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-sm tracking-widest uppercase hover:bg-[#F59E0B] disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
