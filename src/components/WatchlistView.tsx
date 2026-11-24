"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, Check, Film, LayoutGrid, List, Plus, Trash2 } from "lucide-react";
import { getMyUserId, supabase } from "@/lib/supabase";
import { kindLabel, TMDBItem, WatchlistItem } from "@/lib/models";
import { posterURL } from "@/lib/tmdb";
import { Poster } from "./Poster";
import { TMDBSearchList } from "./TMDBSearchList";
import { AddViewingModal } from "./AddViewingModal";

type FilterType = "all" | "movie" | "tv";
type ViewMode = "grid" | "list";

let cachedWatchlist: WatchlistItem[] | null = null;

export function WatchlistView({ places }: { places: string[] }) {
  const [items, setItems] = useState<WatchlistItem[]>(() => cachedWatchlist ?? []);
  const [loaded, setLoaded] = useState(() => cachedWatchlist !== null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [adding, setAdding] = useState(false);
  const [watchedItem, setWatchedItem] = useState<WatchlistItem | null>(null);

  const [addMessage, setAddMessage] = useState<{
    text: string;
    type: "success" | "warning" | "error";
  } | null>(null);
  const [savingAdd, setSavingAdd] = useState(false);

  useEffect(() => {
    const savedMode = localStorage.getItem("filmoteka_viewMode") as ViewMode | null;
    if (savedMode === "grid" || savedMode === "list") {
      setViewMode(savedMode);
    }
  }, []);

  function changeViewMode(next: ViewMode) {
    setViewMode(next);
    localStorage.setItem("filmoteka_viewMode", next);
  }

  const load = useCallback(async () => {
    try {
      const uid = await getMyUserId();
      const { data, error: err } = await supabase
        .from("watchlist")
        .select("*")
        .eq("user_id", uid)
        .order("added_at", { ascending: false })
        .order("id", { ascending: false });
      if (err) throw err;
      const list = (data as WatchlistItem[]) ?? [];
      cachedWatchlist = list;
      setItems(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba při načítání seznamu.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    return items.filter((i) => {
      if (filter === "movie") return i.media_type === "movie";
      if (filter === "tv") return i.media_type === "tv";
      return true;
    });
  }, [items, filter]);

  async function remove(item: WatchlistItem) {
    try {
      const { error: err } = await supabase.from("watchlist").delete().eq("id", item.id);
      if (err) throw err;
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodařilo se odebrat položku.");
    }
  }

  function contains(candidate: TMDBItem): boolean {
    return items.some(
      (i) => i.media_type === candidate.mediaType && i.tmdb_id === candidate.tmdbId
    );
  }

  async function addWatchlistItem(candidate: TMDBItem) {
    if (contains(candidate)) {
      setAddMessage({
        text: `Už je v seznamu: ${candidate.title}`,
        type: "warning",
      });
      return;
    }
    if (savingAdd) return;
    setSavingAdd(true);
    try {
      const { data, error: err } = await supabase
        .from("watchlist")
        .insert({
          tmdb_id: candidate.tmdbId,
          media_type: candidate.mediaType,
          title: candidate.title,
          poster_path: candidate.posterPath,
          release_year: candidate.releaseYear,
        })
        .select("*")
        .single();
      if (err) {
        if (err.code === "23505") {
          setAddMessage({
            text: `Už je v seznamu: ${candidate.title}`,
            type: "warning",
          });
          return;
        }
        throw err;
      }
      setItems((prev) => [data as WatchlistItem, ...prev]);
      setAddMessage({
        text: `Přidáno: ${candidate.title}`,
        type: "success",
      });
    } catch (e) {
      setAddMessage({
        text: e instanceof Error ? e.message : "Nepodařilo se přidat do seznamu.",
        type: "error",
      });
    } finally {
      setSavingAdd(false);
    }
  }

  return (
    <div className="screen-container">
      <div className="top-header-row">
        <div>
          <h1 className="large-title">Chci vidět</h1>
          {items.length > 0 && (
            <div className="header-subtitle">{items.length} titulů na seznamu</div>
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

          <button
            type="button"
            className="primary-action-btn"
            onClick={() => {
              setAddMessage(null);
              setAdding(true);
            }}
          >
            <Plus size={19} />
            <span className="hide-on-mobile">Přidat titul</span>
          </button>
        </div>
      </div>

      <div className="ios-section">
        <div className="segmented-control">
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
          <Bookmark size={48} className="secondary-text" />
          <h3>Nic na seznamu</h3>
          {items.length === 0 && (
            <p className="secondary-text">Přidej, co chceš vidět, tlačítkem +.</p>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div className="poster-grid">
          {shown.map((item) => {
            const imgUrl = posterURL(item.poster_path, "w342");
            return (
              <div key={item.id} className="poster-card static">
                <div className="poster-card-artwork">
                  {imgUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imgUrl} alt={item.title} loading="lazy" />
                  ) : (
                    <div className="poster-card-fallback">
                      <Film size={36} />
                    </div>
                  )}
                  <div className="poster-card-overlay-actions">
                    <button
                      type="button"
                      className="pill-action-btn success solid"
                      onClick={() => setWatchedItem(item)}
                      title="Označit jako viděno"
                    >
                      <Check size={14} />
                      <span>Viděno</span>
                    </button>
                    <button
                      type="button"
                      className="overlay-delete-btn"
                      onClick={() => void remove(item)}
                      title="Odebrat ze seznamu"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="poster-card-meta">
                  <div className="poster-card-title">{item.title}</div>
                  <div className="poster-card-sub">
                    {kindLabel(item.media_type)}
                    {item.release_year ? ` · ${item.release_year}` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ios-section">
          <div className="ios-card">
            {shown.map((item) => (
              <div key={item.id} className="ios-row media-row">
                <Poster path={item.poster_path} size="w154" width={48} />
                <div className="media-info">
                  <div className="media-title">
                    {item.release_year
                      ? `${item.title} (${item.release_year})`
                      : item.title}
                  </div>
                  <div className="media-sub">{kindLabel(item.media_type)}</div>
                  {item.note && <div className="viewing-note">{item.note}</div>}
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="pill-action-btn success"
                    onClick={() => setWatchedItem(item)}
                    title="Označit jako viděno"
                  >
                    <Check size={15} />
                    <span>Viděno</span>
                  </button>
                  <button
                    type="button"
                    className="icon-danger-btn"
                    onClick={() => void remove(item)}
                    title="Smazat"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {adding && (
        <div className="modal-backdrop" onClick={() => setAdding(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-navbar">
              <span className="nav-btn-placeholder" />
              <div className="nav-title">Přidat do Chci vidět</div>
              <button
                type="button"
                className="nav-btn bold"
                onClick={() => {
                  setAdding(false);
                  void load();
                }}
              >
                Hotovo
              </button>
            </div>
            <div className="modal-body">
              <TMDBSearchList
                message={addMessage?.text ?? null}
                messageType={addMessage?.type ?? "success"}
                isChecked={contains}
                onSearch={() => setAddMessage(null)}
                onPick={(picked) => void addWatchlistItem(picked)}
              />
            </div>
          </div>
        </div>
      )}

      {watchedItem && (
        <AddViewingModal
          places={places}
          prefill={{
            tmdbId: watchedItem.tmdb_id,
            mediaType: watchedItem.media_type,
            title: watchedItem.title,
            posterPath: watchedItem.poster_path,
            releaseYear: watchedItem.release_year,
          }}
          onClose={() => setWatchedItem(null)}
          onSaved={() => {
            const target = watchedItem;
            setWatchedItem(null);
            if (target) void remove(target);
          }}
        />
      )}
    </div>
  );
}
