import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import CategoryList from "@/pages/CategoryList";
import EntryDetail from "@/pages/EntryDetail";
import Login from "@/pages/Login";
import Admin from "@/pages/Admin";
import WorldMap from "@/pages/WorldMap";
import Dice from "@/pages/Dice";
import MagicList from "@/pages/MagicList";
import MagicTree from "@/pages/MagicTree";
import Sessions from "@/pages/Sessions";
import Shop from "@/pages/Shop";
import Register from "@/pages/Register";
import RulesAdmin from "@/pages/RulesAdmin";
import Guide from "@/pages/Guide";
import Profile from "@/pages/Profile";
import Spells from "@/pages/Spells";
import { Toaster } from "sonner";

function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <div className="min-h-[60vh] flex items-center justify-center text-muted-bone">Lighting the lantern…</div>;
  if (!user) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (requireAdmin && user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

const CATEGORY_ROUTES = [
  { path: "/locations", category: "location" },
  { path: "/characters", category: "character" },
  { path: "/factions", category: "faction" },
  { path: "/lore", category: "lore" },
  { path: "/bestiary", category: "bestiary" },
];

function RouterShell() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/map" element={<WorldMap />} />
        <Route path="/dice" element={<Dice />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/guide/:slug" element={<Guide />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/:id" element={<Profile />} />
        <Route path="/magic" element={<MagicList />} />
        <Route path="/magic/:slug" element={<MagicTree />} />
        <Route path="/spells" element={<Spells />} />
        <Route path="/world/:slug" element={<EntryDetail />} />

        {CATEGORY_ROUTES.map(({ path, category }) => (
          <React.Fragment key={path}>
            <Route path={path} element={<CategoryList category={category} basePath={path} />} />
            <Route path={`${path}/:slug`} element={<EntryDetail />} />
          </React.Fragment>
        ))}

        <Route path="/admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
        <Route path="/admin/rules" element={<ProtectedRoute requireAdmin><RulesAdmin /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RouterShell />
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#151B17",
              border: "1px solid #2C362F",
              color: "#E6E3D8",
              fontFamily: "Manrope, sans-serif",
            },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
