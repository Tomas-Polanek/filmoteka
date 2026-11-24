import { supabase } from "./supabase";
import { TMDBItem, TMDBPersonResult } from "./models";

export interface CastMember {
  id: number;
  name: string;
  character: string | null;
  profilePath: string | null;
}

export interface SeasonInfo {
  id: number;
  name: string;
  seasonNumber: number;
  episodeCount: number | null;
  airDate: string | null;
  posterPath: string | null;
  year: number | null;
}

export interface TMDBDetail {
  title: string;
  originalTitle: string | null;
  tagline: string | null;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  firstYear: number | null;
  lastYear: number | null;
  runtime: number | null;
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  voteAverage: number;
  voteCount: number;
  genres: string[];
  certification: string | null;
  directors: string[];
  writers: string[];
  creators: string[];
  cast: CastMember[];
  trailerURL: string | null;
  seasons: SeasonInfo[];
}

export function posterURL(path: string | null | undefined, size = "w342"): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

// In-memory client caches + in-flight deduplication (prevents double calls in React StrictMode)
const detailCache = new Map<string, TMDBDetail>();
const detailInFlight = new Map<string, Promise<TMDBDetail>>();
const searchCache = new Map<string, TMDBItem[]>();

export function getCachedTMDBDetail(
  mediaType: "movie" | "tv",
  id: number
): TMDBDetail | null {
  const key = `${mediaType}-${id}`;
  const mem = detailCache.get(key);
  if (mem) return mem;
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(`tmdb_detail_${key}`);
      if (raw) {
        const parsed = JSON.parse(raw) as TMDBDetail;
        detailCache.set(key, parsed);
        return parsed;
      }
    } catch {
      // ignore storage errors
    }
  }
  return null;
}

export function prefetchTMDBDetail(mediaType: "movie" | "tv", id: number): void {
  const key = `${mediaType}-${id}`;
  if (detailCache.has(key) || detailInFlight.has(key)) return;
  void fetchTMDBDetail(mediaType, id).catch(() => {});
}

async function tmdbGet<T>(path: string, query: Record<string, string>): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Nejsi přihlášen.");

  const params = new URLSearchParams(query);
  const res = await fetch(`/api/tmdb/3${path}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Chyba TMDB (${res.status})`);
  }
  return (await res.json()) as T;
}

interface RawSearchResult {
  id: number;
  media_type: string;
  title?: string;
  name?: string;
  poster_path?: string | null;
  profile_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  known_for?: RawSearchResult[];
}

export interface MultiSearchOutput {
  items: TMDBItem[];
  people: TMDBPersonResult[];
}

const multiSearchCache = new Map<string, MultiSearchOutput>();
const personCreditsCache = new Map<number, TMDBItem[]>();

function mapRawMediaItem(r: RawSearchResult, matchedActor?: string | null): TMDBItem {
  const date = r.release_date || r.first_air_date || "";
  const year = parseInt(date.slice(0, 4), 10);
  return {
    tmdbId: r.id,
    mediaType: r.media_type as "movie" | "tv",
    title: r.title ?? r.name ?? "",
    posterPath: r.poster_path ?? null,
    releaseYear: Number.isNaN(year) ? null : year,
    matchedActor: matchedActor ?? null,
  };
}

export async function searchTMDBMulti(q: string): Promise<MultiSearchOutput> {
  const norm = q.trim().toLowerCase();
  const cached = multiSearchCache.get(norm);
  if (cached) return cached;

  const data = await tmdbGet<{ results?: RawSearchResult[] }>("/search/multi", {
    query: q,
    language: "cs-CZ",
    include_adult: "false",
  });

  const rawList = data.results ?? [];
  const directItems: TMDBItem[] = [];
  const actorItems: TMDBItem[] = [];
  const people: TMDBPersonResult[] = [];
  const seenKeys = new Set<string>();

  for (const r of rawList) {
    if (r.media_type === "movie" || r.media_type === "tv") {
      const item = mapRawMediaItem(r);
      const key = `${item.mediaType}-${item.tmdbId}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        directItems.push(item);
      }
    } else if (r.media_type === "person" && r.name) {
      const knownFor = (r.known_for ?? [])
        .filter((k) => k.media_type === "movie" || k.media_type === "tv")
        .map((k) => mapRawMediaItem(k, r.name));

      people.push({
        personId: r.id,
        name: r.name,
        profilePath: r.profile_path ?? null,
        knownFor,
      });

      for (const kItem of knownFor) {
        const key = `${kItem.mediaType}-${kItem.tmdbId}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          actorItems.push(kItem);
        }
      }
    }
  }

  const output: MultiSearchOutput = {
    items: [...directItems, ...actorItems],
    people,
  };
  multiSearchCache.set(norm, output);
  return output;
}

export async function fetchPersonCredits(
  person: TMDBPersonResult
): Promise<TMDBItem[]> {
  const cached = personCreditsCache.get(person.personId);
  if (cached) return cached;

  try {
    const data = await tmdbGet<{
      cast?: (RawSearchResult & { vote_count?: number; popularity?: number })[];
    }>(`/person/${person.personId}/combined_credits`, {
      language: "cs-CZ",
    });
    const castList = (data.cast ?? []).filter(
      (c) => (c.media_type === "movie" || c.media_type === "tv") && (c.title || c.name)
    );
    castList.sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0));

    const seen = new Set<string>();
    const items: TMDBItem[] = [];
    for (const c of castList) {
      const item = mapRawMediaItem(c, person.name);
      const key = `${item.mediaType}-${item.tmdbId}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push(item);
      }
    }
    if (items.length > 0) {
      personCreditsCache.set(person.personId, items);
      return items;
    }
  } catch {
    // Fallback pokud Edge Function ještě nemá povolenou cestu /person/{id}/combined_credits
  }

  return person.knownFor;
}

export async function searchTMDB(q: string): Promise<TMDBItem[]> {
  const out = await searchTMDBMulti(q);
  return out.items;
}

function unique(names: string[]): string[] {
  return Array.from(new Set(names));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTMDBDetail(c: Record<string, any>): TMDBDetail {
  const title: string = c.title ?? c.name ?? "";
  const rawOriginal: string | undefined = c.original_title ?? c.original_name;
  const originalTitle = rawOriginal && rawOriginal !== title ? rawOriginal : null;
  const tagline = c.tagline ? String(c.tagline) : null;
  const overview = c.overview ? String(c.overview) : "";
  const posterPath = c.poster_path ?? null;
  const backdropPath = c.backdrop_path ?? null;

  const firstDate: string = c.release_date ?? c.first_air_date ?? "";
  const parsedFirst = parseInt(firstDate.slice(0, 4), 10);
  const firstYear = Number.isNaN(parsedFirst) ? null : parsedFirst;

  let lastYear: number | null = null;
  if ((c.status === "Ended" || c.status === "Canceled") && c.last_air_date) {
    const parsedLast = parseInt(String(c.last_air_date).slice(0, 4), 10);
    if (!Number.isNaN(parsedLast)) lastYear = parsedLast;
  }

  const runtime = typeof c.runtime === "number" && c.runtime > 0 ? c.runtime : null;
  const numberOfSeasons = typeof c.number_of_seasons === "number" ? c.number_of_seasons : null;
  const numberOfEpisodes = typeof c.number_of_episodes === "number" ? c.number_of_episodes : null;
  const voteAverage = typeof c.vote_average === "number" ? c.vote_average : 0;
  const voteCount = typeof c.vote_count === "number" ? c.vote_count : 0;

  const genres: string[] = Array.isArray(c.genres) ? c.genres.map((g: { name: string }) => g.name) : [];
  const creators: string[] = Array.isArray(c.created_by)
    ? c.created_by.map((p: { name: string }) => p.name)
    : [];

  const seasons: SeasonInfo[] = Array.isArray(c.seasons)
    ? c.seasons.map(
        (s: {
          id: number;
          name: string;
          season_number: number;
          episode_count?: number;
          air_date?: string;
          poster_path?: string;
        }) => {
          const y = s.air_date ? parseInt(s.air_date.slice(0, 4), 10) : NaN;
          return {
            id: s.id,
            name: s.name,
            seasonNumber: s.season_number,
            episodeCount: typeof s.episode_count === "number" ? s.episode_count : null,
            airDate: s.air_date ?? null,
            posterPath: s.poster_path ?? null,
            year: Number.isNaN(y) ? null : y,
          };
        }
      )
    : [];

  const credits = c.credits ?? c.aggregate_credits;
  const crew: { name: string; job?: string }[] = Array.isArray(credits?.crew) ? credits.crew : [];
  const directors = unique(crew.filter((p) => p.job === "Director").map((p) => p.name));
  const writers = unique(
    crew.filter((p) => p.job === "Screenplay" || p.job === "Writer").map((p) => p.name)
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawCast: any[] = Array.isArray(credits?.cast) ? credits.cast.slice(0, 15) : [];
  const cast: CastMember[] = rawCast.map((person, i) => {
    const roleChar = Array.isArray(person.roles)
      ? person.roles.map((r: { character?: string }) => r.character).find(Boolean)
      : undefined;
    const ch = person.character || roleChar || null;
    return {
      id: i,
      name: person.name,
      character: ch && String(ch).trim() !== "" ? String(ch) : null,
      profilePath: person.profile_path ?? null,
    };
  });

  const videos: { key: string; site: string; type: string; iso_639_1?: string }[] = Array.isArray(
    c.videos?.results
  )
    ? c.videos.results.filter((v: { site: string }) => v.site === "YouTube")
    : [];
  const trailer =
    videos.find((v) => v.type === "Trailer" && v.iso_639_1 === "cs") ??
    videos.find((v) => v.type === "Trailer") ??
    videos.find((v) => v.type === "Teaser");
  const trailerURL = trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;

  const ratings: Record<string, string> = {};
  if (Array.isArray(c.release_dates?.results)) {
    for (const country of c.release_dates.results) {
      const cert = (country.release_dates ?? [])
        .map((r: { certification?: string }) => r.certification)
        .find((cert?: string) => cert && cert.length > 0);
      if (cert) ratings[country.iso_3166_1] = cert;
    }
  }
  if (Array.isArray(c.content_ratings?.results)) {
    for (const country of c.content_ratings.results) {
      if (country.rating) ratings[country.iso_3166_1] = country.rating;
    }
  }
  const certification = ratings["CZ"] ?? ratings["US"] ?? null;

  return {
    title,
    originalTitle,
    tagline,
    overview,
    posterPath,
    backdropPath,
    firstYear,
    lastYear,
    runtime,
    numberOfSeasons,
    numberOfEpisodes,
    voteAverage,
    voteCount,
    genres,
    certification,
    directors,
    writers,
    creators,
    cast,
    trailerURL,
    seasons,
  };
}

export async function fetchTMDBDetail(
  mediaType: "movie" | "tv",
  id: number
): Promise<TMDBDetail> {
  const key = `${mediaType}-${id}`;
  const cached = detailCache.get(key);
  if (cached) return cached;

  const existingPromise = detailInFlight.get(key);
  if (existingPromise) return existingPromise;

  const promise = (async () => {
    const isTV = mediaType === "tv";
    const path = isTV ? `/tv/${id}` : `/movie/${id}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await tmdbGet<Record<string, any>>(path, {
      language: "cs-CZ",
      append_to_response: isTV
        ? "aggregate_credits,videos,content_ratings"
        : "credits,videos,release_dates",
      include_video_language: "cs,en",
    });
    const detail = parseTMDBDetail(raw);
    if (!detail.overview) {
      try {
        const en = await tmdbGet<{ overview?: string }>(path, { language: "en-US" });
        if (en.overview) detail.overview = en.overview;
      } catch {
        // English fallback is optional
      }
    }
    detailCache.set(key, detail);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(`tmdb_detail_${key}`, JSON.stringify(detail));
      } catch {
        // ignore quota errors
      }
    }
    return detail;
  })();

  detailInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    detailInFlight.delete(key);
  }
}
