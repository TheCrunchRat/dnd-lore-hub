import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

export default api;

export function formatApiError(err) {
  const detail = err?.response?.data?.detail;
  if (detail == null) return err?.message || "Something went wrong";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export const CATEGORIES = [
  { key: "overview", label: "World", plural: "World Overview", icon: "Compass" },
  { key: "location", label: "Locations", plural: "Locations", icon: "Map" },
  { key: "character", label: "Characters", plural: "Characters", icon: "Users" },
  { key: "faction", label: "Factions", plural: "Factions", icon: "Swords" },
  { key: "lore", label: "Lore", plural: "Lore & History", icon: "BookOpen" },
  { key: "session", label: "Sessions", plural: "Sessions", icon: "ScrollText" },
  { key: "bestiary", label: "Bestiary", plural: "Bestiary", icon: "Ghost" },
];
