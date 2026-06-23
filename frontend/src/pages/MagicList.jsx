import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Sparkles, Plus, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export default function MagicList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/magic/trees");
      setTrees(data);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createNew = async () => {
    const name = window.prompt("Name your new school of magic:");
    if (!name) return;
    setCreating(true);
    try {
      const { data } = await api.post("/magic/trees", {
        name,
        subtitle: "",
        summary: "",
        content: "",
        accent_color: "#FBBF24",
        nodes: [],
      });
      navigate(`/magic/${data.slug}`);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16" data-testid="magic-list-page">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-12">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="block w-10 h-px bg-[#FBBF24]/60" />
            <span className="text-xs tracking-[0.35em] uppercase text-lantern">The Arcane Atlas</span>
          </div>
          <h1 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-bone leading-none ember-glow mb-3">
            Schools of Magic
          </h1>
          <p className="text-muted-bone max-w-2xl leading-relaxed">
            Each school is a living constellation — abilities unlock from elder branches into newer
            leaves. Open a school to wander its tree by lantern-light.
          </p>
        </div>
        {user && (
          <button
            onClick={createNew}
            disabled={creating}
            data-testid="new-tree-btn"
            className="inline-flex items-center gap-2 px-5 py-3 bg-[#FBBF24] text-[#0B0E0C] font-semibold tracking-wide hover:bg-[#F59E0B] transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            New School
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-muted-bone">Unfolding the arcane atlas…</div>
      ) : trees.length === 0 ? (
        <div className="lantern-card p-12 text-center">
          <Sparkles className="w-12 h-12 text-lantern/40 mx-auto mb-4 ember-pulse" strokeWidth={1} />
          <p className="font-serif-display text-2xl text-bone">No schools yet</p>
          <p className="text-sm text-muted-bone mt-2">
            {user ? "Sign of a new age — create the first one." : "The keepers are still drafting the trees."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {trees.map((t) => (
            <Link
              key={t.id}
              to={`/magic/${t.slug}`}
              data-testid={`tree-card-${t.slug}`}
              className="lantern-card vine-frame p-8 group block relative overflow-hidden"
            >
              <div
                className="absolute -top-12 -right-12 w-48 h-48 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity"
                style={{ background: t.accent_color || "#FBBF24" }}
              />
              <div className="relative">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5" style={{ color: t.accent_color || "#FBBF24" }} strokeWidth={1.5} />
                  <span className="text-[10px] tracking-[0.3em] uppercase text-muted-bone">
                    {t.nodes?.length || 0} abilities
                  </span>
                </div>
                <h3 className="font-serif-display text-3xl text-bone group-hover:text-lantern transition-colors mb-1">
                  {t.name}
                </h3>
                {t.subtitle && (
                  <p className="text-sm italic text-muted-bone mb-3">{t.subtitle}</p>
                )}
                {t.summary && (
                  <p className="text-sm text-muted-bone leading-relaxed line-clamp-3 mb-4">{t.summary}</p>
                )}
                <div className="inline-flex items-center gap-1 text-xs tracking-[0.25em] uppercase text-lantern">
                  Walk the tree <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
