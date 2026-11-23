# filmoteka

Rodinná časová kapsle filmů a seriálů: zaznamenáš každé zhlédnutí (kdy, kde, hodnocení, poznámka) a vidíš, kolikrát a naposledy jsi titul viděl. Přihlašuje se uživatelským jménem a heslem. Každý uživatel má vlastní data (Supabase RLS), deník a „Chci vidět“ nevidí nikdo jiný, ani správce.

Struktura:
- `supabase/` migrace databáze a test izolace dat (`npm install && npm test`), Edge Functions `tmdb` a `admin`
- `ios/` SwiftUI aplikace (iOS 17+). Sestavuje se jen na Macu.

## 1. Databáze (Supabase)

1. Supabase Dashboard → SQL Editor → postupně vlož obsah každého souboru `supabase/migrations/*.sql` (podle čísla: `0001_init.sql`, `0002_seasons.sql`, `0003_watchlist.sql`, `0004_family.sql`, `0005_remove_family_add_profiles.sql`, …) → Run. Při aktualizaci spusť jen nové migrace (např. `0005_remove_family_add_profiles.sql`: zruší Rodinu, přidá uživatelská jména a role, pak pokračuj krokem 5).
2. Authentication → Sign In / Providers → Email: provider nech zapnutý, **„Confirm email“ vypni** a registraci („Allow new users to sign up“) nech povolenou. Aplikace se přihlašuje uživatelským jménem; e-mail `<jméno>@users.filmoteka.app` je jen interní, žádný e-mail se neposílá a v aplikaci se nikde neukazuje. Se zapnutým potvrzením by se nový účet nikdy nepřihlásil. Minimální délka hesla: 6 znaků (výchozí; aplikace i funkce `admin` vyžadují aspoň 6).
3. Free projekt se po 7 dnech bez aktivity uspí. Obnovení je v dashboardu do jednoho roku.

**Klíče:** do aplikace patří jen `sb_publishable_...` (publishable). Klíč `sb_secret_...` nikdy do aplikace ani do repozitáře. Pokud jsi ho někam vložil (třeba do chatu), vytvoř nový v Settings → API Keys, nahraď ho všude a starý smaž.

## 2. TMDB

1. Založ účet na themoviedb.org, v Settings → API vezmi **API Read Access Token (v4)**. Je to dlouhý JWT řetězec začínající `eyJ`, ne `sb_secret_`.
2. Token drží Edge Function `tmdb` (`supabase/functions/tmdb`), aplikace volá TMDB jen přes ni a jen s přihlášeným uživatelem. Nasazení (Supabase CLI: `brew install supabase/tap/supabase`, `supabase login`):
   ```
   supabase secrets set TMDB_TOKEN=eyJ... --project-ref <ref>
   supabase functions deploy tmdb --no-verify-jwt --project-ref <ref>
   ```
   `--no-verify-jwt`: uživatele ověřuje funkce sama (gateway kontrola nepokrývá nové `sb_publishable_` klíče). Funkce propouští jen cesty a parametry, které aplikace používá. Test: `cd supabase/functions/tmdb && deno test --node-modules-dir=auto -A`.
3. Pro komerční použití TMDB nelze; aplikace je jen pro rodinu.

## 3. iOS aplikace (na Macu)

1. `cp ios/Filmoteka/Config.swift.example ios/Filmoteka/Config.swift`. Soubor je v `.gitignore`. TMDB token do aplikace nepatří, drží ho Edge Function (krok 2).
2. Vytvoř Xcode projekt: buď ručně (File → New → Project → iOS App „Filmoteka“, iOS 17+, přidej SPM balíček `https://github.com/supabase/supabase-swift`, produkt `Supabase`, a přetáhni soubory z `ios/Filmoteka/`), nebo přes XcodeGen:
   ```
   brew install xcodegen
   cd ios && xcodegen
   ```
   (v `project.yml` změň `bundleIdPrefix` na svůj.)
3. Spusť na simulátoru nebo iPhonu.
4. Účet je jen uživatelské jméno + heslo. Záložka „Nastavení“: změna hesla, motiv a barva, vlastní seznam míst („Kde“); správce tam navíc zakládá a maže účty, nastavuje hesla a role (Edge Function `admin`).

## 4. Instalace na iPhone

- Jen pro sebe: zdarma přes Apple ID. Podpis vyprší po 7 dnech, aplikaci pak znovu nainstaluješ z Xcode.
- Pro rodinu: Apple Developer Program (99 USD/rok) a TestFlight. Build na TestFlightu platí 90 dní.

## 5. Účty a role

Migrace `0005_remove_family_add_profiles.sql` přidává tabulku `public.profiles`: uživatelské jméno, role (`admin` nebo `user`) a vlastní seznam míst „Kde“ (`places`, `null` = výchozí seznam aplikace). Profil založí trigger `on_auth_user_created` při registraci podle jména z metadat (nebo z části interního e-mailu před `@`).

- Uživatelské jméno: 3–32 znaků, malá písmena bez diakritiky, číslice, `.`, `_`, `-`; začíná písmenem nebo číslicí. Je jedinečné a nemění se (odvozuje se z něj přihlašovací e-mail).
- Registrace v aplikaci je otevřená, nový účet má roli `user`. Každý mění jen svoje heslo a svůj seznam míst; roli ani jméno si nezmění.
- Správce (`admin`) v aplikaci zakládá a maže účty, nastavuje jim hesla a uděluje/odebírá roli správce. Sám sebe smazat nemůže a poslední správce musí zůstat. Cizí deníky nevidí.
- Správu dělá Edge Function `admin` (`supabase/functions/admin`): ověří volajícího, zkontroluje jeho roli a změny provede se service role klíčem. `SUPABASE_URL` a `SUPABASE_SERVICE_ROLE_KEY` nastavuje Supabase funkcím sám, žádný secret navíc. Nasazení:
  ```
  supabase functions deploy admin --no-verify-jwt --project-ref <ref>
  ```
  `--no-verify-jwt` ze stejného důvodu jako u `tmdb`. Test: `cd supabase/functions/admin && deno test --node-modules-dir=auto -A`.

**První správce** (jednorázově po registraci, SQL Editor):
```sql
update public.profiles set role = 'admin' where username = 'tvoje-jmeno';
```

**Účty založené před `0005`** (s opravdovým e-mailem): migrace jim dala jméno z metadat nebo z části e-mailu před `@` (obsazené nebo krátké dostane číslo, např. `tom1`). Zkontroluj je (`select username, role from public.profiles;`), případně přejmenuj (`update public.profiles set username = 'nove-jmeno' where username = 'tom1';`) a pak je jednorázově převeď na přihlašování jménem:
```sql
update auth.users u
set email = p.username || '@users.filmoteka.app',
    email_confirmed_at = coalesce(u.email_confirmed_at, now())
from public.profiles p
where p.user_id = u.id and u.email not like '%@users.filmoteka.app';

update auth.identities i
set identity_data = i.identity_data || jsonb_build_object('email', u.email)
from auth.users u
where i.user_id = u.id and i.provider = 'email' and u.email like '%@users.filmoteka.app';
```
Pak se přihlásí jménem a dosavadním heslem. Původní e-maily tím z projektu zmizí.

## Known shortcuts

- Měsíc bez dne se ukládá jako 1. den měsíce.
- Seriály se ukládají po sezónách (volitelně), ne po epizodách. Sezóna 0 = speciály.
