// scripts/jam/trailer-edit.mjs: the trailer's cut (scripts/jam/trailer.mjs edit; docs/jam/VIDEO.md). Reads scripts/jam/trailer-cut.json (the parts in order:
// a shot from <out>/shots, its in and out seconds, a speed, the caption over it) and makes <out>/trailer.mp4: each part trimmed, sped up where asked
// (a time-lapse, or a camera move recorded slower than it plays), the caption burned in (ffmpeg drawtext, fading in and out), hard cuts between parts, the
// end card (the logo or the name, the jam, the play link), and one of the game's own radio tracks under it all (CC0, docs/jam/AUDIO-CREDITS.md).
//   --cut file   another cut list; --link text   the end card's play line
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ff = (args, cwd) => { const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { cwd, stdio: ['ignore', 'inherit', 'inherit'] }); if (r.status !== 0) throw new Error('ffmpeg failed: ' + args.join(' ').slice(0, 300)); };
const probe = f => { const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }); return +r.stdout.trim(); };

export async function edit({ OUT, FPS, opt }) {
  const cut = JSON.parse(readFileSync(resolve(opt('cut', 'scripts/jam/trailer-cut.json')), 'utf8'));
  // a preview (the music choice): --upto N keeps the parts up to voice line N (the parts after it until the next line too), no end card, no phone copy;
  // --music a track (--music-from s into it), --file the output file
  const upto = +opt('upto', 0); if (upto) { const k = cut.parts.findIndex(p => p.vo > upto); if (k >= 0) cut.parts = cut.parts.slice(0, k); cut.noEnd = true; cut.noPhone = true; }
  if (opt('music', null)) cut.music = opt('music', null); if (opt('music-from', null)) cut.musicFrom = +opt('music-from', 0); if (opt('file', null)) cut.out = opt('file', null);
  const E = join(OUT, 'edit'); rmSync(E, { recursive: true, force: true }); mkdirSync(join(E, 'fonts'), { recursive: true });
  // the fonts beside the work (drawtext reads a relative path: no drive colons to escape)
  for (const f of ['bahnschrift.ttf', 'georgiab.ttf', 'segoeui.ttf']) if (existsSync(`C:/Windows/Fonts/${f}`)) copyFileSync(`C:/Windows/Fonts/${f}`, join(E, 'fonts', f));
  const logo = resolve(cut.logo ?? 'src/assets/ui/brand/logo.webp'), hasLogo = existsSync(logo);
  if (hasLogo) ff(['-i', logo, '-vf', 'scale=900:-1', join(E, 'logo.png')]);
  const W = 1920, H = 1080, parts = [];
  const text = (name, s) => { writeFileSync(join(E, name), s); return name; };
  /** a caption: bottom left, white on a soft dark band, fading in and out over the part's length d */
  const caption = (txt, d, i, size = 64) => {
    const f = text(`cap${i}.txt`, txt), a = `if(lt(t,0.25),t/0.25,if(gt(t,${(d - 0.3).toFixed(2)}),max(0,(${d.toFixed(2)}-t)/0.3),1))`;
    return `drawbox=x=0:y=ih-230:w=iw:h=230:color=black@0.28:t=fill:enable='gte(t,0)',drawtext=fontfile=fonts/bahnschrift.ttf:textfile=${f}:fontsize=${size}:fontcolor=white:x=110:y=h-170:alpha='${a}':shadowcolor=black@0.6:shadowx=2:shadowy=3`;
  };
  // the voice-over (trailer-voice.mjs): line N starts with the part that has "vo": N (the end card's "end.vo"); --voice picks the take (default the cut's)
  const VO = (() => { const v = opt('voice', null) ?? cut.voice; if (!v) return null; const f = join(resolve(cut.voiceDir ?? 'F:/ClaudeTemp/jam/voice'), v, 'lines.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; })();
  const voLen = n => VO?.lines.find(l => l.n === n)?.secs ?? 0, GAP = cut.voiceGap ?? 0.45;
  // the parts resolved (a negative from or to counts back from the clip's end: a stage's result is its last seconds)
  const R = [];
  cut.parts.forEach((p0, i) => {
    const src = join(OUT, 'shots', `${p0.shot}.mp4`); if (!existsSync(src)) { console.log(`skip ${p0.shot}: no clip`); return; }
    const D = probe(src), p = { ...p0, i, src, D, from: p0.from < 0 ? Math.max(0, D + p0.from) : p0.from, to: p0.to <= 0 ? D + p0.to : Math.min(p0.to, D), sp: p0.speed ?? 1, hold: 0 };
    p.len = (p.to - p.from) / p.sp; R.push(p);
  });
  // the shots fit the lines (the lead, 2026-11-15: a shot may be longer than its line, never shorter): each line's parts (from its "vo" part to the next one's) are
  // stretched at their last part: slower first (not below 1x), then more of its clip, then its last frame held
  if (VO) for (let a = 0; a < R.length; a++) {
    if (!R[a].vo) continue; let b = a + 1; while (b < R.length && !R[b].vo) b++;
    const need = voLen(R[a].vo) + GAP, have = R.slice(a, b).reduce((s, p) => s + p.len, 0); let short = need - have; if (short <= 0) continue;
    const p = R[b - 1];
    if (p.sp > 1) { const sp = Math.max(1, (p.to - p.from) / (p.len + short)); short -= (p.to - p.from) / sp - p.len; p.sp = sp; p.len = (p.to - p.from) / sp; }
    if (short > 0) { const more = Math.min(short * p.sp, p.D - p.to); p.to += more; p.len = (p.to - p.from) / p.sp; short -= more / p.sp; }
    if (short > 0) { p.hold = short; p.len += short; }
  }
  for (const p of R) {
    const i = p.i, sp = p.sp, len = p.len, out = `p${String(i).padStart(2, '0')}.mp4`;
    const vf = [`setpts=(PTS-STARTPTS)/${sp}`, `scale=${W}:${H}:flags=lanczos`, `fps=${FPS}`, ...(p.hold > 0 ? [`tpad=stop_mode=clone:stop_duration=${p.hold.toFixed(3)}`] : [])];
    let args;
    if (p.title) {
      // the opening: the menu scene with the logo (or the name) over it
      const t = hasLogo ? null : text(`title${i}.txt`, cut.name ?? 'Golf Manager 2026');
      const fc = hasLogo
        ? `[0:v]${vf.join(',')}[b];[1:v]format=rgba,fade=in:st=0.4:d=0.6:alpha=1[l];[b][l]overlay=(W-w)/2:(H-h)/2-30[v]`
        : `[0:v]${vf.join(',')},drawtext=fontfile=fonts/georgiab.ttf:textfile=${t}:fontsize=130:fontcolor=0xFFE7A0:x=(w-tw)/2:y=(h-th)/2-30:shadowcolor=black@0.7:shadowx=4:shadowy=5:alpha='min(1,max(0,(t-0.4)/0.6))'[v]`;
      args = ['-ss', String(p.from), '-t', String(p.to - p.from), '-i', p.src, ...(hasLogo ? ['-loop', '1', '-i', 'logo.png'] : []), '-filter_complex', fc, '-map', '[v]', '-t', len.toFixed(3)];
    } else {
      if (p.caption) vf.push(caption(p.caption, len, i));
      args = ['-ss', String(p.from), '-t', String(p.to - p.from), '-i', p.src, '-vf', vf.join(','), '-t', len.toFixed(3)];
    }
    ff([...args, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', String(cut.crf ?? 17), '-pix_fmt', 'yuv420p', '-r', String(FPS), out], E);
    parts.push({ out, len, shot: p.shot, caption: p.caption ?? (p.title ? '(title)' : ''), vo: p.vo ?? null });
  }
  // the end card: a still of the club, darkened, the logo (or the name), the jam and the play line
  if (!cut.noEnd) { const endSrc = join(OUT, 'shots', `${cut.end?.still ?? 'alive'}.mp4`), endLen = Math.max(cut.end?.len ?? 4.5, VO && cut.end?.vo ? voLen(cut.end.vo) + 1.2 : 0);
  {
    const n = text('end-name.txt', cut.name ?? 'Golf Manager 2026'), j = text('end-jam.txt', cut.end?.jam ?? 'Made for the Zoud GameLab game jam 2026'), l = text('end-link.txt', opt('link', null) ?? cut.end?.link ?? 'Play free in your browser  ·  itch.io link here');
    const base = existsSync(endSrc) ? ['-ss', '1', '-t', String(endLen), '-i', endSrc] : ['-f', 'lavfi', '-t', String(endLen), '-i', `color=c=0x10202a:s=${W}x${H}:r=${FPS}`];
    const words = `drawtext=fontfile=fonts/bahnschrift.ttf:textfile=${j}:fontsize=44:fontcolor=white@0.92:x=(w-tw)/2:y=h*0.74,drawtext=fontfile=fonts/bahnschrift.ttf:textfile=${l}:fontsize=52:fontcolor=0xFFD66B:x=(w-tw)/2:y=h*0.83`;
    const fc = hasLogo
      ? `[0:v]scale=${W}:${H},fps=${FPS},boxblur=12:2,eq=brightness=-0.18[b];[1:v]format=rgba[l];[b][l]overlay=(W-w)/2:H*0.10,${words},fade=in:st=0:d=0.5,fade=out:st=${endLen - 0.8}:d=0.8[v]`
      : `[0:v]scale=${W}:${H},fps=${FPS},boxblur=12:2,eq=brightness=-0.18,drawtext=fontfile=fonts/georgiab.ttf:textfile=${n}:fontsize=140:fontcolor=0xFFE7A0:x=(w-tw)/2:y=h*0.32:shadowcolor=black@0.7:shadowx=4:shadowy=5,${words},fade=in:st=0:d=0.5,fade=out:st=${endLen - 0.8}:d=0.8[v]`;
    ff([...base, ...(hasLogo ? ['-loop', '1', '-i', 'logo.png'] : []), '-filter_complex', fc, '-map', '[v]', '-t', String(endLen), '-an', '-c:v', 'libx264', '-crf', String(cut.crf ?? 17), '-pix_fmt', 'yuv420p', '-r', String(FPS), 'end.mp4'], E);
    parts.push({ out: 'end.mp4', len: endLen, shot: 'end card', caption: '', vo: cut.end?.vo ?? null });
  } }
  writeFileSync(join(E, 'list.txt'), parts.map(p => `file '${p.out}'`).join('\n') + '\n');
  ff(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'video.mp4'], E);
  const dur = probe(join(E, 'video.mp4'));
  // the music: one radio track under the whole cut, in at once, out over the end card; with a voice, each line at its part's start and the music
  // ducked 10 dB under it (0.25 s ramps either side)
  const music = resolve(cut.music ?? 'public/audio/music/sunny-side-up-2.mp3');
  const final = join(OUT, cut.out ?? 'trailer.mp4');
  const lines = []; { let t = 0; for (const p of parts) { if (VO && p.vo) { const l = VO.lines.find(q => q.n === p.vo); if (l) lines.push({ at: t + (cut.voiceLead ?? 0.25), ...l }); } t += p.len; } }
  const RAMP = 0.25, duckK = 1 - Math.pow(10, -(cut.duckDb ?? 10) / 20);
  const win = l => `clip((t-${(l.at - RAMP).toFixed(2)})/${RAMP},0,1)*clip((${(l.at + l.secs + RAMP).toFixed(2)}-t)/${RAMP},0,1)`;
  const duck = lines.length ? lines.map(win).reduce((a, b) => `max(${a},${b})`) : '0';
  const vin = lines.flatMap(l => ['-i', l.file]);
  const vmix = lines.map((l, k) => `[${k + 2}:a]adelay=${Math.round(l.at * 1000)}|${Math.round(l.at * 1000)}[v${k}]`).join(';');
  const fc = `[1:a]atrim=${(cut.musicFrom ?? 0).toFixed(2)}:${((cut.musicFrom ?? 0) + dur).toFixed(2)},asetpts=PTS-STARTPTS,aresample=48000,afade=t=in:st=0:d=0.4,afade=t=out:st=${(dur - 2.5).toFixed(2)}:d=2.5,volume='${cut.musicVol ?? 0.9}*(1-${duckK.toFixed(3)}*(${duck}))':eval=frame[m]` +
    (lines.length ? `;${vmix};${lines.map((_, k) => `[v${k}]`).join('')}amix=inputs=${lines.length}:normalize=0:duration=longest[vo];[m][vo]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]` : ';[m]anull[a]');
  writeFileSync(join(E, 'mix.txt'), fc);
  ff(['-i', 'video.mp4', '-i', music, ...vin, '-/filter_complex', 'mix.txt', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', dur.toFixed(3), '-movflags', '+faststart', final], E);
  if (lines.length) writeFileSync(join(OUT, (cut.out ?? 'trailer.mp4').replace(/.mp4$/, '-voice.json')), JSON.stringify(lines.map(l => ({ n: l.n, at: +l.at.toFixed(2), secs: l.secs, text: l.text })), null, 1));
  if (!cut.noPhone) {
  // a 720p copy for a phone, held under 30 MB (two-pass at the bitrate that fits, audio 128k)
  const phone = final.replace(/.mp4$/, '-720p.mp4'), secs = probe(final), vk = Math.max(600, Math.floor((28 * 8 * 1024) / secs - 128));
  ff(['-i', final, '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium', '-b:v', `${vk}k`, '-pass', '1', '-passlogfile', 'p720', '-an', '-f', 'mp4', 'NUL'], E);
  ff(['-i', final, '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium', '-b:v', `${vk}k`, '-pass', '2', '-passlogfile', 'p720', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', phone], E);
  console.log('phone copy', phone, +(statSync(phone).size / 1e6).toFixed(1), 'MB');
  }
  console.log(JSON.stringify({ out: final, secs: +probe(final).toFixed(2), mb: +(statSync(final).size / 1e6).toFixed(1), parts: parts.map(p => `${p.shot} ${p.len.toFixed(1)}s ${p.caption}`) }, null, 1));
}
