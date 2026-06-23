import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api, { CATEGORIES, formatApiError } from "../lib/api";
import { ArrowLeft, Calendar, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import PCEditor from "../components/PCEditor";
import { toast } from "sonner";

const NAME_KEY = "lantern.diceName";

const CAT_PATH = {
  overview: "/world",
  location: "/locations",
  character: "/characters",
  faction: "/factions",
  lore: "/lore",
  session: "/sessions",
  bestiary: "/bestiary",
};

export default function EntryDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState([]);
  const [pcEditorOpen, setPcEditorOpen] = useState(false);
  const playerName = (typeof window !== "undefined" && localStorage.getItem(NAME_KEY)) || "";
  const isPC = entry?.category === "character" && entry?.metadata?.role === "PC";
  const ownedByUser = !!user && !!entry?.metadata?.user_id && entry.metadata.user_id === user.id;
  const ownedByName =
    isPC &&
    !!entry?.metadata?.owner &&
    !!playerName &&
    entry.metadata.owner.toLowerCase() === playerName.toLowerCase();
  const isOwnedByMe = isPC && (ownedByUser || ownedByName);

  const handleDeletePC = async () => {
    if (!window.confirm(`Delete ${entry.title} from the codex?`)) return;
    try {
      await api.delete(`/pcs/${entry.id}`, {
        params: playerName ? { player_name: playerName } : {},
      });
      toast.success("Character removed");
      navigate("/characters");
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  useEffect(() => {
    setLoading(true);
    api.get(`/entries/${slug}`)
      .then((r) => {
        setEntry(r.data);
        return api.get("/entries", { params: { category: r.data.category, limit: 6 } });
      })
      .then((r) => {
        if (r) setRelated((r.data || []).filter((e) => e.slug !== slug).slice(0, 3));
      })
      .catch(() => setEntry(null))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className="max-w-3xl mx-auto px-6 py-24 text-muted-bone" data-testid="detail-loading">Unfolding the page…</div>;
  }

  if (!entry) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center" data-testid="detail-notfound">
        <h2 className="font-serif-display text-3xl text-bone mb-4">That page was lost to root and rust</h2>
        <button onClick={() => navigate(-1)} className="text-lantern hover:underline">Return</button>
      </div>
    );
  }

  const cat = CATEGORIES.find((c) => c.key === entry.category);
  const basePath = CAT_PATH[entry.category] || "/";

  return (
    <article className="bg-obsidian" data-testid={`detail-${entry.slug}`}>
      {entry.image_url && (
        <div className="relative h-[60vh] w-full overflow-hidden">
          <img src={entry.image_url} alt={entry.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0E0C] via-[#0B0E0C]/60 to-transparent" />
        </div>
      )}

      <div className="max-w-3xl mx-auto px-6 lg:px-8 py-16">
        <Link to={basePath} className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-muted-bone hover:text-lantern mb-8" data-testid="back-link">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to {cat?.plural || "Codex"}
        </Link>

        <div className="text-xs tracking-[0.35em] uppercase text-lantern mb-4">{entry.category}</div>
        <h1 className="font-serif-display text-4xl md:text-6xl text-bone leading-none ember-glow mb-4">
          {entry.title}
        </h1>
        {entry.subtitle && (
          <p className="font-serif-display text-xl md:text-2xl italic text-lantern/80 mb-6">{entry.subtitle}</p>
        )}

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-bone mb-10">
          {entry.updated_at && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Inscribed {new Date(entry.updated_at).toLocaleDateString()}
            </span>
          )}
          {entry.tags?.map((t) => (
            <span key={t} className="border border-rust px-2 py-0.5 uppercase tracking-wider">{t}</span>
          ))}
          {user && user.role === "admin" && (
            <button
              onClick={() => navigate(`/admin?edit=${entry.id}`)}
              data-testid="edit-btn"
              className="inline-flex items-center gap-1.5 text-lantern hover:underline ml-auto"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          {isOwnedByMe && (!user || user.role !== "admin") && (
            <div className="inline-flex items-center gap-3 ml-auto" data-testid="owner-controls">
              <button
                onClick={() => setPcEditorOpen(true)}
                data-testid="owner-edit-btn"
                className="inline-flex items-center gap-1.5 text-lantern hover:underline"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit your character
              </button>
              <button
                onClick={handleDeletePC}
                data-testid="owner-delete-btn"
                className="inline-flex items-center gap-1.5 text-muted-bone hover:text-red-400"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          )}
        </div>

        {entry.summary && (
          <p className="font-serif-display text-xl md:text-2xl text-bone leading-snug border-l-2 border-[#FBBF24]/60 pl-5 mb-10">
            {entry.summary}
          </p>
        )}

        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <div className="lantern-card p-6 mb-10 grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Object.entries(entry.metadata).map(([k, v]) => (
              <div key={k}>
                <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-1">{k.replace(/_/g, " ")}</div>
                <div className="text-sm text-bone">{String(v)}</div>
              </div>
            ))}
          </div>
        )}

        {entry.content && (
          <div className="prose-tome">
            {entry.content.split(/\n\s*\n/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        )}

        {related.length > 0 && (
          <div className="mt-20">
            <div className="lantern-divider mb-8" />
            <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-6">Nearby in the Codex</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {related.map((r) => (
                <Link key={r.id} to={`${basePath}/${r.slug}`} className="lantern-card p-4" data-testid={`related-${r.slug}`}>
                  <div className="font-serif-display text-lg text-bone">{r.title}</div>
                  <div className="text-xs text-muted-bone line-clamp-2 mt-1">{r.summary}</div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <PCEditor
        open={pcEditorOpen}
        onClose={() => setPcEditorOpen(false)}
        existing={entry}
        onSaved={(saved) => {
          setEntry(saved);
          if (saved.slug && saved.slug !== slug) navigate(`/characters/${saved.slug}`, { replace: true });
        }}
      />
    </article>
  );
}
