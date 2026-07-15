import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTheme, effectiveTheme, TINT_HEX } from "../lib/theme";

/**
 * ThemeBackground — renders global background image + tint + vignette + grain
 * as a fixed layer behind the app content. Applies the realm theme merged
 * with the current-page override.
 */
export function ThemeBackground() {
  const { theme } = useTheme();
  const location = useLocation();
  const t = effectiveTheme(theme, location.pathname);

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: -1 }} aria-hidden="true">
      {t.background_url && (
        <div
          data-testid="theme-background"
          className="absolute inset-0"
          style={{
            backgroundImage: `url("${t.background_url}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: t.background_blur ? `blur(${t.background_blur}px)` : "none",
            transform: t.background_blur ? "scale(1.05)" : "none",  // hide blur edges
          }}
        />
      )}
      {t.background_dim > 0 && (
        <div className="absolute inset-0" style={{ background: `rgba(11,14,12,${t.background_dim})` }} />
      )}
      {t.overlay_tint !== "none" && (
        <div
          className="absolute inset-0"
          style={{
            background: TINT_HEX[t.overlay_tint] || "transparent",
            opacity: Math.min(1, Math.max(0, t.overlay_strength || 0)),
            mixBlendMode: "multiply",
          }}
        />
      )}
      {t.vignette && (
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      )}
      {t.grain && <div className="absolute inset-0 theme-grain" />}
      <style>{`
        .theme-grain{background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence baseFrequency='0.9' seed='7' /></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.35'/></svg>");opacity:.12;mix-blend-mode:overlay;pointer-events:none}
      `}</style>
    </div>
  );
}

/**
 * DecalLayer — renders all decals as absolutely positioned images across the
 * viewport. Supports three parallax modes:
 *   - static: fixed position on the viewport
 *   - scroll: shifts vertically as the page scrolls (depth ∈ [0..1])
 *   - mouse:  gently follows the cursor (depth ∈ [0..1])
 *
 * When `editMode.selectId` is set (edit mode), decals become pointer-events
 * enabled and expose their bounding boxes for drag/select handling done in
 * `CosmeticEditor`.
 */
export function DecalLayer({ editMode, onDecalSelect, selectedDecalId }) {
  const { theme } = useTheme();
  const location = useLocation();
  const [scrollY, setScrollY] = useState(0);
  const [mouse, setMouse] = useState({ dx: 0, dy: 0 });
  const rafRef = useRef(null);

  // Track scroll + mouse for parallax (respect prefers-reduced-motion)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setScrollY(window.scrollY);
      });
    };
    const onMove = (e) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      setMouse({ dx: (e.clientX - cx) / cx, dy: (e.clientY - cy) / cy });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const path = location.pathname;
  const decals = (theme?.decals || []).filter((d) => {
    if (!d.pages || d.pages.length === 0) return true;
    return d.pages.some((p) => path === p || path.startsWith(p + "/"));
  });

  if (decals.length === 0) return null;

  return (
    <div className={`fixed inset-0 ${editMode ? "pointer-events-none" : "pointer-events-none"}`} data-testid="decal-layer">
      {decals.map((d) => {
        const isSelected = selectedDecalId === d.id;
        let transform = `translate(-50%, -50%) rotate(${d.rotation || 0}deg)`;
        if (d.parallax_mode === "scroll") {
          transform = `translate(-50%, ${-50 + (scrollY * (d.depth || 0.3) * -0.05)}%) rotate(${d.rotation || 0}deg)`;
        } else if (d.parallax_mode === "mouse") {
          const px = mouse.dx * (d.depth || 0.3) * 40; // px shift
          const py = mouse.dy * (d.depth || 0.3) * 40;
          transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px)) rotate(${d.rotation || 0}deg)`;
        }
        return (
          <div
            key={d.id}
            data-testid={`decal-${d.id}`}
            data-decal-id={d.id}
            className={`absolute transition-shadow ${editMode ? "cursor-move" : ""}`}
            style={{
              left: `${d.x}%`,
              top: `${d.y}%`,
              width: `${d.width}vw`,
              transform,
              opacity: d.opacity,
              zIndex: d.z_index || 5,
              pointerEvents: editMode ? "auto" : "none",
              boxShadow: isSelected ? "0 0 0 2px #FBBF24, 0 0 24px rgba(251,191,36,0.4)" : "none",
              outline: editMode ? "1px dashed rgba(251,191,36,0.4)" : "none",
              outlineOffset: "4px",
              willChange: d.parallax_mode !== "static" ? "transform" : undefined,
            }}
            onMouseDown={editMode ? (e) => onDecalSelect?.(d, e) : undefined}
          >
            <img
              src={d.image_url}
              alt=""
              draggable={false}
              className="w-full h-auto select-none"
              style={{ userSelect: "none", pointerEvents: "none" }}
            />
          </div>
        );
      })}
    </div>
  );
}
