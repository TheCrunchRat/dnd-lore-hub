import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  User, Pencil, Save, X, BookOpen, MessageCircle, Calendar, Sparkles,
  Quote, ShieldCheck,
} from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import MarkdownView from "../components/MarkdownView";
import MarkdownEditor from "../components/MarkdownEditor";
import ImageUploader from "../components/ImageUploader";

/**
 * /profile        — own profile (editable; requires login)
 * /profile/:id    — another player's public profile
 */
export default function Profile() {
  const { id } = useParams();
  const { user } = useAuth();
  const isOwn = !id;

  const [data, setData] = useState(null);          // { profile, stats, characters }
  const [entries, setEntries] = useState([]);      // for [[wiki]] resolution in bio
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const path = isOwn ? "/profile/me" : `/profile/${id}`;
      const [p, e] = await Promise.all([
        api.get(path),
        api.get("/entries", { params: { limit: 500 } }).catch(() => ({ data: [] })),
      ]);
      setData(p.data);
      setEntries(e.data || []);
    } catch (err) {
      setData(null);
      if (err?.response?.status !== 401) toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [id, user]);

  const startEdit = () => {
    setDraft({
      display_name: data.profile.display_name || "",
      avatar_url: data.profile.avatar_url || "",
      bio: data.profile.bio || "",
      quote: data.profile.quote || "",
      title: data.profile.title || "",
      pronouns: data.profile.pronouns || "",
    });
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data: updated } = await api.put("/profile/me", draft);
      setData(updated);
      setEditing(false);
      toast.success("Profile updated");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto px-6 py-24 text-muted-bone">Lighting the lantern…</div>;
  }
  if (isOwn && !user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center" data-testid="profile-not-logged-in">
        <h2 className="font-serif-display text-3xl text-bone mb-4">Sign in to see your profile</h2>
        <Link to="/login" className="inline-flex items-center gap-2 px-5 py-3 bg-[#FBBF24] text-[#0B0E0C] font-semibold tracking-wide hover:bg-[#F59E0B]">
          Sign in
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h2 className="font-serif-display text-3xl text-bone mb-4">No keeper found by that name</h2>
        <Link to="/" className="text-lantern hover:underline">Return to the Codex</Link>
      </div>
    );
  }

  const { profile, stats, characters } = data;
  const isAdmin = profile.role === "admin";

  return (
    <div className="max-w-5xl mx-auto px-6 lg:px-10 py-12" data-testid="profile-page">
      {/* Hero */}
      <div className="lantern-card vine-frame p-8 mb-8 relative overflow-hidden">
        <div
          className="absolute -top-32 -right-32 w-80 h-80 rounded-full blur-3xl opacity-25"
          style={{ background: "#FBBF24" }}
        />
        <div className="relative flex items-start gap-6 flex-wrap">
          {/* Avatar */}
          <div
            className="w-28 h-28 shrink-0 border-2 border-[#FBBF24]/40 bg-[#0B0E0C] overflow-hidden flex items-center justify-center"
            data-testid="profile-avatar"
          >
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="w-12 h-12 text-lantern/40" strokeWidth={1.2} />
            )}
          </div>
          {/* Identity */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-[0.35em] uppercase text-lantern mb-1.5 flex items-center gap-2">
              {profile.title || (isAdmin ? "Lanternkeeper" : "Wanderer of the realm")}
              {isAdmin && (
                <span className="inline-flex items-center gap-1 text-[9px] text-[#FBBF24] border border-[#FBBF24]/40 px-1 py-0.5">
                  <ShieldCheck className="w-2.5 h-2.5" /> DM
                </span>
              )}
            </div>
            <h1 className="font-serif-display text-4xl md:text-5xl text-bone leading-none ember-glow" data-testid="profile-display-name">
              {profile.display_name || profile.name}
            </h1>
            {profile.pronouns && (
              <div className="text-xs text-muted-bone mt-1.5 italic">{profile.pronouns}</div>
            )}
            {profile.quote && (
              <blockquote className="mt-4 flex items-start gap-2 text-muted-bone" data-testid="profile-quote">
                <Quote className="w-4 h-4 text-lantern/60 shrink-0 mt-1" />
                <span className="font-serif-display italic text-lg">&ldquo;{profile.quote}&rdquo;</span>
              </blockquote>
            )}
          </div>
          {isOwn && !editing && (
            <button
              onClick={startEdit}
              data-testid="edit-profile-btn"
              className="inline-flex items-center gap-2 px-3 py-2 border border-rust text-bone hover:border-[#FBBF24]/50 hover:text-lantern text-xs tracking-widest uppercase"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit Profile
            </button>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3 mb-8" data-testid="profile-stats">
        <Stat icon={Sparkles} label="Characters" value={stats.characters} testid="stat-characters" />
        <Stat icon={MessageCircle} label="Comments" value={stats.comments} testid="stat-comments" />
        <Stat icon={Calendar} label="RSVPs" value={stats.rsvps} testid="stat-rsvps" />
      </div>

      {/* Bio */}
      {profile.bio?.trim() && (
        <section className="mb-10" data-testid="profile-bio">
          <div className="text-[10px] tracking-[0.35em] uppercase text-lantern mb-3 flex items-center gap-2">
            <BookOpen className="w-3 h-3" /> About
          </div>
          <MarkdownView source={profile.bio} entries={entries} compact />
        </section>
      )}

      {/* Characters */}
      <section data-testid="profile-characters">
        <div className="text-[10px] tracking-[0.35em] uppercase text-lantern mb-3 flex items-center gap-2">
          <Sparkles className="w-3 h-3" /> Their Characters
        </div>
        {characters.length === 0 ? (
          <p className="text-sm text-muted-bone italic">
            {isOwn
              ? <>No characters yet — <Link to="/characters" className="text-lantern hover:underline">claim or create one</Link>.</>
              : "This keeper has not bound any characters to the lantern yet."}
          </p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {characters.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/characters/${c.slug}`}
                  data-testid={`char-link-${c.slug}`}
                  className="lantern-card group block p-4 hover:border-[#FBBF24]/40 transition-colors"
                >
                  <div className="text-[10px] tracking-[0.3em] uppercase text-lantern">
                    {c.metadata?.character_class || "Character"}
                    {c.metadata?.level ? ` · Level ${c.metadata.level}` : ""}
                  </div>
                  <div className="font-serif-display text-xl text-bone group-hover:text-lantern leading-tight mt-1">
                    {c.title}
                  </div>
                  {c.subtitle && <div className="text-sm text-muted-bone italic mt-0.5">{c.subtitle}</div>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Editor drawer */}
      {editing && draft && (
        <ProfileEditor
          draft={draft}
          setDraft={setDraft}
          entries={entries}
          saving={saving}
          onSave={save}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, testid }) {
  return (
    <div className="lantern-card p-4 flex items-center gap-3" data-testid={testid}>
      <div className="w-10 h-10 rounded-sm flex items-center justify-center border border-[#FBBF24]/40 bg-[#FBBF24]/[0.06]">
        <Icon className="w-4 h-4 text-lantern" strokeWidth={1.5} />
      </div>
      <div>
        <div className="text-[10px] tracking-[0.3em] uppercase text-muted-bone">{label}</div>
        <div className="font-serif-display text-2xl text-bone leading-none mt-1">{value}</div>
      </div>
    </div>
  );
}

function ProfileEditor({ draft, setDraft, entries, saving, onSave, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0B0E0C]/80 backdrop-blur-sm" onClick={onClose} data-testid="profile-editor-overlay">
      <div
        className="absolute right-0 top-0 h-full w-full max-w-xl bg-stone-deep border-l border-rust overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="profile-editor"
      >
        <div className="sticky top-0 z-10 bg-stone-deep/95 backdrop-blur-sm border-b border-rust px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-lantern">Editing</div>
            <h2 className="font-serif-display text-2xl text-bone">{draft.display_name || "Your profile"}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onSave} disabled={saving} data-testid="profile-save" className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-sm hover:bg-[#F59E0B] disabled:opacity-60">
              <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={onClose} data-testid="profile-close" className="p-2 text-muted-bone hover:text-bone">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <F label="Display name">
            <input type="text" value={draft.display_name}
              onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
              data-testid="field-display-name"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </F>
          <F label="Title" hint="A custom honorific (e.g. 'Wickwarden of the Hollow Reach').">
            <input type="text" value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              data-testid="field-title"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </F>
          <F label="Pronouns">
            <input type="text" value={draft.pronouns}
              onChange={(e) => setDraft({ ...draft, pronouns: e.target.value })}
              data-testid="field-pronouns"
              placeholder="they/them"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </F>
          <F label="Favourite quote">
            <input type="text" value={draft.quote}
              onChange={(e) => setDraft({ ...draft, quote: e.target.value })}
              data-testid="field-quote"
              placeholder="Walk the realm a while longer."
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </F>
          <F label="Avatar">
            <ImageUploader
              value={draft.avatar_url}
              onUploaded={(url) => setDraft({ ...draft, avatar_url: url })}
              onClear={() => setDraft({ ...draft, avatar_url: "" })}
              testid="avatar-uploader"
            />
          </F>
          <F label="Bio" hint="Markdown welcome. [[Entry]] cross-links to the codex.">
            <MarkdownEditor
              value={draft.bio}
              onChange={(v) => setDraft({ ...draft, bio: v })}
              entries={entries}
              rows={8}
              testid="field-bio"
              placeholder="Tell the realm about yourself."
            />
          </F>
        </div>
      </div>
    </div>
  );
}

function F({ label, hint, children }) {
  return (
    <div>
      <label className="block text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-bone mt-1">{hint}</p>}
    </div>
  );
}
