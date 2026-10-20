// The sprite review tool: every sprite the game has, as the game has it (cut from the atlas), with one button to remove it from
// the game (and one to bring it back). Removals go to scripts/assets/removed.json, which every asset step skips; "Rebuild"
// runs the asset steps again so the game drops them.
//   node scripts/assets/review/server.mjs [--port 5179]   then open http://127.0.0.1:5179/
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from '../source.mjs';
import { readRemoved, writeRemoved } from '../removed.mjs';

const PORT = +(process.argv[process.argv.indexOf('--port') + 1] || 5179) || 5179;
const ATLAS = path.join(ROOT, 'src/assets/atlas'), CACHE = path.join(ROOT, 'output/review/thumbs');
fs.mkdirSync(CACHE, { recursive: true });

/** the game's sprites from src/game/library.ts: library items, and one entry per townsperson (their first walking frame) */
function sprites() {
  const src = fs.readFileSync(path.join(ROOT, 'src/game/library.ts'), 'utf8'), out = [];
  for (const m of src.matchAll(/^ {2}(\{"id".*\}),$/gm)) { const e = JSON.parse(m[1]); out.push({ id: e.id, name: e.name, cat: e.cat, kind: e.kind, tex: e.tex }); }
  const people = JSON.parse(/WALKER_PEOPLE[^=]*= (\[.*\]);/.exec(src)?.[1] ?? '[]'), wf = JSON.parse('[' + (/const WF = \[(.*)\];/.exec(src)?.[1] ?? '') + ']');
  people.forEach((p, i) => { const o = ((i * 5 + 0) * 5 + 1) * 9; if (wf.length > o + 4) out.push({ id: p.id, name: p.id.replace(/^person:/, ''), cat: 'Townspeople', kind: 'walker', tex: wf.slice(o, o + 5) }); });
  return out;
}
const safe = id => id.replace(/[^a-z0-9_.-]/gi, '_');
/** a thumbnail (PNG): cut from the atlas page, cached on disk so a removed sprite still shows after the rebuild */
async function thumb(id) {
  const f = path.join(CACHE, safe(id) + '.png');
  if (fs.existsSync(f)) return fs.readFileSync(f);
  const s = sprites().find(x => x.id === id); if (!s) return null;
  const [p, u0, v0, u1, v1] = s.tex, page = path.join(ATLAS, `sprites-${p}-0.webp`), m = await sharp(page).metadata();
  const left = Math.round(u0 * m.width), top = Math.round(v0 * m.height), width = Math.max(1, Math.round((u1 - u0) * m.width)), height = Math.max(1, Math.round((v1 - v0) * m.height));
  const png = await sharp(page).extract({ left, top, width, height }).resize(360, 300, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  fs.writeFileSync(f, png); return png;
}

let job = null;   // the running rebuild: { log, done, code }
function rebuild() {
  if (job && !job.done) return job;
  const steps = ['scripts/assets/prep-decals.mjs', 'scripts/assets/nature-patches.mjs', 'scripts/assets/prep-sprites.mjs', 'scripts/assets/prep-scales.mjs', 'scripts/assets/audit-sprites.mjs'];
  job = { log: '', done: false, code: 0, step: '' };
  const run = i => {
    if (i >= steps.length) { job.done = true; job.log += '\nAll done: reload the game.\n'; return; }
    job.step = steps[i]; job.log += `\n> node ${steps[i]}\n`;
    const p = spawn(process.execPath, [steps[i]], { cwd: ROOT, env: process.env });
    p.stdout.on('data', d => { job.log += d; }); p.stderr.on('data', d => { job.log += d; });
    p.on('close', code => { if (code) { job.done = true; job.code = code; job.log += `\nFailed (${code}).\n`; } else run(i + 1); });
  };
  run(0); return job;
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sprite review</title>
<style>
:root{--bg:#16180f;--card:#22261a;--line:#3a4128;--ink:#e9e4d2;--dim:#9aa184;--red:#d0543a;--green:#6fa34a;--gold:#e0b04a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.35 system-ui,sans-serif}
header{position:sticky;top:0;z-index:2;background:#1d2014ee;border-bottom:1px solid var(--line);padding:10px 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
h1{font-size:16px;margin:0 12px 0 0}input{background:#11130b;border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:6px 10px;min-width:200px}
.chip{background:#11130b;border:1px solid var(--line);color:var(--dim);border-radius:999px;padding:4px 10px;cursor:pointer;font-size:12px}.chip.on{color:var(--ink);border-color:var(--gold)}
.btn{border:0;border-radius:6px;padding:7px 12px;font-weight:600;cursor:pointer}.rebuild{background:var(--gold);color:#1a1606}.rebuild:disabled{opacity:.5}
#status{color:var(--dim);font-size:12px;white-space:pre-wrap;max-width:420px;max-height:3.6em;overflow:hidden}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden;display:flex;flex-direction:column}
.card.removed{opacity:.45;border-color:var(--red)}.img{height:170px;display:flex;align-items:center;justify-content:center;background:#2b3120}
.img img{max-width:100%;max-height:100%;image-rendering:auto}.meta{padding:8px;flex:1}.id{font:11px ui-monospace,monospace;color:var(--dim);word-break:break-all}
.name{font-weight:600;margin-bottom:2px}.cat{font-size:11px;color:var(--gold)}.act{padding:0 8px 8px}
.act button{width:100%}.rm{background:var(--red);color:#fff}.rs{background:var(--green);color:#fff}
@media (max-width:600px){main{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));padding:16px}header{padding:10px 16px}}
</style></head><body>
<header><h1>Sprite review</h1><input id="q" placeholder="Search id or name"><span id="cats"></span>
<span style="flex:1"></span><span id="count"></span><button class="btn rebuild" id="rb">Rebuild game sprites</button><div id="status"></div></header>
<main id="grid"></main>
<script>
let all=[],removed={},cat='',q='';
const el=(t,a={},...k)=>{const e=document.createElement(t);Object.assign(e,a);for(const c of k)e.append(c);return e};
async function load(){const r=await (await fetch('/api/sprites')).json();all=r.sprites;removed=r.removed;cats();draw();}
function cats(){const c=[...new Set(all.map(s=>s.cat))].sort(),box=document.getElementById('cats');box.innerHTML='';
 for(const k of ['',...c,'Removed']){const b=el('span',{className:'chip'+(k===cat?' on':''),textContent:k||'All'});b.onclick=()=>{cat=k;cats();draw();};box.append(b);}}
function draw(){const g=document.getElementById('grid');g.innerHTML='';let n=0;
 const list=all.filter(s=>(cat==='Removed'?removed[s.id]:!cat||s.cat===cat)&&(!q||(s.id+' '+s.name).toLowerCase().includes(q)));
 for(const s of list){n++;const off=!!removed[s.id];
  const b=el('button',{className:'btn '+(off?'rs':'rm'),textContent:off?'Restore':'Remove from game'});
  b.onclick=async()=>{const r=await (await fetch('/api/'+(off?'restore':'remove'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:s.id})})).json();removed=r.removed;draw();count();};
  g.append(el('div',{className:'card'+(off?' removed':'')},el('div',{className:'img'},el('img',{src:'/thumb/'+encodeURIComponent(s.id),loading:'lazy',alt:s.name})),
   el('div',{className:'meta'},el('div',{className:'name',textContent:s.name}),el('div',{className:'cat',textContent:s.cat+' · '+s.kind}),el('div',{className:'id',textContent:s.id})),el('div',{className:'act'},b)));}
 count(n);}
function count(n){document.getElementById('count').textContent=(n!=null?n+' shown · ':'')+Object.keys(removed).length+' removed';}
document.getElementById('q').oninput=e=>{q=e.target.value.toLowerCase();draw();};
document.getElementById('rb').onclick=async()=>{await fetch('/api/rebuild',{method:'POST'});poll();};
async function poll(){const j=await (await fetch('/api/status')).json(),s=document.getElementById('status'),b=document.getElementById('rb');
 if(!j){s.textContent='';b.disabled=false;return;}b.disabled=!j.done;s.textContent=j.done?(j.code?'Rebuild failed: see the terminal':'Rebuilt: reload the game'):'Rebuilding: '+j.step+' …';if(!j.done)setTimeout(poll,2000);}
load();poll();
</script></body></html>`;

const body = req => new Promise(res => { let s = ''; req.on('data', d => { s += d; }); req.on('end', () => { try { res(JSON.parse(s || '{}')); } catch { res({}); } }); });
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), json = o => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(PAGE); }
    if (url.pathname === '/api/sprites') {
      const list = sprites(), have = new Set(list.map(s => s.id)), rm = readRemoved();
      // removed sprites that are gone from the atlas after a rebuild still show (from the thumbnail cache)
      for (const id of Object.keys(rm)) if (!have.has(id)) list.push({ id, name: rm[id].name ?? id, cat: rm[id].cat ?? 'Removed', kind: rm[id].kind ?? '', tex: null });
      return json({ sprites: list, removed: rm });
    }
    if (url.pathname.startsWith('/thumb/')) { const png = await thumb(decodeURIComponent(url.pathname.slice(7))); if (!png) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'max-age=3600' }); return res.end(png); }
    if (req.method === 'POST' && (url.pathname === '/api/remove' || url.pathname === '/api/restore')) {
      const { id } = await body(req), rm = readRemoved(), s = sprites().find(x => x.id === id);
      if (url.pathname === '/api/remove' && id) { await thumb(id).catch(() => null); rm[id] = { at: new Date().toISOString(), name: s?.name ?? rm[id]?.name, cat: s?.cat ?? rm[id]?.cat, kind: s?.kind ?? rm[id]?.kind }; }
      else delete rm[id];
      writeRemoved(rm); return json({ removed: rm });
    }
    if (req.method === 'POST' && url.pathname === '/api/rebuild') return json(rebuild());
    if (url.pathname === '/api/status') return json(job);
    res.writeHead(404); res.end();
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(PORT, '127.0.0.1', () => console.log(`sprite review: http://127.0.0.1:${PORT}/`));
