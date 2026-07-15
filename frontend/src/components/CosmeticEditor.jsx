import React, { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Wrench, X, Trash2, Sparkles, Save, MousePointer, Minus, ArrowLeft, ArrowRight, RefreshCcw } from "lucide-react";
import { useTheme, PAGE_SCOPES, DEFAULT_THEME } from "../lib/theme";
import { useAuth } from "../contexts/AuthContext";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import ImageUploader from "./ImageUploader";

const TINTS = ["none", "warm", "cool", "dark", "purple", "green"];
const POSITIONS = ["center", "top", "bottom", "left", "right", "top left", "top right", "bottom left", "bottom right"];
const SIZES = ["cover", "contain", "auto"];

/** Fields that live in `page_overrides[scope]` when the scope is not global.
 *  Kept in sync with backend PageOverride model. */
const OVERRIDABLE = [
  "background_url", "background_blur", "background_dim", "background_fade",
  "background_position", "background_size",
  "overlay_tint", "overlay_strength", "accent_color", "vignette", "grain", "transition_ms",
];

export default function CosmeticEditor() {
  const { user } = useAuth();
  const { theme, reload, setDraft } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setLocalDraft] = useState(null);
  const [scope, setScope] = useState("");            // "" = global
  const [tool, setTool] = useState("select");
  const [pendingDecalUrl, setPendingDecalUrl] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [side, setSide] = useState("right");
  const draggingRef = useRef(null);

  // When editing starts, seed the local draft AND push it to the ThemeProvider
  // so the runtime layers preview it live.
  useEffect(() => {
    if (editing) {
      const d = JSON.parse(JSON.stringify(theme || DEFAULT_THEME));
      d.page_overrides = d.page_overrides || {};
      setLocalDraft(d);
      setDraft(d);
    } else {
      setDraft(null);
    }
  }, [editing, theme, setDraft]);

  // Push draft to context whenever it changes so the runtime layers rerender.
  useEffect(() => {
    if (editing && draft) setDraft(draft);
  }, [draft, editing, setDraft]);

  // Drag existing decal to reposition
  useEffect(() => {
    if (!editing) return;
    const onMove = (e) => {
      const st = draggingRef.current;
      if (!st) return;
      const dx = ((e.clientX - st.startX) / window.innerWidth) * 100;
      const dy = ((e.clientY - st.startY) / window.innerHeight) * 100;
      setLocalDraft((d) => {
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

  // Click-to-place decal
  useEffect(() => {
    if (!editing) return;
    const clickOnPage = (e) => {
      if (tool !== "place" || !pendingDecalUrl) return;
      if (e.target.closest("[data-cosmetic-panel]")) return;
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      const newDecal = {
        id: `decal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        image_url: pendingDecalUrl, x, y,
        width: 10, opacity: 0.9, rotation: 0, z_index: 5,
        parallax_mode: "static", depth: 0.3, pages: scope ? [scope] : [],
      };
      setLocalDraft((d) => ({ ...d, decals: [...(d.decals || []), newDecal] }));
      setSelectedId(newDecal.id);
      setTool("select");
      toast.success("Decal placed");
    };
    window.addEventListener("click", clickOnPage, true);
    return () => window.removeEventListener("click", clickOnPage, true);
  }, [editing, tool, pendingDecalUrl, scope]);

  if (!user || user.role !== "admin") return null;

  // ---- Helpers to read/write the current scope's fields ----
  const scopedGet = (key) => {
    if (!draft) return "";
    if (!scope) return draft[key];
    return draft.page_overrides?.[scope]?.[key] ?? "";
  };
  const isOverridden = (key) => Boolean(scope && draft?.page_overrides?.[scope] && draft.page_overrides[scope][key] !== undefined && draft.page_overrides[scope][key] !== null && draft.page_overrides[scope][key] !== "");
  const scopedSet = (key, val) => {
    setLocalDraft((d) => {
      if (!d) return d;
      if (!scope) return { ...d, [key]: val };
      const overrides = { ...(d.page_overrides || {}) };
      overrides[scope] = { ...(overrides[scope] || {}), [key]: val };
      return { ...d, page_overrides: overrides };
    });
  };
  const scopedClear = (key) => {
    if (!scope) return;
    setLocalDraft((d) => {
      const overrides = { ...(d.page_overrides || {}) };
      if (!overrides[scope]) return d;
      const copy = { ...overrides[scope] };
      delete copy[key];
      if (Object.keys(copy).length === 0) delete overrides[scope];
      else overrides[scope] = copy;
      return { ...d, page_overrides: overrides };
    });
  };

  const updateDecal = (id, patch) => setLocalDraft((d) => ({
    ...d, decals: (d.decals || []).map((dc) => dc.id === id ? { ...dc, ...patch } : dc),
  }));
  const removeDecal = (id) => setLocalDraft((d) => ({
    ...d, decals: (d.decals || []).filter((dc) => dc.id !== id),
  }));

  const startDragDecal = (dec, e) => {
    e.preventDefault();
    setSelectedId(dec.id);
    draggingRef.current = { id: dec.id, startX: e.clientX, startY: e.clientY, origX: dec.x, origY: dec.y };
  };

  const saveAll = async () => {
    try {
      await api.put("/theme", draft);
      toast.success("Realm cosmetics saved");
      reload();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const discard = () => {
    setLocalDraft(JSON.parse(JSON.stringify(theme || DEFAULT_THEME)));
    toast.info("Changes discarded");
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

  // Draft decals overlay (draggable in edit mode)
  const draftDecals = (draft?.decals || []).filter((d) => {
    if (!d.pages || d.pages.length === 0) return true;
    return d.pages.some((p) => window.location.pathname === p || window.location.pathname.startsWith(p + "/"));
  });

  return createPortal(
    <>
      {/* Draggable decal overlay */}
      <div className="fixed inset-0 z-20" style={{ pointerEvents: "none" }} data-testid="draft-decal-layer">
        {draftDecals.map((d) => (
          <div
            key={d.id}
            data-testid={`draft-decal-${d.id}`}
            className="absolute cursor-move"
            style={{
              left: `${d.x}%`, top: `${d.y}%`, width: `${d.width}vw`,
              transform: `translate(-50%, -50%) rotate(${d.rotation || 0}deg)`,
              opacity: d.opacity, zIndex: d.z_index || 5,
              pointerEvents: "auto",
              outline: selectedId === d.id ? "2px solid #FBBF24" : "1px dashed rgba(251,191,36,0.5)",
              outlineOffset: "3px",
              boxShadow: selectedId === d.id ? "0 0 24px rgba(251,191,36,0.4)" : "none",
            }}
            onMouseDown={(e) => startDragDecal(d, e)}
          >
            <img src={d.image_url} alt="" draggable={false} className="w-full h-auto select-none pointer-events-none" />
          </div>
        ))}
      </div>

      {tool === "place" && pendingDecalUrl && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 bg-[#0B0E0C] border border-[#FBBF24]/60 text-lantern text-xs tracking-widest uppercase">
          Click anywhere to place the decal
        </div>
      )}

      {collapsed ? (
        <button
          data-cosmetic-panel="1"
          data-testid="expand-cosmetic-panel"
          onClick={() => setCollapsed(false)}
          className={`fixed top-4 ${side === "right" ? "right-4" : "left-4"} z-50 inline-flex items-center gap-2 px-3 py-2 bg-[#0B0E0C] border-2 border-[#FBBF24]/60 text-lantern text-[10px] tracking-widest uppercase`}
        >
          <Wrench className="w-3.5 h-3.5" /> Cosmetics
        </button>
      ) : (
        <div
          data-cosmetic-panel="1"
          data-testid="cosmetic-panel"
          className={`fixed top-4 ${side === "right" ? "right-4" : "left-4"} z-50 w-[380px] max-h-[92vh] bg-[#0B0E0C]/95 backdrop-blur border-2 border-[#FBBF24]/60 flex flex-col`}
          style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}
        >
          <div className="flex items-center justify-between p-3 border-b border-rust">
            <div className="text-xs tracking-[0.3em] uppercase text-lantern inline-flex items-center gap-2">
              <Wrench className="w-3.5 h-3.5" /> Realm Cosmetics
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setSide(side === "right" ? "left" : "right")} data-testid="swap-side" title="Swap side" className="p-1.5 text-muted-bone hover:text-bone">
                {side === "right" ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </button>
              <button onClick={() => setCollapsed(true)} data-testid="collapse-cosmetic-panel" title="Collapse (see the whole page)" className="p-1.5 text-muted-bone hover:text-bone">
                <Minus className="w-4 h-4" />
              </button>
              <button onClick={discard} data-testid="discard-cosmetics" title="Discard local changes" className="p-1.5 text-muted-bone hover:text-bone">
                <RefreshCcw className="w-4 h-4" />
              </button>
              <button onClick={saveAll} data-testid="save-cosmetics" className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-xs hover:bg-[#F59E0B]">
                <Save className="w-3 h-3" /> Save
              </button>
              <button onClick={() => setEditing(false)} data-testid="close-cosmetic-editor" className="p-1.5 text-muted-bone hover:text-bone">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Page-scope selector */}
          <div className="px-3 py-2 border-b border-rust">
            <div className="text-[10px] tracking-widest uppercase text-muted-bone mb-1">Editing scope</div>
            <select value={scope} onChange={(e) => setScope(e.target.value)} data-testid="scope-select"
              className="w-full px-2 py-1.5 bg-[#0B0E0C] border border-rust text-bone text-sm focus:border-[#FBBF24] focus:outline-none">
              {PAGE_SCOPES.map((s) => <option key={s.key || "__global"} value={s.key}>{s.label}</option>)}
            </select>
            {scope && (
              <div className="text-[10px] text-muted-bone mt-1 italic">
                Fields you edit here only apply to <span className="text-lantern">{scope}</span>. Blank fields fall back to Global.
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            <Section title="Background & Atmosphere" testid="section-theme">
              <Field label="Background image URL / upload" scope={scope} overridden={isOverridden("background_url")} onClear={() => scopedClear("background_url")}>
                <div className="flex gap-2 items-start">
                  <input value={scopedGet("background_url") || ""} onChange={(e) => scopedSet("background_url", e.target.value)}
                    placeholder={scope ? "(inherits Global)" : ""}
                    data-testid="bg-url-input"
                    className="flex-1 px-2 py-1.5 bg-[#0B0E0C] border border-rust text-bone text-sm focus:border-[#FBBF24] focus:outline-none" />
                  <ImageUploader value="" onUploaded={(u) => scopedSet("background_url", u)} compact testid="bg-url-upload" />
                </div>
                {scopedGet("background_url") && <img src={scopedGet("background_url")} alt="" className="mt-2 w-full h-24 object-cover border border-rust" />}
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Position" scope={scope} overridden={isOverridden("background_position")} onClear={() => scopedClear("background_position")}>
                  <select value={scopedGet("background_position") || "center"} onChange={(e) => scopedSet("background_position", e.target.value)}
                    data-testid="bg-position" className="w-full px-2 py-1 bg-[#0B0E0C] border border-rust text-bone text-sm">
                    {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Size" scope={scope} overridden={isOverridden("background_size")} onClear={() => scopedClear("background_size")}>
                  <select value={scopedGet("background_size") || "cover"} onChange={(e) => scopedSet("background_size", e.target.value)}
                    data-testid="bg-size" className="w-full px-2 py-1 bg-[#0B0E0C] border border-rust text-bone text-sm">
                    {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>

              <Slider label="Blur (px)" v={scopedGet("background_blur")} on={(v) => scopedSet("background_blur", v)} min={0} max={20} step={1} testid="bg-blur" />
              <Slider label="Dim" v={scopedGet("background_dim")} on={(v) => scopedSet("background_dim", v)} min={0} max={1} step={0.05} testid="bg-dim" />
              <Slider label="Fade edges" v={scopedGet("background_fade")} on={(v) => scopedSet("background_fade", v)} min={0} max={1} step={0.05} testid="bg-fade" />
              <Slider label="Transition (ms)" v={scopedGet("transition_ms")} on={(v) => scopedSet("transition_ms", v)} min={0} max={2500} step={50} testid="transition-ms" />

              <Field label="Overlay tint" scope={scope} overridden={isOverridden("overlay_tint")} onClear={() => scopedClear("overlay_tint")}>
                <div className="flex gap-1 flex-wrap">
                  {TINTS.map((t) => (
                    <button key={t} onClick={() => scopedSet("overlay_tint", t)} data-testid={`tint-${t}`}
                      className={`px-2 py-1 text-[10px] tracking-widest uppercase border ${scopedGet("overlay_tint") === t ? "border-[#FBBF24] text-lantern" : "border-rust text-muted-bone hover:text-bone"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </Field>
              <Slider label="Tint strength" v={scopedGet("overlay_strength")} on={(v) => scopedSet("overlay_strength", v)} min={0} max={1} step={0.05} testid="tint-strength" />

              <Field label="Accent color" scope={scope} overridden={isOverridden("accent_color")} onClear={() => scopedClear("accent_color")}>
                <div className="flex gap-2">
                  <input type="color" value={scopedGet("accent_color") || "#FBBF24"} onChange={(e) => scopedSet("accent_color", e.target.value)}
                    data-testid="accent-color" className="h-9 w-12 bg-transparent border border-rust" />
                  <input value={scopedGet("accent_color") || ""} onChange={(e) => scopedSet("accent_color", e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-[#0B0E0C] border border-rust text-bone text-sm" />
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Toggle label="Vignette" v={scopedGet("vignette")} on={(v) => scopedSet("vignette", v)} testid="toggle-vignette" />
                <Toggle label="Grain" v={scopedGet("grain")} on={(v) => scopedSet("grain", v)} testid="toggle-grain" />
              </div>
            </Section>

            <Section title="Decals & Overlays" testid="section-decals">
              <Field label="New decal image">
                <div className="flex gap-2 items-start">
                  <input value={pendingDecalUrl} onChange={(e) => setPendingDecalUrl(e.target.value)}
                    placeholder="URL or upload →" data-testid="new-decal-url"
                    className="flex-1 px-2 py-1.5 bg-[#0B0E0C] border border-rust text-bone text-sm" />
                  <ImageUploader value="" onUploaded={setPendingDecalUrl} compact testid="new-decal-upload" />
                </div>
                <button onClick={() => { if (pendingDecalUrl) setTool("place"); else toast.error("Add an image URL first"); }}
                  disabled={!pendingDecalUrl} data-testid="place-decal-btn"
                  className="mt-2 w-full inline-flex items-center justify-center gap-1 px-3 py-2 border border-[#FBBF24]/60 text-lantern hover:bg-[#FBBF24]/10 disabled:opacity-50 text-xs tracking-widest uppercase">
                  <MousePointer className="w-3 h-3" /> {tool === "place" ? "Click page to drop…" : "Click to place"}
                </button>
              </Field>

              {(draft?.decals || []).length === 0 ? (
                <p className="text-[11px] text-muted-bone italic mt-2">No decals yet. Add one above.</p>
              ) : (
                <ul className="space-y-1 mt-2">
                  {draft.decals.map((d) => (
                    <li key={d.id} onClick={() => setSelectedId(d.id)} data-testid={`decal-row-${d.id}`}
                      className={`flex items-center gap-2 p-1.5 border cursor-pointer ${selectedId === d.id ? "border-[#FBBF24] bg-[#FBBF24]/10" : "border-rust hover:border-[#FBBF24]/50"}`}>
                      <img src={d.image_url} alt="" className="w-8 h-8 object-cover" />
                      <div className="flex-1 min-w-0 text-[10px] text-muted-bone">
                        <div className="text-bone truncate">{d.image_url.split("/").pop()}</div>
                        <div>{d.parallax_mode} · z{d.z_index} · pages: {(d.pages || []).join(", ") || "all"}</div>
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
                  <Slider label="Size (vw%)" v={selected.width} on={(v) => updateDecal(selected.id, { width: v })} min={2} max={60} step={0.5} testid="sel-width" />
                  <Slider label="Opacity" v={selected.opacity} on={(v) => updateDecal(selected.id, { opacity: v })} min={0} max={1} step={0.05} testid="sel-opacity" />
                  <Slider label="Rotation" v={selected.rotation} on={(v) => updateDecal(selected.id, { rotation: v })} min={-180} max={180} step={1} testid="sel-rotation" />
                  <Field label="Layer (z-index)">
                    <input type="number" value={selected.z_index} onChange={(e) => updateDecal(selected.id, { z_index: parseInt(e.target.value || "0", 10) })}
                      data-testid="sel-z" className="w-24 px-2 py-1 bg-[#0B0E0C] border border-rust text-bone text-sm" />
                  </Field>
                  <Field label="Parallax mode">
                    <div className="flex gap-1">
                      {["static", "scroll", "mouse"].map((m) => (
                        <button key={m} onClick={() => updateDecal(selected.id, { parallax_mode: m })} data-testid={`sel-parallax-${m}`}
                          className={`px-2 py-1 text-[10px] tracking-widest uppercase border ${selected.parallax_mode === m ? "border-[#FBBF24] text-lantern" : "border-rust text-muted-bone hover:text-bone"}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </Field>
                  {selected.parallax_mode !== "static" && (
                    <Slider label="Depth" v={selected.depth} on={(v) => updateDecal(selected.id, { depth: v })} min={0} max={1} step={0.05} testid="sel-depth" />
                  )}
                  <Field label="Pages (blank = all)">
                    <input value={(selected.pages || []).join(", ")}
                      onChange={(e) => updateDecal(selected.id, { pages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      placeholder="/dice, /magic" data-testid="sel-pages"
                      className="w-full px-2 py-1 bg-[#0B0E0C] border border-rust text-bone text-sm" />
                  </Field>
                </div>
              )}
            </Section>
          </div>

          <div className="p-2 border-t border-rust text-[10px] text-muted-bone tracking-widest uppercase text-center">
            Live preview · Save publishes to the party
          </div>
        </div>
      )}
    </>,
    document.body
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

function Field({ label, children, scope, overridden, onClear }) {
  return (
    <div>
      <div className="text-[10px] tracking-widest uppercase text-muted-bone mb-1 flex items-center justify-between">
        <span>{label}</span>
        {scope && overridden && (
          <button onClick={onClear} className="text-lantern hover:text-red-300" title="Clear this override (fall back to Global)">
            × override
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Slider({ label, v, on, min, max, step, testid }) {
  const val = v === "" || v === null || v === undefined ? min : Number(v);
  return (
    <div>
      <div className="text-[10px] tracking-widest uppercase text-muted-bone mb-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-bone font-mono text-[11px]">{step < 1 ? val.toFixed(2) : val.toFixed(0)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={(e) => on(parseFloat(e.target.value))} data-testid={testid}
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
