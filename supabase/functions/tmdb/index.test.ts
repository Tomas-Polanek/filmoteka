import { assertEquals } from "jsr:@std/assert@1";
import { handler } from "./index.ts";

const base = "http://localhost/functions/v1/tmdb";
const okUser = (t: string) => Promise.resolve(t === "good");
let upstreamCalls: { url: string; auth: string | null }[] = [];
const fakeFetch = ((input: URL | RequestInfo, init?: RequestInit) => {
  upstreamCalls.push({ url: String(input), auth: new Headers(init?.headers).get("Authorization") });
  return Promise.resolve(new Response('{"ok":true}', { headers: { "Content-Type": "application/json" } }));
}) as typeof fetch;

const get = (path: string, token?: string) =>
  handler(
    new Request(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
    okUser,
    fakeFetch,
  );

Deno.env.set("TMDB_TOKEN", "secret-tmdb");

Deno.test("rejects missing and invalid user tokens without calling TMDB", async () => {
  upstreamCalls = [];
  assertEquals((await get("/3/movie/11")).status, 401);
  assertEquals((await get("/3/movie/11", "bad")).status, 401);
  assertEquals(upstreamCalls.length, 0);
});

Deno.test("refuses paths the app does not use", async () => {
  upstreamCalls = [];
  for (const p of ["/3/account", "/3/movie/11/../../account", "/4/list/1", "/3/movie/abc"]) {
    assertEquals((await get(p, "good")).status, 404, p);
  }
  assertEquals(upstreamCalls.length, 0);
});

Deno.test("forwards allowed paths with the server token and only allowed params", async () => {
  upstreamCalls = [];
  const res = await get("/3/search/multi?query=Pel%C3%AD%C5%A1ky%2B&language=cs-CZ&api_key=leak", "good");
  assertEquals(res.status, 200);
  assertEquals(upstreamCalls.length, 1);
  const up = new URL(upstreamCalls[0].url);
  assertEquals(up.pathname, "/3/search/multi");
  assertEquals(up.searchParams.get("query"), "Pelíšky+");
  assertEquals(up.searchParams.get("language"), "cs-CZ");
  assertEquals(up.searchParams.has("api_key"), false);
  assertEquals(upstreamCalls[0].auth, "Bearer secret-tmdb");

  assertEquals((await get("/3/tv/1399/season/1?language=cs-CZ", "good")).status, 200);
  assertEquals((await get("/3/movie/11?append_to_response=credits,videos", "good")).status, 200);
});

Deno.test("only GET", async () => {
  const res = await handler(new Request(base + "/3/movie/11", { method: "POST" }), okUser, fakeFetch);
  assertEquals(res.status, 405);
});
