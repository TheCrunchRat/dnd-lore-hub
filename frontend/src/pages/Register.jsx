import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Flame, UserPlus } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";

export default function Register() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/register", { name, email, password });
      await refresh();
      toast.success("Welcome to the table");
      const dest = new URLSearchParams(location.search).get("redirect") || "/characters";
      navigate(dest);
    } catch (e2) {
      setError(formatApiError(e2));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-6 relative overflow-hidden" data-testid="register-page">
      <div className="absolute inset-0">
        <img src="https://images.pexels.com/photos/323340/pexels-photo-323340.jpeg" alt="" className="w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B0E0C] via-[#0B0E0C]/85 to-[#0B0E0C]" />
      </div>

      <form
        onSubmit={onSubmit}
        className="relative z-10 w-full max-w-md lantern-card vine-frame p-10"
        data-testid="register-form"
      >
        <div className="flex flex-col items-center mb-7">
          <Flame className="w-10 h-10 text-lantern ember-pulse mb-3" strokeWidth={1.25} />
          <div className="text-[10px] tracking-[0.4em] uppercase text-lantern mb-1">Step to the table</div>
          <h1 className="font-serif-display text-3xl text-bone">Make an account</h1>
          <p className="text-xs text-muted-bone mt-2 text-center">
            So your characters survive a refresh, a new device, and the long dusk.
          </p>
        </div>

        <label className="block text-xs tracking-[0.25em] uppercase text-muted-bone mb-2">Display name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="register-name"
          placeholder="What the party calls you"
          className="w-full mb-4 px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
        />

        <label className="block text-xs tracking-[0.25em] uppercase text-muted-bone mb-2">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="register-email"
          className="w-full mb-4 px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
        />

        <label className="block text-xs tracking-[0.25em] uppercase text-muted-bone mb-2">Password</label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="register-password"
          className="w-full mb-6 px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
        />

        {error && (
          <div className="text-sm text-red-400 mb-4 border border-red-900/50 bg-red-950/30 px-3 py-2" data-testid="register-error">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          data-testid="register-submit"
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#FBBF24] text-[#0B0E0C] font-semibold tracking-wide hover:bg-[#F59E0B] transition-colors disabled:opacity-60"
        >
          <UserPlus className="w-4 h-4" />
          {submitting ? "Lighting your lantern…" : "Create account"}
        </button>

        <p className="text-[11px] text-muted-bone text-center mt-6 leading-relaxed">
          Already have one? <Link to="/login" className="text-lantern hover:underline">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
