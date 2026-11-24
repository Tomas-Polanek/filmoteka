# filmoteka

Rodinná časová kapsle filmů a seriálů: zaznamenáš každé zhlédnutí (kdy, kde, hodnocení, poznámka) a vidíš, kolikrát a naposledy jsi titul viděl. Přihlašuje se čistým uživatelským jménem a heslem (např. `tpolanek`). Každý uživatel má vlastní data (Supabase RLS), deník a „Chci vidět“ nevidí nikdo jiný, ani správce.

Aplikace je postavená v **Next.js (React) jako iOS PWA** – v Safari na iPhonu ji přidáš na plochu (**Sdílet → Přidat na plochu**), běží na celou obrazovku s vlastní ikonou, nikdy nevyprší a nepotřebuje App Store ani Xcode.

Struktura:
- `src/` Next.js (App Router) PWA aplikace + serverové API routy (`/api/tmdb`, `/api/admin`, `/api/keepalive`)
- `public/` PWA manifest a ikony aplikace (`icon.svg`, `icon.png`)
- `supabase/` migrace databáze, testy izolace dat (`npm run test:db`) a Edge Functions `tmdb` a `admin`

---

## 1. Databáze (Supabase)

1. Supabase Dashboard → SQL Editor → postupně vlož obsah každého souboru `supabase/migrations/*.sql` (`0001_init.sql` až `0005_remove_family_add_profiles.sql`) → Run.
2. Authentication → Sign In / Providers → Email: provider nech zapnutý a **„Confirm email“ vypni**. Aplikace se přihlašuje uživatelským jménem; interní e-mail `<jméno>@users.filmoteka.app` se nikde neukazuje.
   Pak v Authentication → Sign In / Providers **vypni „Allow new users to sign up“**. Veřejná registrace v aplikaci není a bez tohoto přepínače by si účet mohl založit kdokoli přímo přes API. Další účty zakládá správce v Nastavení → Účty (funkce `admin` používá service role, na kterou vypnutá registrace nemá vliv).
3. Edge Functions `tmdb` a `admin`:
   ```bash
   supabase secrets set TMDB_TOKEN=eyJ... --project-ref <ref>
   supabase functions deploy tmdb --no-verify-jwt --project-ref <ref>
   supabase functions deploy admin --no-verify-jwt --project-ref <ref>
   ```
   *(Pokud nechceš nasazovat Edge Function `tmdb`, stačí nastavit `TMDB_TOKEN` přímo v proměnných prostředí Next.js aplikace – API route `/api/tmdb` ho použije automaticky jako fallback.)*

---

## 2. Lokální spuštění

1. Zkopíruj `.env.example` do `.env.local` a vyplň URL a publishable klíč ze Supabase:
   ```bash
   cp .env.example .env.local
   npm install
   npm run dev
   ```
2. Otevři `http://localhost:3000`.

---

## 3. Nasazení: Vercel (automatický deploy z GitHubu)

1. Na [vercel.com](https://vercel.com) klikni na **Add New → Project** a vyber GitHub repozitář `Tomas-Polanek/filmoteka`.
2. V sekci **Environment Variables** přidej:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<tvuj-project-ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_...`
   - `TMDB_TOKEN` = `eyJ...` *(volitelný fallback)*
3. Klikni na **Deploy**.
4. Soubor `vercel.json` automaticky nastaví Cron job (`/api/keepalive` každé 4 dny), aby se tvůj Supabase Free projekt po 7 dnech neuspal.

---

## 4. Nasazení: Raspberry Pi + Tailscale Funnel

Pokud chceš aplikaci provozovat přímo na svém **Raspberry Pi** a zpřístupnit ji přes **Tailscale Funnel** (s automatickým HTTPS certifikátem):

1. Na Raspberry Pi naklonuj repozitář, vytvoř `.env.local` a sestav aplikaci:
   ```bash
   git clone https://github.com/Tomas-Polanek/filmoteka.git
   cd filmoteka
   cp .env.example .env.local
   nano .env.local   # vyplň NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, TMDB_TOKEN
   npm install
   npm run build
   ```
2. Spusť aplikaci na portu `3000` (např. přes `pm2` nebo `systemd`):
   ```bash
   npm start
   ```
3. Zapni **Tailscale Funnel** na portu `3000` (poběží na pozadí s HTTPS):
   ```bash
   sudo tailscale funnel --bg 3000
   ```
   Tailscale ti vypíše veřejnou HTTPS adresu `https://<nazev-rpi>.<tvuj-tailnet>.ts.net`, kterou si na iPhonu otevřeš v Safari a dáš **Sdílet → Přidat na plochu**.
   *(Pokud chceš, aby byla aplikace dostupná jen pro zařízení připojená do tvého Tailnetu a ne z veřejného internetu, použij místo `funnel` příkaz `sudo tailscale serve --bg 3000`.)*

---

## 5. Instalace na plochu iPhonu (PWA)

1. Otevři nasazenou HTTPS adresu (z Vercelu nebo Tailscale Funnelu) v **Safari** na iPhonu.
2. Klepni dole na tlačítko **Sdílet** (čtvereček se šipkou nahoru) → **Přidat na plochu** (*Add to Home Screen*).
3. Aplikace se přidá s ikonou Filmoteky a spouští se na celou obrazovku jako nativní iOS aplikace.

---

## 6. Správa účtů a zapomenuté heslo

- **První správce** (jednorázově v Supabase SQL Editoru):
  ```sql
  update public.profiles set role = 'admin' where username = 'tpolanek';
  ```
- **Zapomenuté heslo:** Uživateli nastaví nové heslo správce přímo v aplikaci (**Nastavení → Uživatelé → uživatel → Nastavit heslo**). Zapomene-li heslo poslední správce, nastaví si ho v Supabase SQL Editoru:
  ```sql
  update auth.users
  set encrypted_password = extensions.crypt('nove-heslo', extensions.gen_salt('bf'))
  where email = 'tpolanek@users.filmoteka.app';
  ```
