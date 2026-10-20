// The sprite studio: the owner's screen for fixing the game's sprites.
//   Library: every sprite as the game has it (cut from the atlas), beside a person for scale: remove it from the game, or make it
//            bigger or smaller everywhere it is placed (scripts/assets/removed.json, scale-overrides.json)
//   Lots:    the baked house lots: click any sprite in one to move, resize, flip or delete it there (lot-edits.json)
//   People:  every townsperson's walk rows, animated: fix any frame that faces the wrong way (mirror it, use another frame in its
//            place, or drop in a new picture): walker-fixes.json, the pictures in scripts/assets/walker-frames (walker-fix.mjs)
//   Rebuild: runs the asset steps again, so the game takes the changes.
//   node scripts/assets/review/server.mjs [--port 5179]   then open http://127.0.0.1:5179/
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT, TOT } from '../source.mjs';
import { readRemoved, writeRemoved } from '../removed.mjs';
import { readLotEdits, readScales, readWalkerFixes, writeLotEdits, writeScales, writeWalkerFixes } from '../overrides.mjs';
import { LIB, drawOrder, rectOf, render } from '../lot-render.mjs';
import { mapScale } from '../lot-layout.mjs';
import { boundsOf, lotVariants } from '../lot-variants.mjs';
import { fixCode, newFramePath, parseFix } from '../walker-fix.mjs';

const PORT = +(process.argv[process.argv.indexOf('--port') + 1] || 5179) || 5179;
const ATLAS = path.join(ROOT, 'src/assets/atlas'), CACHE = path.join(ROOT, 'output/review/thumbs');
fs.mkdirSync(CACHE, { recursive: true });
const LOT_RES = 0.45;

// ---------------------------------------------------------------- the game's sprites (src/game/library.ts)
function library() {
  const src = fs.readFileSync(path.join(ROOT, 'src/game/library.ts'), 'utf8'), out = [];
  for (const m of src.matchAll(/^ {2}(\{"id".*\}),$/gm)) { const e = JSON.parse(m[1]); out.push({ id: e.id, name: e.name, cat: e.cat, kind: e.kind, tex: e.tex, w: e.w, h: e.h, quad: e.quad }); }
  const people = JSON.parse(/WALKER_PEOPLE[^=]*= (\[.*\]);/.exec(src)?.[1] ?? '[]'), wf = JSON.parse('[' + (/const WF = \[(.*)\];/.exec(src)?.[1] ?? '') + ']');
  people.forEach((p, i) => { const o = ((i * 5 + 0) * 5 + 0) * 9; if (wf.length > o + 8) out.push({ id: p.id, name: p.id.replace(/^person:/, ''), cat: 'Townspeople', kind: 'walker', tex: wf.slice(o, o + 5), w: p.w, h: p.h, quad: wf.slice(o + 5, o + 9), ax: p.ax, ay: p.ay }); });
  return out;
}
const safe = id => id.replace(/[^a-z0-9_.-]/gi, '_');
/** a sprite's picture as the game has it, cut from the atlas (cached on disk, so a removed sprite still shows after a rebuild) */
async function thumb(id) {
  const f = path.join(CACHE, safe(id) + '.png'), stamp = f + '.json';
  const s = library().find(x => x.id === id);
  // Removed sprites lose their atlas entry; their last picture must survive a rebuild.
  if (!s?.tex) return fs.existsSync(f) ? fs.readFileSync(f) : null;
  const [p, u0, v0, u1, v1] = s.tex, page = path.join(ATLAS, `sprites-${p}-0.webp`), stat = fs.statSync(page);
  const version = JSON.stringify([s.tex, s.quad, stat.size, stat.mtimeMs]);
  if (fs.existsSync(f) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === version) return fs.readFileSync(f);
  const m = await sharp(page).metadata();
  const left = Math.round(u0 * m.width), top = Math.round(v0 * m.height), width = Math.max(1, Math.round((u1 - u0) * m.width)), height = Math.max(1, Math.round((v1 - v0) * m.height));
  const png = await sharp(page).extract({ left, top, width, height }).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  fs.writeFileSync(f, png); fs.writeFileSync(stamp, version); return png;
}

// ---------------------------------------------------------------- lots: the variants with the owner's edits, their pictures and hit boxes
function lotState(id) {
  const v = lotVariants().find(x => x.id === id); if (!v) return null;
  const edits = readLotEdits()[id] ?? {};
  // every raw placement with its edit applied (deleted ones left out), remembering its index (edits are keyed by it)
  // (a rejected house's delete is spent on its replacement: v.raw has the new house at v.houseIdx, see lot-variants.mjs)
  const items = v.raw.map((p, i) => { const e = v.swapped && i === v.houseIdx ? undefined : edits[i]; if (e?.del) return null; return { ...p, idx: i, x: +(p.x + (e?.dx ?? 0)).toFixed(3), y: +(p.y + (e?.dy ?? 0)).toFixed(3), scale: e?.scale ?? p.scale, flip: e?.flip ?? p.flip, edited: !!e }; }).filter(Boolean);
  const box = boundsOf(items, v.W, v.D);
  return { v, items, box, edits };
}
const lotPics = new Map();
async function lotPicture(id) {
  const st = lotState(id); if (!st) return null;
  const key = id + JSON.stringify(st.edits); if (lotPics.has(key)) return lotPics.get(key);
  const png = await render(st.items, st.box, LOT_RES, { background: { r: 70, g: 82, b: 42, alpha: 1 } });
  if (lotPics.size > 40) lotPics.clear(); lotPics.set(key, png); return png;
}

// ---------------------------------------------------------------- people: frames from the TrickOrTreat sheets with the fixes applied
const PEOPLE_DIRS = ['S', 'SE', 'E', 'NE', 'N'];
function people() {
  const out = [];
  for (const size of ['adult', 'kid']) {
    const dir = path.join(TOT, 'art/people', size); if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) { const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); out.push({ id: m.id, sheet: path.join(dir, f.replace(/\.json$/, '.webp')), m }); }
  }
  return out;
}
/** the directions with a dropped-in picture for this person, as 'DIR-k' */
const newFrameList = pid => PEOPLE_DIRS.flatMap(d => [0, 1, 2, 3, 4].filter(k => fs.existsSync(newFramePath(ROOT, pid, d, k))).map(k => `${d}-${k}`));
/** a frame with its fix applied (as the game draws it), or as the sheet has it when asDrawn */
async function frame(pid, d, k, asDrawn) {
  const p = people().find(x => x.id === pid); if (!p) return null;
  const { m } = p, fix = asDrawn ? null : parseFix(readWalkerFixes()[pid]?.[d]?.[k]);
  const cut = (dir, fr) => sharp(p.sheet).extract({ left: fr * m.frameWidth, top: m.directions.indexOf(dir) * m.frameHeight, width: m.frameWidth, height: m.frameHeight }).png().toBuffer();
  const dropped = fix?.kind === 'new' ? newFramePath(ROOT, pid, d, k) : null;
  let buf;
  if (fix?.kind === 'use') buf = await cut(fix.dir ?? d, fix.frame);
  else if (dropped && fs.existsSync(dropped)) buf = await sharp(dropped).resize(m.frameWidth, m.frameHeight, { fit: 'contain', position: 'bottom', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  else buf = await cut(d, k);
  if (fix?.kind === 'mirror' || fix?.mirror) buf = await sharp(buf).flop().png().toBuffer();
  return sharp(buf).resize(Math.round(m.frameWidth * 0.5), Math.round(m.frameHeight * 0.5)).png().toBuffer();
}

// ---------------------------------------------------------------- rebuild
let job = null;
function rebuild() {
  if (job && !job.done) return job;
  const steps = ['scripts/assets/prep-decals.mjs', 'scripts/assets/nature-patches.mjs', 'scripts/assets/prep-sprites.mjs', 'scripts/assets/prep-scales.mjs', 'scripts/assets/audit-sprites.mjs'];
  job = { log: '', done: false, code: 0, step: '', started: Date.now() };
  const run = i => {
    if (i >= steps.length) { job.done = true; job.log += '\nAll done: reload the game.\n'; return; }
    job.step = steps[i]; job.log += `\n> node ${steps[i]}\n`;
    const p = spawn(process.execPath, [steps[i]], { cwd: ROOT, env: { ...process.env, TOT_REPO: TOT } });
    p.stdout.on('data', d => { job.log += d; }); p.stderr.on('data', d => { job.log += d; });
    p.on('close', code => { if (code) { job.done = true; job.code = code; job.log += `\nFailed (${code}).\n`; } else run(i + 1); });
  };
  run(0); return job;
}


const body = req => new Promise(res => { let s = ''; req.on('data', d => { s += d; }); req.on('end', () => { try { res(JSON.parse(s || '{}')); } catch { res({}); } }); });
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), json = o => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const png = b => { if (!b) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-cache' }); res.end(b); };
  const P = url.pathname;
  try {
    if (P === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(path.join(ROOT, 'scripts/assets/review/studio.html'), 'utf8')); }
    // library
    if (P === '/api/sprites') {
      const list = library(), have = new Set(list.map(s => s.id)), rm = readRemoved(), sc = readScales();
      for (const id of Object.keys(rm)) if (!have.has(id)) list.push({ id, name: rm[id].name ?? id, cat: rm[id].cat ?? 'Removed', kind: rm[id].kind ?? '', tex: null, w: rm[id].w ?? 100, h: rm[id].h ?? 100, quad: rm[id].quad, ax: rm[id].ax, ay: rm[id].ay });
      for (const s of list) { s.base = s.kind === 'car' ? 0.8 : s.kind === 'walker' || s.cat === 'Lots' ? 1 : mapScale(s.id); s.scale = s.kind === 'car' ? 0.8 : sc[s.id] ?? s.base; s.quad ??= [0, 0, s.w, s.h]; delete s.tex; }
      // the townspeople, for the cursor: each one's trimmed picture and where its feet are (the anchor) inside it, in native px
      const walkers = list.filter(s => s.kind === 'walker' && !rm[s.id]).map(s => ({ id: s.id, name: s.name, quad: s.quad, ax: s.ax, ay: s.ay }));
      return json({ sprites: list, removed: rm, walkers });
    }
    if (P.startsWith('/thumb/')) return png(await thumb(decodeURIComponent(P.slice(7))));
    if (req.method === 'POST' && (P === '/api/remove' || P === '/api/restore')) {
      const { id } = await body(req), rm = readRemoved(), s = library().find(x => x.id === id);
      if (P === '/api/remove' && id) { await thumb(id).catch(() => null); rm[id] = { ...rm[id], at: new Date().toISOString(), ...Object.fromEntries(['name', 'cat', 'kind', 'w', 'h', 'quad', 'ax', 'ay'].filter(k => s?.[k] !== undefined).map(k => [k, s[k]])) }; }
      else delete rm[id];
      writeRemoved(rm); return json({ removed: rm });
    }
    if (req.method === 'POST' && P === '/api/scale') {
      const { id, factor, reset } = await body(req), sc = readScales();
      if (reset) delete sc[id]; else { const cur = sc[id] ?? mapScale(id); sc[id] = +(cur * factor).toFixed(3); }
      writeScales(sc); return json({ id, scale: sc[id] ?? mapScale(id), base: mapScale(id) });
    }
    // lots
    if (P === '/api/lots') return json(lotVariants().map(v => ({ id: v.id, name: v.name, edits: Object.keys(readLotEdits()[v.id] ?? {}).length })));
    if (P.startsWith('/lot/')) return png(await lotPicture(decodeURIComponent(P.slice(5)).replace(/\.png$/, '')));
    if (P.startsWith('/api/lot/')) {
      const st = lotState(decodeURIComponent(P.slice(9))); if (!st) return json(null);
      const order = drawOrder(st.items).map(({ s, it }) => { const [l, t, w, h] = rectOf(s, it); return { idx: s.idx, id: s.id, name: it.name, flat: !!it.flat, x: s.x, y: s.y, scale: s.scale, flip: s.flip, edited: s.edited, r: [(l - st.box[0]) * LOT_RES, (t - st.box[1]) * LOT_RES, w * LOT_RES, h * LOT_RES] }; });
      return json({ id: st.v.id, name: st.v.name, w: Math.round((st.box[2] - st.box[0]) * LOT_RES), h: Math.round((st.box[3] - st.box[1]) * LOT_RES), items: order });
    }
    if (req.method === 'POST' && P === '/api/lot-edit') {
      const { lot, idx, op } = await body(req), all = readLotEdits(), e = (all[lot] ??= {}), cur = e[idx] ?? {}, v = lotVariants().find(x => x.id === lot), raw = v?.raw[idx];
      if (!raw) return json({ ok: false });
      const step = 0.25, scale = cur.scale ?? raw.scale;
      if (op === 'x+') cur.dx = +((cur.dx ?? 0) + step).toFixed(2); if (op === 'x-') cur.dx = +((cur.dx ?? 0) - step).toFixed(2);
      if (op === 'y+') cur.dy = +((cur.dy ?? 0) + step).toFixed(2); if (op === 'y-') cur.dy = +((cur.dy ?? 0) - step).toFixed(2);
      if (op === 'bigger') cur.scale = +(scale * 1.08).toFixed(3); if (op === 'smaller') cur.scale = +(scale / 1.08).toFixed(3);
      if (op === 'flip') cur.flip = !(cur.flip ?? raw.flip);
      // deleting the lot's house rejects it: another house of its pool takes its spot (lot-variants.mjs); a replacement deleted in turn
      // joins the lot's houseRejects, so the next one is tried; reset on the house brings the original back
      const isHouse = +idx === v.houseIdx;
      if (op === 'delete') { cur.del = true; if (isHouse && v.swapped) e.houseRejects = [...new Set([...(e.houseRejects ?? []), raw.id])]; }
      if (op === 'reset' && isHouse) delete e.houseRejects;
      if (op === 'reset') delete e[idx]; else e[idx] = cur;
      if (!Object.keys(e).length) delete all[lot];
      writeLotEdits(all); return json({ ok: true });
    }
    // people
    if (P === '/api/people') { const fx = readWalkerFixes(); return json(people().map(p => ({ id: p.id, dirs: PEOPLE_DIRS, fixes: fx[p.id] ?? {}, newFrames: newFrameList(p.id) }))); }
    if (P === '/api/frames-needed') {
      const out = []; for (const [id, rows] of Object.entries(readWalkerFixes())) for (const [dir, row] of Object.entries(rows)) for (const [k, op] of Object.entries(row)) if (op === 'new') out.push({ id, dir, frame: +k, has: fs.existsSync(newFramePath(ROOT, id, dir, k)) });
      return json(out);
    }
    if (P.startsWith('/frame/')) { const [pid, d, k] = decodeURIComponent(P.slice(7)).split('|'); return png(await frame(pid, d, +k, url.searchParams.get('orig') === '1')); }
    if (req.method === 'POST' && P === '/api/walker-fix') {
      const b = await body(req), { id, dir, frame: k } = b, fx = readWalkerFixes();
      // a body without op toggles mirror, as it did before the studio had other fixes
      const code = b.op === undefined ? (fx[id]?.[dir]?.[k] === 'mirror' ? '' : 'mirror') : b.op, fix = parseFix(code);
      if ((code !== '' && !fix) || !people().some(p => p.id === id) || !PEOPLE_DIRS.includes(dir) || !(+k >= 0 && +k <= 4)) { res.writeHead(400); return res.end('bad fix'); }
      const row = ((fx[id] ??= {})[dir] ??= {});
      if (code) row[k] = fixCode(fix); else delete row[k];
      if (!Object.keys(row).length) delete fx[id][dir]; if (!Object.keys(fx[id]).length) delete fx[id];
      writeWalkerFixes(fx); return json({ fixes: fx[id] ?? {} });
    }
    if (req.method === 'POST' && P === '/api/walker-frame') {
      const { id, dir, frame: k, png: b64 } = await body(req), f = +k;
      if (!people().some(p => p.id === id) || !PEOPLE_DIRS.includes(dir) || !(f >= 0 && f <= 4)) { res.writeHead(400); return res.end('bad frame'); }
      let pic; try { pic = await sharp(Buffer.from(b64 ?? '', 'base64')).png().toBuffer(); } catch { res.writeHead(400); return res.end('not a picture'); }
      const file = newFramePath(ROOT, id, dir, f); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, pic);
      const fx = readWalkerFixes(), row = ((fx[id] ??= {})[dir] ??= {});
      if (row[f] !== 'new') { row[f] = 'new'; writeWalkerFixes(fx); }
      return json({ fixes: fx[id], has: true });
    }
    if (req.method === 'POST' && P === '/api/rebuild') return json(rebuild());
    if (P === '/api/status') return json(job && { ...job, log: job.log.slice(-600) });
    res.writeHead(404); res.end();
  } catch (e) { res.writeHead(500); res.end(String(e.stack || e)); }
}).listen(PORT, '127.0.0.1', () => console.log(`sprite studio: http://127.0.0.1:${PORT}/`));
