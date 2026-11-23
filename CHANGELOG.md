# Co je nového

Formát (aplikace ho čte, drž ho přesně): `## <verze> (<YYYY-MM-DD>)`, pod ním odrážky `- `. Nejnovější verze nahoře a musí se shodovat s `MARKETING_VERSION` v `ios/project.yml`, jinak build selže.

## 0.4.0 (2026-11-23)
- Přihlášení a registrace jen jménem a heslem, bez e-mailu.
- Role Správce a Uživatel. Správce zakládá a maže účty, mění hesla a přiděluje roli.
- Nová záložka Nastavení: změna hesla, motiv (světlý, tmavý, podle systému), barva aplikace a vlastní seznam míst „Kde“.
- Tlačítko Uložit je ve formulářích nahoře vpravo.
- Odhlásit je přesunuté do Nastavení.
- Odstraněna funkce Rodina.
- Verze aplikace a historie změn v Nastavení → O aplikaci.

## 0.3.1 (2026-11-22)
- Nová ikona aplikace.
- Opravena neviditelná ikona na tlačítku Přehrát trailer.

## 0.3.0 (2026-11-22)
- Detail titulu jako v Jellyfinu: pozadí, popis, žánry, režie, herci, sezóny a trailer.
- Řazení deníku podle data, hodnocení, názvu, počtu zhlédnutí nebo roku.
- U seriálů jde uložit konkrétní sezónu.
- Nová záložka Kalendář s měsíčním přehledem a časovou osou.
- Nová záložka Chci vidět. Swipem „Viděno“ se titul přesune do deníku.
- Vyhledávání filmů běží přes server, klíč k databázi filmů už není v aplikaci.

## 0.2.0 (2026-11-22)
- Zhlédnutí jde upravit klepnutím v detailu titulu.
- Smazání zhlédnutí se potvrzuje.
- Datum zhlédnutí s přesností na den, měsíc nebo rok.
- „Uložit a přidat další“ pro rychlé zadávání starých filmů. Místo se pamatuje.

## 0.1.0 (2026-11-22)
- První verze: deník zhlédnutí, vyhledávání filmů a seriálů, hodnocení a poznámky.
