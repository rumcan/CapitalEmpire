// scripts/jam/trailer-vclock.mjs: the trailer's frame stepping (docs/jam/VIDEO.md "How a frame is made"). The owner, 2026-11-15, after draft 1: "the pc is
// slow so when you are showing stuff like the importing a map it doesnt translate": a real-time capture drops frames whenever the PC is busy. So, while a shot
// records, the page runs on a virtual clock that the robot moves on by exactly 1/30 s a frame (two 1/60 s steps), however long the PC takes to draw it:
//   - the page and the golf view's frame (same origin): performance.now, Date.now, requestAnimationFrame, setTimeout and setInterval are the clock's;
//   - the sim worker: its 100 ms tick and its performance.now are the clock's too (a prelude module loaded before it; each tick is acknowledged, so the frame
//     drawn after a step has the worker's answer);
//   - after each step the robot waits, in real time, until the ground's bakes in flight are done and draws again at the same moment, so no frame shows a
//     half-baked ground; then it takes the picture (Page.captureScreenshot).
// Off (between shots) everything runs as the browser's own. Nothing in the game is changed: only the clocks it reads.

/** runs in each frame of the page before the game (the page's own and the golf view's iframe); the clock lives on the top window as __vt */
function vclock(preludeSrc) {
  const W = window; let top = W; try { top = W.top; } catch { /* a cross-origin parent: this frame keeps the browser's clocks */ return; }
  const isTop = top === W;
  const rp = performance.now.bind(performance), rd = Date.now.bind(Date), rraf = W.requestAnimationFrame.bind(W), rcaf = W.cancelAnimationFrame.bind(W);
  const rst = W.setTimeout.bind(W), rsi = W.setInterval.bind(W), rct = W.clearTimeout.bind(W), rci = W.clearInterval.bind(W);
  if (isTop) W.__vt = { on: false, t: 0, t0: 0, d0: 0, rafs: [], timers: new Map(), id: 1e7, workers: [], acks: new Map(), real: { rp, rst, rct } };
  const S = top.__vt; if (!S) return;
  const off = isTop ? 0 : top.performance.timeOrigin - performance.timeOrigin; // (this frame's performance.now is counted from its own start)
  performance.now = () => S.on ? S.t + off : rp();
  Date.now = () => S.on ? S.d0 + (S.t - S.t0) : rd();
  W.requestAnimationFrame = cb => { if (!S.on) return rraf(cb); const id = ++S.id; S.rafs.push({ id, cb, off, rraf }); return id; };
  W.cancelAnimationFrame = id => { const i = S.rafs.findIndex(r => r.id === id); if (i >= 0) S.rafs.splice(i, 1); else rcaf(id); };
  const vtimer = (rep, real) => (fn, ms = 0, ...a) => {
    if (!S.on || typeof fn !== 'function') return real(fn, ms, ...a);
    const id = ++S.id; S.timers.set(id, { id, fn, a, ms: Math.max(0, +ms || 0), at: S.t + Math.max(0, +ms || 0), rep, rst, rsi }); return id;
  };
  W.setTimeout = vtimer(false, rst); W.setInterval = vtimer(true, rsi);
  W.clearTimeout = id => { if (!S.timers.delete(id)) rct(id); };
  W.clearInterval = id => { if (!S.timers.delete(id)) rci(id); };
  if (!isTop) return;
  // the sim worker on the clock: a prelude module first, then the worker's own module
  const RW = W.Worker;
  const Wrapped = function (url, opts) {
    const u = String(url && url.href ? url.href : url);
    if (!/sim[.-]worker/.test(u)) return new RW(url, opts);
    const abs = new URL(u, location.href).href, mod = !!(opts && opts.type === 'module');
    const pre = URL.createObjectURL(new Blob([`(${preludeSrc})();`], { type: 'text/javascript' }));
    const src = mod ? `import ${JSON.stringify(pre)};\nimport ${JSON.stringify(abs)};\n` : `importScripts(${JSON.stringify(pre)}, ${JSON.stringify(abs)});\n`;
    const w = new RW(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), opts);
    w.__vt = u; // (the URL it was made from: the robot can see which workers are on the clock)
    w.addEventListener('message', e => { const d = e.data; if (d && d.__vtAck !== undefined) { e.stopImmediatePropagation(); const r = S.acks.get(w); if (r) { S.acks.delete(w); r(); } } });
    const term = w.terminate.bind(w); w.terminate = () => { const i = S.workers.indexOf(w); if (i >= 0) S.workers.splice(i, 1); S.acks.delete(w); term(); }; // (the game ends a sim worker when a game is reset or loaded)
    S.workers.push(w); return w;
  };
  Wrapped.prototype = RW.prototype; W.Worker = Wrapped;
  const runRafs = () => { const list = S.rafs; S.rafs = []; for (const r of list) { try { r.cb(S.t + r.off); } catch (e) { console.error('[vt] raf', e); } } };
  W.__vtOn = () => { if (S.on) return; S.t = rp(); S.t0 = S.t; S.wt = S.t; S.d0 = rd(); S.on = true; for (const w of S.workers) w.postMessage({ __vt: 'on', t: S.t }); };
  W.__vtOff = () => {
    if (!S.on) return; S.on = false;
    const rafs = S.rafs; S.rafs = []; for (const r of rafs) r.rraf(r.cb);
    for (const tm of S.timers.values()) { const left = Math.max(0, tm.at - S.t); if (tm.rep) tm.rsi(tm.fn, tm.ms, ...tm.a); else tm.rst(tm.fn, left, ...tm.a); }
    S.timers.clear(); for (const w of S.workers) w.postMessage({ __vt: 'off' });
  };
  /** n steps of dt ms (the sim worker's clock simMul times as far: a time-lapse whose town runs fast while the page, its clouds and its light, moves on a
   *  frame at a time); then, with settle (ms), the ground's bakes in flight waited for in real time and the frame drawn once more at the same moment */
  W.__vtStep = async (n, dt, settle, simMul = 1) => {
    for (let i = 0; i < n; i++) {
      S.t += dt; S.wt = (S.wt ?? S.t) + dt * simMul;
      for (let k = 0; k < 5000; k++) { // the timers due, earliest first (a timer may set another)
        let best = null; for (const tm of S.timers.values()) if (tm.at <= S.t && (!best || tm.at < best.at)) best = tm;
        if (!best) break; if (best.rep) best.at += Math.max(1, best.ms); else S.timers.delete(best.id);
        try { best.fn(...best.a); } catch (e) { console.error('[vt] timer', e); }
      }
      await Promise.all(S.workers.map(w => new Promise(res => { const to = rst(() => { S.ackMiss = (S.ackMiss || 0) + 1; S.acks.delete(w); const k = S.workers.indexOf(w); if (k >= 0) S.workers.splice(k, 1); res(); }, 1500); /* (no answer: a worker gone, left out from now on) */ S.acks.set(w, () => { rct(to); res(); }); w.postMessage({ __vt: 'tick', t: S.wt }); })));
      await new Promise(r => rst(r, 0)); // (the worker's answers, posted before its ack, are handled before the frame is drawn)
      runRafs();
    }
    const g = W.__game, t0 = rp();
    // (no drawing while it waits: each frame drawn asks for a few chunks ahead of the view, so busy would never reach 0; then one draw at the same moment)
    if (settle && g && g.ground && g.ground.busy > 0) { while (g.ground.busy > 0 && rp() - t0 < settle) await new Promise(r => rst(r, 20)); runRafs(); }
    return { t: S.t, wait: Math.round(rp() - t0), busy: g?.ground?.busy ?? 0, ackMiss: S.ackMiss || 0 };
  };
}

/** the sim worker's prelude: its clock and its setInterval follow the page's ticks while the clock is on */
function prelude() {
  const rp = performance.now.bind(performance), rdn = Date.now.bind(Date), rsi = self.setInterval.bind(self);
  let vt = null, t0 = 0, d0 = 0; const iv = [];
  performance.now = () => vt === null ? rp() : vt;
  Date.now = () => vt === null ? rdn() : d0 + (vt - t0);
  self.setInterval = (fn, ms, ...a) => { const e = { fn, ms: Math.max(1, +ms || 1), a, next: 0 }; iv.push(e); return rsi(() => { if (vt === null) fn(...a); }, ms); };
  self.addEventListener('message', ev => {
    const d = ev.data; if (!d || d.__vt === undefined) return; ev.stopImmediatePropagation();
    if (d.__vt === 'on') { vt = d.t; t0 = d.t; d0 = rdn(); for (const e of iv) e.next = vt + e.ms; }
    else if (d.__vt === 'off') vt = null;
    else if (d.__vt === 'tick') { vt = d.t; for (const e of iv) { let n = 0; while (e.next <= vt && n++ < 50) { e.next += e.ms; try { e.fn(...e.a); } catch (err) { console.error('[vt] worker', err); } } } }
    self.postMessage({ __vtAck: 1, t: d.t ?? null }); // (always a value: an ack without one would reach the game)
  });
}

/** the init script's source (Playwright's addInitScript({ content })) */
export const vclockSource = `(${vclock.toString()})(${JSON.stringify(prelude.toString())});`;
