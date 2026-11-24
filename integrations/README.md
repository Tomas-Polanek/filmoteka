# Jellyfin → Filmotéka

Dokoukané filmy a epizody z Jellyfinu se samy zapíšou do deníku s místem „Jellyfin“. Skript `jellyfin_sync.py` běží na počítači s Jellyfinem (např. Raspberry Pi) a každých 15 minut pošle nová zhlédnutí do Filmotéky. Jellyfin nemusí být vidět z internetu, skript posílá data jen ven.

- **Film:** jedno zhlédnutí za den, kdy jsi ho naposledy dokoukal.
- **Seriál:** jedno zhlédnutí za seriál, sezónu a den.
- Plakát a český název doplní Filmotéka z TMDB při dalším otevření deníku. Hodnocení a poznámku doplníš sám.
- Stejné zhlédnutí se nikdy nezapíše dvakrát, skript můžeš spustit kolikrát chceš.

## Nastavení (jednou)

1. **Databáze:** v Supabase SQL Editoru spusť `supabase/migrations/0006_integrations.sql` a `0007_integrations_admin.sql`.
2. **Klíč do Filmotéky:** v aplikaci **Nastavení → Propojení → Jellyfin → Propojit Jellyfin** a klíč si zkopíruj. Ukáže se jen jednou (kdyžtak vytvoř nový). Správce může klíč vytvořit i za ostatní v **Nastavení → Uživatelé → uživatel → Jellyfin**.
3. **API klíč Jellyfinu:** Jellyfin → Ovládací panel → **Klíče API** → `+` → název `Filmotéka`.
4. **Skript na Pi:** zkopíruj složku `integrations/` z repozitáře na Pi (z počítače s repozitářem):
   ```bash
   ssh pi 'mkdir -p ~/filmoteka ~/.config/filmoteka'
   scp integrations/jellyfin_sync.py pi:~/filmoteka/
   scp integrations/jellyfin-sync.example.json pi:~/.config/filmoteka/jellyfin-sync.json
   ssh pi 'chmod 600 ~/.config/filmoteka/jellyfin-sync.json'
   ```
   Pak na Pi doplň `~/.config/filmoteka/jellyfin-sync.json`:
   ```json
   {
     "jellyfin_url": "http://127.0.0.1:8096",
     "jellyfin_api_key": "API klíč z Jellyfinu",
     "supabase_url": "https://<project-ref>.supabase.co",
     "supabase_publishable_key": "sb_publishable_...",
     "since": "2026-11-25",
     "users": [
       { "jellyfin_user": "tomas", "token": "klíč z Filmotéky" }
     ]
   }
   ```
   - `since`: od kterého dne zhlédnutí posílat. Dej dnešek, nebo starší datum pro jednorázový import historie (Jellyfin si u každého titulu pamatuje jen poslední datum přehrání).
   - `users`: každý člen rodiny má svůj Jellyfin účet a svůj klíč z Filmotéky.
5. **Zkouška nanečisto** (nic neodešle, jen vypíše):
   ```bash
   python3 ~/filmoteka/jellyfin_sync.py --dry-run
   ```
6. **Každých 15 minut** (`crontab -e`):
   ```
   */15 * * * * python3 $HOME/filmoteka/jellyfin_sync.py >> $HOME/filmoteka/sync.log 2>&1
   ```

V aplikaci pak v **Nastavení → Propojení** uvidíš čas poslední synchronizace.

## Zrušení

Nastavení → Propojení → **Zrušit propojení** (klíč přestane platit) a smaž řádek z `crontab -e`. Už zapsaná zhlédnutí v deníku zůstanou.
