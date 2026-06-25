import React from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { Flame, LogIn, LogOut, Shield } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const navItems = [
  { to: "/", label: "Codex" },
  { to: "/map", label: "Map" },
  { to: "/locations", label: "Locations" },
  { to: "/characters", label: "Characters" },
  { to: "/factions", label: "Factions" },
  { to: "/lore", label: "Lore" },
  { to: "/sessions", label: "Sessions" },
  { to: "/guide", label: "Guide" },
  { to: "/bestiary", label: "Bestiary" },
  { to: "/magic", label: "Magic" },
  { to: "/spells", label: "Spells" },
  { to: "/shop", label: "Shop" },
  { to: "/dice", label: "Dice" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-obsidian noise-bg text-bone flex flex-col">
      <header className="sticky top-0 z-40 bg-[#0B0E0C]/85 backdrop-blur-xl border-b border-rust">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-4 flex items-center justify-between gap-6">
          <Link to="/" className="flex items-center gap-3 group" data-testid="brand-link">
            <Flame className="w-6 h-6 text-lantern ember-pulse" strokeWidth={1.5} />
            <div className="leading-tight">
              <div className="font-serif-display text-xl text-bone tracking-wide">Lantern Realm</div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-muted-bone">Codex of the Long Dusk</div>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-1" data-testid="primary-nav">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={({ isActive }) =>
                  `px-3 py-2 text-sm tracking-wide transition-colors border-b border-transparent ${
                    isActive ? "text-lantern border-[#FBBF24]" : "text-muted-bone hover:text-bone"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Link
                  to="/profile"
                  data-testid="profile-link"
                  className="hidden sm:inline-flex items-center gap-2 px-3 py-2 text-xs tracking-widest uppercase border border-rust text-bone hover:text-lantern hover:border-[#FBBF24]/40 transition-colors"
                  title="Your profile"
                >
                  <Shield className="w-3.5 h-3.5 text-lantern" />
                  {user.name}
                </Link>
                {user.role === "admin" && (
                  <button
                    onClick={() => navigate("/admin")}
                    data-testid="admin-btn"
                    className="hidden sm:inline-flex items-center gap-2 px-3 py-2 text-xs tracking-widest uppercase border border-[#FBBF24]/40 text-lantern hover:bg-[#FBBF24]/10 transition-colors"
                  >
                    Admin
                  </button>
                )}
                <button
                  onClick={async () => { await logout(); navigate("/"); }}
                  data-testid="logout-btn"
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs tracking-widest uppercase border border-rust text-muted-bone hover:text-bone hover:border-[#FBBF24]/40 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Exit
                </button>
              </>
            ) : (
              <Link
                to="/login"
                data-testid="login-link"
                className="inline-flex items-center gap-2 px-3 py-2 text-xs tracking-widest uppercase border border-[#FBBF24]/40 text-lantern hover:bg-[#FBBF24]/10 transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign in
              </Link>
            )}
          </div>
        </div>
        <div className="lg:hidden overflow-x-auto border-t border-rust">
          <div className="flex gap-1 px-6 py-2 min-w-max">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                data-testid={`navmobile-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={({ isActive }) =>
                  `px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
                    isActive ? "text-lantern" : "text-muted-bone hover:text-bone"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-rust mt-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <Flame className="w-4 h-4 text-lantern" strokeWidth={1.5} />
            <p className="text-xs tracking-[0.25em] uppercase text-muted-bone">
              No lantern shall go dark by my hand
            </p>
          </div>
          <p className="text-xs text-muted-bone">A private campaign codex · Lantern Realm</p>
        </div>
      </footer>
    </div>
  );
}
