#!/usr/bin/env python3
"""Sends finished Jellyfin plays to Filmotéka.

Runs on the machine with Jellyfin (e.g. every 15 minutes from cron). For every configured Jellyfin user it reads
the movies and episodes marked as played since `since`, maps them to TMDB ids and calls the Supabase function
`integration_add_viewings` with that user's Filmotéka token. Filmotéka skips plays it already has, so running
the script often (or twice) is harmless.

A movie becomes one viewing per day it was last played; episodes become one viewing per series, season and day.
Only the standard library is used.

Usage: jellyfin_sync.py [--config PATH] [--dry-run]
"""

import argparse
import datetime as dt
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_CONFIG = Path.home() / ".config" / "filmoteka" / "jellyfin-sync.json"
PAGE = 200
BATCH = 500


def http_json(url, *, headers=None, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST" if body is not None else "GET")
    req.add_header("Accept", "application/json")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return json.loads(res.read() or b"null")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:300]
        raise RuntimeError(f"{e.code} {url.split('?')[0]}: {detail}") from None


class Jellyfin:
    def __init__(self, url, api_key):
        self.url = url.rstrip("/")
        self.headers = {"Authorization": f'MediaBrowser Token="{api_key}"', "X-Emby-Token": api_key}

    def get(self, path, **params):
        query = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
        return http_json(f"{self.url}{path}?{query}", headers=self.headers)

    def user_id(self, name):
        for user in self.get("/Users"):
            if user["Name"].lower() == name.lower():
                return user["Id"]
        raise RuntimeError(f"Jellyfin user '{name}' not found")

    def played_since(self, user_id, since):
        """Played movies and episodes, newest first, whose last play is on or after `since` (a local date)."""
        start = 0
        while True:
            page = self.get(
                "/Items",
                userId=user_id,
                IsPlayed="true",
                Recursive="true",
                IncludeItemTypes="Movie,Episode",
                SortBy="DatePlayed",
                SortOrder="Descending",
                Fields="ProviderIds",
                EnableUserData="true",
                StartIndex=start,
                Limit=PAGE,
            )
            items = page.get("Items", [])
            for item in items:
                played = local_date(item.get("UserData", {}).get("LastPlayedDate"))
                if played is None:
                    continue
                if played < since:
                    return
                yield item, played
            start += len(items)
            if not items or start >= page.get("TotalRecordCount", 0):
                return

    def provider_ids(self, user_id, item_ids):
        ids = {}
        item_ids = sorted(set(item_ids))
        for i in range(0, len(item_ids), 50):
            page = self.get("/Items", userId=user_id, Ids=",".join(item_ids[i : i + 50]), Fields="ProviderIds")
            for item in page.get("Items", []):
                ids[item["Id"]] = (item.get("ProviderIds") or {}, item.get("Name"), item.get("ProductionYear"))
        return ids


def local_date(iso):
    """Jellyfin dates are UTC ("2026-11-20T19:05:33.1234567Z"); returns the local calendar day."""
    if not iso:
        return None
    ts = dt.datetime.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=dt.timezone.utc)
    return ts.astimezone().date()


def tmdb_id(provider_ids):
    value = next((v for k, v in (provider_ids or {}).items() if k.lower() == "tmdb"), None)
    return int(value) if value and str(value).isdigit() else None


def collect(jf, user_id, since):
    """Turns played items into Filmotéka items; returns (items, skipped titles without a TMDB id)."""
    rows = list(jf.played_since(user_id, since))
    series = jf.provider_ids(user_id, [it["SeriesId"] for it, _ in rows if it.get("Type") == "Episode" and it.get("SeriesId")])
    items, skipped = {}, []
    for it, day in rows:
        if it.get("Type") == "Movie":
            tid = tmdb_id(it.get("ProviderIds"))
            if tid is None:
                skipped.append(it.get("Name", "?"))
                continue
            ref = f"movie:{tid}:{day}"
            items[ref] = {"ref": ref, "media_type": "movie", "tmdb_id": tid, "title": it.get("Name") or str(tid),
                          "release_year": it.get("ProductionYear"), "watched_on": day.isoformat(), "season": None}
        else:
            ids, name, year = series.get(it.get("SeriesId"), ({}, it.get("SeriesName"), None))
            tid = tmdb_id(ids)
            if tid is None:
                skipped.append(it.get("SeriesName") or it.get("Name", "?"))
                continue
            season = it.get("ParentIndexNumber")
            season = season if isinstance(season, int) and season >= 0 else None
            ref = f"tv:{tid}:s{season if season is not None else '-'}:{day}"
            items[ref] = {"ref": ref, "media_type": "tv", "tmdb_id": tid, "title": name or it.get("SeriesName") or str(tid),
                          "release_year": year, "watched_on": day.isoformat(), "season": season}
    return list(items.values()), sorted(set(skipped))


def send(config, token, items):
    """Sends items in batches. With no items it still calls once, which checks the token and records the sync."""
    url = config["supabase_url"].rstrip("/") + "/rest/v1/rpc/integration_add_viewings"
    headers = {"apikey": config["supabase_publishable_key"]}
    added = 0
    for i in range(0, max(len(items), 1), BATCH):
        added += http_json(url, headers=headers, body={"p_token": token, "p_items": items[i : i + BATCH]})
    return added


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--dry-run", action="store_true", help="print what would be sent, send nothing")
    args = parser.parse_args()

    config = json.loads(args.config.read_text(encoding="utf-8"))
    since = dt.date.fromisoformat(config["since"])
    jf = Jellyfin(config["jellyfin_url"], config["jellyfin_api_key"])

    failed = False
    for user in config["users"]:
        name = user["jellyfin_user"]
        try:
            items, skipped = collect(jf, jf.user_id(name), since)
            if args.dry_run:
                print(json.dumps({"user": name, "items": items, "skipped": skipped}, ensure_ascii=False, indent=2))
                continue
            added = send(config, user["token"], items)
            note = f", bez TMDB ID: {', '.join(skipped)}" if skipped else ""
            print(f"{dt.datetime.now():%Y-%m-%d %H:%M} {name}: {len(items)} zhlédnutí, nových {added}{note}")
        except Exception as e:  # keep syncing the other users
            failed = True
            print(f"{dt.datetime.now():%Y-%m-%d %H:%M} {name}: chyba: {e}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
