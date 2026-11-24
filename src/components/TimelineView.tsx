"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { getMyUserId, supabase } from "@/lib/supabase";
import {
  formatDayCzech,
  formatMonthCzech,
  formatMonthFromIso,
  TimelineViewing,
  TitleSummary,
  todayIsoString,
} from "@/lib/models";
import { Poster } from "./Poster";
import { TitleDetailView } from "./TitleDetailView";

type Mode = "calendar" | "timeline";
const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

let cachedTimeline: TimelineViewing[] | null = null;

export function TimelineView({ places }: { places: string[] }) {
  const [viewings, setViewings] = useState<TimelineViewing[]>(() => cachedTimeline ?? []);
  const [loaded, setLoaded] = useState(() => cachedTimeline !== null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("calendar");

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<string | null>(todayIsoString());
  const [selectedTitle, setSelectedTitle] = useState<TitleSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const uid = await getMyUserId();
      const { data, error: err } = await supabase
        .from("viewings")
        .select("id,tmdb_id,media_type,title,poster_path,release_year,watched_on,rating")
        .eq("user_id", uid)
        .order("watched_on", { ascending: false })
        .order("id", { ascending: false });
      if (err) throw err;
      const list = (data as TimelineViewing[]) ?? [];
      cachedTimeline = list;
      setViewings(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba při načítání kalendáře.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map: Record<string, TimelineViewing[]> = {};
    for (const v of viewings) {
      if (!map[v.watched_on]) map[v.watched_on] = [];
      map[v.watched_on].push(v);
    }
    return map;
  }, [viewings]);

  const byMonth = useMemo(() => {
    const groups: { key: string; label: string; viewings: TimelineViewing[] }[] = [];
    for (const v of viewings) {
      const key = v.watched_on.slice(0, 7);
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.viewings.push(v);
      } else {
        groups.push({
          key,
          label: formatMonthFromIso(v.watched_on),
          viewings: [v],
        });
      }
    }
    return groups;
  }, [viewings]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setSelectedDay(null);
  }

  function goToday() {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth() + 1);
    setSelectedDay(todayIsoString());
  }

  function summaryFor(viewing: TimelineViewing): TitleSummary {
    const same = viewings.filter(
      (v) => v.tmdb_id === viewing.tmdb_id && v.media_type === viewing.media_type
    );
    const latest = same[0] ?? viewing;
    const ratings = same.map((v) => v.rating).filter((r): r is number => r != null);
    const avg =
      ratings.length === 0
        ? null
        : Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
    return {
      media_type: viewing.media_type,
      tmdb_id: viewing.tmdb_id,
      title: latest.title,
      poster_path: latest.poster_path,
      release_year: latest.release_year,
      view_count: same.length,
      last_watched: latest.watched_on,
      avg_rating: avg,
    };
  }

  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDow = new Date(year, month - 1, 1).getDay();
    const leading = (firstDow + 6) % 7;
    const cells: (string | null)[] = Array(leading).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push(iso);
    }
    return cells;
  }, [year, month]);

  if (selectedTitle) {
    return (
      <TitleDetailView
        title={selectedTitle}
        places={places}
        onBack={() => {
          setSelectedTitle(null);
          void load();
        }}
        onChanged={() => void load()}
      />
    );
  }

  const todayIso = todayIsoString();

  return (
    <div className="screen-container">
      <div className="top-header-row">
        <h1 className="large-title">Kalendář</h1>
        <div className="toolbar-actions">
          <div className="segmented-control compact-segments">
            <button
              type="button"
              className={`segment-btn ${mode === "calendar" ? "active" : ""}`}
              onClick={() => setMode("calendar")}
            >
              Kalendář
            </button>
            <button
              type="button"
              className={`segment-btn ${mode === "timeline" ? "active" : ""}`}
              onClick={() => setMode("timeline")}
            >
              Časová osa
            </button>
          </div>
          {mode === "calendar" && (
            <button
              type="button"
              className="secondary-pill-btn"
              onClick={goToday}
            >
              Dnes
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="ios-section">
          <div className="ios-card">
            <div className="ios-row error-text">{error}</div>
          </div>
        </div>
      )}

      {mode === "calendar" ? (
        <div className="calendar-split-layout">
          <div className="calendar-main-col">
            <div className="calendar-month-header">
              <button
                type="button"
                className="icon-nav-btn accent-text"
                onClick={() => shiftMonth(-1)}
                aria-label="Předchozí měsíc"
              >
                <ChevronLeft size={22} />
              </button>
              <span className="calendar-month-title">
                {formatMonthCzech(year, month)}
              </span>
              <button
                type="button"
                className="icon-nav-btn accent-text"
                onClick={() => shiftMonth(1)}
                aria-label="Další měsíc"
              >
                <ChevronRight size={22} />
              </button>
            </div>

            <div className="ios-card calendar-card">
              <div className="calendar-grid">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="calendar-weekday">
                    {w}
                  </div>
                ))}
                {calendarDays.map((iso, idx) => {
                  if (!iso) {
                    return <div key={`empty-${idx}`} className="calendar-cell empty" />;
                  }
                  const dayNum = parseInt(iso.slice(8, 10), 10);
                  const dayViewings = byDay[iso] ?? [];
                  const isToday = iso === todayIso;
                  const isSelected = selectedDay === iso;
                  const first = dayViewings[0];

                  return (
                    <button
                      key={iso}
                      type="button"
                      className={`calendar-cell ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedDay(iso)}
                    >
                      <span className={`calendar-day-num ${isToday ? "today" : ""}`}>
                        {dayNum}
                      </span>
                      {first && (
                        <div className="calendar-poster-wrap">
                          <Poster path={first.poster_path} size="w92" width={36} />
                          {dayViewings.length > 1 && (
                            <span className="calendar-count-badge">
                              {dayViewings.length}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="calendar-side-col">
            {selectedDay ? (
              <div className="ios-section">
                <div className="ios-section-header">{formatDayCzech(selectedDay)}</div>
                <div className="ios-card">
                  {(byDay[selectedDay] ?? []).length === 0 ? (
                    <div className="ios-row secondary-text">Žádné zhlédnutí</div>
                  ) : (
                    (byDay[selectedDay] ?? []).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className="ios-row ios-button-row media-row"
                        onClick={() => setSelectedTitle(summaryFor(v))}
                      >
                        <Poster path={v.poster_path} size="w154" width={48} />
                        <div className="media-info">
                          <div className="media-title">
                            {v.release_year ? `${v.title} (${v.release_year})` : v.title}
                          </div>
                          <div className="media-sub">{formatDayCzech(v.watched_on)}</div>
                          {v.rating != null && (
                            <div className="media-rating">★ {v.rating}/10</div>
                          )}
                        </div>
                        <ChevronRight size={18} className="chevron-icon" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="ios-card">
                <div className="ios-row secondary-text">
                  Vyber den v kalendáři pro zobrazení zhlédnutých titulů.
                </div>
              </div>
            )}
          </div>
        </div>
      ) : loaded && viewings.length === 0 ? (
        <div className="empty-state">
          <CalendarIcon size={48} className="secondary-text" />
          <h3>Zatím nic</h3>
          <p className="secondary-text">Zhlédnutí se tu objeví podle data.</p>
        </div>
      ) : (
        byMonth.map((group) => (
          <div key={group.key} className="ios-section">
            <div className="ios-section-header">
              {group.label} · {group.viewings.length}×
            </div>
            <div className="ios-card">
              {group.viewings.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="ios-row ios-button-row media-row"
                  onClick={() => setSelectedTitle(summaryFor(v))}
                >
                  <Poster path={v.poster_path} size="w154" width={48} />
                  <div className="media-info">
                    <div className="media-title">
                      {v.release_year ? `${v.title} (${v.release_year})` : v.title}
                    </div>
                    <div className="media-sub">{formatDayCzech(v.watched_on)}</div>
                    {v.rating != null && (
                      <div className="media-rating">★ {v.rating}/10</div>
                    )}
                  </div>
                  <ChevronRight size={18} className="chevron-icon" />
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
