// J11 (#1270): makes the radio's music files from the downloaded sources (CC0 tracks from OpenGameArt, kept untrusted in their own folders under
// F:/ClaudeTemp/jam/audio-src/<name>/; nothing there is ever run, ffmpeg only reads them). One MP3 per track in public/audio/music/ (loudness set to
// -18 LUFS in two passes so the radio does not jump from track to track, a short fade in and out, 80 kbps joint stereo) and src/game/sound/tracks.json,
// the list the radio reads (its titles, artists, licences, lengths and sizes). Prints the rows of docs/jam/AUDIO-CREDITS.md.
//   node scripts/jam/make-music.mjs [--src F:/ClaudeTemp/jam/audio-src] [--only id,id] [--kbps 80]
// The licence of each source was read from its OpenGameArt page's record (CC0 only; see docs/jam/AUDIO-CREDITS.md for what was checked and how).
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = resolve(opt('src', 'F:/ClaudeTemp/jam/audio-src')), OUT = join(ROOT, 'public', 'audio', 'music'), KBPS = Number(opt('kbps', 80)), ONLY = opt('only', '') ? opt('only', '').split(',') : null;
const TARGET_LUFS = -18, TRUE_PEAK = -2;

/** the radio's tracks, in playing order. page: where the track is on OpenGameArt; fetched: the day the file was downloaded */
const TRACKS = [
  { id: 'bossa-town', title: 'Bossa Town', artist: 'KarateStudios', src: 'oga-bossa-town/bossa_town.flac', page: 'https://opengameart.org/content/bossa-town', licence: 'CC0 1.0', fetched: '2026-11-14' },
  { id: 'all-into-harmony', title: 'All into Harmony', artist: 'Pro Sensory (Alex McCulloch)', src: 'oga-all-into-harmony/all_into_harmony.mp3', page: 'https://opengameart.org/content/all-into-harmony', licence: 'CC0 1.0', fetched: '2026-11-14' },
  { id: 'blue-intermission', title: 'Blue Intermission', artist: 'congusbongus', src: 'oga-blue-intermission/blue_intermission.ogg', page: 'https://opengameart.org/content/blue-intermission', licence: 'CC0 1.0', fetched: '2026-11-14' },
  { id: 'seaside-village', title: 'Seaside Village', artist: 'KarateStudios', src: 'oga-seaside-village/seaside_village.flac', page: 'https://opengameart.org/content/seaside-village', licence: 'CC0 1.0', fetched: '2026-11-14' },
  { id: 'two-left-socks', title: 'Two Left Socks', artist: 'congusbongus', src: 'oga-two-left-socks/two_left_socks.ogg', page: 'https://opengameart.org/content/two-left-socks', licence: 'CC0 1.0', fetched: '2026-11-14' },
  { id: 'sunny-side-up-2', title: 'Sunny Side Up 2', artist: 'Pro Sensory (Alex McCulloch)', src: 'oga-sunny-side-up-2/sunny_side_up_2.mp3', page: 'https://opengameart.org/content/sunny-side-up-2', licence: 'CC0 1.0', fetched: '2026-11-14' },
  // the owner, 2026-11-14: "https://opengameart.org/content/5-chiptunes-action add these chiptunes to the radio" (one zip, 49.6 MB, five looping WAVs; CC0 on the page and in its INFO.txt)
  { id: 'chip-title-screen', title: 'Chiptune: Title Screen', artist: 'Juhani Junkala (SubspaceAudio)', src: 'chiptunes-action/x/title-screen-x4.wav' /* the 11 s loop played four times (ffmpeg -stream_loop 3 -c copy), so it is a track of its own */, page: 'https://opengameart.org/content/5-chiptunes-action', licence: 'CC0 1.0', fetched: '2026-11-14' },
  { id: 'chip-level-1', title: 'Chiptune: Level 1', artist: 'Juhani Junkala (SubspaceAudio)', src: 'chiptunes-action/x/Juhani Junkala [Retro Game Music Pack] Level 1.wav', page: 'https://opengameart.org/content/5-chiptunes-action', licence: 'CC0 1.0', fetched: '2026-11-14' },
  { id: 'chip-level-2', title: 'Chiptune: Level 2', artist: 'Juhani Junkala (SubspaceAudio)', src: 'chiptunes-action/x/Juhani Junkala [Retro Game Music Pack] Level 2.wav', page: 'https://opengameart.org/content/5-chiptunes-action', licence: 'CC0 1.0', fetched: '2026-11-14' },
  { id: 'chip-level-3', title: 'Chiptune: Level 3', artist: 'Juhani Junkala (SubspaceAudio)', src: 'chiptunes-action/x/Juhani Junkala [Retro Game Music Pack] Level 3.wav', page: 'https://opengameart.org/content/5-chiptunes-action', licence: 'CC0 1.0', fetched: '2026-11-14' },
  { id: 'chip-ending', title: 'Chiptune: Ending', artist: 'Juhani Junkala (SubspaceAudio)', src: 'chiptunes-action/x/Juhani Junkala [Retro Game Music Pack] Ending.wav', page: 'https://opengameart.org/content/5-chiptunes-action', licence: 'CC0 1.0', fetched: '2026-11-14' },
];

const run = (cmd, a) => spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const probe = f => { const r = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,bit_rate:stream=codec_name,channels,sample_rate', '-of', 'json', f]); if (r.status !== 0) throw new Error(`ffprobe failed on ${f}: ${r.stderr}`); const j = JSON.parse(r.stdout); return { seconds: Number(j.format.duration), codec: j.streams?.[0]?.codec_name, channels: j.streams?.[0]?.channels, rate: j.streams?.[0]?.sample_rate }; };
const mb = n => (n / 1048576).toFixed(2) + ' MB';

mkdirSync(OUT, { recursive: true });
const done = [], credits = [];
for (const t of TRACKS) {
  if (ONLY && !ONLY.includes(t.id)) continue;
  const from = join(SRC, t.src), to = join(OUT, `${t.id}.mp3`);
  if (!existsSync(from)) { console.error(`missing source ${from}`); process.exit(2); }
  const before = probe(from), orig = statSync(from).size;
  // pass 1: measure the loudness
  const m = run('ffmpeg', ['-hide_banner', '-nostats', '-i', from, '-vn', '-af', `loudnorm=I=${TARGET_LUFS}:TP=${TRUE_PEAK}:LRA=11:print_format=json`, '-f', 'null', '-']);
  const js = /\{[^{}]*"input_i"[^{}]*\}/.exec(m.stderr)?.[0];
  if (!js) { console.error(`no loudness measure for ${t.id}:\n${m.stderr.slice(-600)}`); process.exit(3); }
  const L = JSON.parse(js);
  // pass 2: that gain exactly (linear), a short fade in and a longer fade out, stereo at 44.1 kHz, 80 kbps, no tags of the source's, ours instead
  const fadeOut = Math.max(0, before.seconds - 1.8);
  const af = `loudnorm=I=${TARGET_LUFS}:TP=${TRUE_PEAK}:LRA=11:measured_I=${L.input_i}:measured_TP=${L.input_tp}:measured_LRA=${L.input_lra}:measured_thresh=${L.input_thresh}:offset=${L.target_offset}:linear=true,aresample=44100,afade=t=in:d=0.4,afade=t=out:st=${fadeOut.toFixed(2)}:d=1.8`;
  const e = run('ffmpeg', ['-hide_banner', '-nostats', '-y', '-i', from, '-vn', '-map_metadata', '-1', '-af', af, '-ac', '2', '-c:a', 'libmp3lame', '-b:a', `${KBPS}k`, '-joint_stereo', '1',
    '-metadata', `title=${t.title}`, '-metadata', `artist=${t.artist}`, '-metadata', `copyright=${t.licence}, ${t.page}`, '-id3v2_version', '3', to]);
  if (e.status !== 0) { console.error(`ffmpeg failed on ${t.id}:\n${e.stderr.slice(-800)}`); process.exit(4); }
  const after = probe(to), bytes = statSync(to).size;
  if (!(after.seconds > 30) || Math.abs(after.seconds - before.seconds) > 1.5 || after.codec !== 'mp3') { console.error(`${t.id}: the output is wrong: ${JSON.stringify(after)} (source ${before.seconds}s)`); process.exit(5); }
  done.push({ id: t.id, title: t.title, artist: t.artist, licence: t.licence, page: t.page, file: `audio/music/${t.id}.mp3`, seconds: Math.round(after.seconds), bytes });
  credits.push(`| ${t.title} | ${t.artist} | ${t.page} | ${t.licence} | ${t.fetched} | ${t.src.split('/')[1]} (${before.codec}, ${mb(orig)}, ${Math.round(before.seconds)} s) | public/audio/music/${t.id}.mp3 (mp3 ${KBPS} kbps, ${mb(bytes)}, ${Math.round(after.seconds)} s; input ${Number(L.input_i).toFixed(1)} LUFS to ${TARGET_LUFS}) |`);
  console.log(`${t.id.padEnd(18)} ${Math.round(after.seconds)} s  ${mb(bytes)}  (source ${before.codec} ${mb(orig)}, ${Number(L.input_i).toFixed(1)} LUFS, true peak ${Number(L.input_tp).toFixed(1)} dB)`);
}
if (!ONLY) writeFileSync(join(ROOT, 'src', 'game', 'sound', 'tracks.json'), JSON.stringify({ tracks: done }, null, 1) + '\n');
const total = done.reduce((a, d) => a + d.bytes, 0);
console.log(`\n${done.length} tracks, ${mb(total)}, ${Math.round(done.reduce((a, d) => a + d.seconds, 0))} s of music\n\n${credits.join('\n')}`);
