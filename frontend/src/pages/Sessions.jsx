import React, { useEffect, useMemo, useState } from "react";
import { Calendar, Clock, MapPin, Plus, Pencil, Trash2, X, Check, HelpCircle, Save, Users, AlertCircle } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import SessionComments from "../components/SessionComments";
import ConfirmDialog from "../components/ConfirmDialog";

const NAME_KEY = "lantern.diceName"; // share name with dice page
const RSVP_KINDS = [
  { key: "yes", label: "I'm in", icon: Check, accent: "#4A7C59" },
  { key: "maybe", label: "Maybe", icon: HelpCircle, accent: "#FBBF24" },
  { key: "no", label: "Can't make it", icon: X, accent: "#9CA3AF" },
];
const STATUS_LABEL = {
  planned: { label: "Planned", color: "#FBBF24" },
  cancelled: { label: "Cancelled", color: "#9CA3AF" },
  completed: { label: "Played", color: "#4A7C59" },
};

function pad(n) { return n < 10 ? `0${n}` : `${n}`; }
function toLocalInputs(iso) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
function combineLocal(date, time) {
  if (!date) return null;
  const t = time || "19:00";
  return new Date(`${date}T${t}`).toISOString();
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function fmtCountdown(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "Past";
  const days = Math.floor(diff / 86400000);
  if (days >= 1) return `In ${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) return `In ${hours} hour${hours === 1 ? "" : "s"}`;
  const mins = Math.max(0, Math.floor(diff / 60000));
  return `In ${mins} min`;
}

const emptyDraft = {
  title: "",
  date: "",
  time: "19:00",
  duration_minutes: 180,
  location: "",
  notes: "",
  status: "planned",
};

export default function Sessions() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // "new" | session.id | null
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem(NAME_KEY) || "");
  const [nameDraft, setNameDraft] = useState("");
  const [showNameField, setShowNameField] = useState(false);
  const [tab, setTab] = useState("upcoming");
  const [entries, setEntries] = useState([]); // for [[wiki]] resolution in comments
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/sessions");
      setSessions(data || []);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    // Best-effort: load codex entries so comment [[wiki-links]] resolve
    api.get("/entries", { params: { limit: 500 } }).then((r) => setEntries(r.data || [])).catch(() => {});
  }, []);

  const now = Date.now();
  const upcoming = useMemo(
    () => sessions
      .filter((s) => new Date(s.scheduled_at).getTime() >= now - 6 * 3600000 && s.status !== "completed")
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)),
    [sessions, now]
  );
  const past = useMemo(
    () => sessions
      .filter((s) => new Date(s.scheduled_at).getTime() < now - 6 * 3600000 || s.status === "completed")
      .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at)),
    [sessions, now]
  );

  const openNew = () => {
    const today = new Date();
    today.setDate(today.getDate() + 7);
    setDraft({ ...emptyDraft, date: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}` });
    setEditing("new");
  };

  const openEdit = (s) => {
    const { date, time } = toLocalInputs(s.scheduled_at);
    setDraft({
      title: s.title,
      date,
      time,
      duration_minutes: s.duration_minutes,
      location: s.location || "",
      notes: s.notes || "",
      status: s.status,
    });
    setEditing(s.id);
  };

  const closeEditor = () => { setEditing(null); setDraft(emptyDraft); };

  const save = async () => {
    if (!draft.title.trim() || !draft.date) {
      toast.error("Title and date are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: draft.title.trim(),
        scheduled_at: combineLocal(draft.date, draft.time),
        duration_minutes: Number(draft.duration_minutes) || 180,
        location: draft.location,
        notes: draft.notes,
        status: draft.status,
      };
      if (editing === "new") await api.post("/sessions", payload);
      else await api.put(`/sessions/${editing}`, payload);
      toast.success("Session saved");
      closeEditor();
      await load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s) => {
    try {
      await api.delete(`/sessions/${s.id}`);
      toast.success("Session removed");
      await load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const saveName = () => {
    const v = nameDraft.trim().slice(0, 40);
    if (!v) return;
    localStorage.setItem(NAME_KEY, v);
    setPlayerName(v);
    setShowNameField(false);
    setNameDraft("");
  };

  const rsvp = async (session, status) => {
    if (!playerName) { setShowNameField(true); return; }
    try {
      await api.post(`/sessions/${session.id}/rsvp`, { player_name: playerName, status, comment: "" });
      // Optimistic local update
      setSessions((arr) => arr.map((s) => {
        if (s.id !== session.id) return s;
        const rsvps = (s.rsvps || []).filter((r) => r.player_name.toLowerCase() !== playerName.toLowerCase());
        rsvps.push({ player_name: playerName, status, comment: "", updated_at: new Date().toISOString() });
        return { ...s, rsvps };
      }));
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const clearRsvp = async (session) => {
    if (!playerName) return;
    try {
      await api.delete(`/sessions/${session.id}/rsvp`, { params: { player_name: playerName } });
      setSessions((arr) => arr.map((s) => {
        if (s.id !== session.id) return s;
        return { ...s, rsvps: (s.rsvps || []).filter((r) => r.player_name.toLowerCase() !== playerName.toLowerCase()) };
      }));
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const listToShow = tab === "upcoming" ? upcoming : past;

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16" data-testid="sessions-page">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="block w-10 h-px bg-[#FBBF24]/60" />
            <span className="text-xs tracking-[0.35em] uppercase text-lantern">The Hearth Calendar</span>
          </div>
          <h1 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-bone leading-none ember-glow mb-3">
            Sessions at the Table
          </h1>
          <p className="text-muted-bone max-w-2xl leading-relaxed">
            When the lantern&rsquo;s lit and the dice are warm. Propose dates, see who can come, and keep
            the party&rsquo;s reckoning of every game night.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 border border-rust">
            <Users className="w-3.5 h-3.5 text-lantern" />
            {playerName ? (
              <>
                <span className="text-sm text-bone" data-testid="rsvp-name">{playerName}</span>
                <button
                  onClick={() => { setNameDraft(playerName); setShowNameField(true); }}
                  data-testid="change-rsvp-name"
                  className="text-[10px] tracking-widest uppercase text-muted-bone hover:text-lantern ml-1"
                >
                  Change
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowNameField(true)}
                data-testid="set-rsvp-name"
                className="text-xs tracking-widest uppercase text-lantern hover:underline"
              >
                Set your name
              </button>
            )}
          </div>
          {user && (
            <button
              onClick={openNew}
              data-testid="new-session-btn"
              className="inline-flex items-center gap-2 px-5 py-3 bg-[#FBBF24] text-[#0B0E0C] font-semibold tracking-wide hover:bg-[#F59E0B] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Schedule Session
            </button>
          )}
        </div>
      </div>

      {showNameField && (
        <div className="lantern-card p-4 mb-6 flex items-center gap-3 flex-wrap" data-testid="name-prompt">
          <span className="text-xs tracking-[0.25em] uppercase text-lantern">Who&rsquo;s RSVPing?</span>
          <input
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveName(); }}
            placeholder={user?.name || "Your name at the table"}
            data-testid="rsvp-name-input"
            className="flex-1 min-w-[200px] px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            autoFocus
          />
          <button
            onClick={saveName}
            data-testid="save-rsvp-name"
            className="px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-xs tracking-widest uppercase"
          >
            Save
          </button>
        </div>
      )}

      <div className="flex gap-1 mb-8 border-b border-rust" data-testid="schedule-tabs">
        {[
          { k: "upcoming", label: "Upcoming", count: upcoming.length },
          { k: "past", label: "Past", count: past.length },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            data-testid={`tab-${t.k}`}
            className={`px-5 py-3 text-xs tracking-[0.3em] uppercase border-b-2 -mb-px transition-colors ${
              tab === t.k ? "text-lantern border-[#FBBF24]" : "text-muted-bone border-transparent hover:text-bone"
            }`}
          >
            {t.label} <span className="ml-1 text-[10px] text-muted-bone">({t.count})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-muted-bone">Reading the lantern&rsquo;s schedule…</div>
      ) : listToShow.length === 0 ? (
        <div className="lantern-card p-12 text-center" data-testid="empty-schedule">
          <Calendar className="w-12 h-12 text-lantern/40 mx-auto mb-4 ember-pulse" strokeWidth={1} />
          <p className="font-serif-display text-2xl text-bone">
            {tab === "upcoming" ? "No sessions on the horizon" : "No sessions have been played yet"}
          </p>
          <p className="text-sm text-muted-bone mt-2">
            {user
              ? "Schedule the next gathering — the party will see it and RSVP."
              : "The DM is still picking a night. Check back soon."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {listToShow.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              isDM={!!user}
              playerName={playerName}
              onRSVP={rsvp}
              onClearRSVP={clearRsvp}
              onEdit={() => openEdit(s)}
              onDelete={() => setConfirmDelete(s)}
              isUpcoming={tab === "upcoming"}
              entries={entries}
              onLockChanged={(updated) => setSessions((all) => all.map((x) => (x.id === updated.id ? updated : x)))}
            />
          ))}
        </div>
      )}

      {editing && (
        <SessionEditor
          draft={draft}
          setDraft={setDraft}
          onSave={save}
          onClose={closeEditor}
          saving={saving}
          isNew={editing === "new"}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={`Delete "${confirmDelete?.title || "session"}"?`}
        body="The session, its RSVPs, and any comments will be erased from the calendar. This can't be undone."
        confirmLabel="Delete session"
        onConfirm={() => { const s = confirmDelete; setConfirmDelete(null); if (s) remove(s); }}
        onCancel={() => setConfirmDelete(null)}
        testid="confirm-delete-session"
      />
    </div>
  );
}

function SessionCard({ session, isDM, playerName, onRSVP, onClearRSVP, onEdit, onDelete, isUpcoming, entries, onLockChanged }) {
  const yourRsvp = (session.rsvps || []).find((r) => r.player_name.toLowerCase() === (playerName || "").toLowerCase());
  const yesList = (session.rsvps || []).filter((r) => r.status === "yes");
  const maybeList = (session.rsvps || []).filter((r) => r.status === "maybe");
  const noList = (session.rsvps || []).filter((r) => r.status === "no");
  const status = STATUS_LABEL[session.status] || STATUS_LABEL.planned;
  const past = new Date(session.scheduled_at).getTime() < Date.now() - 6 * 3600000;
  const date = new Date(session.scheduled_at);
  const cancelled = session.status === "cancelled";

  return (
    <article
      className={`lantern-card vine-frame p-6 group ${cancelled ? "opacity-60" : ""}`}
      data-testid={`session-card-${session.id}`}
    >
      <div className="flex items-start gap-5">
        {/* Date block */}
        <div className="flex-shrink-0 text-center border border-rust px-4 py-3 min-w-[88px]" data-testid="date-block">
          <div className="text-[10px] tracking-[0.3em] uppercase text-lantern">
            {date.toLocaleDateString(undefined, { month: "short" })}
          </div>
          <div className="font-serif-display text-4xl text-bone leading-none my-1">
            {date.getDate()}
          </div>
          <div className="text-[10px] tracking-widest uppercase text-muted-bone">
            {date.toLocaleDateString(undefined, { weekday: "short" })}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h3 className="font-serif-display text-2xl text-bone leading-tight">{session.title}</h3>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-bone">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {fmtTime(session.scheduled_at)} · {Math.round(session.duration_minutes / 60 * 10) / 10}h
                </span>
                {session.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> {session.location}
                  </span>
                )}
              </div>
            </div>
            <span className="text-[10px] tracking-[0.25em] uppercase px-2 py-1 border" style={{ borderColor: status.color, color: status.color }}>
              {status.label}
            </span>
          </div>

          {isUpcoming && !cancelled && (
            <div className="text-xs tracking-widest uppercase mb-3" style={{ color: status.color }}>
              {fmtCountdown(session.scheduled_at)}
            </div>
          )}

          {session.notes && (
            <p className="text-sm text-bone/85 leading-relaxed mb-4 whitespace-pre-wrap">{session.notes}</p>
          )}

          {/* RSVP buttons */}
          {!past && !cancelled && (
            <div className="flex flex-wrap gap-2 mb-3" data-testid={`rsvp-row-${session.id}`}>
              {RSVP_KINDS.map((k) => {
                const Icon = k.icon;
                const isYours = yourRsvp?.status === k.key;
                return (
                  <button
                    key={k.key}
                    onClick={() => onRSVP(session, k.key)}
                    data-testid={`rsvp-${k.key}-${session.id}`}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-widest uppercase border transition-colors ${
                      isYours ? "text-[#0B0E0C] font-semibold" : "text-bone hover:border-[#FBBF24]/50"
                    }`}
                    style={isYours ? { background: k.accent, borderColor: k.accent } : { borderColor: "#2C362F" }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {k.label}
                  </button>
                );
              })}
              {yourRsvp && (
                <button
                  onClick={() => onClearRSVP(session)}
                  data-testid={`rsvp-clear-${session.id}`}
                  className="text-[10px] tracking-widest uppercase text-muted-bone hover:text-bone underline self-center ml-1"
                >
                  clear
                </button>
              )}
            </div>
          )}

          {/* Attendees summary */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <RsvpGroup label="In" people={yesList} color="#4A7C59" testid={`yes-${session.id}`} />
            {maybeList.length > 0 && <RsvpGroup label="Maybe" people={maybeList} color="#FBBF24" testid={`maybe-${session.id}`} />}
            {noList.length > 0 && <RsvpGroup label="Out" people={noList} color="#9CA3AF" testid={`no-${session.id}`} />}
            {yesList.length + maybeList.length + noList.length === 0 && (
              <span className="text-muted-bone italic">No RSVPs yet</span>
            )}
          </div>

          {isDM && (
            <div className="flex gap-2 mt-4 pt-4 border-t border-rust">
              <button
                onClick={onEdit}
                data-testid={`edit-session-${session.id}`}
                className="inline-flex items-center gap-1.5 text-xs tracking-widest uppercase text-muted-bone hover:text-lantern"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button
                onClick={onDelete}
                data-testid={`delete-session-${session.id}`}
                className="inline-flex items-center gap-1.5 text-xs tracking-widest uppercase text-muted-bone hover:text-red-400 ml-auto"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          )}

          <SessionComments
            session={session}
            entries={entries}
            onLockChanged={onLockChanged}
          />
        </div>
      </div>
    </article>
  );
}

function RsvpGroup({ label, people, color, testid }) {
  if (!people || people.length === 0) return null;
  return (
    <div data-testid={testid}>
      <span className="text-[10px] tracking-[0.25em] uppercase" style={{ color }}>{label}</span>
      <span className="text-bone ml-1.5">{people.map((p) => p.player_name).join(", ")}</span>
    </div>
  );
}

function SessionEditor({ draft, setDraft, onSave, onClose, saving, isNew }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0B0E0C]/80 backdrop-blur-sm" onClick={onClose} data-testid="session-editor-overlay">
      <div
        className="absolute right-0 top-0 h-full w-full max-w-xl bg-stone-deep border-l border-rust overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="session-editor"
      >
        <div className="sticky top-0 z-10 bg-stone-deep border-b border-rust px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-lantern">{isNew ? "New Session" : "Editing"}</div>
            <h2 className="font-serif-display text-2xl text-bone">{draft.title || "Untitled"}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onSave}
              disabled={saving}
              data-testid="save-session-btn"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-sm hover:bg-[#F59E0B] disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={onClose} data-testid="close-session-editor" className="p-2 text-muted-bone hover:text-bone">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <Field label="Title">
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              data-testid="field-session-title"
              placeholder="e.g. Act II: Into the Brass Cloister"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                data-testid="field-session-date"
                className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
              />
            </Field>
            <Field label="Time">
              <input
                type="time"
                value={draft.time}
                onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                data-testid="field-session-time"
                className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration (minutes)">
              <input
                type="number"
                min={30}
                step={15}
                value={draft.duration_minutes}
                onChange={(e) => setDraft({ ...draft, duration_minutes: parseInt(e.target.value || "0", 10) })}
                data-testid="field-session-duration"
                className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
              />
            </Field>
            <Field label="Status">
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                data-testid="field-session-status"
                className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
              >
                <option value="planned">Planned</option>
                <option value="cancelled">Cancelled</option>
                <option value="completed">Played</option>
              </select>
            </Field>
          </div>

          <Field label="Where (room, voice channel, address)">
            <input
              value={draft.location}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              data-testid="field-session-location"
              placeholder="e.g. Discord: #the-lantern, or Mira's place"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </Field>

          <Field label="Notes / agenda">
            <textarea
              rows={6}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              data-testid="field-session-notes"
              placeholder="What to prep, what we left off on, what to bring…"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y"
            />
          </Field>

          {draft.status === "cancelled" && (
            <div className="border border-[#FBBF24]/30 p-3 flex items-start gap-2 text-xs text-bone">
              <AlertCircle className="w-4 h-4 text-lantern flex-shrink-0 mt-0.5" />
              <span>This session is marked cancelled — RSVP buttons will be hidden for the party.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] tracking-[0.3em] uppercase text-lantern mb-1.5">{label}</label>
      {children}
    </div>
  );
}
