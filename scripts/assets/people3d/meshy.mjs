// Meshy's API (the owner's account, 2026-10-29): rig a person and make its clips, since RUN's rig and clips are down.
// The key is in .meshy-key at the repo root (git-ignored; never print it). Spends Meshy credits; each step's result is kept in
// <root>/<id>/meshy.json (and the shared text-to-motion tasks in output/meshy/motions.json), so a rerun skips what is done.
// The person's root, height and role come from art/people-cast.json; the clips per role from art/meshy-clips.json.
//
//   node scripts/assets/people3d/meshy.mjs balance
//   node scripts/assets/people3d/meshy.mjs rig <id> [--file plain.glb]   -> meshy_rigged.glb (Meshy remesh + rig, 10 credits)
//   node scripts/assets/people3d/meshy.mjs clips <id> [--tier p2] [--only run,cheer]  -> anim_<clip>.glb per p1 clip of its role
//     (3 credits each; --tier p2 adds the role's p2 clips)
//   node scripts/assets/people3d/meshy.mjs renders <id>                  -> "<clip> <frames> [mode]" lines for the clips it has
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const api = 'https://api.meshy.ai/openapi/v1';
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const [cmd, id] = process.argv.slice(2);
const log = s => console.log(`${new Date().toISOString()} ${s}`);
const readJson = async (f, d) => JSON.parse(await fs.readFile(f, 'utf8').catch(() => d));
const key = (await fs.readFile(path.join(root, '.meshy-key'), 'utf8')).trim();

async function call(method, url, body) {
  const r = await fetch(api + url, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${url}: ${r.status} ${t.slice(0, 300)}`);
  return JSON.parse(t);
}
// Polls a task until it ends; returns the task.
async function wait(kind, task) {
  for (;;) {
    const t = await call('GET', `/${kind}/${task}`);
    if (t.status === 'SUCCEEDED') return t;
    if (t.status === 'FAILED' || t.status === 'CANCELED') throw new Error(`${kind} ${task} ${t.status}: ${JSON.stringify(t.task_error ?? {})}`);
    await new Promise(r => setTimeout(r, 5000));
  }
}
async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}`);
  await fs.writeFile(file, Buffer.from(await r.arrayBuffer()));
}

if (cmd === 'balance') { console.log(await call('GET', '/balance')); process.exit(0); }
if (!id || !['rig', 'clips', 'renders'].includes(cmd)) throw new Error('Usage: meshy.mjs balance | rig <id> | clips <id> | renders <id> (see the header)');
const person = (await readJson(path.join(root, 'art/people-cast.json'), '{}')).people?.find(p => p.id === id);
if (!person) throw new Error(`${id} is not in art/people-cast.json`);
const map = await readJson(path.join(root, 'art/meshy-clips.json'), '{}');
const female = person.from === 'base_woman' || /_w_|girl/.test(id);
// the person's clips: its role's p1 list (most-wanted first; and p2 with --tier p2, or for `renders`), with the female replacements
const role = map.roles[person.meshyRole ?? (typeof person.clips === 'string' ? person.clips : null) ?? (person.role === 'town' ? 'town' : 'spectator')] ?? {};
const clips = Object.fromEntries(Object.entries({ ...role.p1, ...(arg('--tier') === 'p2' || cmd === 'renders' ? role.p2 : {}) })
  .map(([c, a]) => [c, female && map.female[c] !== undefined ? map.female[c] : a]));
const dir = path.join(root, person.root, id);
const stateFile = path.join(dir, 'meshy.json');
const state = await readJson(stateFile, '{"clips":{}}');
const save = () => fs.writeFile(stateFile, JSON.stringify(state, null, 2) + '\n');

if (cmd === 'renders') {
  for (const c of Object.keys(clips)) if (await fs.stat(path.join(dir, `anim_${c}.glb`)).catch(() => null)) console.log(c, ...(map.render[c] ?? '4').split(':'));
} else if (cmd === 'rig') {
  // RUN's model.glb (Draco, quantized, webp) fails Meshy's pose check and has about 500,000 faces (the rig takes at most 320,000):
  // meshy-plain-glb.mjs writes plain.glb, Meshy remeshes it to 100,000 faces, then rigs the remesh
  if (!state.remeshTask) {
    const glb = await fs.readFile(path.join(dir, arg('--file') ?? 'plain.glb'));
    const model_url = `data:model/gltf-binary;base64,${glb.toString('base64')}`;
    state.remeshTask = (await call('POST', '/remesh', { model_url, target_polycount: 100000, topology: 'triangle', target_formats: ['glb'] })).result;
    await save();
    log(`${id}: remesh task ${state.remeshTask}`);
  }
  state.remeshCredits = (await wait('remesh', state.remeshTask)).consumed_credits;
  if (!state.rigTask) { state.rigTask = (await call('POST', '/rigging', { input_task_id: state.remeshTask, height_meters: person.height })).result; await save(); }
  const t = await wait('rigging', state.rigTask);
  state.rigCredits = t.consumed_credits;
  await download(t.result.rigged_character_glb_url, path.join(dir, 'meshy_rigged.glb'));
  await save();
  log(`${id}: rigged (${(state.remeshCredits ?? 0) + (t.consumed_credits ?? 0)} credits) -> meshy_rigged.glb`);
} else {
  if (!state.rigTask) throw new Error(`${id}: rig it first (meshy.mjs rig ${id})`);
  const motionsFile = path.join(root, 'output/meshy/motions.json');
  // a text-to-motion clip is made once and shared by everyone; Meshy keeps it 3 days, so an older one is made again
  async function motion(name) {
    const motions = await readJson(motionsFile, '{}'), m = motions[name];
    if (m && Date.now() - m.made < 2.5 * 86400e3) return m.task;
    const spec = map.motions[name];
    const task = (await call('POST', '/text-to-motion', { prompt: spec.prompt, duration: spec.duration, mode: 'prime' })).result;
    const t = await wait('text-to-motion', task);
    motions[name] = { task, made: Date.now(), credits: t.consumed_credits };
    await fs.mkdir(path.dirname(motionsFile), { recursive: true });
    await fs.writeFile(motionsFile, JSON.stringify(motions, null, 2) + '\n');
    log(`motion ${name}: ${task} (${t.consumed_credits ?? '?'} credits)`);
    return task;
  }
  const only = arg('--only')?.split(',');
  for (const [clip, action] of Object.entries(clips)) {
    if (only && !only.includes(clip)) continue;
    const file = path.join(dir, `anim_${clip}.glb`), done = state.clips[clip];
    if (done?.action === action && await fs.stat(file).catch(() => null)) continue;
    try {
      let task = done?.action === action ? done.task : null;
      if (!task) {
        const body = typeof action === 'string' ? { motion_task_id: await motion(action.slice(2)) } : { action_id: action };
        task = (await call('POST', '/animations', { rig_task_id: state.rigTask, ...body })).result;
      }
      state.clips[clip] = { action, task }; await save();
      const t = await wait('animations', task);
      await download(t.result.animation_glb_url, file);
      state.clips[clip].credits = t.consumed_credits; await save();
      log(`${id}: ${clip} = ${action} (${t.consumed_credits ?? '?'} credits) -> anim_${clip}.glb`);
    } catch (e) { delete state.clips[clip]; await save(); log(`${id}: ${clip} FAILED: ${e.message}`); }
  }
}
