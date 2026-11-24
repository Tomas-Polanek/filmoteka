"use client";

import React, { useState } from "react";
import { HelpCircle, Lock, LogIn, User, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  authErrorMessage,
  internalEmail,
  isValidPassword,
  normalizeUsername,
  PASSWORD_HINT,
  USERNAME_HINT,
} from "@/lib/account";

export function AuthView() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [forgotten, setForgotten] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !busy;

  async function submit(signUp: boolean) {
    setError(null);
    setInfo(null);
    const name = normalizeUsername(username);
    if (!name) {
      setError(signUp ? USERNAME_HINT : "Špatné jméno nebo heslo");
      return;
    }
    if (signUp && !isValidPassword(password)) {
      setError(PASSWORD_HINT);
      return;
    }
    setBusy(true);
    try {
      if (signUp) {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: internalEmail(name),
          password,
          options: {
            data: { username: name },
          },
        });
        if (signUpErr) throw signUpErr;
        if (data.user && !data.session) {
          setInfo("Účet je založený, ale čeká na potvrzení. Požádej správce.");
        }
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: internalEmail(name),
          password,
        });
        if (signInErr) throw signInErr;
      }
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
          <img src="/icon.svg" alt="Filmoteka" className="auth-logo" />
          <h1 className="auth-title">Filmoteka</h1>
          <p className="secondary-text">Rodinná časová kapsle filmů a seriálů</p>
        </div>

        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) void submit(false);
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
          {info && <div className="auth-message info">{info}</div>}

          <div className="auth-buttons">
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-primary"
            >
              <LogIn size={18} />
              <span>{busy ? "Přihlašování…" : "Přihlásit se"}</span>
            </button>

            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void submit(true)}
              className="btn-secondary"
            >
              <UserPlus size={18} />
              <span>Vytvořit nový účet</span>
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
