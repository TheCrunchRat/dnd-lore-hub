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
import { Toaster } from "sonner";

function ProtectedRoute({ children }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <div className="min-h-[60vh] flex items-center justify-center text-muted-bone">Lighting the lantern…</div>;
  if (!user) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

const CATEGORY_ROUTES = [
  { path: "/locations", category: "location" },
  { path: "/characters", category: "character" },
  { path: "/factions", category: "faction" },
  { path: "/lore", category: "lore" },
  { path: "/sessions", category: "session" },
  { path: "/bestiary", category: "bestiary" },
];

function RouterShell() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/map" element={<WorldMap />} />
        <Route path="/dice" element={<Dice />} />
        <Route path="/world/:slug" element={<EntryDetail />} />

        {CATEGORY_ROUTES.map(({ path, category }) => (
          <React.Fragment key={path}>
            <Route path={path} element={<CategoryList category={category} basePath={path} />} />
            <Route path={`${path}/:slug`} element={<EntryDetail />} />
          </React.Fragment>
        ))}

        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
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
          position="top-right"
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
