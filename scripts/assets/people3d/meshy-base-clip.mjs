// A base person's clips straight from Meshy's API (RUN's animate-3d knows only idle, walk, run and jump; Meshy's library has 680, among them
// golf_drive, id 323): Meshy rigs the base's model (art/people3d/<base>/receipt.json modelUrl, RUN's A-pose model) and animates it with the
// library actions, and each clip is saved as art/people3d/<base>/anim_<clip>.glb, which rig-local-person.mjs then moves onto every person of
// that base (make-cast.mjs does it for the people whose cast entry lists the clip).
// About 5 Meshy credits a rig and 3 an action (2026-10-25); the rig is kept (meshy.json) and reused, so a clip later costs only its action.
// The key: MESHY_API_KEY, or the file ~/.meshy/api-key (outside the repo; never printed, never committed). The API needs a paid Meshy plan.
//
//   node scripts/assets/people3d/meshy-base-clip.mjs <base> <clip>=<action id> [<clip>=<action id> ...] [--height <m>] [--model <plain glb>] [--remesh <faces>]
//     e.g. meshy-base-clip.mjs base_man golf_drive=323    (the action ids: https://api.meshy.ai/web/public/animations/resources)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [base, ...rest] = process.argv.slice(2), arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const clips = rest.filter(a => /^[a-z][a-z0-9_]*=\d+$/.test(a)).map(a => { const [clip, id] = a.split('='); return { clip, id: +id }; });
if (!base || !clips.length) throw new Error('Usage: node scripts/assets/people3d/meshy-base-clip.mjs <base> <clip>=<action id> [...] [--height m]');
const keyFile = path.join(os.homedir(), '.meshy', 'api-key');
const key = (process.env.MESHY_API_KEY ?? (fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8') : '')).trim();
if (!key) throw new Error(`No Meshy API key: set MESHY_API_KEY or save it in ${keyFile}`);
const dir = path.join(root, 'art/people3d', base), receiptFile = path.join(dir, 'meshy.json');
const receipt = fs.existsSync(receiptFile) ? JSON.parse(fs.readFileSync(receiptFile, 'utf8')) : {};
const save = () => fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n');
const api = async (method, url, body) => {
  const r = await fetch(`https://api.meshy.ai/openapi/v1/${url}`, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Meshy ${method} ${url}: ${r.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
};
/** a task, polled every 10 s until it ends (up to 30 min) */
async function wait(kind, id) {
  for (let k = 0; k < 180; k++) {
    const t = await api('GET', `${kind}/${id}`);
    if (t.status === 'SUCCEEDED') return t;
    if (t.status === 'FAILED' || t.status === 'CANCELED') throw new Error(`Meshy ${kind} ${id} ${t.status}: ${JSON.stringify(t.task_error ?? t).slice(0, 300)}`);
    if (k % 6 === 0) console.log(`${base}: ${kind} ${t.status} ${t.progress ?? 0}%`);
    await new Promise(r => setTimeout(r, 10000));
  }
  throw new Error(`Meshy ${kind} ${id} did not end in 30 min`);
}

console.log(`${base}: Meshy balance ${(await api('GET', 'balance')).balance} credits`);
// 1. the rig (once): Meshy's own skeleton on the base's RUN model. A failed task (refunded) is forgotten, so a rerun tries again
for (const [k, kind] of [['remeshTaskId', 'remesh'], ['rigTaskId', 'rigging']])
  if (receipt[k] && ['FAILED', 'CANCELED'].includes((await api('GET', `${kind}/${receipt[k]}`)).status)) { delete receipt[k]; save(); }
if (!receipt.rigTaskId) {
  // RUN's own file (Draco, WebP, a turned Z-up root) failed Meshy's pose estimation (2026-10-25): --model sends a plain GLB inline instead
  // (plain-glb.mjs; up to 100 MB as a data URI)
  const plain = arg('--model'), modelUrl = plain ? `data:model/gltf-binary;base64,${fs.readFileSync(plain).toString('base64')}`
    : JSON.parse(fs.readFileSync(path.join(dir, 'receipt.json'), 'utf8')).modelUrl;
  if (!modelUrl) throw new Error(`${base}: no modelUrl in receipt.json (or give --model <plain glb>)`);
  const height = +(arg('--height') ?? JSON.parse(fs.readFileSync(path.join(dir, 'sheet.json'), 'utf8')).heightMetres ?? 1.75);
  // and RUN's 500,000 triangles were "not a single, well-formed humanoid" to the rigger: --remesh <faces> has Meshy rebuild the mesh first
  // and rigs that task's model (the rig is only the clip's carrier: rig-local-person.mjs keeps every person's own mesh and texture)
  let source = { model_url: modelUrl };
  if (arg('--remesh')) {
    if (!receipt.remeshTaskId) {
      receipt.remeshTaskId = (await api('POST', 'remesh', { model_url: modelUrl, target_polycount: +arg('--remesh'), topology: 'triangle', target_formats: ['glb'] })).result; save();
      console.log(`${base}: remesh ${receipt.remeshTaskId} (${arg('--remesh')} faces)`);
    }
    await wait('remesh', receipt.remeshTaskId);
    source = { input_task_id: receipt.remeshTaskId };
  }
  receipt.rigTaskId = (await api('POST', 'rigging', { ...source, height_meters: height })).result; save();
  console.log(`${base}: rigging ${receipt.rigTaskId} (height ${height} m)`);
}
await wait('rigging', receipt.rigTaskId);
// 2. each clip: an animation task on that rig, its GLB (the rigged mesh, skeleton and the one clip) saved as anim_<clip>.glb
receipt.clips ??= {};
for (const { clip, id } of clips) {
  const want = path.join(dir, `anim_${clip}.glb`);
  if (fs.existsSync(want)) { console.log(`${base}: anim_${clip}.glb is already there`); continue; }
  const task = receipt.clips[clip]?.actionId === id ? receipt.clips[clip].taskId : null;
  const taskId = task ?? (await api('POST', 'animations', { rig_task_id: receipt.rigTaskId, action_id: id, post_process: { operation_type: 'change_fps', fps: 30 } })).result;
  receipt.clips[clip] = { actionId: id, taskId }; save();
  const t = await wait('animations', taskId), url = t.result?.animation_glb_url;
  if (!url) throw new Error(`${base}: animation ${taskId} has no GLB (${JSON.stringify(t.result).slice(0, 200)})`);
  const r = await fetch(url); if (!r.ok) throw new Error(`${base}: download ${r.status}`);
  fs.writeFileSync(want, Buffer.from(await r.arrayBuffer()));
  // its textures are 9 of its 13 MB and unused (strip-glb-images.mjs; the people's sheets come out byte-identical without them)
  spawnSync(process.execPath, [path.join(root, 'scripts/assets/people3d/strip-glb-images.mjs'), want], { stdio: 'inherit' });
  console.log(`${base}: ${clip} (Meshy action ${id}) -> ${path.relative(root, want)} (${t.consumed_credits ?? '?'} credits)`);
}
console.log(`${base}: Meshy balance now ${(await api('GET', 'balance')).balance} credits`);
