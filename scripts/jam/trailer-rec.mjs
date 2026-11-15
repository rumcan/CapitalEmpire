// scripts/jam/trailer-rec.mjs: the trailer robot's recorder (scripts/jam/trailer.mjs uses it). Frames come from Chrome's own screencast (CDP
// Page.startScreencast: each painted frame of the page, the game's canvas and its UI, as a JPEG with the time it was painted), written one file a frame
// with their times, then turned into a constant-rate clip by ffmpeg (each frame held until the next one came). Nothing is drawn into the picture here
// but the pointer (cursorScript), which the page draws where the robot's mouse is, as a player's own pointer would be.
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export const FPS = 30;

/** the pointer: a small arrow drawn over everything at the mouse's place (headless Chrome draws no cursor into its frames). Moves with every real mouse event
 *  the robot sends; hidden with window.__trailerCursor(false), e.g. inside the golf view, which has its own aim */
export const cursorScript = () => {
  const make = () => {
    if (document.getElementById('trailer-cursor')) return;
    const d = document.createElement('div'); d.id = 'trailer-cursor';
    d.style.cssText = 'position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:none;filter:drop-shadow(0 2px 2px rgba(0,0,0,.55))';
    d.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M3 2 L3 22 L8.5 17 L12.5 26 L16 24.5 L12 15.8 L19.5 15.8 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(d);
    let on = true;
    window.__trailerCursor = v => { on = !!v; d.style.display = on ? 'block' : 'none'; };
    const at = e => { d.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; };
    window.addEventListener('mousemove', at, true); window.addEventListener('pointermove', at, true); window.addEventListener('pointerdown', at, true);
    window.addEventListener('pointerdown', () => { d.style.scale = '0.85'; }, true); window.addEventListener('pointerup', () => { d.style.scale = '1'; }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', make); else make();
};

/** a recorder on one page: rec.start(name) ... rec.stop() writes raw/<name>/ (its frames) and shots/<name>.mp4 (FPS, no audio) under dir.
 *  step (the default, docs/jam/VIDEO.md): the page on the virtual clock (trailer-vclock.mjs), each frame stepped by 1/FPS s and its picture taken once the
 *  ground is baked: rec.tick(n) makes n frames, and the robot's waits, pointer moves and swing holds go through it while rec.on.
 *  realtime (--realtime): Chrome's screencast, each painted frame with its time (draft 1's way: frames drop when the PC is busy) */
export class Recorder {
  constructor(page, dir, { width = 1920, height = 1080, quality = 90, step = true, settle = 6000 } = {}) { this.page = page; this.dir = dir; this.w = width; this.h = height; this.q = quality; this.step = step; this.settle = settle; this.cdp = null; this.shot = null; this.on = false; }
  async start(name) {
    if (this.shot) await this.stop();
    let raw = join(this.dir, 'raw', name);
    try { if (existsSync(raw)) rmSync(raw, { recursive: true, force: true }); } catch { raw = join(this.dir, 'raw', `${name}-${Date.now()}`); }
    mkdirSync(raw, { recursive: true });
    this.cdp ??= await this.page.context().newCDPSession(this.page);
    const shot = this.shot = { name, raw, frames: [], t0: null, waited: 0 };
    if (this.step) {
      // the first frame on a baked ground: the bakes in flight done (real time) before the clock stops for the shot
      await this.page.evaluate(async () => { const g = window.__game, t0 = performance.now(); while (g?.ground?.busy > 0 && performance.now() - t0 < 15000) await new Promise(r => setTimeout(r, 50)); });
      await this.page.evaluate(() => window.__vtOn());
      this.on = true; await this.tick(1); return;
    }
    this.onFrame = async ({ data, metadata, sessionId }) => {
      try { await this.cdp.send('Page.screencastFrameAck', { sessionId }); } catch { /* stopped */ }
      if (this.shot !== shot) return;
      const t = metadata.timestamp ?? Date.now() / 1000; shot.t0 ??= t;
      const f = `${String(shot.frames.length).padStart(5, '0')}.jpg`; writeFileSync(join(raw, f), Buffer.from(data, 'base64')); shot.frames.push([f, t - shot.t0]);
    };
    this.cdp.on('Page.screencastFrame', this.onFrame);
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: this.q, maxWidth: this.w, maxHeight: this.h, everyNthFrame: 1 });
  }
  /** step mode: n frames, each 1/FPS s on the clock (two half steps: the golf view moves on per animation frame, 60 a second), each one's picture written */
  async tick(n = 1, every = 1) { // (every k: a time-lapse, k frames of the clock to each picture)
    const shot = this.shot; if (!this.on || !shot) return;
    for (let i = 0; i < n; i++) {
      const r = await this.page.evaluate(([k, s]) => window.__vtStep(2 * k, 1000 / 60, s), [every, this.settle]);
      shot.waited += r?.wait ?? 0;
      const { data } = await this.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: this.q, optimizeForSpeed: true });
      const f = `${String(shot.frames.length).padStart(5, '0')}.jpg`; writeFileSync(join(shot.raw, f), Buffer.from(data, 'base64')); shot.frames.push([f, shot.frames.length / FPS]);
    }
  }
  /** ends the shot: the clip <name>.mp4, and how many frames it got over how long */
  async stop() {
    const shot = this.shot; if (!shot) return null;
    if (this.step) {
      this.on = false; this.shot = null;
      try { await this.page.evaluate(() => window.__vtOff()); } catch { /* the page is gone */ }
      return stepClip(this.dir, shot);
    }
    try { await this.cdp.send('Page.stopScreencast'); } catch { /* gone */ }
    this.cdp.off('Page.screencastFrame', this.onFrame); this.shot = null;
    await new Promise(r => setTimeout(r, 150));
    return clipOf(this.dir, shot.name, shot.frames);
  }
}

/** step mode's clip: the numbered frames at exactly FPS */
function stepClip(dir, shot) {
  if (shot.frames.length < 2) return { name: shot.name, frames: shot.frames.length, secs: 0, out: null };
  const out = join(dir, 'shots', `${shot.name}.mp4`); mkdirSync(join(dir, 'shots'), { recursive: true });
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(shot.raw, '%05d.jpg'), '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-r', String(FPS), out], { stdio: 'inherit' });
  writeFileSync(join(shot.raw, 'times.json'), JSON.stringify(shot.frames));
  return { name: shot.name, frames: shot.frames.length, secs: +(shot.frames.length / FPS).toFixed(2), bakeWaitS: +(shot.waited / 1000).toFixed(1), out: r.status === 0 ? out : null };
}

/** frames [file, seconds] -> dir/<name>.mp4 at FPS: each frame lasts until the next (the concat demuxer's durations), then a constant rate */
export function clipOf(dir, name, frames, { w = 1920, h = 1080 } = {}) {
  if (frames.length < 2) return { name, frames: frames.length, secs: 0, fps: 0, out: null };
  const raw = join(dir, 'raw', name), list = [];
  for (let i = 0; i < frames.length; i++) { const d = i + 1 < frames.length ? frames[i + 1][1] - frames[i][1] : 1 / FPS; list.push(`file '${frames[i][0]}'`, `duration ${Math.max(0.001, d).toFixed(4)}`); }
  list.push(`file '${frames[frames.length - 1][0]}'`);
  writeFileSync(join(raw, 'frames.txt'), list.join('\n') + '\n');
  writeFileSync(join(raw, 'times.json'), JSON.stringify(frames));
  const out = join(dir, 'shots', `${name}.mp4`); mkdirSync(join(dir, 'shots'), { recursive: true });
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(raw, 'frames.txt'),
    '-vf', `scale=${w}:${h}:flags=lanczos,fps=${FPS},format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-r', String(FPS), out], { stdio: 'inherit' });
  const secs = frames[frames.length - 1][1];
  return { name, frames: frames.length, secs: +secs.toFixed(2), fps: +(frames.length / Math.max(0.01, secs)).toFixed(1), out: r.status === 0 ? out : null };
}
