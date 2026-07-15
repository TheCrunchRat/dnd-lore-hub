import { useEffect, useState, createContext, useContext, useCallback } from "react";
import api from "./api";

const ThemeCtx = createContext({
  theme: null, reload: () => {}, draft: null, setDraft: () => {},
});

export const DEFAULT_THEME = {
  background_url: "",
  background_blur: 0.0,
  background_dim: 0.45,
  background_fade: 0.0,
  background_position: "center",
  background_size: "cover",
  overlay_tint: "none",
  overlay_strength: 0.2,
  accent_color: "#FBBF24",
  vignette: true,
  grain: false,
  transition_ms: 600,
  decals: [],
  page_overrides: {},
};

/** Route prefixes we let the DM independently theme. `""` = global default. */
export const PAGE_SCOPES = [
  { key: "",         label: "Global (all pages)" },
  { key: "/codex",   label: "/codex + entries" },
  { key: "/entry",   label: "/entry/… detail" },
  { key: "/map",     label: "/map" },
  { key: "/magic",   label: "/magic + trees" },
  { key: "/dice",    label: "/dice" },
  { key: "/shop",    label: "/shop" },
  { key: "/guide",   label: "/guide" },
  { key: "/sessions",label: "/sessions" },
  { key: "/profile", label: "/profile" },
  { key: "/characters", label: "/characters" },
];

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(null);
  const [draft, setDraft] = useState(null); // live-preview draft while editor is open

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get("/theme");
      setTheme(data);
    } catch { setTheme(DEFAULT_THEME); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <ThemeCtx.Provider value={{ theme: theme || DEFAULT_THEME, reload, setTheme, draft, setDraft }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);

/** Merge the base theme with the best-matching page override for the given
 *  pathname. Only non-null / non-empty override keys win. */
export function effectiveTheme(theme, pathname) {
  if (!theme) return DEFAULT_THEME;
  const overrides = theme.page_overrides || {};
  const key = Object.keys(overrides)
    .filter((p) => p && (pathname === p || pathname.startsWith(p + "/")))
    .sort((a, b) => b.length - a.length)[0];
  if (!key) return { ...DEFAULT_THEME, ...theme };
  const partial = Object.fromEntries(
    Object.entries(overrides[key] || {}).filter(([, v]) => v !== null && v !== undefined && v !== "")
  );
  return { ...DEFAULT_THEME, ...theme, ...partial };
}

/** When the editor is open, the draft acts as the live-preview theme; otherwise
 *  we fall back to the saved theme. Callers should use this in the runtime
 *  layers so DM sees changes as they slide/type. */
export function useLiveTheme() {
  const { theme, draft } = useTheme();
  return draft || theme;
}

export const TINT_HEX = {
  none:   "transparent",
  warm:   "#7A3A16",
  cool:   "#0B2D3D",
  dark:   "#000000",
  purple: "#2C1F4A",
  green:  "#1B3A25",
};
