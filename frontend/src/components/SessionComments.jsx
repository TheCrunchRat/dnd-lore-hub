import React, { useEffect, useMemo, useState } from "react";
import {
  MessageCircle, Send, Pin, PinOff, Trash2, Pencil, X,
  ShieldCheck, Lock, Unlock, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import MarkdownView from "./MarkdownView";

/**
 * Collapsible comment thread for a scheduled session.
 *  - GET /api/sessions/:id/comments         (public)
 *  - POST /api/sessions/:id/comments        (login required, blocked when locked unless admin)
 *  - PUT  /api/sessions/:id/comments/:cid   (author or admin)
 *  - DELETE /api/sessions/:id/comments/:cid (author or admin)
 *  - POST /api/sessions/:id/comments/:cid/pin (admin)
 *  - POST /api/sessions/:id/lock_comments   (admin)
 */
export default function SessionComments({ session, entries = [], onLockChanged }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState(null); // {comments_locked, comments}
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const sid = session.id;

  const fetchThread = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/sessions/${sid}/comments`);
      setThread(data);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  // Load when the panel is first expanded
  useEffect(() => {
    if (open && !thread) fetchThread();
  }, [open]);

  const post = async () => {
    if (!body.trim() || posting) return;
    setPosting(true);
    try {
      const { data } = await api.post(`/sessions/${sid}/comments`, { body: body.trim() });
      setThread((t) => ({ ...(t || { comments_locked: false }), comments: [...(t?.comments || []), data] }));
      setBody("");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setPosting(false);
    }
  };

  const saveEdit = async (cid) => {
    if (!editBody.trim()) return;
    try {
      const { data } = await api.put(`/sessions/${sid}/comments/${cid}`, { body: editBody.trim() });
      setThread((t) => ({
        ...t,
        comments: t.comments.map((c) => (c.id === cid ? data : c)),
      }));
      setEditingId(null);
      setEditBody("");
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const remove = async (cid) => {
    if (confirmDelete !== cid) {
      setConfirmDelete(cid);
      setTimeout(() => setConfirmDelete((cur) => (cur === cid ? null : cur)), 3500);
      return;
    }
    setConfirmDelete(null);
    try {
      await api.delete(`/sessions/${sid}/comments/${cid}`);
      setThread((t) => ({ ...t, comments: t.comments.filter((c) => c.id !== cid) }));
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const togglePin = async (cid) => {
    try {
      const { data } = await api.post(`/sessions/${sid}/comments/${cid}/pin`);
      // Re-sort: pinned first, then by created_at
      setThread((t) => {
        const next = t.comments.map((c) => (c.id === cid ? data : c));
        next.sort((a, b) =>
          (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
          (a.created_at || "").localeCompare(b.created_at || "")
        );
        return { ...t, comments: next };
      });
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const toggleLock = async () => {
    try {
      const { data } = await api.post(`/sessions/${sid}/lock_comments`);
      setThread((t) => ({ ...(t || {}), comments_locked: data.comments_locked }));
      onLockChanged?.(data);
      toast.success(data.comments_locked ? "Comments sealed" : "Comments unsealed");
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const locked = thread?.comments_locked ?? session?.comments_locked ?? false;
  const isAdmin = user?.role === "admin";
  const count = thread?.comments?.length ?? null;

  return (
    <div className="border-t border-rust/60 mt-4 pt-4" data-testid={`comments-${sid}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        data-testid={`comments-toggle-${sid}`}
        className="flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-muted-bone hover:text-lantern transition-colors"
      >
        <MessageCircle className="w-3.5 h-3.5" />
        Comments
        {count !== null && <span className="text-lantern">({count})</span>}
        {locked && <Lock className="w-3 h-3 text-[#FBBF24]" />}
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4" data-testid={`comments-panel-${sid}`}>
          {/* Comment list */}
          {loading ? (
            <p className="text-xs text-muted-bone italic">Drawing the lantern closer…</p>
          ) : (thread?.comments?.length ?? 0) === 0 ? (
            <div className="text-xs text-muted-bone italic">No words yet — be the first to speak.</div>
          ) : (
            <ul className="space-y-3">
              {thread.comments.map((c) => (
                <CommentItem
                  key={c.id}
                  comment={c}
                  isAdmin={isAdmin}
                  isMine={user && user.id === c.author_id}
                  editingId={editingId}
                  editBody={editBody}
                  setEditBody={setEditBody}
                  onStartEdit={() => { setEditingId(c.id); setEditBody(c.body); }}
                  onCancelEdit={() => { setEditingId(null); setEditBody(""); }}
                  onSaveEdit={() => saveEdit(c.id)}
                  onDelete={() => remove(c.id)}
                  confirmDelete={confirmDelete === c.id}
                  onPin={() => togglePin(c.id)}
                  entries={entries}
                />
              ))}
            </ul>
          )}

          {/* Compose */}
          <div className="lantern-card p-3 space-y-2" data-testid={`comments-compose-${sid}`}>
            {!user ? (
              <p className="text-xs text-muted-bone italic">
                Sign in to post a comment.
              </p>
            ) : locked && !isAdmin ? (
              <p className="text-xs text-muted-bone italic flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-[#FBBF24]" /> The Lanternkeeper has sealed this thread.
              </p>
            ) : (
              <>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); post(); }
                  }}
                  placeholder="Markdown welcome — try [[Mirewatch]] to link a codex entry. Ctrl+Enter to send."
                  rows={2}
                  data-testid={`comment-input-${sid}`}
                  className="w-full px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y text-sm leading-relaxed"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-bone">
                    Posting as <span className="text-bone">{user.name}</span>
                    {isAdmin && <span className="text-lantern ml-1.5">· Lanternkeeper</span>}
                  </span>
                  <button
                    onClick={post}
                    disabled={!body.trim() || posting}
                    data-testid={`comment-send-${sid}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-xs tracking-widest uppercase hover:bg-[#F59E0B] disabled:opacity-50"
                  >
                    <Send className="w-3 h-3" />
                    {posting ? "Sending…" : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* DM lock toggle */}
          {isAdmin && (
            <div className="flex items-center justify-end">
              <button
                onClick={toggleLock}
                data-testid={`comments-lock-${sid}`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] tracking-[0.25em] uppercase border transition-colors ${
                  locked
                    ? "border-[#FBBF24] text-lantern bg-[#FBBF24]/5"
                    : "border-rust text-muted-bone hover:text-lantern hover:border-[#FBBF24]/40"
                }`}
                title={locked ? "Unseal comments" : "Seal comments (players can no longer post)"}
              >
                {locked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                {locked ? "Unseal thread" : "Seal thread"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CommentItem({
  comment, isAdmin, isMine, editingId, editBody, setEditBody,
  onStartEdit, onCancelEdit, onSaveEdit, onDelete, confirmDelete, onPin, entries,
}) {
  const editing = editingId === comment.id;
  const isDM = comment.author_role === "admin";
  return (
    <li
      className={`lantern-card p-3 ${comment.pinned ? "border-[#FBBF24]/40 bg-[#FBBF24]/[0.03]" : ""}`}
      data-testid={`comment-${comment.id}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {comment.pinned && (
            <span className="inline-flex items-center gap-1 text-[10px] tracking-[0.25em] uppercase text-[#F59E0B]">
              <Pin className="w-2.5 h-2.5" /> Pinned
            </span>
          )}
          <span className={`text-xs ${isDM ? "text-lantern" : "text-bone"} font-semibold truncate`}>
            {comment.author_name}
          </span>
          {isDM && (
            <span className="inline-flex items-center gap-1 text-[9px] tracking-[0.25em] uppercase text-[#FBBF24]" title="Dungeon Master">
              <ShieldCheck className="w-2.5 h-2.5" /> DM
            </span>
          )}
          <span className="text-[10px] text-muted-bone" title={comment.created_at}>
            {formatRelative(comment.created_at)}
            {comment.edited && " · edited"}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {isAdmin && (
            <button
              onClick={onPin}
              data-testid={`comment-pin-${comment.id}`}
              className="p-1 text-muted-bone hover:text-[#F59E0B] transition-colors"
              title={comment.pinned ? "Unpin" : "Pin to top"}
            >
              {comment.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
          )}
          {(isMine || isAdmin) && !editing && (
            <button
              onClick={onStartEdit}
              data-testid={`comment-edit-${comment.id}`}
              className="p-1 text-muted-bone hover:text-bone transition-colors"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {(isMine || isAdmin) && !editing && (
            <button
              onClick={onDelete}
              data-testid={`comment-delete-${comment.id}`}
              className={`p-1 transition-colors ${
                confirmDelete ? "text-red-400" : "text-muted-bone hover:text-red-400"
              }`}
              title={confirmDelete ? "Click again to confirm" : "Delete"}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={3}
            data-testid={`comment-edit-input-${comment.id}`}
            className="w-full px-2 py-1.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none resize-y text-sm"
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={onCancelEdit}
              data-testid={`comment-edit-cancel-${comment.id}`}
              className="px-2 py-1 text-[10px] tracking-widest uppercase text-muted-bone hover:text-bone"
            >
              <X className="w-3 h-3 inline" /> Cancel
            </button>
            <button
              onClick={onSaveEdit}
              data-testid={`comment-edit-save-${comment.id}`}
              className="px-2 py-1 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-[10px] tracking-widest uppercase hover:bg-[#F59E0B]"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <CommentBody body={comment.body} entries={entries} />
      )}
    </li>
  );
}

function CommentBody({ body, entries }) {
  return (
    <div className="text-sm">
      <MarkdownView source={body} entries={entries || []} compact />
    </div>
  );
}

function formatRelative(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
