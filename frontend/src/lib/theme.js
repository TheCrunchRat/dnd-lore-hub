import { useEffect, useState, createContext, useContext, useCallback } from "react";
import api from "./api";

const ThemeCtx = createContext({ theme: null, reload: () => {}, saving: false });

export const DEFAULT_THEME = {
  background_url: "",
  background_blur: 0.0,
  background_dim: 0.45,
  overlay_tint: "none",
  overlay_strength: 0.2,
  accent_color: "#FBBF24",
  vignette: true,
  grain: false,
  decals: [],
  page_overrides: {},
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(null);

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get("/theme");
      setTheme(data);
    } catch { setTheme(DEFAULT_THEME); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <ThemeCtx.Provider value={{ theme: theme || DEFAULT_THEME, reload, setTheme }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);

/** Merge realm-wide theme with the current-page override for the given pathname. */
export function effectiveTheme(theme, pathname) {
  if (!theme) return DEFAULT_THEME;
  const overrides = theme.page_overrides || {};
  // Match longest-prefix override
  const key = Object.keys(overrides)
    .filter((p) => pathname === p || pathname.startsWith(p + "/"))
    .sort((a, b) => b.length - a.length)[0];
  if (!key) return theme;
  const partial = Object.fromEntries(
    Object.entries(overrides[key] || {}).filter(([, v]) => v !== null && v !== undefined)
  );
  return { ...theme, ...partial };
}

export const TINT_HEX = {
  none:   "transparent",
  warm:   "#7A3A16",
  cool:   "#0B2D3D",
  dark:   "#000000",
  purple: "#2C1F4A",
  green:  "#1B3A25",
};
