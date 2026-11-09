// T378 (#1034): builds the golf course names catalogue the new-game card's course search filters (src/game/golf/osm/catalogue.ts): every leisure=golf_course with a name,
// country by country, from the public Overpass servers, as compact JSON chunks under public/catalogue/ (an index and a chunk per big country, the small countries packed
// together). Run by the lead, once in a while; never by a player. Plain Node 22 (built-in fetch, zlib), no installs.
//   node scripts/dev/osm-course-catalogue.mjs [--countries ZA,US,GB] [--max-minutes 170] [--cache E:/ClaudeTemp/T378/cache] [--out public/catalogue]
//        [--gap 10 (seconds between two requests, at least)] [--overpass https://a/api/interpreter,https://b/...] [--build-only] [--no-build] [--list]
// What it asks, and how politely:
//   - ONE Overpass query per country (the US: one per state, a few hundred courses each, not sixteen thousand): `area["ISO3166-1"="XX"]`, the named golf courses as
//     `out tags bb` (tags and bounding boxes, no geometry) and, in the same answer, the golf=hole ways with a ref as `out tags center`, so a course can be marked Full
//     (its holes numbered 1..18 inside it) with no query of its own. A country whose courses mostly have no address asks ONE more, the named places (city, town,
//     village, suburb, hamlet) as tab-separated text, where a course with no addr:city takes its town from (the nearest, in the build).
//   - at least --gap seconds (10) between any two requests; one request at a time; the User-Agent "CapitalEmpire-catalogue/1.0 (dev script)", no personal address.
//   - every answer is kept on disk under the cache (gzipped, with the server and the time), so a rerun asks nothing twice; a run that stops (a server down, the time
//     up, Ctrl-C) carries on where it was; a region that failed is tried again at the end of the run, after a pause.
//   - 429 and 5xx: it backs off (Retry-After, else 30 s doubling to 5 min) and falls over to the next server; a server that hung or was busy is left alone for a while
//     (10 minutes for a hang, 3 for busy) and the server that answered last is asked first (the health ordering the game's own course import uses, overpass.ts).
//   - an answer with an Overpass "remark" (runtime error, timed out, out of memory) is a failure, never kept (Overpass answers those with HTTP 200 and half a result).
// The build (always at the end, or alone with --build-only) turns the cache into the chunks: nothing is asked. The countries not asked yet (the time ran out, a server
// was down) are listed and the script finishes them on its next run.
// LICENCE: Data (c) OpenStreetMap contributors, ODbL 1.0: the chunks carry the credit, and the game shows it beside the list.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { join } from 'node:path';
import * as L from './osm-catalogue-lib.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; }, flag = k => args.includes(`--${k}`);
const CACHE = opt('cache', 'E:/ClaudeTemp/T378/cache').replace(/\\/g, '/'), OUT = opt('out', 'public/catalogue').replace(/\\/g, '/');
const GAP_MS = Math.max(10, Number(opt('gap', 10))) * 1000, MAX_MS = Number(opt('max-minutes', 170)) * 60_000;
/** an answer whose map data is older than this is not used (--max-age-days): on 2026-11-09 overpass.kumi.systems answered Texas from a July snapshot, with 139 courses of some 900 */
const MAX_AGE_MS = Number(opt('max-age-days', 3)) * 86_400_000;
const SERVERS = opt('overpass') ? opt('overpass').split(',') : L.SERVERS;
const ONLY = opt('countries') ? opt('countries').split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : null;
const T0 = Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const left = () => MAX_MS - (Date.now() - T0);
mkdirSync(CACHE, { recursive: true });

// ---------------------------------------------------------------------------------------------------------------- the cache
const fileOf = (name, ext) => `${CACHE}/${name}.${ext}`;
function readCached(name, ext) {
  const f = fileOf(name, ext + '.gz'), m = fileOf(name, 'meta.json');
  if (!existsSync(f) || !existsSync(m)) return null;
  try { return { text: gunzipSync(readFileSync(f)).toString('utf8'), meta: JSON.parse(readFileSync(m, 'utf8')) }; } catch { return null; }
}
function keep(name, ext, text, meta) {
  writeFileSync(fileOf(name, ext + '.gz') + '.tmp', gzipSync(Buffer.from(text, 'utf8'), { level: 9 })); renameSync(fileOf(name, ext + '.gz') + '.tmp', fileOf(name, ext + '.gz'));
  writeFileSync(fileOf(name, 'meta.json'), JSON.stringify(meta));
}
const failFile = `${CACHE}/failures.json`;
const failures = existsSync(failFile) ? JSON.parse(readFileSync(failFile, 'utf8')) : {};
const noteFailure = (key, why) => { failures[key] = { n: (failures[key]?.n ?? 0) + 1, last: new Date().toISOString(), why }; writeFileSync(failFile, JSON.stringify(failures, null, 1)); };

// ---------------------------------------------------------------------------------------------------------------- the polite asking
/** what this run has learned of each server: when it may be asked again, and when it last answered */
const health = new Map(SERVERS.map(u => [u, { until: 0, okAt: 0, stale: false }]));
const host = u => new URL(u).hostname;
const stats = { requests: 0, ok: 0, byServer: Object.fromEntries(SERVERS.map(u => [host(u), { ok: 0, bad: 0 }])) };
let lastEnd = 0;
/** the servers to ask, the one that answered last first, the ones left alone (they hung or were busy) after the rest */
function ordered() {
  const now = Date.now(), score = u => { const h = health.get(u); return (h.until > now ? 1e15 + h.until : 0) - h.okAt; };
  return SERVERS.filter(u => !health.get(u).stale).sort((a, b) => score(a) - score(b) || SERVERS.indexOf(a) - SERVERS.indexOf(b));
}
/** how long a request is waited for: the main server the query's own time and a little more, a mirror (they hang when they are down) at most 90 s and a little more */
const clientTimeoutMs = (url, timeoutS) => (url === SERVERS[0] ? timeoutS + 45 : Math.min(timeoutS, 90) + 15) * 1000;
async function gap() { const w = lastEnd + GAP_MS - Date.now(); if (w > 0) await sleep(w); }
class Failed extends Error {}
class TimeUp extends Error {}

/** one query, on the servers in turn (see the header): returns { text, server, base } of an answer that read; throws Failed when every server failed in every round */
async function ask(query, kind, label, timeoutS) {
  let wait = 30_000;
  for (let round = 0; round < 3; round++) {
    let tried = 0;
    for (const url of ordered()) {
      const h = health.get(url);
      if (h.until > Date.now() && tried > 0) continue; // (all of them left alone: the one left alone the shortest is still tried, the others wait)
      if (left() < 60_000) throw new TimeUp();
      await gap();
      tried++; stats.requests++;
      const t0 = Date.now(), tag = `${label} on ${host(url)}`;
      let res = null, text = '', why = '', hung = false, retryAfter = 0;
      try {
        res = await fetch(url, { method: 'POST', headers: { 'User-Agent': L.UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(clientTimeoutMs(url, timeoutS)) });
        retryAfter = parseInt(res.headers.get('retry-after') ?? '', 10) || 0;
        text = await res.text();
      } catch (e) { hung = e.name === 'TimeoutError' || e.name === 'AbortError'; why = hung ? `no answer in ${clientTimeoutMs(url, timeoutS) / 1000} s` : (e.cause?.code || e.message); }
      lastEnd = Date.now();
      const s = ((lastEnd - t0) / 1000).toFixed(1);
      let base = '';
      if (!why && res.status === 429) { why = 'HTTP 429 (too many requests)'; h.until = Date.now() + 180_000; wait = Math.max(wait, (retryAfter || 60) * 1000); }
      else if (!why && [502, 503, 504, 509].includes(res.status)) { why = `HTTP ${res.status}`; h.until = Date.now() + 60_000; }
      else if (!why && res.status === 400) throw new Error(`${tag}: HTTP 400, the query is wrong: ${text.replace(/\s+/g, ' ').slice(0, 300)}`);
      else if (!why && !res.ok) why = `HTTP ${res.status}`;
      else if (!why) {
        if (kind === 'json') {
          let j = null; try { j = JSON.parse(text); } catch { /* an error page */ }
          if (!j || !Array.isArray(j.elements)) why = `not an Overpass answer (${text.replace(/\s+/g, ' ').slice(0, 120)})`;
          else if (j.remark && /runtime error|timed out|out of memory|too busy|rejected/i.test(j.remark)) { why = `remark: ${j.remark}`; h.until = Date.now() + 180_000; }
          else {
            base = j.osm3s?.timestamp_osm_base ?? '';
            const age = Date.now() - Date.parse(base);
            if (!base || !Number.isFinite(age) || age > MAX_AGE_MS) { why = `stale map data (${base || 'no date'}): left alone for the rest of the run`; h.stale = true; }
          }
        } else if (/runtime error|<html|<\?xml|Error/i.test(text.slice(0, 2000)) && !/^-?\d/.test(text)) why = `not a table (${text.replace(/\s+/g, ' ').slice(0, 120)})`;
      }
      if (hung) h.until = Date.now() + 600_000;
      if (!why) { h.okAt = Date.now(); h.until = 0; stats.ok++; stats.byServer[host(url)].ok++; log(`${tag}: ${text.length} bytes in ${s} s`); return { text, server: host(url), base }; }
      stats.byServer[host(url)].bad++; log(`${tag}: ${why} after ${s} s`);
    }
    if (round < 2) { log(`every server failed ${label}: waiting ${Math.round(wait / 1000)} s`); await sleep(Math.min(wait, left())); wait = Math.min(wait * 2, 300_000); }
  }
  throw new Failed(label);
}
const timeoutFor = approx => (approx < 100 ? 180 : approx < 600 ? 240 : 300); // (a country of six courses took 79 s on 2026-11-09: the server is slow today, not the query big)
const approxOf = r => (r.cc === 'US' ? 330 : L.COUNTRIES.find(c => c[0] === r.cc)?.[1] ?? 100);

/** asks a region for its courses (kept in the cache); returns the cached record. A region already kept is not asked */
async function coursesOf(r) {
  const kept = readCached(`${r.id}.courses`, 'json');
  if (kept) return kept;
  const a = await ask(L.coursesQuery(r, timeoutFor(approxOf(r))), 'json', r.id, timeoutFor(approxOf(r)));
  const meta = { server: a.server, fetchedAt: new Date().toISOString(), base: a.base, bytes: a.text.length };
  keep(`${r.id}.courses`, 'json', a.text, meta);
  return { text: a.text, meta };
}
/** the places of a country (kept); the US asks once for the whole country, the others per country */
async function placesOf(r) {
  const p = r.cc === 'US' ? L.usPlaces : r, name = `places-${p.cc.toLowerCase()}`, kept = readCached(name, 'csv');
  if (kept) return kept;
  const kinds = r.cc === 'US' ? ['city', 'town', 'village', 'suburb'] : L.PLACE_KINDS, t = r.cc === 'US' ? 300 : timeoutFor(approxOf(r));
  const a = await ask(L.placesQuery(p, kinds, t), 'csv', name, t);
  const meta = { server: a.server, fetchedAt: new Date().toISOString(), bytes: a.text.length };
  keep(name, 'csv', a.text, meta);
  return { text: a.text, meta };
}
/** whether a country is worth a places query: at least 20 of its named courses give no town of their own */
function needsPlaces(text) {
  let n = 0;
  try { for (const el of JSON.parse(text).elements) if (el.tags?.leisure === 'golf_course' && !(el.tags['addr:city'] || el.tags['addr:town'] || el.tags['addr:village'] || el.tags['addr:municipality'])) n++; } catch { return false; }
  return n >= 20;
}

// ---------------------------------------------------------------------------------------------------------------- the plan
const regions = L.regionsPlan(ONLY), ccs = [...new Set(regions.map(r => r.cc))];
const have = r => existsSync(fileOf(`${r.id}.courses`, 'json.gz')) && existsSync(fileOf(`${r.id}.courses`, 'meta.json'));
const havePlaces = cc => existsSync(fileOf(`places-${cc.toLowerCase()}`, 'csv.gz')) && existsSync(fileOf(`places-${cc.toLowerCase()}`, 'meta.json'));
if (flag('list')) {
  for (const r of regions) console.log(`${r.id.padEnd(7)} ${have(r) ? 'kept' : 'to ask'}${failures[r.id] ? `  (failed ${failures[r.id].n}x: ${failures[r.id].why})` : ''}`);
  process.exit(0);
}

/** the tasks in the order they are asked: each region's courses, then the places of its country (the US: after its last state) when the courses say they are needed */
function tasks() {
  const out = [];
  for (const cc of ccs) {
    const mine = regions.filter(r => r.cc === cc);
    for (const r of mine) out.push({ key: r.id, run: () => coursesOf(r) });
    out.push({
      key: `places-${cc.toLowerCase()}`,
      want: () => (cc === 'US' ? mine.some(have) : have(mine[0]) && needsPlaces(readCached(`${mine[0].id}.courses`, 'json').text)),
      kept: () => havePlaces(cc), run: () => placesOf(mine[0]),
    });
  }
  return out;
}

/** asks everything not kept yet, in order; what failed is asked again after a pause (twice); returns the keys that are still missing. Stops quietly when the time is up */
async function fetchAll() {
  const all = tasks(), bad = [];
  const one = async t => {
    if (t.kept ? t.kept() : have(regions.find(r => r.id === t.key))) return true;
    if (t.want && !t.want()) return true;
    try { await t.run(); return true; }
    catch (e) { if (e instanceof Failed) { noteFailure(t.key, 'every server failed'); log(`${t.key}: failed, left for later`); return false; } throw e; }
  };
  try {
    for (const t of all) if (!(await one(t))) bad.push(t);
    for (let again = 1; again <= 2 && bad.length; again++) {
      log(`${bad.length} failed, asking them again after a pause: ${bad.map(t => t.key).join(' ')}`); await sleep(Math.min(120_000, left()));
      for (const t of [...bad]) if (await one(t)) bad.splice(bad.indexOf(t), 1);
    }
  } catch (e) { if (!(e instanceof TimeUp)) throw e; log(`the ${opt('max-minutes', 170)} minutes are up: what is kept is built, the rest is for the next run`); }
  return all.filter(t => (t.kept ? t.want?.() && !t.kept() : !have(regions.find(r => r.id === t.key)))).map(t => t.key);
}

// ---------------------------------------------------------------------------------------------------------------- the build
function build() {
  const t0 = Date.now(), built = new Date().toISOString().slice(0, 10), countries = [], todo = [], names = {};
  for (const cc of [...new Set(regions.map(r => r.cc))]) {
    const mine = regions.filter(r => r.cc === cc), entries = [];
    let at = '', missing = 0;
    const pl = (() => { const k = readCached(`places-${cc.toLowerCase()}`, 'csv'); return k ? new L.Places(L.parsePlacesCsv(k.text)) : null; })();
    for (const r of mine) {
      const k = readCached(`${r.id}.courses`, 'json');
      if (!k) { missing++; todo.push(r.id); continue; }
      const es = L.entriesOf(JSON.parse(k.text), { places: pl, suffix: r.state?.[0] ?? '', cc });
      for (const e of es) entries.push(e);
      const b = k.meta.base || k.meta.fetchedAt; if (b && (!at || b < at)) at = b;
    }
    if (!mine.length || (missing === mine.length)) continue;
    countries.push({ cc, entries: L.dedupe(entries), at: at ? at.slice(0, 10) : built, regions: mine.length, missing });
    names[cc] = L.countryName(cc);
  }
  const chunks = L.packChunks(countries), files = [], index = {
    v: 1, built, credit: L.CREDIT, licence: L.LICENCE, total: 0,
    countries: countries.map(c => ({ cc: c.cc, country: names[c.cc], n: c.entries.length })).filter(c => c.n),
    chunks: [],
  };
  mkdirSync(OUT, { recursive: true });
  for (const c of chunks) {
    const text = L.chunkText(c, built), buf = Buffer.from(text, 'utf8'), hash = createHash('sha1').update(buf).digest('hex').slice(0, 8), file = `${c.id}.${hash}.json`;
    writeFileSync(join(OUT, file), buf);
    const byCc = {}; for (const e of c.entries) { const cc = c.cc || e[9]; byCc[cc] = (byCc[cc] ?? 0) + 1; }
    index.chunks.push({ file, id: c.id, cc: c.cc, n: c.entries.length, ccs: byCc, bytes: buf.length, gz: gzipSync(buf, { level: 9 }).length, at: c.at });
    files.push(file); index.total += c.entries.length;
  }
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index) + '\n');
  for (const f of readdirSync(OUT)) if (f.endsWith('.json') && f !== 'index.json' && !files.includes(f)) unlinkSync(join(OUT, f));
  // the report
  log(`built ${chunks.length} chunks, ${index.total} courses in ${index.countries.length} countries, in ${Date.now() - t0} ms`);
  const rows = index.countries.map(c => `${c.cc} ${c.country}: ${c.n}`).join('; ');
  console.log(rows);
  let rawT = 0, gzT = 0;
  for (const c of index.chunks) { rawT += c.bytes; gzT += c.gz; console.log(`  ${c.file.padEnd(22)} ${String(c.n).padStart(6)} courses  ${(c.bytes / 1024).toFixed(1).padStart(8)} KB  ${(c.gz / 1024).toFixed(1).padStart(7)} KB gzipped${c.cc ? '' : `  (${Object.keys(c.ccs).join(' ')})`}`); }
  console.log(`  total ${(rawT / 1024).toFixed(0)} KB, ${(gzT / 1024).toFixed(0)} KB gzipped`);
  if (todo.length) console.log(`not asked yet (${todo.length}): ${todo.join(' ')}`);
  return index;
}

// ---------------------------------------------------------------------------------------------------------------- main
if (!flag('build-only')) {
  const todo = regions.filter(r => !have(r)).length;
  log(`${regions.length} regions, ${todo} to ask, at least ${GAP_MS / 1000} s between requests, ${Math.round(MAX_MS / 60000)} minutes at most; cache ${CACHE}`);
  const missing = await fetchAll();
  log(`${stats.requests} requests, ${stats.ok} answered: ${JSON.stringify(stats.byServer)}; ${missing.length ? `not kept yet: ${missing.join(' ')}` : 'everything is kept'}; ${Math.round((Date.now() - T0) / 60000)} minutes`);
}
if (!flag('no-build')) build();
