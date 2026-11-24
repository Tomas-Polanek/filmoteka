import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase";

const ALLOWED_PATHS = [
  /^3\/search\/multi$/,
  /^3\/(movie|tv)\/\d+$/,
  /^3\/tv\/\d+\/season\/\d+$/,
  /^3\/person\/\d+\/combined_credits$/,
];

const ALLOWED_PARAMS = new Set([
  "query",
  "language",
  "include_adult",
  "page",
  "append_to_response",
  "include_video_language",
]);

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const TOKEN_TTL_MS = 5 * 60 * 1000;
const TOKEN_MAX_ENTRIES = 200;
// Responses need a signed-in user, so shared caches (CDN) must not store them.
const CACHE_HEADERS = { "Cache-Control": "private, max-age=3600" };

type Entry<T> = { expires: number; value: T };

declare global {
  // eslint-disable-next-line no-var
  var __filmotekaTmdbCache: Map<string, Entry<unknown>> | undefined;
  // eslint-disable-next-line no-var
  var __filmotekaTokenCache: Map<string, Entry<true>> | undefined;
}

const responseCache = (globalThis.__filmotekaTmdbCache ??= new Map());
const tokenCache = (globalThis.__filmotekaTokenCache ??= new Map());

function lookup<T>(cache: Map<string, Entry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expires > Date.now()) return entry.value;
  cache.delete(key);
  return undefined;
}

/** Stores the value; drops expired entries, then the oldest ones, so the map never exceeds `max`. */
function remember<T>(cache: Map<string, Entry<T>>, key: string, value: T, ttl: number, max: number) {
  const now = Date.now();
  cache.delete(key);
  if (cache.size >= max) {
    for (const [k, e] of cache) if (e.expires <= now) cache.delete(k);
    for (const k of cache.keys()) {
      if (cache.size < max) break;
      cache.delete(k);
    }
  }
  cache.set(key, { expires: now + ttl, value });
}

/** True when Supabase Auth accepts the bearer token (cached briefly so cache hits stay fast). */
async function isSignedIn(authHeader: string): Promise<boolean> {
  if (lookup(tokenCache, authHeader)) return true;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: SUPABASE_KEY },
    });
    if (!res.ok) return false;
  } catch {
    return false;
  }
  remember(tokenCache, authHeader, true, TOKEN_TTL_MS, TOKEN_MAX_ENTRIES);
  return true;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { path } = await context.params;
  const joinedPath = path.join("/");
  if (!ALLOWED_PATHS.some((re) => re.test(joinedPath))) {
    return NextResponse.json({ error: "path not allowed" }, { status: 404 });
  }

  const searchParams = new URLSearchParams();
  for (const [k, v] of req.nextUrl.searchParams.entries()) {
    if (ALLOWED_PARAMS.has(k)) {
      searchParams.append(k, v);
    }
  }

  const cacheKey = `${joinedPath}?${searchParams.toString()}`;
  const cached = lookup(responseCache, cacheKey);
  if (cached !== undefined) {
    if (!(await isSignedIn(authHeader))) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.json(cached, { headers: CACHE_HEADERS });
  }

  // Volání přes Supabase Edge Function `tmdb` (kde je platný TMDB_TOKEN secret)
  try {
    const edgeUrl = `${SUPABASE_URL}/functions/v1/tmdb/${cacheKey}`;
    const edgeRes = await fetch(edgeUrl, {
      headers: {
        Authorization: authHeader,
        apikey: SUPABASE_KEY,
        Accept: "application/json",
      },
    });
    const data = await edgeRes.json().catch(() => ({}));
    if (edgeRes.ok) {
      // The edge function verified the token, so later cache hits can skip that check for a while.
      remember(tokenCache, authHeader, true, TOKEN_TTL_MS, TOKEN_MAX_ENTRIES);
      remember(responseCache, cacheKey, data, CACHE_TTL_MS, CACHE_MAX_ENTRIES);
      return NextResponse.json(data, { headers: CACHE_HEADERS });
    }
    return NextResponse.json(data, { status: edgeRes.status });
  } catch {
    return NextResponse.json(
      { error: "Nepodařilo se spojit s TMDB Edge Function." },
      { status: 502 }
    );
  }
}
