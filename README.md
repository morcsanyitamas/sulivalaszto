# Suliválasztó – Rákosmente és környéke

Általános iskola választását segítő egyoldalas dashboard: 57 iskola a XVII., XVI., XVIII., XIX., X. és II. kerületből,
Pécelről, Ecserről, Maglódról, Vecsésről és Gödöllőről – menetidőkkel, pontozással, térképnézettel.

## Közzététel GitHub Pages-en

1. Új repó a GitHubon (publikus, ha ingyenes fiókod van).
2. Töltsd fel az `index.html` fájlt (a repó főoldalán az **Add file → Upload files** működik, nem kell git).
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch: `main`, mappa: `/ (root)`, **Save**.
4. 1–2 perc múlva él: `https://<felhasznalonev>.github.io/<repo-nev>/`

## Adatkezelés és szinkron

Belépés nélkül az oldal semmit nem küld sehová: amit beírsz, a böngésződ `localStorage`-ában marad.

A kitett fájlban nincs személyes adat. Az alapértelmezett otthon városrész-szintű pont
(Rákoskert, Budapest XVII.), és a menetidők is ehhez készültek – konkrét lakcím csak
bejelentkezés után, a Firestore-ból jön, az **Otthon & súlyok** alatt. Ha lakcímet írsz be,
azt bejelentkezve tedd, hogy a felhőbe kerüljön és ne csak ebben a böngészőben létezzen.

A pontos címet az **Otthon & súlyok** panelben add meg: beírod, megkeresed, kiválasztod a
találatot. Ilyenkor az oldal egyetlen kéréssel újraszámolja mind az 57 iskola közúti távját és
menetidejét az új pontról (OSRM), tehát nem csak a térkép mozdul el, hanem minden szám. Belépve
ez a cím és a hozzá tartozó útvonaltábla a közös adatbázisba kerül, tehát mindketten ugyanahhoz
a ponthoz mért adatokat látjátok.

Ha az útvonaltervező épp nem érhető el, a közúti táv légvonalból becsült érték – ezt a panel ki
is írja, és az **Útvonalak frissítése** gombbal bármikor újrapróbálható.

Belépve (Google-fiók vagy e-mailes link) az adatok a `rakosmente-suli` Firestore adatbázisba
mentődnek, és minden eszközön ugyanaz látszik. A hozzáférést a `firestore.rules` fájlban felsorolt
e-mail címek korlátozzák – a szabály a Google szerverén fut, nem megkerülhető.

Az `index.html`-ben szereplő Firebase `apiKey` **szándékosan nyilvános**: a projektet azonosítja,
nem ad hozzáférést. A védelmet a Security Rules adja.
[Firebase dokumentáció](https://firebase.google.com/docs/projects/api-keys)

Az adatok CSV-ként bármikor kimenthetők az **Otthon & súlyok** panel *Adatok* szakaszából.

## Firebase beállítás

1. Firestore Database → production mode, `europe-west3`
2. Rules fül → a `firestore.rules` tartalmának bemásolása, a második e-mail cím kitöltve → Publish
3. Authentication → Sign-in method → **csak Google** bekapcsolva (az Email link maradjon kikapcsolva)
4. Authentication → Settings → **Authorized domains** → `<felhasznalonev>.github.io` hozzáadása
   (enélkül a belépés `auth/unauthorized-domain` hibával áll meg)

## Külső hivatkozások

Az oldal egy dolgot tölt be CDN-ről, az is opcionális:

- Google Fonts (Bricolage Grotesque, Source Sans 3, IBM Plex Mono) – ha nem érhető el, rendszerbetűvel jelenik meg

Ezen kívül két szolgáltatást hív, de csak akkor, ha címet állítasz be – magától egyik sem fut:

- **Nominatim** (OpenStreetMap címkereső): a beírt címet elküldi, és koordinátát ad vissza
- **OSRM** (útvonaltervező): az új otthonhoz újraszámolja az 57 iskola közúti távját

Ha bármelyik nem érhető el, a koordináta kézzel is megadható, a távolság pedig légvonalas
becslésre vált – az oldal használható marad, csak pontatlanabb, és ezt jelzi is.

Minden más – az 57 iskola adatai, a menetidő-modell, a térkép, a teljes logika – benne van az `index.html`-ben.

## Nyíltnap-kereső

Egy GitHub Actions workflow (`.github/workflows/nyiltnap.yml`) minden reggel lefuttatja a
`tools/nyiltnap.mjs` scriptet. Ez végignézi az iskolák honlapját (a kezdőlapot és a hírek,
felvételi, leendő elsősök jellegű aloldalakat), nyílt napra, iskolakóstolgatóra stb. utaló,
dátummal ellátott említéseket keres, és az eredményt a `nyiltnap.json` fájlba írja. Az oldal ezt
betölti: a listában szaggatott keretes „nyílt nap?” címke jelzi a találatot, az adatlapon pedig
látszik, hogy a kereső figyeli-e az iskolát, mit talált, és az **Átveszem** gombbal a dátum a
saját adatok közé írható.

- A felső összesítőben a **„N nyílt nap közeleg”** link (vagy a **Nyílt napok** nézetgomb) egy listát
  nyit: dátum, iskola, forráslink, hónapok szerint csoportosítva – a kereső találatai és a kézzel
  beírt nyílt napok együtt. A kihúzott és eltüntetett iskolák nem számítanak; a *Rövidlista* kapcsolóval
  csak a rövidlistások látszanak. Sorra kattintva nyílik az adatlap.
- **Helyi gépről is fut** a GitHub mellett: több iskolai honlap a GitHub szervereiről nem érhető el
  (időtúllépés, 403), magyar otthoni netről igen. `tools/nyiltnap-helyi.ps1` egy külön klónban
  (`%LOCALAPPDATA%\sulivalaszto-nyiltnap`) lefuttatja a keresőt, és ha változott, commitol és pushol –
  a fejlesztői munkapéldányhoz nem nyúl. Ütemezés (egyszer): `powershell -ExecutionPolicy Bypass -File
  tools\nyiltnap-utemezes.ps1` → naponta 7:30, kikapcsolt gépnél a következő induláskor pótolja.
  Napló: `%LOCALAPPDATA%\sulivalaszto-nyiltnap.log`. Törlés: ugyanez `-Remove` kapcsolóval.
- Kézi futtatás: GitHub → Actions → Nyíltnap-kereső → Run workflow, vagy helyben
  `node tools/nyiltnap.mjs` (csak egy-két iskola, fájlírás nélkül: `node tools/nyiltnap.mjs c03 c46`).
- Facebookot nem figyel (belépés nélkül nem olvasható), és a képként feltett plakátot sem látja.
- Ahol a honlap tartalmát JavaScript tölti be, ott a kereső nem tud olvasni – az adatlap ezt kiírja.
  Ha egy ilyen oldalnak van közvetlenül olvasható aloldala, a script `EXTRA` táblájába felvehető.

## Az adatok eredete

- Iskolanevek, címek, fenntartók, profilok: tankerületi intézménylisták, önkormányzati oldalak, iskolai honlapok (2026. szeptemberi állapot)
- Közúti távolság és szabad forgalmú menetidő: OSRM útvonaltervezés az OpenStreetMap úthálózatán,
  a Rákoskert városrész OSM-középpontjából mint kiindulópontból
- Csúcsidei szorzók: TomTom Traffic Index, Budapest, 2025
- Bicikli és BKV menetidő: modellezett becslés (±15%, illetve ±30%) – a rövidlistásoknál érdemes visszaellenőrizni és beírni a valódit
