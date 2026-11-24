"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Bookmark, Calendar, Film, Settings, Sparkles, UserCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_PLACES, Profile, roleLabel } from "@/lib/account";
import { ACCENTS, AccentOption, formatDayCzech, ThemeOption } from "@/lib/models";
import { APP_VERSION, IS_BETA, RELEASES } from "@/lib/changelog";
import { AuthView } from "@/components/AuthView";
import { TitlesView } from "@/components/TitlesView";
import { WatchlistView } from "@/components/WatchlistView";
import { TimelineView } from "@/components/TimelineView";
import { SettingsView } from "@/components/SettingsView";

type TabId = "diary" | "watchlist" | "calendar" | "settings";

export default function HomePage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("diary");

  const [theme, setTheme] = useState<ThemeOption>("system");
  const [accent, setAccent] = useState<AccentOption>("blue");
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  useEffect(() => {
    const storedTheme = localStorage.getItem("theme") as ThemeOption | null;
    if (storedTheme === "system" || storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
    }
    const storedAccent = localStorage.getItem("accent") as AccentOption | null;
    if (storedAccent && ACCENTS.some((a) => a.id === storedAccent)) {
      setAccent(storedAccent);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const found = ACCENTS.find((a) => a.id === accent) ?? ACCENTS[0];
    document.documentElement.style.setProperty("--accent", found.hex);
    localStorage.setItem("accent", accent);
  }, [accent]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSignedIn(session != null);
      setUserId(session?.user?.id ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(session != null);
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setProfileError(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, username, role, places")
        .eq("user_id", userId)
        .single();
      if (error) throw error;
      setProfile(data as Profile);
      setProfileError(null);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Chyba při načítání profilu.");
    }
  }, [userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!signedIn) return;
    const lastSeen = localStorage.getItem("lastSeenVersion");
    if (lastSeen !== APP_VERSION) {
      setShowWhatsNew(true);
      localStorage.setItem("lastSeenVersion", APP_VERSION);
    }
  }, [signedIn]);

  async function savePlaces(places: string[] | null) {
    if (!userId) throw new Error("Nejsi přihlášen.");
    const { data, error } = await supabase
      .from("profiles")
      .update({ places })
      .eq("user_id", userId)
      .select("user_id, username, role, places")
      .single();
    if (error) throw error;
    setProfile(data as Profile);
  }

  if (signedIn === null) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  if (!signedIn) {
    return <AuthView />;
  }

  const places = profile?.places ?? DEFAULT_PLACES;
  const currentRelease = RELEASES.find((r) => r.version === APP_VERSION);

  const navItems: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "diary", label: "Deník", icon: <Film size={20} /> },
    { id: "watchlist", label: "Chci vidět", icon: <Bookmark size={20} /> },
    { id: "calendar", label: "Kalendář", icon: <Calendar size={20} /> },
    { id: "settings", label: "Nastavení", icon: <Settings size={20} /> },
  ];

  return (
    <div className="app-layout">
      {/* Cinematic Ambient Background Layer */}
      <div className="cinema-ambient-bg" aria-hidden="true">
        <div className="cinema-orb orb-1" />
        <div className="cinema-orb orb-2" />
        <div className="cinema-orb orb-3" />
        <div className="cinema-grid-overlay" />
      </div>

      {/* Desktop Left Sidebar */}
      <aside className="desktop-sidebar">
        <div className="sidebar-brand" onClick={() => setTab("diary")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="Filmoteka" className="sidebar-logo" />
          <div>
            <div className="sidebar-title">Filmoteka</div>
            <div className="sidebar-version">
              v{APP_VERSION} {IS_BETA && <span className="beta-badge-sm">BETA</span>}
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`sidebar-nav-item ${tab === item.id ? "active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {profile && (
          <button
            type="button"
            className="sidebar-user-card"
            onClick={() => setTab("settings")}
          >
            <div className="sidebar-user-avatar">
              {profile.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-username">{profile.username}</div>
              <div className="sidebar-role">
                <UserCheck size={12} />
                <span>{roleLabel(profile.role)}</span>
              </div>
            </div>
          </button>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="app-shell">
        <main className="app-main">
          {tab === "diary" && <TitlesView places={places} />}
          {tab === "watchlist" && <WatchlistView places={places} />}
          {tab === "calendar" && <TimelineView places={places} />}
          {tab === "settings" && (
            <SettingsView
              profile={profile}
              profileError={profileError}
              onReloadProfile={loadProfile}
              onSavePlaces={savePlaces}
              theme={theme}
              onChangeTheme={setTheme}
              accent={accent}
              onChangeAccent={setAccent}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="tab-bar">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tab-item ${tab === item.id ? "active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {showWhatsNew && currentRelease && (
        <div className="modal-backdrop" onClick={() => setShowWhatsNew(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-navbar">
              <span className="nav-btn-placeholder" />
              <div className="nav-title">Co je nového</div>
              <button
                type="button"
                className="nav-btn bold"
                onClick={() => setShowWhatsNew(false)}
              >
                Hotovo
              </button>
            </div>
            <div className="modal-body">
              <div className="ios-section">
                <div className="ios-section-header space-between">
                  <span>Verze {currentRelease.version}</span>
                  {currentRelease.date && (
                    <span>{formatDayCzech(currentRelease.date)}</span>
                  )}
                </div>
                <div className="ios-card">
                  {currentRelease.items.map((item, idx) => (
                    <div key={idx} className="ios-row changelog-item-row">
                      <Sparkles size={15} className="accent-text shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
