import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, ImageOverlay, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import { MapPin, Save, ImageIcon, Crosshair } from "lucide-react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

// Default working canvas — overridden to match the loaded image's aspect ratio
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
  return L.divIcon({
    html,
    className: "lantern-marker",
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -20],
  });
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
  useEffect(() => {
    map.fitBounds([[0, 0], [dims.h, dims.w]], { padding: [20, 20] });
  }, [map, dims]);
  return null;
}

function pctToLatLng(x, y, dims) {
  return [dims.h * (1 - y / 100), dims.w * (x / 100)];
}

export default function WorldMap() {
  const { user } = useAuth();
  const [locations, setLocations] = useState([]);
  const [mapUrl, setMapUrl] = useState("");
  const [dims, setDims] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const [loading, setLoading] = useState(true);
  const [placeMode, setPlaceMode] = useState(null);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");

  const load = async () => {
    try {
      const [locRes, setRes] = await Promise.all([
        api.get("/entries", { params: { category: "location" } }),
        api.get("/settings"),
      ]);
      setLocations(locRes.data || []);
      setMapUrl(setRes.data.world_map_url);
      setUrlDraft(setRes.data.world_map_url);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Load natural image dimensions to keep aspect ratio
  useEffect(() => {
    if (!mapUrl) return;
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      const w = 1000;
      const h = Math.round(w / Math.max(ratio, 0.1));
      setDims({ w, h });
    };
    img.src = mapUrl;
  }, [mapUrl]);

  const placed = useMemo(
    () => locations.filter((l) => typeof l.map_x === "number" && typeof l.map_y === "number"),
    [locations]
  );

  const unplaced = useMemo(
    () => locations.filter((l) => l.map_x == null || l.map_y == null),
    [locations]
  );

  const handlePick = async ({ x, y }) => {
    if (!placeMode) return;
    try {
      await api.put(`/entries/${placeMode.id}/position`, { map_x: x, map_y: y });
      toast.success(`Placed ${placeMode.title} on the map`);
      setPlaceMode(null);
      await load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const clearPosition = async (entry) => {
    try {
      await api.put(`/entries/${entry.id}/position`, { map_x: null, map_y: null });
      toast.success(`Removed ${entry.title} from the map`);
      await load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const saveUrl = async () => {
    try {
      const { data } = await api.put("/settings", { world_map_url: urlDraft });
      setMapUrl(data.world_map_url);
      setEditingUrl(false);
      toast.success("World map updated");
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16" data-testid="map-page">
      <div className="flex items-start justify-between mb-10 flex-wrap gap-4">
        <div>
          <div className="text-xs tracking-[0.35em] uppercase text-lantern mb-2">The Cartographer&rsquo;s Map</div>
          <h1 className="font-serif-display text-4xl md:text-5xl text-bone leading-none ember-glow">
            World of the Lantern Realm
          </h1>
          <p className="text-sm text-muted-bone mt-3 max-w-xl">
            Lanterns mark the places already chronicled. Click any flame to read the page. The map is a
            living thing — keepers add new lights as the party finds them.
          </p>
        </div>
        {user && (
          <button
            onClick={() => setEditingUrl((v) => !v)}
            data-testid="edit-map-url-btn"
            className="inline-flex items-center gap-2 px-4 py-2 border border-rust text-bone hover:border-[#FBBF24]/50 text-xs tracking-[0.2em] uppercase"
          >
            <ImageIcon className="w-4 h-4" />
            Change map image
          </button>
        )}
      </div>

      {user && editingUrl && (
        <div className="lantern-card p-5 mb-8 flex flex-wrap gap-3 items-center" data-testid="map-url-editor">
          <input
            type="text"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://… (any image URL)"
            data-testid="map-url-input"
            className="flex-1 min-w-[260px] px-3 py-2 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none text-sm"
          />
          <button
            onClick={saveUrl}
            data-testid="save-map-url-btn"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24] text-[#0B0E0C] font-semibold text-xs tracking-[0.2em] uppercase hover:bg-[#F59E0B]"
          >
            <Save className="w-4 h-4" /> Save
          </button>
        </div>
      )}

      {user && placeMode && (
        <div className="lantern-card border-[#FBBF24]/60 p-5 mb-6 flex items-center gap-3" data-testid="place-banner">
          <Crosshair className="w-5 h-5 text-lantern" />
          <p className="text-sm text-bone flex-1">
            Click anywhere on the map to place <span className="font-serif-display text-lantern text-lg">{placeMode.title}</span>.
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
        <div className="text-muted-bone">Unfolding the map…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
          <div
            className={`lantern-card overflow-hidden ${placeMode ? "cursor-crosshair ring-1 ring-[#FBBF24]/40" : ""}`}
            style={{ height: "70vh", minHeight: "520px" }}
            data-testid="map-container"
          >
            <MapContainer
              key={`${dims.w}x${dims.h}`}
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
              {mapUrl && <ImageOverlay key={mapUrl} url={mapUrl} bounds={[[0, 0], [dims.h, dims.w]]} opacity={0.95} />}
              {placeMode && <ClickToPlace onPick={handlePick} dims={dims} />}
              {placed.map((loc) => (
                <Marker
                  key={loc.id}
                  position={pctToLatLng(loc.map_x, loc.map_y, dims)}
                  icon={lanternIcon}
                  eventHandlers={{}}
                >
                  <Popup>
                    <div data-testid={`map-popup-${loc.slug}`}>
                      <div className="text-[10px] tracking-[0.25em] uppercase text-lantern mb-1">Location</div>
                      <div className="font-serif-display text-xl text-bone mb-1">{loc.title}</div>
                      {loc.subtitle && <div className="italic text-sm text-muted-bone mb-2">{loc.subtitle}</div>}
                      {loc.summary && <p className="text-xs text-bone/80 leading-relaxed mb-3 line-clamp-3">{loc.summary}</p>}
                      <Link
                        to={`/locations/${loc.slug}`}
                        className="text-xs tracking-[0.2em] uppercase text-lantern hover:underline"
                      >
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
                <MapPin className="w-3.5 h-3.5" /> Lit on the Map
              </div>
              {placed.length === 0 && (
                <p className="text-xs text-muted-bone">No locations placed yet.</p>
              )}
              <ul className="space-y-2" data-testid="placed-list">
                {placed.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 group" data-testid={`placed-${l.slug}`}>
                    <Link to={`/locations/${l.slug}`} className="text-sm text-bone hover:text-lantern truncate">
                      {l.title}
                    </Link>
                    {user && (
                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                        <button
                          onClick={() => setPlaceMode(l)}
                          data-testid={`replace-${l.slug}`}
                          className="text-[10px] uppercase tracking-wider text-muted-bone hover:text-lantern"
                          title="Re-place"
                        >
                          Move
                        </button>
                        <span className="text-muted-bone">·</span>
                        <button
                          onClick={() => clearPosition(l)}
                          data-testid={`remove-${l.slug}`}
                          className="text-[10px] uppercase tracking-wider text-muted-bone hover:text-red-400"
                          title="Remove from map"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {user && unplaced.length > 0 && (
              <div className="lantern-card p-5" data-testid="unplaced-card">
                <div className="text-xs tracking-[0.3em] uppercase text-lantern mb-3">Waiting to be Lit</div>
                <ul className="space-y-2">
                  {unplaced.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2" data-testid={`unplaced-${l.slug}`}>
                      <span className="text-sm text-bone truncate">{l.title}</span>
                      <button
                        onClick={() => setPlaceMode(l)}
                        data-testid={`place-${l.slug}`}
                        className="text-[10px] uppercase tracking-wider text-lantern hover:underline"
                      >
                        Place
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
                  Sign in as a DM to set the world map image and place lanterns for your locations.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
