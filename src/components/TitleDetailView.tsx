"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Play,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import { getMyUserId, supabase } from "@/lib/supabase";
import {
  czechPlural,
  formatDayCzech,
  TitleSummary,
  TMDBItem,
  Viewing,
} from "@/lib/models";
import {
  fetchTMDBDetail,
  getCachedTMDBDetail,
  posterURL,
  TMDBDetail,
} from "@/lib/tmdb";
import { Poster } from "./Poster";
import { AddViewingModal } from "./AddViewingModal";

const viewingsCache = new Map<string, Viewing[]>();

export function TitleDetailView({
  title,
  places,
  onBack,
  onChanged,
}: {
  title: TitleSummary;
  places: string[];
  onBack: () => void;
  onChanged: () => void;
}) {
  const cacheKey = `${title.media_type}-${title.tmdb_id}`;
  const [viewings, setViewings] = useState<Viewing[]>(
    () => viewingsCache.get(cacheKey) ?? []
  );
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<TMDBDetail | null>(() =>
    getCachedTMDBDetail(title.media_type, title.tmdb_id)
  );
  const [detailFailed, setDetailFailed] = useState(false);
  const [detailLoading, setDetailLoading] = useState(
    () => getCachedTMDBDetail(title.media_type, title.tmdb_id) === null
  );
  const [expandedOverview, setExpandedOverview] = useState(false);
  const castScrollRef = useRef<HTMLDivElement | null>(null);
  const [modalMode, setModalMode] = useState<{
    open: boolean;
    editing: Viewing | null;
  }>({ open: false, editing: null });
  const [toDelete, setToDelete] = useState<Viewing | null>(null);

  const loadViewings = useCallback(async () => {
    try {
      const uid = await getMyUserId();
      const { data, error: err } = await supabase
        .from("viewings")
        .select("*")
        .eq("user_id", uid)
        .eq("tmdb_id", title.tmdb_id)
        .eq("media_type", title.media_type)
        .order("watched_on", { ascending: false })
        .order("id", { ascending: false });
      if (err) throw err;
      const rows = (data as Viewing[]) ?? [];
      viewingsCache.set(`${title.media_type}-${title.tmdb_id}`, rows);
      setViewings(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba načítání zhlédnutí.");
    }
  }, [title.tmdb_id, title.media_type]);

  useEffect(() => {
    void loadViewings();
  }, [loadViewings]);

  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    setDetailFailed(false);
    fetchTMDBDetail(title.media_type, title.tmdb_id)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          setDetailFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setDetailFailed(true);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [title.media_type, title.tmdb_id]);

  const average = useMemo(() => {
    const ratings = viewings.map((v) => v.rating).filter((r): r is number => r != null);
    if (ratings.length === 0) return null;
    const sum = ratings.reduce((a, b) => a + b, 0);
    return Math.round((sum / ratings.length) * 10) / 10;
  }, [viewings]);

  const facts = useMemo(() => {
    if (!detail) {
      const kind = title.media_type === "tv" ? "Seriál" : "Film";
      return title.release_year ? `${kind} · ${title.release_year}` : kind;
    }
    const parts: string[] = [];
    const first = detail.firstYear ?? title.release_year;
    if (first) {
      parts.push(
        detail.lastYear && detail.lastYear !== first
          ? `${first}–${detail.lastYear}`
          : `${first}`
      );
    }
    if (detail.runtime) {
      const h = Math.floor(detail.runtime / 60);
      const m = detail.runtime % 60;
      parts.push(h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`);
    }
    if (detail.numberOfSeasons != null) {
      parts.push(
        `${detail.numberOfSeasons} ${czechPlural(
          detail.numberOfSeasons,
          "sezóna",
          "sezóny",
          "sezón"
        )}`
      );
    }
    if (detail.numberOfEpisodes != null) {
      parts.push(
        `${detail.numberOfEpisodes} ${czechPlural(
          detail.numberOfEpisodes,
          "epizoda",
          "epizody",
          "epizod"
        )}`
      );
    }
    if (detail.voteCount > 0) {
      parts.push(`TMDB ${detail.voteAverage.toFixed(1).replace(".", ",")}`);
    }
    return parts.join(" · ");
  }, [detail, title]);

  async function confirmDelete(v: Viewing) {
    setToDelete(null);
    setViewings((prev) => prev.filter((item) => item.id !== v.id));
    try {
      const { error: err } = await supabase.from("viewings").delete().eq("id", v.id);
      if (err) throw err;
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodařilo se smazat zhlédnutí.");
      await loadViewings();
    }
  }

  const prefillItem: TMDBItem = {
    tmdbId: title.tmdb_id,
    mediaType: title.media_type,
    title: title.title,
    posterPath: title.poster_path,
    releaseYear: title.release_year,
  };

  const backdropUrl = posterURL(detail?.backdropPath, "w1280");

  return (
    <div className="screen-container detail-screen">
      <div className="top-navbar">
        <button type="button" className="nav-back-btn" onClick={onBack}>
          <ChevronLeft size={22} />
          <span>Zpět do deníku</span>
        </button>
        <div className="nav-inline-title">{title.title}</div>
        <button
          type="button"
          className="primary-action-btn compact"
          onClick={() => setModalMode({ open: true, editing: null })}
        >
          <Plus size={17} />
          <span>Přidat zhlédnutí</span>
        </button>
      </div>

      <div className="detail-hero-card">
        <div
          className="detail-backdrop"
          style={
            backdropUrl
              ? { backgroundImage: `url(${backdropUrl})` }
              : undefined
          }
        >
          <div className="detail-backdrop-gradient" />
        </div>

        <div className="detail-hero-body">
          <div className="detail-hero-content">
            <div className="detail-poster-wrap">
              <Poster path={title.poster_path} size="w342" width={124} />
            </div>
            <div className="detail-title-block">
              <h1 className="detail-main-title">{title.title}</h1>
              {detail?.originalTitle && (
                <div className="secondary-text">{detail.originalTitle}</div>
              )}
              <div className="secondary-text detail-facts">{facts}</div>

              {detail && (detail.certification || detail.genres.length > 0) && (
                <div className="chips-row">
                  {detail.certification && (
                    <span className="chip-cert">{detail.certification}</span>
                  )}
                  {detail.genres.map((g) => (
                    <span key={g} className="chip-genre">
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {detail?.trailerURL && (
                <div className="trailer-row">
                  <a
                    href={detail.trailerURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="trailer-btn"
                  >
                    <Play size={16} fill="currentColor" />
                    <span>Přehrát trailer</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          {detailLoading && (
            <div className="detail-status secondary-text">Načítám podrobnosti z TMDB…</div>
          )}
          {detailFailed && (
            <div className="detail-status secondary-text">
              <AlertTriangle size={15} />
              <span>Podrobnosti z TMDB se nepodařilo načíst.</span>
            </div>
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

      <div className="detail-columns">
        {/* Left Column: Overview */}
        <div className="detail-col-main">
          {detail &&
            (detail.tagline ||
              detail.overview ||
              detail.directors.length > 0 ||
              detail.writers.length > 0 ||
              detail.creators.length > 0) && (
              <div className="ios-section">
                <div className="ios-section-header">Popis</div>
                <div className="ios-card">
                  {(detail.tagline || detail.overview) && (
                    <div className="ios-row column-start">
                      {detail.tagline && (
                        <div className="tagline-text">{detail.tagline}</div>
                      )}
                      {detail.overview && (
                        <div>
                          <p
                            className={
                              expandedOverview ? "overview-text" : "overview-text clamped"
                            }
                          >
                            {detail.overview}
                          </p>
                          {detail.overview.length > 280 && (
                            <button
                              type="button"
                              className="text-toggle-btn accent-text"
                              onClick={() => setExpandedOverview((e) => !e)}
                            >
                              {expandedOverview ? "Méně" : "Více"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {detail.directors.length > 0 && (
                    <div className="ios-row space-between">
                      <span>Režie</span>
                      <span className="secondary-text right-align">
                        {detail.directors.join(", ")}
                      </span>
                    </div>
                  )}
                  {detail.writers.length > 0 && (
                    <div className="ios-row space-between">
                      <span>Scénář</span>
                      <span className="secondary-text right-align">
                        {detail.writers.join(", ")}
                      </span>
                    </div>
                  )}
                  {detail.creators.length > 0 && (
                    <div className="ios-row space-between">
                      <span>Tvůrci</span>
                      <span className="secondary-text right-align">
                        {detail.creators.join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

          {detail && detail.seasons.length > 0 && (
            <div className="ios-section">
              <div className="ios-section-header">Sezóny</div>
              <div className="ios-card">
                {detail.seasons.map((s) => {
                  const infoParts: string[] = [];
                  if (s.episodeCount != null) {
                    infoParts.push(
                      `${s.episodeCount} ${czechPlural(
                        s.episodeCount,
                        "epizoda",
                        "epizody",
                        "epizod"
                      )}`
                    );
                  }
                  if (s.year) infoParts.push(String(s.year));
                  return (
                    <div key={s.id} className="ios-row media-row">
                      <Poster path={s.posterPath} size="w92" width={42} />
                      <div className="media-info">
                        <div className="media-title">{s.name}</div>
                        <div className="media-sub">{infoParts.join(" · ")}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Statistics & Viewings History */}
        <div className="detail-col-side">
          {viewings.length > 0 && (
            <>
              <div className="ios-section">
                <div className="ios-section-header">Statistiky</div>
                <div className="ios-card">
                  <div className="ios-row space-between">
                    <span>Počet zhlédnutí</span>
                    <span className="bold">{viewings.length}×</span>
                  </div>
                  <div className="ios-row space-between">
                    <span>První</span>
                    <span className="secondary-text">
                      {formatDayCzech(viewings[viewings.length - 1].watched_on)}
                    </span>
                  </div>
                  <div className="ios-row space-between">
                    <span>Poslední</span>
                    <span className="secondary-text">
                      {formatDayCzech(viewings[0].watched_on)}
                    </span>
                  </div>
                  {average != null && (
                    <div className="ios-row space-between">
                      <span>Průměrné hodnocení</span>
                      <span className="bold accent-text">
                        ★ {average.toString().replace(".", ",")} / 10
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="ios-section">
                <div className="ios-section-header">Moje zhlédnutí</div>
                <div className="ios-card">
                  {viewings.map((v) => (
                    <div key={v.id} className="ios-row viewing-item-row">
                      <button
                        type="button"
                        className="viewing-main-btn"
                        onClick={() => setModalMode({ open: true, editing: v })}
                      >
                        <div className="viewing-top-line">
                          <span className="viewing-date">
                            {formatDayCzech(v.watched_on)}
                          </span>
                          {v.season != null && (
                            <span className="secondary-text">
                              {v.season === 0 ? "Speciály" : `Sezóna ${v.season}`}
                            </span>
                          )}
                          <span className="flex-spacer" />
                          {v.rating != null && (
                            <span className="viewing-rating">★ {v.rating}/10</span>
                          )}
                        </div>
                        {v.place && <div className="secondary-text">{v.place}</div>}
                        {v.note && <div className="viewing-note">{v.note}</div>}
                      </button>
                      <button
                        type="button"
                        className="icon-danger-btn"
                        title="Smazat zhlédnutí"
                        onClick={() => setToDelete(v)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Full-width Jellyfin-style Cast & Crew Carousel */}
      {detail && detail.cast.length > 0 && (
        <div className="jellyfin-cast-section">
          <div className="jellyfin-cast-header">
            <h2 className="jellyfin-section-title">Herci a obsazení</h2>
            <div className="jellyfin-carousel-arrows">
              <button
                type="button"
                className="carousel-arrow-btn"
                aria-label="Posunout doleva"
                onClick={() =>
                  castScrollRef.current?.scrollBy({ left: -560, behavior: "smooth" })
                }
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                className="carousel-arrow-btn"
                aria-label="Posunout doprava"
                onClick={() =>
                  castScrollRef.current?.scrollBy({ left: 560, behavior: "smooth" })
                }
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <div className="jellyfin-cast-track" ref={castScrollRef}>
            {detail.cast.map((member) => {
              const avatarUrl = posterURL(member.profilePath, "w342");
              return (
                <div key={member.id} className="jellyfin-cast-card">
                  <div className="jellyfin-cast-photo-wrap">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt={member.name}
                        className="jellyfin-cast-photo"
                        loading="lazy"
                      />
                    ) : (
                      <div className="jellyfin-cast-photo placeholder">
                        <User size={38} />
                      </div>
                    )}
                  </div>
                  <div className="jellyfin-cast-name">{member.name}</div>
                  {member.character && (
                    <div className="jellyfin-cast-role">{member.character}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modalMode.open && (
        <AddViewingModal
          places={places}
          prefill={prefillItem}
          editing={modalMode.editing}
          onClose={() => setModalMode({ open: false, editing: null })}
          onSaved={() => {
            void loadViewings();
            onChanged();
          }}
        />
      )}

      {toDelete && (
        <div className="modal-backdrop" onClick={() => setToDelete(null)}>
          <div className="ios-alert" onClick={(e) => e.stopPropagation()}>
            <h3>Smazat zhlédnutí?</h3>
            <p>{formatDayCzech(toDelete.watched_on)}</p>
            <div className="ios-alert-actions">
              <button
                type="button"
                className="ios-alert-btn"
                onClick={() => setToDelete(null)}
              >
                Zrušit
              </button>
              <button
                type="button"
                className="ios-alert-btn destructive bold"
                onClick={() => void confirmDelete(toDelete)}
              >
                Smazat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
