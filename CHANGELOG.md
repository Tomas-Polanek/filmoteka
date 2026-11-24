# Co je nového

Formát: `## <verze> (<YYYY-MM-DD>)`, pod ním odrážky `- `. Nejnovější verze nahoře.

## 0.5.5 (2026-11-24)
- Na telefonu už spodní lišta nepřekrývá okno se zhlédnutím, takže je vidět i pole Poznámka.
- Detail filmu se na telefonu otevře nahoře a tlačítko Zpět vrátí deník na místo, kde jste skončili.
- Všechny rozbalovací nabídky (Kde, řazení, rok, měsíc, motiv) mají vlastní vzhled aplikace místo systémového seznamu.

## 0.5.4 (2026-11-24)
- Tlačítko Upravit v detailu filmu nebo seriálu hned vedle Přidat zhlédnutí (upraví poslední zhlédnutí).
- Kulatá zaškrtávací políčka ve stylu aplikace.

## 0.5.3 (2026-11-24)
- Registrace je vypnutá: nové účty zakládá jen správce v Nastavení → Uživatelé.
- Detail titulu je přizpůsobený telefonu: kratší tlačítka v horní liště, menší plakát a název, který se nepřekrývá s obrázkem.
- Mezipaměť filmů na serveru vrací data jen přihlášeným a nemůže neomezeně růst.
- Výběr data zhlédnutí má vlastní kalendář ve stylu aplikace místo strohého systémového okna.
- U každého zhlédnutí je tlačítko s tužkou pro úpravu.

## 0.5.2 (2026-11-24)
- Filmové ambientní pozadí a Liquid Glass vzhled karet, panelů i vlastních posuvníků.
- Vyhledávání podle jména herce nebo režiséra (při přidávání titulu z TMDB i přímo v Deníku).
- Okamžité načítání detailů filmů díky serverové a klientské mezipaměti a přednačítání při najetí myší na plakát.

## 0.5.1 (2026-11-24)
- Responzivní vzhled pro PC i mobil: levý postranní panel (Sidebar) na počítači a plovoucí spodní lišta na telefonu.
- Mřížka velkých plakátů s odznaky hodnocení a počtu zhlédnutí + přepínač Mřížka / Seznam.
- Široký detail titulu s karuselem „Herci a obsazení“ ve stylu Jellyfinu a dvousloupcový Kalendář.

## 0.5.0 (2026-11-24)
- Nová webová a PWA aplikace (Next.js + React) pro iPhone, iPad, Android i počítač (nahrazuje původní Xcode projekt).
- Přidej si Filmoteku v Safari na plochu iPhonu – funguje bez App Storu a bez 7denního vypršení.
- Automatický keep-alive Cron na Vercelu proti 7dennímu uspání Supabase a podpora pro Tailscale Funnel na Raspberry Pi.

## 0.4.1 (2026-11-24)
- Na přihlášení je „Zapomenuté heslo?“ s návodem: správce ti nastaví nové heslo.

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
- Nová záložka Chci vidět. Akcí „Viděno“ se titul přesune do deníku.
- Vyhledávání filmů běží přes server, klíč k databázi filmů už není v aplikaci.

## 0.2.0 (2026-11-22)
- Zhlédnutí jde upravit klepnutím v detailu titulu.
- Smazání zhlédnutí se potvrzuje.
- Datum zhlédnutí s přesností na den, měsíc nebo rok.
- „Uložit a přidat další“ pro rychlé zadávání starých filmů. Místo se pamatuje.

## 0.1.0 (2026-11-22)
- První verze: deník zhlédnutí, vyhledávání filmů a seriálů, hodnocení a poznámky.
