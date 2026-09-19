# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Suliválasztó – a single-page Hungarian dashboard for picking a primary school around Budapest's
XVII. district. Everything (52 schools, travel-time model, map, scoring, sync) lives in `index.html`.

Nyelv: the UI, data and comments are Hungarian. Keep new user-facing strings and code comments in Hungarian.

## Build / run / test

There is no build step, package manager, test suite or linter. `index.html` is the deliverable.

- Run locally: open `index.html` in a browser, or `python -m http.server` then `http://localhost:8000`.
  A plain `file://` open works for everything except Firebase login (needs an authorized domain).
- Deploy: push to `main`; GitHub Pages serves `/` from the repo root.
- Verify changes by exercising the UI (list / térkép / összevetés views, drawer, share code, CSV) —
  there is nothing to run automatically.

## Architecture of `index.html`

Four parts, in file order:

1. `<style>` – design tokens on `:root`, dark mode via `prefers-color-scheme` plus a
   `[data-theme]` override. Use the existing CSS variables (`--accent`, `--ink-2`, `--s1..--s6`, …)
   rather than literal colors.
2. `CATALOG` (~line 317) – the 52 built-in schools as compact literals:
   `id, n` (név), `a` (cím), `d` (kerület/település), `sd` (városrész), `o` (fenntartó: `t`
   tankerületi / `e` egyházi / `a` alapítványi / `n` nemzetiségi), `lat/lon`, `w` (weboldal),
   `p` (profil), `rd` (OSRM road distance, metres), `ff` (free-flow drive time, seconds).
   `rd`/`ff` are measured from the OSM centroid of Rákoskert — the same point as `DEF.home` —
   so they encode no private location. Recompute both together if that origin ever changes.
   `CATALOG` is read-only reference data; user input never mutates it.
3. Main IIFE (`"use strict"`) – the whole app, no framework, no build. Renders by string
   concatenation into `innerHTML` and delegates events from `document`.
4. ES module at the bottom – Firebase v12 (ESM CDN), exposed as `window.FB` and handed to the
   IIFE through `window.__fbReady`. The IIFE must work when this module fails to load.

### State model

Two objects, deliberately separate:

- `settings` – `home` (lat/lon/label; the default is a neighbourhood-level point by design —
  never commit a real street address, it belongs in Firestore behind login), `w` (weights: `res`, `dst`, `fit`, `soft`, 0–5),
  `maxMin`, `showScore`. Schema version `v:2`; `loadLocal()` resets `home` on a version mismatch.
- `recs[id]` – the user's per-school record layered on top of `CATALOG`: `status`
  (`short`/`out`/`none`), `zoned`, `kMat`, `kSzo`, `gimn`, `classSize`, `lang`, `fit`,
  `soft{teach,vibe,build,after,food}`, `openDay`, `note`, `distO`, `tt` (manual travel-time
  overrides keyed `mode_slot`), `hidden`, and `base` for user-added schools.

`ui` holds only ephemeral view state (view, query, filters, sort, selection, `slot`) and is not persisted.

Persistence is write-through: any mutation calls `setField()` → `persist(id)` (or `persistSettings()`),
which writes `localStorage["sulivalaszto.v1"]` immediately and debounces a Firestore write (350/400 ms).
Never write `localStorage` or Firestore directly from a handler.

### Derived values

Nothing is cached — `scores(s)`, `travel()`, `visible()`, `ranked()` recompute on every render, and
`renderAll()` re-renders the active view wholesale. Keep it that way; it is fast enough at this size.

- `roadKm` prefers `recs.distO` → `settings.route[id]` → `CATALOG.rd` (only while the home is
  still the default point) → haversine × 1.35. `freeMin` follows the same order for duration.
  `settings.route` is an OSRM table (`{id: [metres, seconds]}`) recomputed by `refreshRoutes()`
  whenever the home moves, tagged with `settings.routeFor` = `homeKey()` so a stale table is
  ignored wholesale rather than mixed with fresh data. The `CATALOG.rd`/`ff` values are only
  valid for the default home — never use them unconditionally.
- `travel(s, mode, slot)` for `bike`/`car`/`bkv` × `am`/`pm`: a manual `tt` override wins, otherwise
  the model (car = free-flow `ff` × peak multiplier `CARF`; bike and bkv are modelled estimates).
  Rows show a `.own` marker when an override is in effect.
- `scores()` produces `res/dst/fit/soft` sub-scores plus a weighted `total` and `cov`
  (data coverage). Missing inputs are `null` and drop out of the weighting — they lower `cov`,
  never `total`. Preserve that property when touching scoring.
- The map is inline SVG built in `renderMap()` with a local equirectangular projection centred on
  `settings.home` — no tiles, no map library.

### Sync

Firestore path `haztartas/fo/{iskolak/<id>, beallitasok/app}` (`HOUSEHOLD = "fo"` — one shared
household, not per-user). `onSnapshot` listeners overwrite `recs` wholesale, except ids still in
`pending` (a local write in flight). On the first snapshot, an empty cloud plus non-empty local data
triggers an upload instead of a wipe. Access is restricted by Firestore rules to an allow-list of
e-mail addresses; the `apiKey` in the file is public by design.

The share code (`exportCode`/`importCode`, `SULI1:` lz-string or `SULI0:` base64 fallback) is an
independent transfer path and must keep working without Firebase.

### External dependencies

Google Fonts, `lz-string` (cdnjs), the Firebase ESM CDN, Nominatim (address search, on button press
only — never as-you-type, per its 1 req/s policy) and the OSRM demo server (one `table` request per
home change, all schools in a single call). All are optional — the page must stay usable when any of
them is blocked; the routing fallback is a haversine estimate that the setup panel flags as such.
Don't add dependencies that break that.

## Known issues

- `index.html:935` and `index.html:943` (delete a custom school, "Minden saját adat törlése") call an
  undeclared `db` with the old Firebase compat API (`db.doc("schools/"+id)`). Under `"use strict"`
  this throws a `ReferenceError` and the cloud-side delete never happens. Use `SYNC.deleteSchool(id)` /
  `SYNC.saveSettings(...)` when fixing.
- `README.md` documents a `firestore.rules` file that is not in the repo; the rules live only in the
  Firebase console.
