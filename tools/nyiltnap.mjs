// Nyíltnap-kereső: végignézi a CATALOG iskoláinak honlapját, és nyílt napra utaló,
// dátummal ellátott említéseket keres. Az eredmény a repó gyökerébe kerül (nyiltnap.json),
// amit az index.html opcionálisan betölt. Függőség nélküli, Node 20+.
//
//   node tools/nyiltnap.mjs            – minden iskola
//   node tools/nyiltnap.mjs c03 c21    – csak a megadottak (teszteléshez; ilyenkor nem ír fájlt)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Csak nyilvános oldalak szövegét olvassuk; több iskolai honlap tanúsítványa lejárt
// vagy hiányos láncú, ezek miatt ne essen ki a figyelésből.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
process.removeAllListeners("warning");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "nyiltnap.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const MAX_PAGES = 10;     // iskolánként ennyi oldalt nézünk meg a kezdőlapon felül
const TIMEOUT = 20000;
const PARALLEL = 6;

/* Ahol a kezdőlap JavaScripttel tölti be a tartalmat, itt adhatók meg a közvetlenül
   olvasható aloldalak (a honlaphoz képest relatívan). */
const EXTRA = {
  c21: ["aktualis.htm"],
};

/* ---------- katalógus az index.html-ből ---------- */
function loadCatalog() {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const m = html.match(/const CATALOG = (\[[\s\S]*?\n\]);/);
  if (!m) throw new Error("CATALOG nem található az index.html-ben");
  return new Function("return " + m[1])();
}

/* ---------- szövegkezelés ---------- */
// Ékezetek levétele karakterenként, hogy a pozíciók egyezzenek az eredeti szöveggel.
const FOLD = { á: "a", é: "e", í: "i", ó: "o", ö: "o", ő: "o", ú: "u", ü: "u", ű: "u" };
const fold = (s) => s.toLowerCase().replace(/[áéíóöőúüű]/g, (c) => FOLD[c]);

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  hellip: "…", bdquo: "„", rdquo: "”", ldquo: "“", raquo: "»", laquo: "«",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", ouml: "ö", odblac: "ő", uacute: "ú", uuml: "ü", udblac: "ű",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Ouml: "Ö", Odblac: "Ő", Uacute: "Ú", Uuml: "Ü", Udblac: "Ű" };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(n); } catch { return " "; }
    }
    return ENT[e] ?? all;
  });
}
function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/article|\/section)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\r\f\v ]+/g, " ")
    .replace(/ *\n[ \n]*/g, "\n")
    .trim();
}
// RSS/Atom: a bejegyzések szövege CDATA-ban vagy escape-elve van benne.
function feedToText(xml) {
  return htmlToText(
    xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c) => c)
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  );
}

/* ---------- letöltés ---------- */
async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctl.signal, redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                 "Accept-Language": "hu-HU,hu;q=0.9,en;q=0.5" },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const ctype = res.headers.get("content-type") || "";
    let cs = (ctype.match(/charset=([\w-]+)/i) || [])[1];
    if (!cs) cs = (buf.subarray(0, 2048).toString("latin1").match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
    let body;
    try { body = new TextDecoder((cs || "utf-8").toLowerCase()).decode(buf); }
    catch { body = buf.toString("utf8"); }
    return { ok: res.ok, status: res.status, url: res.url, ctype, body };
  } finally {
    clearTimeout(t);
  }
}
function errText(e) {
  const c = e?.cause?.code || e?.code || "";
  if (e?.name === "AbortError") return "időtúllépés";
  if (c === "ENOTFOUND" || c === "EAI_AGAIN") return "a domain nem létezik";
  if (c === "ECONNREFUSED") return "a szerver elutasította a kapcsolatot";
  return (c || e?.message || "ismeretlen hiba").toString().slice(0, 80);
}

/* ---------- linkek ---------- */
// Olyan aloldalak, ahol nyílt nap vagy friss hír lehet.
const LINK_HOT = /nyilt|nyitott|kostolgat|nyitogat|leendo|elsos|beirat|beirk|felvetel|ovisuli|suli-?vado|iskolavado|ismerked/;
const LINK_NEWS = /hir|aktualis|esemeny|naptar|programok|kozlemeny|uzenofal|news|blog|bejegyz/;
const SKIP = /\.(pdf|jpe?g|png|gif|webp|docx?|xlsx?|pptx?|zip|mp4)(\?|$)|facebook\.|instagram\.|youtube\.|e-kreta|kreta\.hu|google\.|mailto:|tel:|javascript:|#$/i;

function links(html, base) {
  const out = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  const host = new URL(base).hostname.replace(/^www\./, "");
  while ((m = re.exec(html))) {
    let u;
    try { u = new URL(decodeEntities(m[1]), base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || SKIP.test(u.href)) continue;
    if (u.hostname.replace(/^www\./, "") !== host) continue;
    u.hash = "";
    const label = fold(htmlToText(m[2]) + " " + decodeURIComponent(u.pathname + u.search));
    const score = LINK_HOT.test(label) ? 2 : LINK_NEWS.test(label) ? 1 : 0;
    if (score) out.push({ url: u.href, score });
  }
  const seen = new Set();
  return out.sort((a, b) => b.score - a.score).filter((l) => !seen.has(l.url) && seen.add(l.url));
}

/* ---------- dátumok ---------- */
const MONTHS = ["januar", "februar", "marcius", "aprilis", "majus", "junius", "julius", "augusztus", "szeptember", "oktober", "november", "december"];
const MON_RE = "(jan|feb|marc|apr|maj|jun|jul|aug|szept|szep|okt|nov|dec)[a-z]*\\.?";
const monthOf = (w) => MONTHS.findIndex((m) => m.startsWith(w.replace(/\.$/, "").slice(0, 3))) + 1;

// A tanév, amire a nyílt napok vonatkoznak: augusztustól a következő nyárig.
function seasonYear(month, today) {
  const start = today.getMonth() + 1 >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  return month >= 7 ? start : start + 1;
}
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// A szöveg (ékezet nélküli, kisbetűs) összes dátuma, pozícióval.
function findDates(f, today) {
  const res = [];
  const add = (idx, len, y, mo, d) => {
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return;
    const guessed = !y;
    if (!y) {
      // Évszám nélküli dátumnál az előtte legutóbb említett évszám dönt: egy régi tanévről
      // szóló hírben ("2023/2024", "2025.") a dátum nem az idei szezoné.
      const ys = [...f.slice(Math.max(0, idx - 400), idx).matchAll(/\b(20\d\d)(?:\s*[/-]\s*(?:20)?(\d\d))?\b/g)];
      const last = ys.length ? ys[ys.length - 1] : null;
      const lastYear = last ? (last[2] ? 2000 + +last[2] : +last[1]) : null;
      if (lastYear && lastYear < seasonYear(8, today)) return;
      y = seasonYear(mo, today);
    }
    if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCMonth() !== mo - 1) return;
    res.push({ idx, len, date: iso(y, mo, d), guessed });
  };
  let m;
  // 2026. november 12. / 2026. nov. 12 / november 12-én
  const r1 = new RegExp(`(?:\\b(20\\d\\d)\\.?\\s*)?\\b${MON_RE}\\s*(\\d{1,2})\\b`, "g");
  while ((m = r1.exec(f))) add(m.index, m[0].length, m[1] && +m[1], monthOf(m[2]), +m[3]);
  // 2026.11.12. / 2026. 11. 12. / 2026-11-12
  const r2 = /\b(20\d\d)\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\b/g;
  while ((m = r2.exec(f))) add(m.index, m[0].length, +m[1], +m[2], +m[3]);
  // 12.11.2026 – ritka, de előfordul
  const r3 = /(?<![\d.])(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d\d)\b/g;
  while ((m = r3.exec(f))) add(m.index, m[0].length, +m[3], +m[2], +m[1]);
  return res.sort((a, b) => a.idx - b.idx);
}

/* ---------- találatok ---------- */
const KW = /nyilt\s*(nap|ora|oraj|het|foglalkoz|tanitas|iskola|delutan|reggel)|nyitott\s*(nap|ora|kapu)|iskolakostolgat|iskolanyitogat|iskolacsalogat|suli-?kostolgat|suli-?csalogat|suliv[ao]r[ao]|iskolavar[ao]|ismerkedo\s*(foglalkoz|delutan|nap|est)|leendo\s*(elso|elsos|1\.)|ovisuli|ovis\s*foglalkoz|iskolaelokeszit/g;
const WINDOW = 220;

function hitsIn(text, url, today) {
  const f = fold(text);
  const out = [];
  let mentions = 0;
  const lo = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  const hi = new Date(today.getTime() + 300 * 86400000).toISOString().slice(0, 10);
  // évszám nélküli dátumot csak közeli időpontként fogadunk el – a távoli inkább tavalyi
  const hiGuess = new Date(today.getTime() + 150 * 86400000).toISOString().slice(0, 10);
  const dates = findDates(f, today);
  KW.lastIndex = 0;
  let m;
  while ((m = KW.exec(f))) {
    mentions++;
    const a = m.index - WINDOW, b = m.index + m[0].length + WINDOW;
    for (const d of dates) {
      if (d.idx < a || d.idx > b) continue;
      if (d.date < lo || d.date > (d.guessed ? hiGuess : hi)) continue;
      // a dátum és a kulcsszó ne legyen külön bekezdésben, ha messze vannak
      const between = f.slice(Math.min(d.idx, m.index), Math.max(d.idx, m.index));
      if ((between.match(/\n/g) || []).length > 3) continue;
      const tail = f.slice(d.idx + d.len, d.idx + d.len + 40);
      // időszak határa ("… december 31. közötti", "… 31-ig") nem esemény
      if (/^[^\n]{0,6}(kozott|-?ig\b)/.test(tail)) continue;
      // időpont 7 és 20 óra között: "16:30", "16.30" vagy "17 órakor"
      const tm = tail.match(/^[^\n]{0,25}?(?<![\d.])(0?[7-9]|1\d|20)[:.]([0-5]\d)(?![.\d])/) ||
                 tail.match(/^[^\n]{0,25}?(?<![\d.])(0?[7-9]|1\d|20)\s*(?:ora|orakor|oratol)/);
      // a kivonat a dátum körül: abból látszik, mire vonatkozik
      const s0 = Math.max(0, d.idx - 100);
      const s1 = Math.min(text.length, d.idx + d.len + 140);
      out.push({
        date: d.date,
        time: tm ? `${tm[1].padStart(2, "0")}:${tm[2] && /^\d/.test(tm[2]) ? tm[2] : "00"}` : null,
        text: (s0 > 0 ? "…" : "") + text.slice(s0, s1).replace(/\s+/g, " ").trim() + (s1 < text.length ? "…" : ""),
        url,
      });
    }
  }
  return { hits: out, mentions };
}

/* ---------- egy iskola ---------- */
async function scanSchool(s, today) {
  const r = { st: "aktiv", url: s.w || null, pages: 0, hits: [], rel: [] };
  if (!s.w) return { ...r, st: "nincs", why: "nincs ismert honlap" };
  let home;
  try { home = await get(s.w); }
  catch (e) { return { ...r, st: "hiba", why: errText(e) }; }
  if (!home.ok) return { ...r, st: "hiba", why: `HTTP ${home.status}` };
  r.url = home.url;
  const homeText = htmlToText(home.body);

  const queue = links(home.body, home.url).slice(0, MAX_PAGES);
  for (const p of EXTRA[s.id] || []) queue.unshift({ url: new URL(p, home.url).href, score: 2 });
  if (/wp-content|wp-json/.test(home.body)) queue.unshift({ url: new URL("/feed/", home.url).href, score: 1, feed: true });

  const texts = [{ url: home.url, text: homeText }];
  for (const l of queue.slice(0, MAX_PAGES)) {
    try {
      const p = await get(l.url);
      if (!p.ok || !/html|xml|text/i.test(p.ctype)) continue;
      const t = l.feed || /xml/.test(p.ctype) ? feedToText(p.body) : htmlToText(p.body);
      texts.push({ url: l.feed ? home.url : p.url, text: t });
    } catch { /* egy aloldal hibája nem baj */ }
  }
  r.pages = texts.length;

  const total = texts.reduce((n, t) => n + t.text.length, 0);
  if (total < 600) return { ...r, st: "js", why: "a tartalmat JavaScript tölti be, szövegként nem olvasható" };

  const seen = new Set();
  for (const t of texts) {
    const { hits, mentions } = hitsIn(t.text, t.url, today);
    if (mentions && t.url !== home.url) r.rel.push(t.url);
    for (const h of hits) {
      const k = h.date + "|" + (h.time || "");
      if (seen.has(k)) continue;
      seen.add(k);
      r.hits.push(h);
    }
  }
  // ha egy napra időponttal is van találat, az időpont nélkülit elhagyjuk
  const timed = new Set(r.hits.filter((h) => h.time).map((h) => h.date));
  r.hits = r.hits.filter((h) => h.time || !timed.has(h.date));
  r.hits.sort((a, b) => a.date.localeCompare(b.date));
  r.hits = r.hits.slice(0, 8);
  r.rel = [...new Set(r.rel)].slice(0, 3);
  return r;
}

/* ---------- futtatás ---------- */
async function main() {
  const only = process.argv.slice(2);
  const today = new Date();
  const cat = loadCatalog().filter((s) => !only.length || only.includes(s.id));
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { s: {} };
  const out = {};
  let i = 0;
  async function worker() {
    while (i < cat.length) {
      const s = cat[i++];
      const r = await scanSchool(s, today);
      // Az első észlelés napját megőrizzük, így a felület jelezheti az új találatot.
      const old = Object.fromEntries((prev.s[s.id]?.hits || []).map((h) => [h.date + "|" + (h.time || ""), h.found]));
      const now = today.toISOString().slice(0, 10);
      r.hits.forEach((h) => { h.found = old[h.date + "|" + (h.time || "")] || now; });
      const p = prev.s[s.id];
      if (r.st === "aktiv") r.okAt = now;
      else if (p && p.st === "aktiv" && r.st !== "nincs") {
        // Átmeneti hiba vagy blokkolás (pl. a GitHub szerveréről nem elérhető oldal): a legutóbbi
        // sikeres eredményt megtartjuk, csak jelöljük, hogy most nem sikerült frissíteni.
        out[s.id] = { ...p, okAt: p.okAt || (prev.gen || "").slice(0, 10), stale: r.why };
        console.log(`! ${s.id} ${s.n.slice(0, 48).padEnd(48)} ${r.why} – a ${out[s.id].okAt} eredmény marad`);
        continue;
      }
      out[s.id] = r;
      const tag = { aktiv: "✓", js: "~", hiba: "✗", nincs: "-" }[r.st];
      console.log(`${tag} ${s.id} ${s.n.slice(0, 48).padEnd(48)} ${r.st === "aktiv" ? `${r.pages} oldal, ${r.hits.length} találat` : r.why}`);
      for (const h of r.hits) console.log(`     ${h.date}${h.time ? " " + h.time : ""}  ${h.text.slice(0, 110)}`);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  if (only.length) return;

  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  const data = { v: 1, gen: today.toISOString(), s: sorted };
  writeFileSync(OUT, JSON.stringify(data, null, 1) + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
