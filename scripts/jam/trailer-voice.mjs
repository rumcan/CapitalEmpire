// scripts/jam/trailer-voice.mjs: the trailer's voice-over lines (docs/jam/VIDEO.md "The voice"). Reads the script (numbered lines, each "N. [the shot] words"),
// says each line with Kokoro-82M (Apache-2.0, local: F:/voices/kokoro_say.py), and normalises it to -16 LUFS (ffmpeg loudnorm, two passes), one wav a line:
// <out>/<voice>/NN.wav (a line already said, by its words, voice and speed, is not said again: only changed lines are re-voiced), with lines.json (the words, the shot, the length). trailer-edit.mjs places line N at the start of the cut part that has "vo": N.
//   node scripts/jam/trailer-voice.mjs [--script F:/ClaudeTemp/jam/voice/script.md] [--voice am_michael] [--speed 0.95] [--out F:/ClaudeTemp/jam/voice]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const SCRIPT = resolve(opt('script', 'F:/ClaudeTemp/jam/voice/script.md')), VOICE = opt('voice', 'am_michael'), SPEED = opt('speed', '0.95');
const PY = opt('python', 'F:/voices/kokoro-venv/Scripts/python.exe'), SAY = opt('say', 'F:/voices/kokoro_say.py');
const OUT = join(resolve(opt('out', 'F:/ClaudeTemp/jam/voice')), VOICE); mkdirSync(OUT, { recursive: true });
const lines = readFileSync(SCRIPT, 'utf8').split('\n').map(l => /^(\d+)\.\s*\[([^\]]*)\]\s*(.+)$/.exec(l.trim())).filter(Boolean).map(m => ({ n: +m[1], shot: m[2], text: m[3].trim() }));
const probe = f => +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim();
const out = [];
for (const l of lines) {
  const nn = String(l.n).padStart(2, '0'), txt = join(OUT, `${nn}.txt`), raw = join(OUT, `said-${createHash('sha1').update(`${VOICE}|${SPEED}|${l.text}`).digest('hex').slice(0, 10)}.wav`), wav = join(OUT, `${nn}.wav`);
  writeFileSync(txt, l.text);
  if (!existsSync(raw) || opt('again', null)) { const r = spawnSync(PY, [SAY, txt, raw, VOICE, SPEED], { encoding: 'utf8' }); if (r.status !== 0) { console.error(`line ${l.n}: ${r.stderr.slice(-400)}`); process.exit(1); } }
  // loudness: measure, then apply (linear), -16 LUFS integrated, -1.5 dBTP; 48 kHz stereo for the mix
  const m = spawnSync('ffmpeg', ['-hide_banner', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const j = JSON.parse(m.slice(m.lastIndexOf('{'), m.lastIndexOf('}') + 1));
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000`, '-ac', '2', wav]);
  out.push({ ...l, file: wav, secs: +probe(wav).toFixed(2) });
  console.log(`${nn} ${out.at(-1).secs.toFixed(2)} s  ${l.text}`);
}
writeFileSync(join(OUT, 'lines.json'), JSON.stringify({ voice: VOICE, speed: +SPEED, script: SCRIPT, lines: out }, null, 1));
console.log(`${out.length} lines, ${out.reduce((s, l) => s + l.secs, 0).toFixed(1)} s of voice -> ${OUT}`);
