import React, { useRef, useState } from "react";
import { Upload, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";

/**
 * Drag-and-drop image uploader. Calls POST /api/uploads (DM-only) and resolves
 * to the public URL the backend serves. URL persistence is the parent's job —
 * we just pass the value back via onUploaded.
 *
 * Props:
 *   value      — current image_url (used to show preview & "Clear" button)
 *   onUploaded — (publicUrl: string) => void; called with the full URL on success
 *   onClear    — optional callback when the user clicks the X to remove
 *   testid     — defaults to "image-uploader"
 *   compact    — small variant for inline use (e.g. inside the markdown editor)
 */
export default function ImageUploader({
  value = "",
  onUploaded,
  onClear,
  testid = "image-uploader",
  compact = false,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are accepted.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image too large (max 10 MB).");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/uploads", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      // data.url is like "/api/uploads/<id>"; convert to absolute so it works
      // as an <img src> anywhere in the app.
      const fullUrl = `${process.env.REACT_APP_BACKEND_URL || ""}${data.url}`;
      onUploaded?.(fullUrl);
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) upload(file);
  };

  if (compact) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
          className="hidden"
          data-testid={`${testid}-input`}
          onChange={(e) => upload(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          data-testid={`${testid}-pick`}
          className="p-1.5 text-muted-bone hover:text-lantern hover:bg-[#FBBF24]/5 transition-colors disabled:opacity-50"
          title={uploading ? "Uploading…" : "Upload image"}
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
        </button>
      </>
    );
  }

  return (
    <div data-testid={testid}>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
        className="hidden"
        data-testid={`${testid}-input`}
        onChange={(e) => upload(e.target.files?.[0])}
      />
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-testid={`${testid}-dropzone`}
        className={`border-2 border-dashed cursor-pointer transition-colors px-4 py-6 text-center ${
          dragging
            ? "border-[#FBBF24] bg-[#FBBF24]/5"
            : "border-rust hover:border-[#FBBF24]/40 hover:bg-[#FBBF24]/[0.02]"
        } ${uploading ? "pointer-events-none opacity-70" : ""}`}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-lantern text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading…
          </div>
        ) : value ? (
          <div className="flex items-center gap-3 text-left">
            <img src={value} alt="" className="w-20 h-20 object-cover border border-rust" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-1">Current image</div>
              <div className="text-xs text-muted-bone truncate">{value}</div>
              <div className="text-[10px] text-muted-bone italic mt-1">Click or drop a new image to replace.</div>
            </div>
            {onClear && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClear(); }}
                data-testid={`${testid}-clear`}
                className="p-1.5 text-muted-bone hover:text-red-400 transition-colors"
                title="Remove image"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-bone">
            <Upload className="w-6 h-6 text-lantern/60" strokeWidth={1.5} />
            <div className="text-sm text-bone">Drop an image here, or click to choose</div>
            <div className="text-[10px] tracking-widest uppercase">PNG · JPG · WEBP · GIF · 10 MB max</div>
          </div>
        )}
      </div>
    </div>
  );
}
