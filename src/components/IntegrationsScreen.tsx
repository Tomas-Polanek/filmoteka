"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, Copy } from "lucide-react";
import { formatDayCzech } from "@/lib/models";
import {
  connectIntegration,
  disconnectIntegration,
  Integration,
  listIntegrations,
} from "@/lib/integrations";

const SETUP_DOC = "https://github.com/Tomas-Polanek/filmoteka/blob/main/integrations/README.md";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const day = formatDayCzech(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  );
  return `${day} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function IntegrationsScreen({ onBack }: { onBack: () => void }) {
  const [jellyfin, setJellyfin] = useState<Integration | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await listIntegrations();
      setJellyfin(list.find((i) => i.provider === "jellyfin") ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodařilo se načíst propojení.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function connect() {
    setBusy(true);
    try {
      setToken(await connectIntegration("jellyfin"));
      setCopied(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Propojení se nepodařilo vytvořit.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setConfirmDisconnect(false);
    setBusy(true);
    try {
      await disconnectIntegration("jellyfin");
      setToken(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Propojení se nepodařilo zrušit.");
    } finally {
      setBusy(false);
    }
  }

  async function copyToken() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
  }

  return (
    <div className="screen-container">
      <div className="top-navbar">
        <button type="button" className="nav-back-btn" onClick={onBack}>
          <ChevronLeft size={22} />
          <span>Nastavení</span>
        </button>
        <div className="nav-inline-title">Propojení</div>
        <span className="nav-btn-placeholder" />
      </div>

      <div className="ios-section">
        <div className="ios-section-header">Jellyfin</div>
        <div className="ios-card">
          {!loaded ? (
            <div className="ios-row secondary-text">Načítám…</div>
          ) : jellyfin ? (
            <>
              <div className="ios-row space-between">
                <span>Stav</span>
                <span className="success-text">Propojeno</span>
              </div>
              <div className="ios-row space-between">
                <span>Poslední synchronizace</span>
                <span className="secondary-text">
                  {jellyfin.last_sync_at ? formatDateTime(jellyfin.last_sync_at) : "zatím žádná"}
                </span>
              </div>
              <button
                type="button"
                className="ios-row ios-button-row accent-text"
                disabled={busy}
                onClick={() => void connect()}
              >
                Vytvořit nový klíč
              </button>
              <button
                type="button"
                className="ios-row ios-button-row destructive-text"
                disabled={busy}
                onClick={() => setConfirmDisconnect(true)}
              >
                Zrušit propojení
              </button>
            </>
          ) : (
            <button
              type="button"
              className="ios-row ios-button-row accent-text"
              disabled={busy}
              onClick={() => void connect()}
            >
              Propojit Jellyfin
            </button>
          )}
        </div>
        <div className="ios-section-footer secondary-text">
          Dokoukané filmy a epizody z Jellyfinu se samy zapíšou do deníku s místem „Jellyfin“. Seriál se zapíše
          jednou za den a sezónu. Hodnocení a poznámku doplníš sám.
        </div>
      </div>

      {token && (
        <div className="ios-section">
          <div className="ios-section-header">Klíč pro Jellyfin</div>
          <div className="ios-card">
            <div className="ios-row column-start">
              <code className="integration-token">{token}</code>
            </div>
            <button
              type="button"
              className="ios-row ios-button-row space-between accent-text"
              onClick={() => void copyToken()}
            >
              <span>{copied ? "Zkopírováno" : "Zkopírovat klíč"}</span>
              {copied ? <Check size={17} /> : <Copy size={17} />}
            </button>
          </div>
          <div className="ios-section-footer secondary-text">
            Klíč se ukáže jen teď. Vlož ho do nastavení synchronizace na serveru s Jellyfinem podle{" "}
            <a href={SETUP_DOC} target="_blank" rel="noopener noreferrer" className="accent-text">
              návodu
            </a>
            . Kdo klíč zná, může ti do deníku přidávat zhlédnutí, tak ho nikomu neposílej.
          </div>
        </div>
      )}

      {error && <div className="ios-section-footer error-text">{error}</div>}

      {confirmDisconnect && (
        <div className="modal-backdrop" onClick={() => setConfirmDisconnect(false)}>
          <div className="ios-alert" onClick={(e) => e.stopPropagation()}>
            <h3>Zrušit propojení s Jellyfinem?</h3>
            <p>Nová zhlédnutí se přestanou zapisovat. Už zapsaná zhlédnutí v deníku zůstanou.</p>
            <div className="ios-alert-actions">
              <button type="button" className="ios-alert-btn" onClick={() => setConfirmDisconnect(false)}>
                Ponechat
              </button>
              <button
                type="button"
                className="ios-alert-btn destructive bold"
                onClick={() => void disconnect()}
              >
                Zrušit propojení
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
