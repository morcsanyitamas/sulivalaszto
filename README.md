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

## Az adatok eredete

- Iskolanevek, címek, fenntartók, profilok: tankerületi intézménylisták, önkormányzati oldalak, iskolai honlapok (2026. szeptemberi állapot)
- Közúti távolság és szabad forgalmú menetidő: OSRM útvonaltervezés az OpenStreetMap úthálózatán,
  a Rákoskert városrész OSM-középpontjából mint kiindulópontból
- Csúcsidei szorzók: TomTom Traffic Index, Budapest, 2025
- Bicikli és BKV menetidő: modellezett becslés (±15%, illetve ±30%) – a rövidlistásoknál érdemes visszaellenőrizni és beírni a valódit
