// TMDB proxy: the app calls /functions/v1/tmdb/<tmdb path>?<query> with the signed-in user's access token,
// this function adds the TMDB token (secret TMDB_TOKEN) so it never ships inside the app.
// Deploy with --no-verify-jwt: the gateway check does not cover the new sb_publishable keys / asymmetric JWTs,
// so the user is verified here instead.
import { createClient } from "npm:@supabase/supabase-js@2";

// Only what the app uses; anything else is refused so the function can't be used as an open TMDB relay.
const ALLOWED_PATHS = [
  /^3\/search\/multi$/,
  /^3\/(movie|tv)\/\d+$/,
  /^3\/tv\/\d+\/season\/\d+$/,
  /^3\/person\/\d+\/combined_credits$/,
];
const ALLOWED_PARAMS: Record<string, true> = {
  query: true,
  language: true,
  include_adult: true,
  page: true,
  append_to_response: true,
  include_video_language: true,
};

export type VerifyUser = (token: string) => Promise<boolean>;

const supabaseVerify: VerifyUser = async (token) => {
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await client.auth.getUser(token);
  return !error && data.user != null;
};

const json = (status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export async function handler(
  req: Request,
  verify: VerifyUser = supabaseVerify,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  if (req.method !== "GET") return json(405, "method not allowed");

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !(await verify(token))) return json(401, "unauthorized");

  const url = new URL(req.url);
  // Path arrives as /tmdb/3/... (or /functions/v1/tmdb/3/... when served locally).
  const path = url.pathname.replace(/^.*?\/tmdb\//, "");
  if (!ALLOWED_PATHS.some((re) => re.test(path))) return json(404, "path not allowed");

  const upstream = new URL(`https://api.themoviedb.org/${path}`);
  for (const [key, value] of url.searchParams) {
    if (Object.hasOwn(ALLOWED_PARAMS, key)) upstream.searchParams.append(key, value);
  }

  const tmdbToken = Deno.env.get("TMDB_TOKEN");
  if (!tmdbToken) return json(500, "TMDB_TOKEN secret is not set");

  const res = await fetchFn(upstream, {
    headers: { Authorization: `Bearer ${tmdbToken}`, Accept: "application/json" },
  });
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
  });
}

if (import.meta.main) Deno.serve((req) => handler(req));
