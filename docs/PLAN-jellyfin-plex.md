# Plán: automatické zhlédnutí z Jellyfinu a Plexu

Cíl: když film nebo epizodu dokoukáš v Jellyfinu (nebo Plexu), Filmotéka sama zapíše zhlédnutí. Datum je den přehrání, místo „Jellyfin“ / „Plex“, hodnocení a poznámku doplníš později.

## Jde to? Ano, dvěma cestami

| | Jellyfin | Plex |
|---|---|---|
| **Push (server pošle událost sám)** | oficiální plugin **Webhook** (zdarma), událost *Playback Stop* s příznakem dokoukání a ID z TMDB | webhooky jen s **Plex Pass** (placený), událost `media.scrobble` při ~90 % |
| **Pull (Filmotéka se sama ptá)** | REST API s API klíčem: zhlédnuté položky, `LastPlayedDate`, `PlayCount`, ID z TMDB | API s `X-Plex-Token`: historie přehrání, zdarma |

Plán stojí na **push pro Jellyfin**. Plex je druhý krok.

## Architektura

```
Jellyfin (Raspberry Pi) ──webhook POST──▶ https://filmoteka-denik.vercel.app/api/integrations/jellyfin
                                             │ ověří tajný token uživatele
                                             │ najde TMDB ID, sezónu, datum
                                             ▼
                                        Supabase: viewings (service role, user_id z tokenu)
```

Jellyfin na Pi nemusí být vidět z internetu: webhook jde ven z Pi na Vercel. Funnel ani otevřené porty nejsou potřeba.

## Kroky

1. **Databáze (migrace 0006)**
   - Tabulka `integrations`: `user_id`, `provider` (`jellyfin` / `plex`), `token_hash` (náhodný tajný token, uložený jen jako hash), `created_at`, `last_event_at`.
   - Ve `viewings` nové sloupce `source` (`manual` / `jellyfin` / `plex`) a `source_event_id` s unikátním indexem `(user_id, source, source_event_id)`, aby stejná událost nezapsala zhlédnutí dvakrát.
   - RLS: uživatel vidí a maže jen své integrace.
2. **Nastavení → Propojení**
   - Tlačítko „Propojit Jellyfin“ vytvoří token a ukáže **jednou** celou adresu webhooku a návod (kam ji v Jellyfinu vložit, jakou šablonu použít).
   - Možnost propojení zrušit (smaže token).
3. **API route `/api/integrations/jellyfin`**
   - Ověří token (porovná hash), zkontroluje událost *dokoukáno*.
   - Film: TMDB ID z `Provider_tmdb`. Epizoda: TMDB ID seriálu + číslo sezóny.
   - **Seriály:** jedno zhlédnutí na *seriál + sezónu + den*, ne na každou epizodu (jinak by deník zahltily epizody).
   - Název a plakát doplní z TMDB přes stávající Edge Function `tmdb`.
   - Zapíše se service role klíčem na serveru (env `SUPABASE_SERVICE_ROLE_KEY` ve Vercelu).
4. **Šablona webhooku** pro Jellyfin plugin (JSON s `NotificationType`, `PlayedToCompletion`, `ItemType`, `Provider_tmdb`, `SeriesId`, `SeasonNumber`, `UtcTimestamp`) uložená v README.
5. **Jednorázový import historie** (volitelný): skript nebo tlačítko, které přes Jellyfin API načte všechno zhlédnuté a zapíše jedno zhlédnutí na titul s datem `LastPlayedDate`. Jellyfin si pamatuje jen poslední datum a počet přehrání, ne každé zhlédnutí.
6. **Plex** (později): stejný endpoint `/api/integrations/plex` pro Plex Pass webhook; bez Plex Pass malý skript na Pi, který čte historii přes API.

## Otevřené otázky na příště

- Zapisovat i nedokoukané filmy (např. nad 80 %)? Plugin posílá i procento přehrání.
- Seriály: jedno zhlédnutí za den a sezónu, nebo za celou sezónu až po poslední epizodě?
- Má mít Jellyfin víc uživatelů (rodina)? Pak každý člen propojí svůj Jellyfin účet zvlášť, nebo jeden webhook s mapováním Jellyfin uživatel → Filmotéka účet.
- Ověřit na skutečném Jellyfinu na Pi: verzi, nainstalovaný plugin Webhook a co přesně posílá (zachytit jednu událost do logu, než se napíše zpracování).

## Odhad

Jellyfin push + Nastavení + migrace: jedno sezení. Import historie a Plex: každé zvlášť menší sezení.
