"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  ChevronRight,
  Film,
  LayoutGrid,
  List,
  Plus,
  Search,
  X,
} from "lucide-react";
import { getMyUserId, supabase } from "@/lib/supabase";
import { formatDayCzech, TitleSummary } from "@/lib/models";
import {
  fetchTMDBDetail,
  getCachedTMDBDetail,
  posterURL,
  prefetchTMDBDetail,
} from "@/lib/tmdb";
import { fillMissingPosters } from "@/lib/integrations";
import { Poster } from "./Poster";
import { Select } from "./Select";
import { AddViewingModal } from "./AddViewingModal";
import { TitleDetailView } from "./TitleDetailView";

type FilterType = "all" | "movie" | "tv";
type SortType = "lastWatched" | "rating" | "title" | "viewCount" | "releaseYear";
type ViewMode = "grid" | "list";

let cachedTitles: TitleSummary[] | null = null;

const SORT_LABELS: { id: SortType; label: string }[] = [
  { id: "lastWatched", label: "Naposledy viděno" },
  { id: "rating", label: "Hodnocení" },
  { id: "title", label: "Název" },
  { id: "viewCount", label: "Počet zhlédnutí" },
  { id: "releaseYear", label: "Rok vydání" },
];

export function TitlesView({ places }: { places: string[] }) {
  const [titles, setTitles] = useState<TitleSummary[]>(() => cachedTitles ?? []);
  const [loaded, setLoaded] = useState(() => cachedTitles !== null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortType>("lastWatched");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [adding, setAdding] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<TitleSummary | null>(null);
  // The list and the detail share the window scroll: the detail starts at the top,
  // and going back returns to where the list was.
  const listScrollY = useRef(0);
  useEffect(() => {
    window.scrollTo(0, selectedTitle ? 0 : listScrollY.current);
  }, [selectedTitle]);
  const openTitle = (t: TitleSummary) => {
    listScrollY.current = window.scrollY;
    setSelectedTitle(t);
  };
  const [creditsIndex, setCreditsIndex] = useState<Record<string, string>>({});

  // Na pozadí zaindexuje herce, postavy a režiséry zhlédnutých titulů pro okamžité vyhledávání v Deníku
  useEffect(() => {
    if (titles.length === 0) return;
    let cancelled = false;
    const STORAGE_KEY = "filmoteka_creditsIndex_v1";
    let currentMap: Record<string, string> = {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) currentMap = JSON.parse(raw);
    } catch {
      // ignore
    }
    setCreditsIndex({ ...currentMap });

    async function indexMissing() {
      let changed = false;
      for (const t of titles) {
        if (cancelled) break;
        const key = `${t.media_type}-${t.tmdb_id}`;
        if (currentMap[key]) continue;
        try {
          const d =
            getCachedTMDBDetail(t.media_type, t.tmdb_id) ??
            (await fetchTMDBDetail(t.media_type, t.tmdb_id));
          const names = [
            ...d.cast.map((c) => `${c.name} ${c.character ?? ""}`),
            ...d.directors,
            ...d.writers,
            ...d.creators,
            d.originalTitle ?? "",
          ]
            .join(" ")
            .toLowerCase();
          currentMap = { ...currentMap, [key]: names };
          changed = true;
          if (!cancelled) setCreditsIndex({ ...currentMap });
        } catch {
          // ignore single title failure
        }
      }
      if (changed) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(currentMap));
        } catch {
          // ignore
        }
      }
    }

    void indexMissing();
    return () => {
      cancelled = true;
    };
  }, [titles]);

  useEffect(() => {
    const savedSort = localStorage.getItem("filmoteka_titlesSort") as SortType | null;
    if (savedSort && SORT_LABELS.some((s) => s.id === savedSort)) {
      setSort(savedSort);
    }
    const savedMode = localStorage.getItem("filmoteka_viewMode") as ViewMode | null;
    if (savedMode === "grid" || savedMode === "list") {
      setViewMode(savedMode);
    }
  }, []);

  function changeSort(next: SortType) {
    setSort(next);
    localStorage.setItem("filmoteka_titlesSort", next);
  }

  function changeViewMode(next: ViewMode) {
    setViewMode(next);
    localStorage.setItem("filmoteka_viewMode", next);
  }

  const load = useCallback(async () => {
    try {
      const uid = await getMyUserId();
      const { data, error: err } = await supabase
        .from("titles")
        .select("*")
        .eq("user_id", uid)
        .order("last_watched", { ascending: false });
      if (err) throw err;
      const list = (data as TitleSummary[]) ?? [];
      cachedTitles = list;
      setTitles(list);
      setError(null);
      if (list.some((t) => !t.poster_path)) {
        void fillMissingPosters(list).then((changed) => {
          if (changed > 0) void load();
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba při načítání deníku.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const movies = titles.filter((t) => t.media_type === "movie").length;
    const series = titles.filter((t) => t.media_type === "tv").length;
    const totalViews = titles.reduce((sum, t) => sum + Number(t.view_count || 0), 0);
    return { movies, series, totalViews };
  }, [titles]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return titles
      .filter((t) => {
        if (filter === "movie") return t.media_type === "movie";
        if (filter === "tv") return t.media_type === "tv";
        return true;
      })
      .filter((t) => {
        if (!q) return true;
        if (t.title.toLowerCase().includes(q)) return true;
        const key = `${t.media_type}-${t.tmdb_id}`;
        return (creditsIndex[key] ?? "").includes(q);
      })
      .sort((a, b) => {
        const desc = (x: number | null, y: number | null): number | null => {
          if (x != null && y != null) return x === y ? null : y - x;
          if (x != null) return -1;
          if (y != null) return 1;
          return null;
        };

        let cmp: number | null = null;
        if (sort === "rating") cmp = desc(a.avg_rating, b.avg_rating);
        else if (sort === "viewCount") cmp = desc(a.view_count, b.view_count);
        else if (sort === "releaseYear") cmp = desc(a.release_year, b.release_year);
        else if (sort === "title") {
          const c = a.title.localeCompare(b.title, "cs");
          cmp = c === 0 ? null : c;
        }

        if (cmp !== null) return cmp;
        if (a.last_watched !== b.last_watched) {
          return a.last_watched > b.last_watched ? -1 : 1;
        }
        return a.title.localeCompare(b.title, "cs");
      });
  }, [titles, filter, search, sort]);

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

  return (
    <div className="screen-container">
      <div className="top-header-row">
        <div>
          <h1 className="large-title">Deník</h1>
          {titles.length > 0 && (
            <div className="header-subtitle">
              {stats.movies} filmů · {stats.series} seriálů · {stats.totalViews} zhlédnutí
            </div>
          )}
        </div>
        <div className="toolbar-actions">
          <div className="view-toggle" role="group" aria-label="Zobrazení">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => changeViewMode("grid")}
              title="Mřížka plakátů"
            >
              <LayoutGrid size={17} />
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === "list" ? "active" : ""}`}
              onClick={() => changeViewMode("list")}
              title="Seznam"
            >
              <List size={17} />
            </button>
          </div>

          <div className="sort-select-wrap" title="Řadit podle">
            <ArrowUpDown size={15} className="accent-text" />
            <Select<SortType>
              className="toolbar-select"
              value={sort}
              options={SORT_LABELS.map((s) => ({ value: s.id, label: s.label }))}
              onChange={changeSort}
              ariaLabel="Řadit podle"
            />
          </div>

          <button
            type="button"
            className="primary-action-btn"
            onClick={() => setAdding(true)}
          >
            <Plus size={19} />
            <span className="hide-on-mobile">Přidat zhlédnutí</span>
          </button>
        </div>
      </div>

      <div className="controls-bar">
        <div className="search-bar">
          <Search size={17} className="search-icon" />
          <input
            type="text"
            placeholder="Hledat podle názvu, herce nebo režiséra…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="clear-btn"
              onClick={() => setSearch("")}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="segmented-control compact-segments">
          {(
            [
              { id: "all", label: "Vše" },
              { id: "movie", label: "Filmy" },
              { id: "tv", label: "Seriály" },
            ] as { id: FilterType; label: string }[]
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              className={`segment-btn ${filter === f.id ? "active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="ios-section">
          <div className="ios-card">
            <div className="ios-row error-text">{error}</div>
          </div>
        </div>
      )}

      {loaded && shown.length === 0 ? (
        <div className="empty-state">
          <Film size={48} className="secondary-text" />
          <h3>{titles.length === 0 ? "Zatím nic" : "Nic nenalezeno"}</h3>
          {titles.length === 0 && (
            <p className="secondary-text">Přidej první zhlédnutí tlačítkem +.</p>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div className="poster-grid">
          {shown.map((t) => {
            const imgUrl = posterURL(t.poster_path, "w342");
            return (
              <button
                key={`${t.media_type}-${t.tmdb_id}`}
                type="button"
                className="poster-card"
                onMouseEnter={() => prefetchTMDBDetail(t.media_type, t.tmdb_id)}
                onClick={() => openTitle(t)}
              >
                <div className="poster-card-artwork">
                  {imgUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imgUrl} alt={t.title} loading="lazy" />
                  ) : (
                    <div className="poster-card-fallback">
                      <Film size={36} />
                    </div>
                  )}
                  <div className="poster-badges-top">
                    {t.view_count > 1 && (
                      <span className="poster-badge count">×{t.view_count}</span>
                    )}
                    {t.avg_rating != null && (
                      <span className="poster-badge rating">
                        ★ {Number(t.avg_rating).toString().replace(".", ",")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="poster-card-meta">
                  <div className="poster-card-title">{t.title}</div>
                  <div className="poster-card-sub">
                    {t.release_year ? `${t.release_year} · ` : ""}
                    {formatDayCzech(t.last_watched)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="ios-section">
          <div className="ios-card">
            {shown.map((t) => (
              <button
                key={`${t.media_type}-${t.tmdb_id}`}
                type="button"
                className="ios-row ios-button-row media-row"
                onClick={() => openTitle(t)}
              >
                <Poster path={t.poster_path} size="w154" width={48} />
                <div className="media-info">
                  <div className="media-title">
                    {t.release_year ? `${t.title} (${t.release_year})` : t.title}
                  </div>
                  <div className="media-sub">
                    ×{t.view_count} · naposledy {formatDayCzech(t.last_watched)}
                  </div>
                  {t.avg_rating != null && (
                    <div className="media-rating">
                      ★ {Number(t.avg_rating).toString().replace(".", ",")}
                    </div>
                  )}
                </div>
                <ChevronRight size={18} className="chevron-icon" />
              </button>
            ))}
          </div>
        </div>
      )}

      {adding && (
        <AddViewingModal
          places={places}
          onClose={() => setAdding(false)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
