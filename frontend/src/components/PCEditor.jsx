import React, { useState } from "react";
import { X, Save, UserPlus } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";

const NAME_KEY = "lantern.diceName";

const empty = {
  name: "",
  subtitle: "",
  summary: "",
  content: "",
  image_url: "",
  race: "",
  char_class: "",
  level: 1,
  alignment: "",
  pronouns: "",
};

export default function PCEditor({ open, onClose, onSaved, existing }) {
  const { user } = useAuth();
  const isEdit = !!existing;
  const initial = isEdit
    ? {
        name: existing.title || "",
        subtitle: existing.subtitle || "",
        summary: existing.summary || "",
        content: existing.content || "",
        image_url: existing.image_url || "",
        race: existing.metadata?.race || "",
        char_class: existing.metadata?.class || "",
        level: existing.metadata?.level || 1,
        alignment: existing.metadata?.alignment || "",
        pronouns: existing.metadata?.pronouns || "",
      }
    : empty;

  const [draft, setDraft] = useState(initial);
  // When signed in, the player name is locked to the account name
  const initialPlayerName = user?.name || existing?.metadata?.owner || localStorage.getItem(NAME_KEY) || "";
  const [playerName, setPlayerName] = useState(initialPlayerName);
  const [saving, setSaving] = useState(false);
  const nameLocked = !!user || (isEdit && !!existing?.metadata?.owner);

  if (!open) return null;

  const save = async () => {
    if (!draft.name.trim()) { toast.error("Your character needs a name"); return; }
    if (!playerName.trim()) { toast.error("Tell us your player name"); return; }

    setSaving(true);
    try {
      const payload = {
        player_name: playerName.trim(),
        name: draft.name.trim(),
        subtitle: draft.subtitle,
        summary: draft.summary,
        content: draft.content,
        image_url: draft.image_url,
        race: draft.race,
        char_class: draft.char_class,
        level: Number(draft.level) || 1,
        alignment: draft.alignment,
        pronouns: draft.pronouns,
      };
      const { data } = isEdit
        ? await api.put(`/pcs/${existing.id}`, payload)
        : await api.post("/pcs", payload);
      // Save the player name for next time
      localStorage.setItem(NAME_KEY, playerName.trim());
      toast.success(isEdit ? "Character updated" : "Character added to the codex");
      onSaved?.(data);
      onClose();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0E0C]/80 backdrop-blur-sm" onClick={onClose} data-testid="pc-editor-overlay">
      <div
        className="absolute right-0 top-0 h-full w-full max-w-2xl bg-stone-deep border-l border-rust overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="pc-editor"
      >
        <div className="sticky top-0 z-10 bg-stone-deep border-b border-rust px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-lantern">
              {isEdit ? "Editing your character" : "Add your character"}
            </div>
            <h2 className="font-serif-display text-2xl text-bone">{draft.name || "Untitled"}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              data-testid="save-pc-btn"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-sm hover:bg-[#F59E0B] disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={onClose} data-testid="close-pc-editor" className="p-2 text-muted-bone hover:text-bone">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <Field label="Your player name (so the DM knows whose character this is)">
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              data-testid="field-player-name"
              disabled={nameLocked}
              placeholder="Mira"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none disabled:opacity-70"
            />
            {user && (
              <p className="text-[10px] text-muted-bone mt-1">
                Linked to your account ({user.email}).
              </p>
            )}
            {!user && isEdit && existing?.metadata?.owner && (
              <p className="text-[10px] text-muted-bone mt-1">
                Locked to the original player — only they (or a DM) can transfer ownership.
              </p>
            )}
          </Field>

          <Field label="Character name">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              data-testid="field-pc-name"
              placeholder="Thorne the Quick"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </Field>

          <Field label="Subtitle / epithet">
            <input
              value={draft.subtitle}
              onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
              data-testid="field-pc-subtitle"
              placeholder="Half-elf rogue, lantern-thief of the Drowning Fens"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Race">
              <input
                value={draft.race}
                onChange={(e) => setDraft({ ...draft, race: e.target.value })}
                data-testid="field-pc-race"
                placeholder="Half-elf"
                className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
              />
            </Field>
            <Field label="Class">
              <input
                value={draft.char_class}
                onChange={(e) => setDraft({ ...draft, char_class: e.target.value })}
                data-testid="field-pc-class"
                placeholder="Rogue"
                className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Level">
              <input
                type="number"
                min={1}
                max={20}
                value={draft.level}
                onChange={(e) => setDraft({ ...draft, level: parseInt(e.target.value || "1", 10) })}
                data-testid="field-pc-level"
                className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
              />
            </Field>
            <Field label="Alignment">
              <input
                value={draft.alignment}
                onChange={(e) => setDraft({ ...draft, alignment: e.target.value })}
                data-testid="field-pc-alignment"
                placeholder="CN"
                className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
              />
            </Field>
            <Field label="Pronouns">
              <input
                value={draft.pronouns}
                onChange={(e) => setDraft({ ...draft, pronouns: e.target.value })}
                data-testid="field-pc-pronouns"
                placeholder="they/them"
                className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
              />
            </Field>
          </div>

          <Field label="One-line summary">
            <input
              value={draft.summary}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              data-testid="field-pc-summary"
              placeholder="The party's quietest hand, fastest blade."
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </Field>

          <Field label="Bio / backstory">
            <textarea
              rows={8}
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              data-testid="field-pc-content"
              placeholder="Where they're from, why they're walking the Sunken Road…"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y"
            />
          </Field>

          <Field label="Portrait URL (optional)">
            <input
              value={draft.image_url}
              onChange={(e) => setDraft({ ...draft, image_url: e.target.value })}
              data-testid="field-pc-image"
              placeholder="https://…"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
            {draft.image_url && (
              <img src={draft.image_url} alt="" className="mt-3 h-32 w-full object-cover border border-rust" />
            )}
          </Field>
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

export { UserPlus };
