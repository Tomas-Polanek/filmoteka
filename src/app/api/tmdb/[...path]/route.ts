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

declare global {
  // eslint-disable-next-line no-var
  var __filmotekaTmdbCache: Map<string, { expires: number; data: unknown }> | undefined;
}

function getServerCache() {
  if (!globalThis.__filmotekaTmdbCache) {
    globalThis.__filmotekaTmdbCache = new Map();
  }
  return globalThis.__filmotekaTmdbCache;
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
  const serverCache = getServerCache();
  const cached = serverCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.data, {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
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
      serverCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, data });
      return NextResponse.json(data, {
        headers: {
          "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        },
      });
    }
    return NextResponse.json(data, { status: edgeRes.status });
  } catch {
    return NextResponse.json(
      { error: "Nepodařilo se spojit s TMDB Edge Function." },
      { status: 502 }
    );
  }
}
