# kinolog

Rodinná časová kapsle filmů a seriálů: zaznamenáš každé zhlédnutí (kdy, kde, hodnocení, poznámka) a vidíš, kolikrát a naposledy jsi titul viděl. Každý uživatel má vlastní data (Supabase RLS).

Struktura:
- `supabase/` migrace databáze a test izolace dat (`npm install && npm test`)
- `ios/` SwiftUI aplikace (iOS 17+). Sestavuje se jen na Macu.

## 1. Databáze (Supabase)

1. Supabase Dashboard → SQL Editor → vlož obsah `supabase/migrations/0001_init.sql` → Run.
2. Auth → Providers → Email: nech "Confirm email" zapnuté, nebo ho vypni, ať se nový uživatel může přihlásit hned.
3. Pozor na e-maily: vestavěný odesílatel posílá jen 2 e-maily za hodinu a jen na členy týmu. Před pozváním rodiny nastav vlastní SMTP (Auth → SMTP settings).
4. Free projekt se po 7 dnech bez aktivity uspí. Obnovení je v dashboardu do jednoho roku.

**Klíče:** do aplikace patří jen `sb_publishable_...` (publishable). Klíč `sb_secret_...` nikdy do aplikace ani do repozitáře. Pokud jsi ho někam vložil (třeba do chatu), vytvoř nový v Settings → API Keys, nahraď ho všude a starý smaž.

## 2. TMDB

1. Založ účet na themoviedb.org, v Settings → API vezmi **API Read Access Token (v4)**. Je to dlouhý JWT řetězec začínající `eyJ`, ne `sb_secret_`.
2. Atribuce: aplikace musí zobrazovat text „This application uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.“ a logo TMDB (je v dokumentaci TMDB).
3. Pro komerční použití TMDB nelze; aplikace je jen pro rodinu.

## 3. iOS aplikace (na Macu)

1. `cp ios/Kinolog/Config.swift.example ios/Kinolog/Config.swift` a doplň `tmdbToken`. Soubor je v `.gitignore`.
2. Vytvoř Xcode projekt: buď ručně (File → New → Project → iOS App „Kinolog“, iOS 17+, přidej SPM balíček `https://github.com/supabase/supabase-swift`, produkt `Supabase`, a přetáhni soubory z `ios/Kinolog/`), nebo přes XcodeGen:
   ```
   brew install xcodegen
   cd ios && xcodegen
   ```
   (v `project.yml` změň `bundleIdPrefix` na svůj.)
3. Spusť na simulátoru nebo iPhonu.

## 4. Instalace na iPhone

- Jen pro sebe: zdarma přes Apple ID. Podpis vyprší po 7 dnech, aplikaci pak znovu nainstaluješ z Xcode.
- Pro rodinu: Apple Developer Program (99 USD/rok) a TestFlight. Build na TestFlightu platí 90 dní.

## Known shortcuts

- TMDB token je v aplikaci. Pro rodinu v pohodě; před jakoukoli veřejnou distribucí přesunout volání TMDB do Supabase Edge Function.
- Měsíc bez dne se ukládá jako 1. den měsíce.
- Seriály se ukládají jako celek, ne po epizodách. Sezónu napiš do poznámky.
