import React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";

/**
 * Themed confirm dialog that replaces `window.confirm()` for destructive
 * actions across the app. Portal-mounted so it escapes parent transforms
 * (cards with `translateY` on hover) and overlays the whole viewport.
 *
 * Usage:
 *   const [confirm, setConfirm] = useState(null);
 *   ...
 *   <button onClick={() => setConfirm({ title, body, onConfirm: doDelete })} />
 *   <ConfirmDialog open={Boolean(confirm)} {...confirm} onCancel={() => setConfirm(null)} />
 */
export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  body = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
  onCancel,
  testid = "confirm-dialog",
}) {
  if (!open) return null;
  const handleConfirm = () => { onConfirm?.(); };
  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-[#0B0E0C]/85 flex items-center justify-center p-4"
      onClick={onCancel}
      data-testid={testid}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="lantern-card vine-frame max-w-md w-full p-6 relative"
        style={{ borderColor: destructive ? "#DC2626AA" : "#FBBF24AA" }}
      >
        <button
          onClick={onCancel}
          data-testid={`${testid}-close`}
          className="absolute top-3 right-3 p-1 text-muted-bone hover:text-bone"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle
            className={`w-6 h-6 shrink-0 ${destructive ? "text-red-400" : "text-lantern"}`}
            strokeWidth={1.5}
          />
          <div>
            <h3 className="font-serif-display text-xl text-bone leading-tight">{title}</h3>
            {body && <p className="text-sm text-muted-bone mt-2 leading-relaxed">{body}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            data-testid={`${testid}-cancel`}
            className="px-4 py-2 border border-rust text-muted-bone hover:text-bone text-sm tracking-wide"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            data-testid={`${testid}-confirm`}
            className={`px-4 py-2 font-semibold text-sm tracking-wide ${
              destructive
                ? "bg-red-500/20 border border-red-500/50 text-red-200 hover:bg-red-500/30"
                : "bg-[#FBBF24] text-[#0B0E0C] hover:bg-[#F59E0B]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
