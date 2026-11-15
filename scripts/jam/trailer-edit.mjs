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
  cut.parts.forEach((p0, i) => { let p = p0;
    const src = join(OUT, 'shots', `${p.shot}.mp4`); if (!existsSync(src)) { console.log(`skip ${p.shot}: no clip`); return; }
    // (a negative from or to counts back from the clip's end: a stage's result is its last seconds)
    const D = probe(src); p = { ...p, from: p.from < 0 ? Math.max(0, D + p.from) : p.from, to: p.to <= 0 ? D + p.to : Math.min(p.to, D) };
    const sp = p.speed ?? 1, len = (p.to - p.from) / sp, out = `p${String(i).padStart(2, '0')}.mp4`;
    const vf = [`setpts=(PTS-STARTPTS)/${sp}`, `scale=${W}:${H}:flags=lanczos`, `fps=${FPS}`];
    let args;
    if (p.title) {
      // the opening: the menu scene with the logo (or the name) over it
      const t = hasLogo ? null : text(`title${i}.txt`, cut.name ?? 'Golf Manager 2026');
      const fc = hasLogo
        ? `[0:v]setpts=(PTS-STARTPTS)/${sp},scale=${W}:${H},fps=${FPS}[b];[1:v]format=rgba,fade=in:st=0.4:d=0.6:alpha=1[l];[b][l]overlay=(W-w)/2:(H-h)/2-30[v]`
        : `[0:v]setpts=(PTS-STARTPTS)/${sp},scale=${W}:${H},fps=${FPS},drawtext=fontfile=fonts/georgiab.ttf:textfile=${t}:fontsize=130:fontcolor=0xFFE7A0:x=(w-tw)/2:y=(h-th)/2-30:shadowcolor=black@0.7:shadowx=4:shadowy=5:alpha='min(1,max(0,(t-0.4)/0.6))'[v]`;
      args = ['-ss', String(p.from), '-t', String(p.to - p.from), '-i', src, ...(hasLogo ? ['-loop', '1', '-i', 'logo.png'] : []), '-filter_complex', fc, '-map', '[v]', '-t', len.toFixed(3)];
    } else {
      if (p.caption) vf.push(caption(p.caption, len, i));
      args = ['-ss', String(p.from), '-t', String(p.to - p.from), '-i', src, '-vf', vf.join(','), '-t', len.toFixed(3)];
    }
    ff([...args, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), out], E);
    parts.push({ out, len, shot: p.shot, caption: p.caption ?? (p.title ? '(title)' : '') });
  });
  // the end card: a still of the club, darkened, the logo (or the name), the jam and the play line
  const endSrc = join(OUT, 'shots', `${cut.end?.still ?? 'alive'}.mp4`), endLen = cut.end?.len ?? 4.5;
  {
    const n = text('end-name.txt', cut.name ?? 'Golf Manager 2026'), j = text('end-jam.txt', cut.end?.jam ?? 'Made for the Zoud GameLab game jam 2026'), l = text('end-link.txt', opt('link', null) ?? cut.end?.link ?? 'Play free in your browser  ·  itch.io link here');
    const base = existsSync(endSrc) ? ['-ss', '1', '-t', String(endLen), '-i', endSrc] : ['-f', 'lavfi', '-t', String(endLen), '-i', `color=c=0x10202a:s=${W}x${H}:r=${FPS}`];
    const words = `drawtext=fontfile=fonts/bahnschrift.ttf:textfile=${j}:fontsize=44:fontcolor=white@0.92:x=(w-tw)/2:y=h*0.70,drawtext=fontfile=fonts/bahnschrift.ttf:textfile=${l}:fontsize=52:fontcolor=0xFFD66B:x=(w-tw)/2:y=h*0.79`;
    const fc = hasLogo
      ? `[0:v]scale=${W}:${H},fps=${FPS},boxblur=12:2,eq=brightness=-0.18[b];[1:v]format=rgba[l];[b][l]overlay=(W-w)/2:H*0.16,${words},fade=in:st=0:d=0.5,fade=out:st=${endLen - 0.8}:d=0.8[v]`
      : `[0:v]scale=${W}:${H},fps=${FPS},boxblur=12:2,eq=brightness=-0.18,drawtext=fontfile=fonts/georgiab.ttf:textfile=${n}:fontsize=140:fontcolor=0xFFE7A0:x=(w-tw)/2:y=h*0.32:shadowcolor=black@0.7:shadowx=4:shadowy=5,${words},fade=in:st=0:d=0.5,fade=out:st=${endLen - 0.8}:d=0.8[v]`;
    ff([...base, ...(hasLogo ? ['-loop', '1', '-i', 'logo.png'] : []), '-filter_complex', fc, '-map', '[v]', '-t', String(endLen), '-an', '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), 'end.mp4'], E);
    parts.push({ out: 'end.mp4', len: endLen, shot: 'end card', caption: '' });
  }
  writeFileSync(join(E, 'list.txt'), parts.map(p => `file '${p.out}'`).join('\n') + '\n');
  ff(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'video.mp4'], E);
  const dur = probe(join(E, 'video.mp4'));
  // the music: one radio track under the whole cut, in at once, out over the end card
  const music = resolve(cut.music ?? 'public/audio/music/sunny-side-up-2.mp3');
  const final = join(OUT, cut.out ?? 'trailer.mp4');
  ff(['-i', 'video.mp4', '-i', music, '-filter_complex', `[1:a]atrim=0:${dur.toFixed(2)},afade=t=in:st=0:d=0.4,afade=t=out:st=${(dur - 2.5).toFixed(2)}:d=2.5,volume=1.0[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final], E);
  console.log(JSON.stringify({ out: final, secs: +probe(final).toFixed(2), mb: +(statSync(final).size / 1e6).toFixed(1), parts: parts.map(p => `${p.shot} ${p.len.toFixed(1)}s ${p.caption}`) }, null, 1));
}
