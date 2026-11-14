// J11 (#1270): makes the tutorial's voice-over files: one MP3 per step of the jam tutorial (tour.ts JAM_TOUR), the town tutorial (TOWN_TOUR) and the range guide
// (guide.ts RANGE_GUIDE), from exactly the text the card shows (src/game/sound/voice-steps.ts: its title and words, numbers and symbols written out as words for the voice
// only), named by the step's id and a hash of that text, and listed in src/game/sound/voice-manifest.json (the game plays a step's file only when it was made from its
// exact words). The voice ENGINE is one swappable command line (VOICE_CMD or --cmd):
//     VOICE_CMD='<a command that reads {textfile} and writes the speech to {out}>' node scripts/jam/make-voice.mjs
//   {textfile}  the path of a UTF-8 text file holding the words to say        {out}  the path the engine must write its audio to (a .wav; any format ffmpeg reads)
//   the environment has them too (VOICE_TEXT, VOICE_OUT, VOICE_KEY), for an engine that takes the words as an argument. The command runs through the shell, once per step.
//   e.g. Piper:  VOICE_CMD='piper --model F:/voices/en_US-ryan-high.onnx --output_file {out} < {textfile}'
// Do NOT use Windows' built-in voices (the owner refused their robotic sound: "make sure the tutorial voices dont sound like steven hawking").
// Then ffmpeg makes each a mono 24 kHz MP3 at 48 kbps, -16 LUFS, its leading silence cut (a step is about 100 KB).
//   node scripts/jam/make-voice.mjs [--list] [--force] [--set jam|tour|guide|all] [--only key,key] [--cmd '...'] [--engine-name 'Piper en_US-ryan-high']
//                                   [--out public/audio/voice] [--manifest src/game/sound/voice-manifest.json]
// --list prints the steps and the words each would be said as, and makes nothing.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2), has = k => args.includes(`--${k}`), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolve(ROOT, opt('out', 'public/audio/voice')), MANIFEST = resolve(ROOT, opt('manifest', 'src/game/sound/voice-manifest.json'));
const CMD = opt('cmd', process.env.VOICE_CMD ?? ''), SET = opt('set', 'all'), ONLY = opt('only', '') ? opt('only', '').split(',') : null;

// the steps and their words, from the game's own source (bundled for node: the same functions the game uses)
const bundle = await build({ entryPoints: [resolve(ROOT, 'src/game/sound/voice-steps.ts')], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error', target: 'es2022' });
const mod = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const steps = mod.voiceSteps().filter(s => SET === 'all' || s.set === SET).map(s => ({ ...s, key: mod.voiceKey(s.id, s.title, s.body), say: mod.spokenStep(s.title, s.body) }))
  .filter(s => !ONLY || ONLY.includes(s.key));

if (has('list')) {
  for (const s of steps) console.log(`[${s.set}] ${s.key}\n    ${s.say}`);
  console.log(`\n${steps.length} steps`);
  process.exit(0);
}
if (!CMD) { console.error('no voice engine: set VOICE_CMD (or --cmd) to a command that reads {textfile} and writes speech to {out}; see the top of this script. Nothing was made.'); process.exit(2); }
if (/\b(SAPI|System\.Speech|Add-Type|espeak|Microsoft (David|George|Zira|Mark)|say\.exe)\b/i.test(CMD)) { console.error('that looks like a built-in system voice (robotic): the owner refused those. Use a natural-sounding neural voice. Nothing was made.'); process.exit(2); }

const work = mkdtempSync(join(tmpdir(), 'ff-voice-'));
mkdirSync(OUT, { recursive: true });
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { voices: {} };
manifest.voices ??= {};
if (opt('engine-name', '')) manifest.engine = opt('engine-name', '');
const q = p => `"${p}"`; // (paths without quotes in them: the shell's own)
let made = 0, failed = 0;
for (const s of steps) {
  const file = join(OUT, `${s.key}.mp3`);
  if (existsSync(file) && manifest.voices[s.key] && !has('force')) { console.log(`have  ${s.key}`); continue; }
  const textfile = join(work, `${s.key}.txt`), raw = join(work, `${s.key}.wav`);
  writeFileSync(textfile, s.say, 'utf8');
  const cmd = CMD.split('{textfile}').join(q(textfile)).split('{out}').join(q(raw));
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', env: { ...process.env, VOICE_TEXT: s.say, VOICE_OUT: raw, VOICE_KEY: s.key }, maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000 });
  if (r.status !== 0 || !existsSync(raw) || statSync(raw).size < 2000) { console.error(`FAIL  ${s.key}: the engine ${r.status !== 0 ? `exited ${r.status}` : 'wrote no audio'}\n${(r.stderr || '').slice(-400)}`); failed++; continue; }
  const af = 'silenceremove=start_periods=1:start_silence=0.08:start_threshold=-50dB,loudnorm=I=-16:TP=-1.5:LRA=9,afade=t=in:d=0.02';
  const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-y', '-i', raw, '-vn', '-map_metadata', '-1', '-af', af, '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '48k', '-metadata', `title=${s.id}`, file], { encoding: 'utf8' });
  if (e.status !== 0) { console.error(`FAIL  ${s.key}: ffmpeg\n${(e.stderr || '').slice(-400)}`); failed++; continue; }
  const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' }), seconds = Number(p.stdout);
  if (!(seconds > 0.5)) { console.error(`FAIL  ${s.key}: the file is ${seconds} s`); rmSync(file, { force: true }); failed++; continue; }
  manifest.voices[s.key] = { file: `audio/voice/${s.key}.mp3`, bytes: statSync(file).size, seconds: Math.round(seconds * 10) / 10 };
  made++; console.log(`made  ${s.key}  ${seconds.toFixed(1)} s  ${(statSync(file).size / 1024).toFixed(0)} KB`);
}
// a file whose step's words changed (its key is no longer in the game) is taken out, so the zip carries no dead voice
if (!ONLY && SET === 'all' && !failed) for (const k of Object.keys(manifest.voices)) if (!steps.some(s => s.key === k)) { rmSync(join(OUT, `${k}.mp3`), { force: true }); delete manifest.voices[k]; console.log(`gone  ${k} (no step has these words now)`); }
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
rmSync(work, { recursive: true, force: true });
const all = Object.values(manifest.voices);
console.log(`\n${made} made, ${failed} failed; ${all.length} voice files, ${(all.reduce((a, v) => a + v.bytes, 0) / 1048576).toFixed(2)} MB in ${OUT}`);
process.exit(failed ? 1 : 0);
