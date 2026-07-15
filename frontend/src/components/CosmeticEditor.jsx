import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Wrench, X, Trash2, Plus, Sparkles, Save, MousePointer, RotateCw, Layers } from "lucide-react";
import { useTheme } from "../lib/theme";
import { useAuth } from "../contexts/AuthContext";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import ImageUploader from "./ImageUploader";
import { DecalLayer } from "./ThemeLayer";

const TINTS = ["none", "warm", "cool", "dark", "purple", "green"];

/**
 * CosmeticEditor — floating admin pill (bottom-right) that toggles a live
 * edit mode. When active:
 *   - overlays a right-side control panel for realm theme (bg, dim, blur,
 *     tint, vignette, grain, accent)
 *   - shows a "Decals" tool that lets the admin click anywhere on the page
 *     to drop a decal, then drag existing decals to reposition them
 *   - Save writes to /api/theme and /api/theme/decals/*
 * Non-admins never see the pill.
 */
export default function CosmeticEditor() {
  const { user } = useAuth();
  const { theme, reload } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [tool, setTool] = useState("select"); // 'select' | 'place'
  const [pendingDecalUrl, setPendingDecalUrl] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const draggingRef = useRef(null); // {id, startX, startY, origX, origY}

  useEffect(() => {
    if (editing) setDraft(JSON.parse(JSON.stringify(theme || {})));
  }, [editing, theme]);

  // Drag existing decal
  useEffect(() => {
    if (!editing) return;
    const onMove = (e) => {
      const st = draggingRef.current;
      if (!st) return;
      const dx = ((e.clientX - st.startX) / window.innerWidth) * 100;
      const dy = ((e.clientY - st.startY) / window.innerHeight) * 100;
      setDraft((d) => {
        if (!d) return d;
        const decals = (d.decals || []).map((dc) =>
          dc.id === st.id ? { ...dc, x: Math.max(0, Math.min(100, st.origX + dx)), y: Math.max(0, Math.min(100, st.origY + dy)) } : dc
        );
        return { ...d, decals };
      });
    };
    const onUp = () => { draggingRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [editing]);

  const startDragDecal = (dec, e) => {
    e.preventDefault();
    setTool("select");
    setSelectedId(dec.id);
    draggingRef.current = {
      id: dec.id, startX: e.clientX, startY: e.clientY, origX: dec.x, origY: dec.y,
    };
  };

  const clickOnPage = (e) => {
    if (!editing || tool !== "place" || !pendingDecalUrl) return;
    if (e.target.closest("[data-cosmetic-panel]")) return;
    const x = (e.clientX / window.innerWidth) * 100;
    const y = (e.clientY / window.innerHeight) * 100;
    const newDecal = {
      id: `decal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      image_url: pendingDecalUrl,
      x, y,
      width: 10, opacity: 0.9, rotation: 0, z_index: 5,
      parallax_mode: "static", depth: 0.3, pages: [],
    };
    setDraft((d) => ({ ...d, decals: [...(d.decals || []), newDecal] }));
    setSelectedId(newDecal.id);
    setTool("select");
    toast.success("Decal placed");
  };

  useEffect(() => {
    if (!editing) return;
    window.addEventListener("click", clickOnPage, true);
    return () => window.removeEventListener("click", clickOnPage, true);
  }, [editing, tool, pendingDecalUrl, clickOnPage]);

  if (!user || user.role !== "admin") return null;

  const updateDraft = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const updateDecal = (id, patch) => setDraft((d) => ({
    ...d, decals: (d.decals || []).map((dc) => dc.id === id ? { ...dc, ...patch } : dc),
  }));
  const removeDecal = (id) => setDraft((d) => ({
    ...d, decals: (d.decals || []).filter((dc) => dc.id !== id),
  }));

  const saveAll = async () => {
    try {
      await api.put("/theme", draft);
      toast.success("Realm cosmetics saved");
      reload();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const selected = (draft?.decals || []).find((d) => d.id === selectedId);

  const pill = (
    <button
      onClick={() => setEditing(true)}
      data-testid="open-cosmetic-editor"
      className="fixed bottom-24 right-6 z-40 inline-flex items-center gap-2 px-4 py-3 bg-[#0B0E0C] border-2 border-[#FBBF24]/60 text-lantern hover:bg-[#FBBF24]/10 shadow-lg"
      style={{ boxShadow: "0 0 24px rgba(251, 191, 36, 0.25)" }}
    >
      <Wrench className="w-4 h-4" />
      <span className="text-[10px] tracking-[0.3em] uppercase">Cosmetics</span>
    </button>
  );

  if (!editing) return pill;

  return createPortal(
    <>
      {/* Edit-mode decal overlay reuses the runtime DecalLayer BUT sourced from the draft */}
      <DraftDecalOverlay draft={draft} onSelect={startDragDecal} selectedId={selectedId} />

      {/* Placement crosshair when in place mode */}
      {tool === "place" && pendingDecalUrl && (
        <div className="fixed inset-0 z-30 pointer-events-none">
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-[#0B0E0C] border border-[#FBBF24]/60 text-lantern text-xs tracking-widest uppercase">
            Click anywhere to place the decal · Esc to cancel
          </div>
        </div>
      )}

      <div
        data-cosmetic-panel="1"
        data-testid="cosmetic-panel"
        className="fixed top-4 right-4 z-50 w-[360px] max-h-[92vh] bg-[#0B0E0C] border-2 border-[#FBBF24]/60 flex flex-col"
        style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}
      >
        <div className="flex items-center justify-between p-3 border-b border-rust">
          <div className="text-xs tracking-[0.3em] uppercase text-lantern inline-flex items-center gap-2">
            <Wrench className="w-3.5 h-3.5" /> Realm Cosmetics
          </div>
          <div className="flex items-center gap-1">
            <button onClick={saveAll} data-testid="save-cosmetics" className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-xs hover:bg-[#F59E0B]">
              <Save className="w-3 h-3" /> Save
            </button>
            <button onClick={() => setEditing(false)} data-testid="close-cosmetic-editor" className="p-1.5 text-muted-bone hover:text-bone">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Theme controls */}
          <Section title="Background & Atmosphere" testid="section-theme">
            <Field label="Background image URL / upload">
              <div className="flex gap-2 items-start">
                <input value={draft?.background_url || ""} onChange={(e) => updateDraft({ background_url: e.target.value })}
                  data-testid="bg-url-input"
                  className="flex-1 px-2 py-1.5 bg-[#0B0E0C] border border-rust text-bone text-sm focus:border-[#FBBF24] focus:outline-none" />
                <ImageUploader value="" onUploaded={(u) => updateDraft({ background_url: u })} compact testid="bg-url-upload" />
              </div>
              {draft?.background_url && <img src={draft.background_url} alt="" className="mt-2 w-full h-16 object-cover border border-rust" />}
            </Field>
            <Slider label="Blur" v={draft?.background_blur || 0} on={(v) => updateDraft({ background_blur: v })} min={0} max={20} step={1} testid="bg-blur" />
            <Slider label="Dim" v={draft?.background_dim || 0} on={(v) => updateDraft({ background_dim: v })} min={0} max={1} step={0.05} testid="bg-dim" />
            <Field label="Overlay tint">
              <div className="flex gap-1 flex-wrap">
                {TINTS.map((t) => (
                  <button key={t} onClick={() => updateDraft({ overlay_tint: t })} data-testid={`tint-${t}`}
                    className={`px-2 py-1 text-[10px] tracking-widest uppercase border ${draft?.overlay_tint === t ? "border-[#FBBF24] text-lantern" : "border-rust text-muted-bone hover:text-bone"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </Field>
            <Slider label="Tint strength" v={draft?.overlay_strength || 0} on={(v) => updateDraft({ overlay_strength: v })} min={0} max={1} step={0.05} testid="tint-strength" />
            <Field label="Accent color">
              <div className="flex gap-2">
                <input type="color" value={draft?.accent_color || "#FBBF24"} onChange={(e) => updateDraft({ accent_color: e.target.value })}
                  data-testid="accent-color"
                  className="h-9 w-12 bg-transparent border border-rust" />
                <input value={draft?.accent_color || ""} onChange={(e) => updateDraft({ accent_color: e.target.value })}
                  className="flex-1 px-2 py-1.5 bg-[#0B0E0C] border border-rust text-bone text-sm" />
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Toggle label="Vignette" v={draft?.vignette} on={(v) => updateDraft({ vignette: v })} testid="toggle-vignette" />
              <Toggle label="Grain" v={draft?.grain} on={(v) => updateDraft({ grain: v })} testid="toggle-grain" />
            </div>
          </Section>

          {/* Decals */}
          <Section title="Decals & Overlays" testid="section-decals">
            <div className="mb-2">
              <Field label="New decal image">
                <div className="flex gap-2 items-start">
                  <input value={pendingDecalUrl} onChange={(e) => setPendingDecalUrl(e.target.value)}
                    placeholder="URL or upload →" data-testid="new-decal-url"
                    className="flex-1 px-2 py-1.5 bg-[#0B0E0C] border border-rust text-bone text-sm" />
                  <ImageUploader value="" onUploaded={setPendingDecalUrl} compact testid="new-decal-upload" />
                </div>
                <button
                  onClick={() => { if (pendingDecalUrl) setTool("place"); else toast.error("Add an image URL first"); }}
                  data-testid="place-decal-btn"
                  disabled={!pendingDecalUrl}
                  className="mt-2 w-full inline-flex items-center justify-center gap-1 px-3 py-2 border border-[#FBBF24]/60 text-lantern hover:bg-[#FBBF24]/10 disabled:opacity-50 disabled:cursor-not-allowed text-xs tracking-widest uppercase"
                >
                  <MousePointer className="w-3 h-3" /> {tool === "place" ? "Click page to drop…" : "Click to place"}
                </button>
              </Field>
            </div>

            {(draft?.decals || []).length === 0 ? (
              <p className="text-[11px] text-muted-bone italic">No decals yet. Add one above.</p>
            ) : (
              <ul className="space-y-1">
                {draft.decals.map((d) => (
                  <li key={d.id}
                    onClick={() => setSelectedId(d.id)}
                    data-testid={`decal-row-${d.id}`}
                    className={`flex items-center gap-2 p-1.5 border cursor-pointer ${selectedId === d.id ? "border-[#FBBF24] bg-[#FBBF24]/10" : "border-rust hover:border-[#FBBF24]/50"}`}>
                    <img src={d.image_url} alt="" className="w-8 h-8 object-cover" />
                    <div className="flex-1 min-w-0 text-[10px] text-muted-bone">
                      <div className="text-bone truncate">{d.image_url.split("/").pop()}</div>
                      <div>{d.parallax_mode} · z{d.z_index}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeDecal(d.id); }} data-testid={`delete-decal-${d.id}`} className="p-1 text-muted-bone hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {selected && (
              <div className="mt-3 pt-3 border-t border-rust space-y-2" data-testid="selected-decal-editor">
                <div className="text-[10px] tracking-widest uppercase text-lantern">Selected decal</div>
                <Slider label="Size (vw%)" v={selected.width} on={(v) => updateDecal(selected.id, { width: v })} min={2} max={60} step={0.5} testid={`sel-width`} />
                <Slider label="Opacity" v={selected.opacity} on={(v) => updateDecal(selected.id, { opacity: v })} min={0} max={1} step={0.05} testid={`sel-opacity`} />
                <Slider label="Rotation" v={selected.rotation} on={(v) => updateDecal(selected.id, { rotation: v })} min={-180} max={180} step={1} testid={`sel-rotation`} />
                <Field label="Layer (z-index; positive = above, negative = below)">
                  <input type="number" value={selected.z_index} onChange={(e) => updateDecal(selected.id, { z_index: parseInt(e.target.value || "0", 10) })}
                    data-testid="sel-z"
                    className="w-24 px-2 py-1 bg-[#0B0E0C] border border-rust text-bone text-sm" />
                </Field>
                <Field label="Parallax mode">
                  <div className="flex gap-1">
                    {["static", "scroll", "mouse"].map((m) => (
                      <button key={m} onClick={() => updateDecal(selected.id, { parallax_mode: m })}
                        data-testid={`sel-parallax-${m}`}
                        className={`px-2 py-1 text-[10px] tracking-widest uppercase border ${selected.parallax_mode === m ? "border-[#FBBF24] text-lantern" : "border-rust text-muted-bone hover:text-bone"}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                </Field>
                {selected.parallax_mode !== "static" && (
                  <Slider label="Depth" v={selected.depth} on={(v) => updateDecal(selected.id, { depth: v })} min={0} max={1} step={0.05} testid="sel-depth" />
                )}
                <Field label="Pages (comma-separated route prefixes; blank = all)">
                  <input value={(selected.pages || []).join(", ")}
                    onChange={(e) => updateDecal(selected.id, { pages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    placeholder="/dice, /magic"
                    data-testid="sel-pages"
                    className="w-full px-2 py-1 bg-[#0B0E0C] border border-rust text-bone text-sm" />
                </Field>
              </div>
            )}
          </Section>
        </div>

        <div className="p-3 border-t border-rust text-[10px] text-muted-bone tracking-widest uppercase text-center">
          Click Save to publish · Esc closes without saving
        </div>
      </div>
    </>,
    document.body
  );
}

function DraftDecalOverlay({ draft, onSelect, selectedId }) {
  // Render the draft decals with pointer-events so they can be dragged.
  const decals = draft?.decals || [];
  return (
    <div className="fixed inset-0 z-20" style={{ pointerEvents: "none" }} data-testid="draft-decal-layer">
      {decals.map((d) => {
        const isSelected = selectedId === d.id;
        return (
          <div
            key={d.id}
            data-testid={`draft-decal-${d.id}`}
            className="absolute cursor-move"
            style={{
              left: `${d.x}%`, top: `${d.y}%`, width: `${d.width}vw`,
              transform: `translate(-50%, -50%) rotate(${d.rotation || 0}deg)`,
              opacity: d.opacity,
              zIndex: d.z_index || 5,
              pointerEvents: "auto",
              outline: isSelected ? "2px solid #FBBF24" : "1px dashed rgba(251,191,36,0.5)",
              outlineOffset: "3px",
              boxShadow: isSelected ? "0 0 24px rgba(251,191,36,0.4)" : "none",
            }}
            onMouseDown={(e) => onSelect(d, e)}
          >
            <img src={d.image_url} alt="" draggable={false} className="w-full h-auto select-none pointer-events-none" />
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, testid, children }) {
  return (
    <div data-testid={testid}>
      <div className="text-[10px] tracking-[0.3em] uppercase text-lantern mb-2 inline-flex items-center gap-2">
        <Sparkles className="w-3 h-3" /> {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10px] tracking-widest uppercase text-muted-bone mb-1">{label}</div>
      {children}
    </div>
  );
}

function Slider({ label, v, on, min, max, step, testid }) {
  return (
    <div>
      <div className="text-[10px] tracking-widest uppercase text-muted-bone mb-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-bone font-mono text-[11px]">{Number(v).toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={(e) => on(parseFloat(e.target.value))}
        data-testid={testid}
        className="w-full accent-[#FBBF24]" />
    </div>
  );
}

function Toggle({ label, v, on, testid }) {
  return (
    <label className="flex items-center gap-2 px-2 py-1.5 border border-rust cursor-pointer text-[10px] tracking-widest uppercase text-bone">
      <input type="checkbox" checked={Boolean(v)} onChange={(e) => on(e.target.checked)} data-testid={testid} className="accent-[#FBBF24]" />
      <span>{label}</span>
    </label>
  );
}
