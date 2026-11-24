"use client";

import React, { useState } from "react";
import { HelpCircle, Lock, LogIn, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authErrorMessage, internalEmail, normalizeUsername } from "@/lib/account";

export function AuthView() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotten, setForgotten] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !busy;

  // Accounts are created only by an admin (Settings → Uživatelé); there is no public sign-up.
  async function submit() {
    setError(null);
    const name = normalizeUsername(username);
    if (!name) {
      setError("Špatné jméno nebo heslo");
      return;
    }
    setBusy(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: internalEmail(name),
        password,
      });
      if (signInErr) throw signInErr;
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page-wrapper">
      <div className="cinema-ambient-bg" aria-hidden="true">
        <div className="cinema-orb orb-1" />
        <div className="cinema-orb orb-2" />
        <div className="cinema-orb orb-3" />
        <div className="cinema-grid-overlay" />
      </div>
      <div className="auth-card">
        <div className="auth-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="Filmotéka" className="auth-logo" />
          <h1 className="auth-title">Filmotéka</h1>
          <p className="secondary-text">Tvůj osobní deník filmů a seriálů</p>
        </div>

        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) void submit();
          }}
        >
          <div className="auth-field">
            <label className="auth-label">Uživatelské jméno</label>
            <div className="auth-input-wrap">
              <User size={18} className="auth-field-icon" />
              <input
                type="text"
                placeholder="např. tpolanek"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label">Heslo</label>
            <div className="auth-input-wrap">
              <Lock size={18} className="auth-field-icon" />
              <input
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && <div className="auth-message error">{error}</div>}

          <div className="auth-buttons">
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-primary"
            >
              <LogIn size={18} />
              <span>{busy ? "Přihlašování…" : "Přihlásit se"}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setForgotten(true)}
            className="auth-forgot-link"
          >
            <HelpCircle size={15} />
            <span>Zapomenuté heslo?</span>
          </button>
        </form>
      </div>

      {forgotten && (
        <div className="modal-backdrop" onClick={() => setForgotten(false)}>
          <div className="ios-alert" onClick={(e) => e.stopPropagation()}>
            <h3>Zapomenuté heslo</h3>
            <p>
              Účty nemají e-mail, takže heslo nejde poslat. Požádej správce, ať ti v{" "}
              <strong>Nastavení → Uživatelé</strong> nastaví nové. Pak se přihlásíš a můžeš si ho v
              Nastavení změnit.
            </p>
            <div className="ios-alert-actions">
              <button
                type="button"
                className="ios-alert-btn bold"
                onClick={() => setForgotten(false)}
              >
                Rozumím
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
