"use client";

import React, { useEffect, useState } from "react";
import { Check, ChevronLeft, Search, User, X } from "lucide-react";
import { kindAndYear, TMDBItem, tmdbItemId, TMDBPersonResult } from "@/lib/models";
import { fetchPersonCredits, posterURL, searchTMDBMulti } from "@/lib/tmdb";
import { Poster } from "./Poster";

export function TMDBSearchList({
  message,
  messageType = "success",
  isChecked = () => false,
  onSearch = () => {},
  onPick,
}: {
  message?: string | null;
  messageType?: "success" | "warning" | "error";
  isChecked?: (item: TMDBItem) => boolean;
  onSearch?: () => void;
  onPick: (item: TMDBItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TMDBItem[]>([]);
  const [people, setPeople] = useState<TMDBPersonResult[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<TMDBPersonResult | null>(null);
  const [personItems, setPersonItems] = useState<TMDBItem[]>([]);
  const [personLoading, setPersonLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    setSelectedPerson(null);
    setPersonItems([]);
    if (!q) {
      setResults([]);
      setPeople([]);
      setError(null);
      setLoading(false);
      return;
    }
    onSearch();
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchTMDBMulti(q);
        if (!cancelled) {
          setResults(found.items);
          setPeople(found.people);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Chyba při hledání.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function handleSelectPerson(person: TMDBPersonResult) {
    setSelectedPerson(person);
    setPersonItems(person.knownFor);
    setPersonLoading(true);
    try {
      const full = await fetchPersonCredits(person);
      setPersonItems(full);
    } finally {
      setPersonLoading(false);
    }
  }

  const displayedItems = selectedPerson ? personItems : results;

  return (
    <div>
      <div className="search-bar-wrap">
        <div className="search-bar">
          <Search size={17} className="search-icon" />
          <input
            type="text"
            placeholder="Hledat film, seriál nebo herce…"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="clear-btn"
              onClick={() => setQuery("")}
              aria-label="Vymazat"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="ios-section">
          <div className="ios-card">
            <div
              className={`ios-row ${
                messageType === "error"
                  ? "error-text"
                  : messageType === "warning"
                  ? "warning-text"
                  : "success-text"
              }`}
            >
              {message}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="ios-section">
          <div className="ios-card">
            <div className="ios-row error-text">{error}</div>
          </div>
        </div>
      )}

      {loading && (
        <div className="center-pad secondary-text">Hledám v TMDB…</div>
      )}

      {!selectedPerson && people.length > 0 && (
        <div className="ios-section">
          <div className="ios-section-header">Herci a tvůrci</div>
          <div className="person-chips-row">
            {people.map((p) => {
              const avatar = posterURL(p.profilePath, "w185");
              return (
                <button
                  key={p.personId}
                  type="button"
                  className="person-chip-btn"
                  onClick={() => void handleSelectPerson(p)}
                >
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt={p.name} className="person-chip-avatar" />
                  ) : (
                    <div className="person-chip-avatar placeholder">
                      <User size={15} />
                    </div>
                  )}
                  <div className="person-chip-text">
                    <span className="person-chip-name">{p.name}</span>
                    <span className="person-chip-sub">
                      Zobrazit filmy ({p.knownFor.length}+)
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedPerson && (
        <div className="ios-section">
          <div className="selected-person-banner">
            <button
              type="button"
              className="nav-back-btn"
              onClick={() => setSelectedPerson(null)}
            >
              <ChevronLeft size={18} />
              <span>Všechny výsledky</span>
            </button>
            <span className="bold">Herec: {selectedPerson.name}</span>
          </div>
          {personLoading && (
            <div className="center-pad secondary-text">Načítám filmografii…</div>
          )}
        </div>
      )}

      {displayedItems.length > 0 && (
        <div className="ios-section">
          {!selectedPerson && people.length > 0 && (
            <div className="ios-section-header">Filmy a seriály</div>
          )}
          <div className="ios-card">
            {displayedItems.map((r) => {
              const checked = isChecked(r);
              return (
                <button
                  key={tmdbItemId(r)}
                  type="button"
                  onClick={() => onPick(r)}
                  className="ios-row ios-button-row media-row"
                >
                  <Poster path={r.posterPath} size="w92" width={40} />
                  <div className="media-info">
                    <div className="media-title">{r.title}</div>
                    <div className="media-sub">
                      {kindAndYear(r)}
                      {r.matchedActor ? ` · ${r.matchedActor}` : ""}
                    </div>
                  </div>
                  {checked && <Check size={18} className="accent-text" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
