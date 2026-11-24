"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_PLACES, OTHER_PLACE } from "@/lib/account";
import {
  CZECH_MONTHS_STANDALONE,
  formatDayCzech,
  kindAndYear,
  NewViewing,
  TMDBItem,
  todayIsoString,
  Viewing,
  ViewingUpdate,
} from "@/lib/models";
import { Poster } from "./Poster";
import { TMDBSearchList } from "./TMDBSearchList";

type Precision = "day" | "month" | "year";
const LAST_PLACE_KEY = "filmoteka_lastPlace";

export function AddViewingModal({
  places,
  prefill = null,
  editing = null,
  onClose,
  onSaved,
}: {
  places: string[];
  prefill?: TMDBItem | null;
  editing?: Viewing | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [item, setItem] = useState<TMDBItem | null>(prefill);
  const canAddAnother = prefill === null && editing === null;
  const [savedInfo, setSavedInfo] = useState<string | null>(null);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const initialDateStr = editing?.watched_on || todayIsoString();
  const [dateStr, setDateStr] = useState<string>(initialDateStr);
  const [precision, setPrecision] = useState<Precision>("day");

  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const y = parseInt(initialDateStr.slice(0, 4), 10);
    return Number.isNaN(y) ? currentYear : y;
  });
  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    const m = parseInt(initialDateStr.slice(5, 7), 10);
    return Number.isNaN(m) ? currentMonth : m;
  });

  const placeOptions = useMemo(() => {
    const filtered = (places.length > 0 ? places : DEFAULT_PLACES).filter(
      (p) => p !== OTHER_PLACE
    );
    return [...filtered, OTHER_PLACE];
  }, [places]);

  const [place, setPlace] = useState<string>("");
  const [customPlace, setCustomPlace] = useState<string>("");

  useEffect(() => {
    const rawPlace =
      editing !== null
        ? editing.place ?? ""
        : typeof window !== "undefined"
        ? localStorage.getItem(LAST_PLACE_KEY) ?? ""
        : "";

    if (!rawPlace) {
      setPlace(placeOptions[0] ?? OTHER_PLACE);
    } else if (placeOptions.includes(rawPlace)) {
      setPlace(rawPlace);
    } else {
      setPlace(OTHER_PLACE);
      setCustomPlace(rawPlace);
    }
  }, [editing, placeOptions]);

  const [rate, setRate] = useState<boolean>(editing?.rating != null);
  const [rating, setRating] = useState<number>(editing?.rating ?? 7);
  const [hasSeason, setHasSeason] = useState<boolean>(editing?.season != null);
  const [season, setSeason] = useState<number>(editing?.season ?? 1);
  const [note, setNote] = useState<string>(editing?.note ?? "");
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const storedDateStr = useMemo(() => {
    if (precision === "day") {
      return dateStr;
    }
    if (precision === "month") {
      const m =
        selectedYear === currentYear ? Math.min(selectedMonth, currentMonth) : selectedMonth;
      return `${selectedYear}-${String(m).padStart(2, "0")}-01`;
    }
    return `${selectedYear}-01-01`;
  }, [precision, dateStr, selectedYear, selectedMonth, currentYear, currentMonth]);

  async function save(currentItem: TMDBItem, addAnother: boolean) {
    if (saving) return;
    setSaving(true);
    setSaveError(null);

    const chosenPlace = place === OTHER_PLACE ? customPlace.trim() : place;
    const placeValue = chosenPlace.length > 0 ? chosenPlace : null;
    const trimmedNote = note.trim();
    const noteValue = trimmedNote.length > 0 ? trimmedNote : null;
    const ratingValue = rate ? rating : null;
    const seasonValue = currentItem.mediaType === "tv" && hasSeason ? season : null;

    try {
      if (editing) {
        const payload: ViewingUpdate = {
          watched_on: storedDateStr,
          place: placeValue,
          rating: ratingValue,
          note: noteValue,
          season: seasonValue,
        };
        const { error } = await supabase
          .from("viewings")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const payload: NewViewing = {
          tmdb_id: currentItem.tmdbId,
          media_type: currentItem.mediaType,
          title: currentItem.title,
          poster_path: currentItem.posterPath,
          release_year: currentItem.releaseYear,
          watched_on: storedDateStr,
          place: placeValue,
          rating: ratingValue,
          note: noteValue,
          season: seasonValue,
        };
        const { error } = await supabase.from("viewings").insert(payload);
        if (error) throw error;
        if (placeValue && typeof window !== "undefined") {
          localStorage.setItem(LAST_PLACE_KEY, placeValue);
        }
      }

      onSaved();

      if (addAnother) {
        setSavedInfo(`Uloženo: ${currentItem.title}`);
        setItem(null);
        setNote("");
        setRate(false);
        setRating(7);
      } else {
        onClose();
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Nepodařilo se uložit zhlédnutí.");
    } finally {
      setSaving(false);
    }
  }

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear; y >= 1900; y--) arr.push(y);
    return arr;
  }, [currentYear]);

  const maxMonth = selectedYear === currentYear ? currentMonth : 12;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-navbar">
          <button type="button" className="nav-btn" onClick={onClose}>
            Zrušit
          </button>
          <div className="nav-title">
            {editing ? "Upravit zhlédnutí" : item === null ? "Vybrat titul" : "Zhlédnutí"}
          </div>
          {item ? (
            <button
              type="button"
              className="nav-btn bold"
              disabled={saving}
              onClick={() => void save(item, false)}
            >
              {editing ? "Uložit změny" : "Uložit"}
            </button>
          ) : (
            <span className="nav-btn-placeholder" />
          )}
        </div>

        <div className="modal-body">
          {!item ? (
            <TMDBSearchList
              message={savedInfo}
              messageType="success"
              onSearch={() => setSavedInfo(null)}
              onPick={(picked) => setItem(picked)}
            />
          ) : (
            <div>
              <div className="ios-section">
                <div className="ios-card">
                  <div className="ios-row media-row">
                    <Poster path={item.posterPath} size="w92" width={50} />
                    <div className="media-info">
                      <div className="media-title">{item.title}</div>
                      <div className="media-sub">{kindAndYear(item)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="ios-section">
                <div className="ios-section-header">Kdy</div>
                <div className="ios-card">
                  <div className="ios-row">
                    <div className="segmented-control">
                      {(
                        [
                          { id: "day", label: "Den" },
                          { id: "month", label: "Měsíc" },
                          { id: "year", label: "Rok" },
                        ] as { id: Precision; label: string }[]
                      ).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={`segment-btn ${precision === p.id ? "active" : ""}`}
                          onClick={() => setPrecision(p.id)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {precision === "day" && (
                    <div className="ios-row space-between">
                      <span>Datum</span>
                      <input
                        type="date"
                        className="ios-select"
                        max={todayIsoString()}
                        value={dateStr}
                        onChange={(e) => setDateStr(e.target.value)}
                      />
                    </div>
                  )}

                  {(precision === "month" || precision === "year") && (
                    <div className="ios-row space-between">
                      <span>Rok</span>
                      <select
                        className="ios-select"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                      >
                        {years.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {precision === "month" && (
                    <div className="ios-row space-between">
                      <span>Měsíc</span>
                      <select
                        className="ios-select"
                        value={Math.min(selectedMonth, maxMonth)}
                        onChange={(e) => setSelectedMonth(Number(e.target.value))}
                      >
                        {CZECH_MONTHS_STANDALONE.slice(0, maxMonth).map((mName, idx) => (
                          <option key={idx + 1} value={idx + 1}>
                            {mName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {precision !== "day" && (
                    <div className="ios-row space-between">
                      <span>Uloží se jako</span>
                      <span className="secondary-text">{formatDayCzech(storedDateStr)}</span>
                    </div>
                  )}
                </div>
              </div>

              {item.mediaType === "tv" && (
                <div className="ios-section">
                  <div className="ios-section-header">Sezóna</div>
                  <div className="ios-card">
                    <div className="ios-row space-between">
                      <span>Konkrétní sezóna</span>
                      <input
                        type="checkbox"
                        className="ios-switch"
                        checked={hasSeason}
                        onChange={(e) => setHasSeason(e.target.checked)}
                      />
                    </div>
                    {hasSeason && (
                      <div className="ios-row space-between">
                        <span>{season === 0 ? "Speciály" : `Sezóna ${season}`}</span>
                        <div className="stepper">
                          <button
                            type="button"
                            className="stepper-btn"
                            disabled={season <= 0}
                            onClick={() => setSeason((s) => Math.max(0, s - 1))}
                          >
                            <Minus size={16} />
                          </button>
                          <button
                            type="button"
                            className="stepper-btn"
                            disabled={season >= 99}
                            onClick={() => setSeason((s) => Math.min(99, s + 1))}
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="ios-section">
                <div className="ios-section-header">Kde</div>
                <div className="ios-card">
                  <div className="ios-row space-between">
                    <span>Kde</span>
                    <select
                      className="ios-select"
                      value={place}
                      onChange={(e) => setPlace(e.target.value)}
                    >
                      {placeOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  {place === OTHER_PLACE && (
                    <div className="ios-row">
                      <input
                        type="text"
                        className="ios-input"
                        placeholder="Kde jinde"
                        value={customPlace}
                        onChange={(e) => setCustomPlace(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="ios-section">
                <div className="ios-section-header">Hodnocení</div>
                <div className="ios-card">
                  <div className="ios-row space-between">
                    <span>Hodnotit</span>
                    <input
                      type="checkbox"
                      className="ios-switch"
                      checked={rate}
                      onChange={(e) => setRate(e.target.checked)}
                    />
                  </div>
                  {rate && (
                    <div className="ios-row space-between">
                      <span>★ {rating}/10</span>
                      <div className="stepper">
                        <button
                          type="button"
                          className="stepper-btn"
                          disabled={rating <= 1}
                          onClick={() => setRating((r) => Math.max(1, r - 1))}
                        >
                          <Minus size={16} />
                        </button>
                        <button
                          type="button"
                          className="stepper-btn"
                          disabled={rating >= 10}
                          onClick={() => setRating((r) => Math.min(10, r + 1))}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="ios-section">
                <div className="ios-section-header">Poznámka</div>
                <div className="ios-card">
                  <div className="ios-row">
                    <textarea
                      className="ios-textarea"
                      placeholder="Poznámka"
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {saveError && (
                <div className="ios-section">
                  <div className="ios-card">
                    <div className="ios-row error-text">{saveError}</div>
                  </div>
                </div>
              )}

              {canAddAnother && (
                <div className="ios-section">
                  <div className="ios-card">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void save(item, true)}
                      className="ios-row ios-button-row accent-text"
                    >
                      Uložit a přidat další
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
