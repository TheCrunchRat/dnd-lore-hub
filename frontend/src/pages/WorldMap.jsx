import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, ImageOverlay, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import {
  MapPin, Save, Image as ImageIcon, Crosshair, Plus, Pencil, Trash2, X,
  Star, StarOff,
} from "lucide-react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import ImageUploader from "../components/ImageUploader";
import ConfirmDialog from "../components/ConfirmDialog";

const DEFAULT_W = 1000;
const DEFAULT_H = 700;

function makeIcon() {
  const html = `
    <div style="position:relative;width:48px;height:48px;display:flex;align-items:center;justify-content:center;pointer-events:auto;">
      <div style="position:absolute;inset:-4px;border-radius:50%;background:radial-gradient(circle, rgba(251,191,36,0.65) 0%, rgba(251,191,36,0.2) 45%, transparent 72%);animation:ember-flicker 3.4s ease-in-out infinite;"></div>
      <div style="position:relative;width:32px;height:32px;border-radius:50%;background:#0B0E0C;border:2px solid #FBBF24;box-shadow:0 0 12px rgba(251,191,36,0.85), inset 0 0 8px rgba(251,191,36,0.4);display:flex;align-items:center;justify-content:center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
        </svg>
      </div>
    </div>`;
  return L.divIcon({ html, className: "lantern-marker", iconSize: [48, 48], iconAnchor: [24, 24], popupAnchor: [0, -20] });
}
const lanternIcon = makeIcon();

function ClickToPlace({ onPick, dims }) {
  useMapEvents({
    click(e) {
      const x = (e.latlng.lng / dims.w) * 100;
      const y = (1 - e.latlng.lat / dims.h) * 100;
      onPick({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
    },
  });
  return null;
}
function FitBounds({ dims }) {
  const map = useMap();
  useEffect(() => { map.fitBounds([[0, 0], [dims.h, dims.w]], { padding: [20, 20] }); }, [map, dims]);
  return null;
}
const pctToLatLng = (x, y, dims) => [dims.h * (1 - y / 100), dims.w * (x / 100)];

export default function WorldMap() {
  const { user } = useAuth();
  const [maps, setMaps] = useState([]);
  const [locations, setLocations] = useState([]);
  const [activeMapId, setActiveMapId] = useState(null);
  const [dims, setDims] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const [loading, setLoading] = useState(true);
  const [placeMode, setPlaceMode] = useState(null);
  const [mapEditorOpen, setMapEditorOpen] = useState(false);
  const [mapDraft, setMapDraft] = useState(null); // {id?, name, subtitle, image_url}
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = async () => {
    try {
      const [mapsRes, locRes] = await Promise.all([
        api.get("/maps"),
        api.get("/entries", { params: { category: "location" } }),
      ]);
      const list = mapsRes.data || [];
      setMaps(list);
      setLocations(locRes.data || []);
      if (!activeMapId) {
        const defaultMap = list.find((m) => m.is_default) || list[0];
        setActiveMapId(defaultMap?.id || null);
      }
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const activeMap = useMemo(() => maps.find((m) => m.id === activeMapId) || null, [maps, activeMapId]);
  const defaultMapId = useMemo(() => maps.find((m) => m.is_default)?.id, [maps]);

  // Locations are "on the active map" if their map_id matches, OR if map_id is null
  // and the active map is the default (back-compat with pre-migration legacy data).
  const placedHere = useMemo(() => {
    if (!activeMap) return [];
    return locations.filter((l) => {
      if (typeof l.map_x !== "number" || typeof l.map_y !== "number") return false;
      const lmid = l.map_id || defaultMapId;
      return lmid === activeMap.id;
    });
  }, [locations, activeMap, defaultMapId]);

  const unplaced = useMemo(
    () => locations.filter((l) => l.map_x == null || l.map_y == null),
    [locations]
  );

  // Aspect-fit the active map's image
  useEffect(() => {
    if (!activeMap?.image_url) return;
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      const w = 1000;
      setDims({ w, h: Math.round(w / Math.max(ratio, 0.1)) });
    };
    img.src = activeMap.image_url;
  }, [activeMap?.image_url]);

  // ---------- Marker placement ----------
  const handlePick = async ({ x, y }) => {
    if (!placeMode || !activeMap) return;
    try {
      await api.put(`/entries/${placeMode.id}/position`, { map_x: x, map_y: y, map_id: activeMap.id });
      toast.success(`Placed ${placeMode.title} on ${activeMap.name}`);
      setPlaceMode(null);
      await load();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const clearPosition = async (entry) => {
    try {
      await api.put(`/entries/${entry.id}/position`, { map_x: null, map_y: null });
      toast.success(`Removed ${entry.title} from the map`);
      await load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  // ---------- Map CRUD ----------
  const openNewMap = () => { setMapDraft({ name: "", subtitle: "", image_url: "", sort_order: maps.length }); setMapEditorOpen(true); };
  const openEditMap = (m) => { setMapDraft({ ...m }); setMapEditorOpen(true); };
  const saveMap = async () => {
    if (!mapDraft?.name?.trim()) { toast.error("Map name required"); return; }
    try {
      if (mapDraft.id) {
        const { data } = await api.put(`/maps/${mapDraft.id}`, mapDraft);
        setActiveMapId(data.id);
        toast.success("Map updated");
      } else {
        const { data } = await api.post("/maps", mapDraft);
        setActiveMapId(data.id);
        toast.success("Map created");
      }
      setMapEditorOpen(false);
      setMapDraft(null);
      await load();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const setDefaultMap = async (m) => {
    try {
      await api.post(`/maps/${m.id}/set_default`);
      toast.success(`Default map: ${m.name}`);
      await load();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const deleteMap = async (m) => {
    try {
      await api.delete(`/maps/${m.id}`);
      toast.success(`Erased "${m.name}"`);
      // If we deleted the active one, pick the new default (or first)
      if (activeMapId === m.id) setActiveMapId(null);
      await load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16" data-testid="map-page">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="text-xs tracking-[0.35em] uppercase text-lantern mb-2">The Cartographer&rsquo;s Atlas</div>
          <h1 className="font-serif-display text-4xl md:text-5xl text-bone leading-none ember-glow">
            {activeMap?.name || "The Lantern Realm"}
          </h1>
          {activeMap?.subtitle && (
            <p className="font-serif-display italic text-muted-bone text-lg mt-1">{activeMap.subtitle}</p>
          )}
          <p className="text-sm text-muted-bone mt-3 max-w-xl">
            Lanterns mark the places already chronicled. Click any flame to read the page. The atlas is a
            living thing — keepers add new lights and new realms as the party finds them.
          </p>
        </div>
        {user && (
          <div className="flex items-center gap-2 flex-wrap">
            {activeMap && (
              <button
                onClick={() => openEditMap(activeMap)}
                data-testid="edit-active-map-btn"
                className="inline-flex items-center gap-2 px-3 py-2 border border-rust text-bone hover:border-[#FBBF24]/50 text-xs tracking-[0.2em] uppercase"
              >
                <ImageIcon className="w-4 h-4" />
                Edit this map
              </button>
            )}
            <button
              onClick={openNewMap}
              data-testid="new-map-btn"
              className="inline-flex items-center gap-2 px-3 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-xs tracking-[0.2em] uppercase hover:bg-[#F59E0B]"
            >
              <Plus className="w-4 h-4" /> New Map
            </button>
          </div>
        )}
      </div>

      {/* Map switcher */}
      <div className="flex flex-wrap gap-2 mb-6" data-testid="map-tabs">
        {maps.map((m) => (
          <button
            key={m.id}
            onClick={() => setActiveMapId(m.id)}
            data-testid={`map-tab-${m.slug}`}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs tracking-[0.2em] uppercase border transition-colors ${
              activeMapId === m.id
                ? "border-[#FBBF24] text-lantern bg-[#FBBF24]/5"
                : "border-rust text-muted-bone hover:text-bone hover:border-[#FBBF24]/30"
            }`}
          >
            {m.is_default && <Star className="w-3 h-3 text-[#FBBF24]" />}
            {m.name}
            <span className="opacity-70 ml-1">({locations.filter((l) => typeof l.map_x === "number" && (l.map_id || defaultMapId) === m.id).length})</span>
          </button>
        ))}
      </div>

      {/* Place-mode banner */}
      {user && placeMode && (
        <div className="lantern-card border-[#FBBF24]/60 p-5 mb-6 flex items-center gap-3" data-testid="place-banner">
          <Crosshair className="w-5 h-5 text-lantern" />
          <p className="text-sm text-bone flex-1">
            Click anywhere on the map to place <span className="font-serif-display text-lantern text-lg">{placeMode.title}</span> on <span className="text-lantern">{activeMap?.name}</span>.
          </p>
          <button
            onClick={() => setPlaceMode(null)}
            data-testid="cancel-place-btn"
            className="text-xs uppercase tracking-[0.2em] text-muted-bone hover:text-bone"
          >
            Cancel
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-muted-bone">Unfolding the atlas…</div>
      ) : !activeMap ? (
        <div className="lantern-card p-10 text-center">
          <p className="font-serif-display text-2xl text-bone mb-3">No maps in the atlas yet</p>
          {user && (
            <button onClick={openNewMap} className="text-lantern hover:underline text-sm">
              + Create the first map
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div
            className={`lantern-card overflow-hidden ${placeMode ? "cursor-crosshair ring-1 ring-[#FBBF24]/40" : ""}`}
            style={{ height: "70vh", minHeight: "520px" }}
            data-testid="map-container"
          >
            <MapContainer
              key={`${activeMap.id}-${dims.w}x${dims.h}`}
              crs={L.CRS.Simple}
              minZoom={-2}
              maxZoom={3}
              zoom={0}
              center={[dims.h / 2, dims.w / 2]}
              maxBoundsViscosity={0.8}
              style={{ height: "100%", width: "100%", background: "#0B0E0C" }}
              zoomControl={true}
              attributionControl={false}
            >
              <FitBounds dims={dims} />
              {activeMap.image_url && (
                <ImageOverlay key={activeMap.image_url} url={activeMap.image_url} bounds={[[0, 0], [dims.h, dims.w]]} opacity={0.95} />
              )}
              {placeMode && <ClickToPlace onPick={handlePick} dims={dims} />}
              {placedHere.map((loc) => (
                <Marker key={loc.id} position={pctToLatLng(loc.map_x, loc.map_y, dims)} icon={lanternIcon}>
                  <Popup>
                    <div data-testid={`map-popup-${loc.slug}`}>
                      <div className="text-[10px] tracking-[0.25em] uppercase text-lantern mb-1">Location</div>
                      <div className="font-serif-display text-xl text-bone mb-1">{loc.title}</div>
                      {loc.subtitle && <div className="italic text-sm text-muted-bone mb-2">{loc.subtitle}</div>}
                      {loc.summary && <p className="text-xs text-bone/80 leading-relaxed mb-3 line-clamp-3">{loc.summary}</p>}
                      <Link to={`/locations/${loc.slug}`} className="text-xs tracking-[0.2em] uppercase text-lantern hover:underline">
                        Open page →
                      </Link>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          <aside className="space-y-4">
            <div className="lantern-card p-5">
              <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-3 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" /> Lit on {activeMap.name}
              </div>
              {placedHere.length === 0 ? (
                <p className="text-xs text-muted-bone">Nothing placed on this map yet.</p>
              ) : (
                <ul className="space-y-2" data-testid="placed-list">
                  {placedHere.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 group" data-testid={`placed-${l.slug}`}>
                      <Link to={`/locations/${l.slug}`} className="text-sm text-bone hover:text-lantern truncate">
                        {l.title}
                      </Link>
                      {user && (
                        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                          <button onClick={() => setPlaceMode(l)} data-testid={`replace-${l.slug}`} className="text-[10px] uppercase tracking-wider text-muted-bone hover:text-lantern" title="Re-place">
                            Move
                          </button>
                          <span className="text-muted-bone">·</span>
                          <button onClick={() => clearPosition(l)} data-testid={`remove-${l.slug}`} className="text-[10px] uppercase tracking-wider text-muted-bone hover:text-red-400" title="Remove from map">
                            Remove
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {user && unplaced.length > 0 && (
              <div className="lantern-card p-5" data-testid="unplaced-card">
                <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-3">Waiting to be Lit</div>
                <ul className="space-y-2">
                  {unplaced.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2" data-testid={`unplaced-${l.slug}`}>
                      <span className="text-sm text-bone truncate">{l.title}</span>
                      <button onClick={() => setPlaceMode(l)} data-testid={`place-${l.slug}`} className="text-[10px] uppercase tracking-wider text-lantern hover:underline">
                        Place
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {user && (
              <div className="lantern-card p-5" data-testid="atlas-controls">
                <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-3">All Maps</div>
                <ul className="space-y-1.5">
                  {maps.map((m) => (
                    <li key={m.id} className="flex items-center gap-1.5 text-sm">
                      <button
                        onClick={() => setActiveMapId(m.id)}
                        className={`flex-1 text-left truncate ${activeMapId === m.id ? "text-lantern" : "text-bone hover:text-lantern"}`}
                      >
                        {m.is_default && <Star className="w-3 h-3 inline mr-1 text-[#FBBF24]" />}
                        {m.name}
                      </button>
                      {!m.is_default && (
                        <button
                          onClick={() => setDefaultMap(m)}
                          data-testid={`map-default-${m.slug}`}
                          className="p-1 text-muted-bone hover:text-[#FBBF24]"
                          title="Set as default"
                        >
                          <StarOff className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => openEditMap(m)} data-testid={`map-edit-${m.slug}`} className="p-1 text-muted-bone hover:text-bone" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(m)}
                        data-testid={`map-delete-${m.slug}`}
                        className="p-1 transition-colors text-muted-bone hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!user && (
              <div className="lantern-card p-5">
                <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-2">Lanternkeepers</div>
                <p className="text-xs text-muted-bone leading-relaxed">
                  Sign in as a DM to add new regional maps and place lanterns for your locations.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}

      {mapEditorOpen && mapDraft && (
        <MapEditor
          draft={mapDraft}
          setDraft={setMapDraft}
          onSave={saveMap}
          onClose={() => { setMapEditorOpen(false); setMapDraft(null); }}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={`Erase the map "${confirmDelete?.name || ""}"?`}
        body="The image, its subtitle, and any lantern placements tied to it will be lost. Locations aren't deleted — they'll just fall off the atlas."
        confirmLabel="Erase map"
        onConfirm={() => { const m = confirmDelete; setConfirmDelete(null); if (m) deleteMap(m); }}
        onCancel={() => setConfirmDelete(null)}
        testid="confirm-delete-map"
      />
    </div>
  );
}

function MapEditor({ draft, setDraft, onSave, onClose }) {
  const isNew = !draft.id;
  return (
    <div className="fixed inset-0 z-50 bg-[#0B0E0C]/80 backdrop-blur-sm" onClick={onClose} data-testid="map-editor-overlay">
      <div
        className="absolute right-0 top-0 h-full w-full max-w-md bg-stone-deep border-l border-rust overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="map-editor"
      >
        <div className="sticky top-0 z-10 bg-stone-deep border-b border-rust px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-lantern">{isNew ? "New Map" : "Editing"}</div>
            <h2 className="font-serif-display text-2xl text-bone">{draft.name || "Untitled"}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onSave} data-testid="map-editor-save" className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-sm hover:bg-[#F59E0B]">
              <Save className="w-4 h-4" /> Save
            </button>
            <button onClick={onClose} data-testid="map-editor-close" className="p-2 text-muted-bone hover:text-bone">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <Field label="Name" required>
            <input
              type="text" value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              data-testid="field-map-name"
              placeholder="e.g. The High Reach"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </Field>
          <Field label="Subtitle">
            <input
              type="text" value={draft.subtitle || ""}
              onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
              data-testid="field-map-subtitle"
              placeholder="e.g. Mountain stronghold of the Wickwardens"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </Field>
          <Field label="Map image">
            <ImageUploader
              value={draft.image_url}
              onUploaded={(url) => setDraft({ ...draft, image_url: url })}
              onClear={() => setDraft({ ...draft, image_url: "" })}
              testid="map-image-uploader"
            />
            <input
              type="text" value={draft.image_url || ""}
              onChange={(e) => setDraft({ ...draft, image_url: e.target.value })}
              data-testid="field-map-image-url"
              placeholder="…or paste an external URL"
              className="w-full mt-2 px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none text-sm"
            />
          </Field>
          <Field label="Sort order" hint="Lower numbers appear first in the tab bar.">
            <input
              type="number" value={draft.sort_order ?? 0}
              onChange={(e) => setDraft({ ...draft, sort_order: parseInt(e.target.value || "0", 10) })}
              data-testid="field-map-sort"
              className="w-full px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <div>
      <label className="block text-[10px] tracking-[0.3em] uppercase text-lantern mb-2">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-bone mt-1">{hint}</p>}
    </div>
  );
}
