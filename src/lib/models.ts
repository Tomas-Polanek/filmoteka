export interface Viewing {
  id: number;
  watched_on: string; // "yyyy-MM-dd"
  place: string | null;
  rating: number | null;
  note: string | null;
  season: number | null;
}

export interface TimelineViewing extends Viewing {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  release_year: number | null;
}

export interface NewViewing {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  release_year: number | null;
  watched_on: string;
  place: string | null;
  rating: number | null;
  note: string | null;
  season: number | null;
}

export interface ViewingUpdate {
  watched_on: string;
  place: string | null;
  rating: number | null;
  note: string | null;
  season: number | null;
}

export interface TitleSummary {
  media_type: "movie" | "tv";
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  release_year: number | null;
  view_count: number;
  last_watched: string;
  avg_rating: number | null;
}

export interface WatchlistItem {
  id: number;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  release_year: number | null;
  note: string | null;
  added_at: string;
}

export interface TMDBItem {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  matchedActor?: string | null;
}

export interface TMDBPersonResult {
  personId: number;
  name: string;
  profilePath: string | null;
  knownFor: TMDBItem[];
}

export function tmdbItemId(item: { mediaType: string; tmdbId: number }): string {
  return `${item.mediaType}-${item.tmdbId}`;
}

export function kindLabel(mediaType: string): string {
  return mediaType === "tv" ? "Seriál" : "Film";
}

export function kindAndYear(item: { mediaType: string; releaseYear: number | null }): string {
  const kind = kindLabel(item.mediaType);
  return item.releaseYear ? `${kind} · ${item.releaseYear}` : kind;
}

export function czechPlural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

export const CZECH_MONTHS_STANDALONE = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

const CZECH_MONTHS_GENITIVE = [
  "ledna",
  "února",
  "března",
  "dubna",
  "května",
  "června",
  "července",
  "srpna",
  "září",
  "října",
  "listopadu",
  "prosince",
];

export function formatDayCzech(isoDate: string): string {
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return isoDate;
  const [y, m, d] = parts;
  const monthName = CZECH_MONTHS_GENITIVE[m - 1];
  if (!monthName) return isoDate;
  return `${d}. ${monthName} ${y}`;
}

export function formatMonthCzech(year: number, month1Based: number): string {
  const name = CZECH_MONTHS_STANDALONE[month1Based - 1] ?? "";
  return `${name} ${year}`;
}

export function formatMonthFromIso(isoDateOrMonth: string): string {
  const parts = isoDateOrMonth.split("-").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return isoDateOrMonth;
  return formatMonthCzech(parts[0], parts[1]);
}

export function todayIsoString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type ThemeOption = "system" | "light" | "dark";
export type AccentOption =
  | "blue"
  | "purple"
  | "pink"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "teal";

export const ACCENTS: { id: AccentOption; label: string; hex: string }[] = [
  { id: "blue", label: "Modrá", hex: "#007aff" },
  { id: "purple", label: "Fialová", hex: "#af52de" },
  { id: "pink", label: "Růžová", hex: "#ff2d55" },
  { id: "red", label: "Červená", hex: "#ff3b30" },
  { id: "orange", label: "Oranžová", hex: "#ff9500" },
  { id: "yellow", label: "Žlutá", hex: "#ffcc00" },
  { id: "green", label: "Zelená", hex: "#34c759" },
  { id: "teal", label: "Tyrkysová", hex: "#30b0c7" },
];
