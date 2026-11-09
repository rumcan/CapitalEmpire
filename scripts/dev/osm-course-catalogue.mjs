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
// (the game's own course import asks four servers; this script asks the main one and maps.mail.ru: on 2026-11-09 kumi answered from a July snapshot or hung and private.coffee hung, 215 s a try)
const SERVERS = opt('overpass') ? opt('overpass').split(',') : L.SERVERS.slice(0, 2);
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
/** how long a request is waited for: the main server the query's own time and a little more, a mirror (they hang when they are down) at most 200 s and a little more */
const clientTimeoutMs = (url, timeoutS) => (url === SERVERS[0] ? timeoutS + 45 : Math.min(timeoutS, 200) + 15) * 1000;
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
// (on 2026-11-09 a country of six courses took 79 s and Florida, with 10 000 hole lines, 76 s: the query costs the time, not the answer, so regions are asked in batches)
const approxOf = r => (r.cc === 'US' ? 330 : L.COUNTRIES.find(c => c[0] === r.cc)?.[1] ?? 100);
const label = rs => rs.map(r => r.id).join('+');

/** asks a batch of regions for their courses in ONE request (batchQuery: each region's courses and hole lines, a count after each); each region's part is kept in the cache
 *  as a single region's answer, so a rerun, the build and a smaller batch all see the same files. Throws Failed when no server gave an answer that fits */
async function coursesBatch(rs) {
  const timeoutS = rs.length > 1 || rs[0].cc === 'US' ? 300 : 240, name = label(rs);
  const a = await ask(L.batchQuery(rs, timeoutS), 'json', name, timeoutS);
  let parts;
  try { parts = L.splitBatch(JSON.parse(a.text), rs); } catch (e) { log(`${name}: the answer does not fit the batch (${e.message})`); throw new Failed(name); }
  const fetchedAt = new Date().toISOString();
  for (const { region, answer } of parts) { const text = JSON.stringify(answer); keep(`${region.id}.courses`, 'json', text, { server: a.server, fetchedAt, base: a.base, bytes: text.length, batch: rs.length }); }
}
/** a batch that failed is asked again in two halves (down to one region); returns the regions that still failed */
async function coursesTask(rs) {
  try { await coursesBatch(rs); return []; }
  catch (e) {
    if (!(e instanceof Failed)) throw e;
    if (rs.length === 1) { noteFailure(rs[0].id, 'every server failed'); return rs; }
    log(`${label(rs)}: failed, asking it in two halves`);
    const h = Math.ceil(rs.length / 2);
    return [...(await coursesTask(rs.slice(0, h))), ...(await coursesTask(rs.slice(h)))];
  }
}

// ---------------------------------------------------------------------------------------------------------------- the places
const regionOfCc = cc => (cc === 'US' ? L.usPlaces : { id: cc.toLowerCase(), cc, area: ['ISO3166-1', cc] });
const placeFiles = () => readdirSync(CACHE).filter(f => /^places-.*\.csv\.gz$/.test(f)).map(f => f.replace(/\.csv\.gz$/, ''));
/** the countries a kept places file covers (its meta says; the first two files of this script's run, places-za and places-us, are named after theirs) */
const placesCovers = name => { try { return JSON.parse(readFileSync(fileOf(name, 'meta.json'), 'utf8')).ccs ?? [name.slice(7).toUpperCase()]; } catch { return []; } };
const placesCovered = cc => placeFiles().some(n => placesCovers(n).includes(cc));
/** whether a country is worth a places query: at least 20 of its named courses give no town of their own (the US always is) */
function needsPlaces(cc, mine) {
  if (cc === 'US') return true;
  let n = 0;
  for (const r of mine) {
    const k = readCached(`${r.id}.courses`, 'json');
    if (!k) continue;
    try { for (const el of JSON.parse(k.text).elements) if (el.tags?.leisure === 'golf_course' && !(el.tags['addr:city'] || el.tags['addr:town'] || el.tags['addr:village'] || el.tags['addr:municipality'])) n++; } catch { /* unreadable: not counted */ }
  }
  return n >= 20;
}
/** asks for the places of several countries in ONE request (the areas united); the biggest places only (a hamlet is not a town), the US alone */
async function placesStep(ccs) {
  const name = `places-${ccs.map(c => c.toLowerCase()).join('-')}`, rs = ccs.map(regionOfCc);
  const a = await ask(L.placesBatchQuery(rs, ['city', 'town', 'village', 'suburb'], 300), 'csv', name, 300);
  keep(name, 'csv', a.text, { server: a.server, fetchedAt: new Date().toISOString(), bytes: a.text.length, ccs });
}

// ---------------------------------------------------------------------------------------------------------------- the plan
const regions = L.regionsPlan(ONLY), ccs = [...new Set(regions.map(r => r.cc))];
const have = r => existsSync(fileOf(`${r.id}.courses`, 'json.gz')) && existsSync(fileOf(`${r.id}.courses`, 'meta.json'));
if (flag('list')) {
  for (const r of regions) console.log(`${r.id.padEnd(7)} ${have(r) ? 'kept' : 'to ask'}${failures[r.id] ? `  (failed ${failures[r.id].n}x: ${failures[r.id].why})` : ''}`);
  console.log(`${L.batchPlan(regions, r => !have(r)).length} requests of courses to go (batches: ${L.batchPlan(regions, r => !have(r)).map(label).join(' | ')})`);
  process.exit(0);
}

/** asks everything not kept yet, in order, in batches; the places of a country once its courses are all kept (the US alone, the others five countries to a request); what failed
 *  is asked again after a pause (twice); returns what is still missing. Stops quietly when the time is up */
async function fetchAll() {
  let bad = [];
  const pending = [];
  const complete = cc => regions.filter(r => r.cc === cc).every(have);
  const wantPlaces = cc => complete(cc) && !placesCovered(cc) && !pending.includes(cc) && needsPlaces(cc, regions.filter(r => r.cc === cc));
  const flush = async all => {
    while (pending.length && (all || pending.length >= 5 || pending.includes('US'))) {
      const group = pending.includes('US') ? ['US'] : pending.slice(0, 5);
      for (const cc of group) pending.splice(pending.indexOf(cc), 1);
      try { await placesStep(group); } catch (e) { if (!(e instanceof Failed)) throw e; noteFailure(`places-${group.join('-')}`, 'every server failed'); log(`places of ${group.join(' ')}: failed, left for later`); }
    }
  };
  try {
    for (let pass = 0; pass <= 2; pass++) {
      if (pass) { if (!bad.length) break; log(`${bad.length} failed, asking them again after a pause: ${label(bad)}`); await sleep(Math.min(120_000, left())); }
      const todo = pass ? bad : regions.filter(r => !have(r));
      bad = [];
      for (const b of L.batchPlan(todo, r => !have(r))) {
        bad.push(...await coursesTask(b));
        for (const cc of new Set(b.map(r => r.cc))) if (wantPlaces(cc)) pending.push(cc);
        await flush(false);
      }
      for (const cc of ccs) if (wantPlaces(cc)) pending.push(cc); // (countries that were kept by an earlier run and have no places yet)
      await flush(true);
    }
  } catch (e) { if (!(e instanceof TimeUp)) throw e; log(`the ${opt('max-minutes', 170)} minutes are up: what is kept is built, the rest is for the next run`); }
  return [...regions.filter(r => !have(r)).map(r => r.id), ...ccs.filter(cc => complete(cc) && !placesCovered(cc) && needsPlaces(cc, regions.filter(r => r.cc === cc))).map(cc => `places-${cc.toLowerCase()}`)];
}


// ---------------------------------------------------------------------------------------------------------------- the build
function build() {
  const t0 = Date.now(), built = new Date().toISOString().slice(0, 10), countries = [], todo = [], names = {};
  // (the places of every file kept, as one index: a course takes the nearest, whichever request brought it)
  const pl = new L.Places(placeFiles().flatMap(n => L.parsePlacesCsv(readCached(n, 'csv')?.text ?? '')));
  for (const cc of [...new Set(regions.map(r => r.cc))]) {
    const mine = regions.filter(r => r.cc === cc), entries = [];
    let at = '', missing = 0;
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
