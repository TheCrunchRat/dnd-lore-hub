import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Flame, LogIn } from "lucide-react";

export default function Login() {
  const { login, error, setError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const ok = await login(email, password);
    setSubmitting(false);
    if (ok) {
      const dest = new URLSearchParams(location.search).get("redirect") || "/admin";
      navigate(dest);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-6 relative overflow-hidden" data-testid="login-page">
      <div className="absolute inset-0">
        <img
          src="https://images.pexels.com/photos/323340/pexels-photo-323340.jpeg"
          alt=""
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B0E0C] via-[#0B0E0C]/85 to-[#0B0E0C]" />
      </div>

      <form
        onSubmit={onSubmit}
        className="relative z-10 w-full max-w-md lantern-card vine-frame p-10"
        data-testid="login-form"
      >
        <div className="flex flex-col items-center mb-8">
          <Flame className="w-10 h-10 text-lantern ember-pulse mb-3" strokeWidth={1.25} />
          <div className="text-[10px] tracking-[0.4em] uppercase text-lantern mb-1">Lanternkeepers Only</div>
          <h1 className="font-serif-display text-3xl text-bone">Sign in to inscribe</h1>
        </div>

        <label className="block text-xs tracking-[0.25em] uppercase text-muted-bone mb-2">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="email-input"
          className="w-full mb-5 px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
        />

        <label className="block text-xs tracking-[0.25em] uppercase text-muted-bone mb-2">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="password-input"
          className="w-full mb-6 px-3 py-2.5 bg-[#0B0E0C] border border-rust text-bone focus:border-[#FBBF24] focus:outline-none"
        />

        {error && (
          <div className="text-sm text-red-400 mb-4 border border-red-900/50 bg-red-950/30 px-3 py-2" data-testid="login-error">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          data-testid="login-submit"
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#FBBF24] text-[#0B0E0C] font-semibold tracking-wide hover:bg-[#F59E0B] transition-colors disabled:opacity-60"
        >
          <LogIn className="w-4 h-4" />
          {submitting ? "Lighting the lantern…" : "Sign in"}
        </button>

        <p className="text-[11px] text-muted-bone text-center mt-6 leading-relaxed">
          Only the DMs hold the keys. Players need only read.
        </p>
      </form>
    </div>
  );
}
