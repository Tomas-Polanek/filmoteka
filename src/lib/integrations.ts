import { supabase } from "@/lib/supabase";
import { fetchTMDBDetail } from "@/lib/tmdb";
import { TitleSummary } from "@/lib/models";

export type IntegrationProvider = "jellyfin" | "plex";

export interface Integration {
  id: number;
  provider: IntegrationProvider;
  created_at: string;
  last_sync_at: string | null;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function listIntegrations(): Promise<Integration[]> {
  const { data, error } = await supabase
    .from("integrations")
    .select("id, provider, created_at, last_sync_at")
    .order("created_at");
  if (error) throw error;
  return (data as Integration[]) ?? [];
}

/**
 * Creates the connection and returns its token. Only the token's hash is stored, so this is the one time
 * the token can be shown; connecting again replaces the old token.
 */
export async function connectIntegration(provider: IntegrationProvider): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const { error: delErr } = await supabase.from("integrations").delete().eq("provider", provider);
  if (delErr) throw delErr;
  const { error } = await supabase.from("integrations").insert({ provider, token_hash: tokenHash });
  if (error) throw error;
  return token;
}

export async function disconnectIntegration(provider: IntegrationProvider): Promise<void> {
  const { error } = await supabase.from("integrations").delete().eq("provider", provider);
  if (error) throw error;
}

/**
 * Synced viewings arrive with the media server's title and no poster. Fills poster and Czech title from TMDB
 * for up to `limit` such titles; returns how many titles changed (the caller reloads the diary when > 0).
 */
export async function fillMissingPosters(titles: TitleSummary[], limit = 20): Promise<number> {
  let changed = 0;
  for (const t of titles.filter((x) => !x.poster_path).slice(0, limit)) {
    try {
      const detail = await fetchTMDBDetail(t.media_type, t.tmdb_id);
      if (!detail.posterPath) continue;
      const { error } = await supabase
        .from("viewings")
        .update({ poster_path: detail.posterPath, title: detail.title })
        .eq("media_type", t.media_type)
        .eq("tmdb_id", t.tmdb_id)
        .is("poster_path", null);
      if (!error) changed++;
    } catch {
      // TMDB unreachable or unknown id: try again next time the diary loads
    }
  }
  return changed;
}
