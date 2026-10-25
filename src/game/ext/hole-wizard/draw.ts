// The New hole wizard on the map overlay (plan P21 3.5, T102): the ghost (exactly the cells a Build lays, by surface, on the 1 m grid;
// cleared cells dark; refused cells red), the centre line, the handles, the gold Build pill by the green, the label beside the pointer,
// and the build ripple (the line draws itself, then the cells pop along it). Canvas 2D only; the state is ./index.ts.
// Units: tiles in; device px on the canvas; the pill's box in css px (the pointer's units).

import { CELL_T, SURF } from '../course-grid';
import { REFUSED, RIPPLE_LINE_MS, RIPPLE_POP_MS, type HoleWizard, type PlanHandle, type WizardGhost } from './index';

/** what the wizard draws with (the Paint tool's PaintView) */
export interface WizardView {
  ctx: CanvasRenderingContext2D;
  /** sets the iso transform: tile coordinates draw where they lie on the map */
  setIso(ctx: CanvasRenderingContext2D): void;
  /** tile to device px */
  screen(x: number, y: number): { x: number; y: number };
  dpr: number;
  /** the one-line label beside the pointer (css px) */
  hint(mx: number, my: number, text: string, bad: boolean): void;
}

/** the ghost's look per run label: fill and edge */
const LOOK: Record<number, { fill: string; edge: string }> = {
  [SURF.rough]: { fill: 'rgba(96,140,62,0.42)', edge: 'rgba(170,214,120,0.85)' },
  [SURF.fairway]: { fill: 'rgba(128,206,92,0.55)', edge: 'rgba(214,255,170,0.95)' },
  [SURF.tee]: { fill: 'rgba(110,214,150,0.65)', edge: 'rgba(235,255,235,1)' },
  [SURF.green]: { fill: 'rgba(84,222,120,0.7)', edge: 'rgba(240,255,240,1)' },
  0: { fill: 'rgba(40,28,18,0.38)', edge: 'rgba(160,120,80,0.8)' },
  [REFUSED]: { fill: 'rgba(240,80,60,0.42)', edge: '#f87171' },
};
const OTHER = { fill: 'rgba(200,200,200,0.35)', edge: 'rgba(255,255,255,0.8)' };
/** the draw order of the run labels: cleared, rough, fairway, tee, green, refused on top */
const ORDER = [0, SURF.rough, SURF.fescue, SURF.water, SURF.fairway, SURF.tee, SURF.bunker, SURF.waste, SURF.green, REFUSED];

/** the runs with label s as one path (tiles, under the iso transform), filled */
function fillRuns(v: WizardView, runs: Int32Array, gx0: number, gy0: number, s: number, fill: string, alpha = 1, delay?: Float32Array, t?: number) {
  const ctx = v.ctx;
  v.setIso(ctx); ctx.beginPath();
  let any = false;
  for (let k = 0, r = 0; k < runs.length; k += 4, r++) {
    if (runs[k + 3] !== s) continue;
    if (delay && t !== undefined && t < delay[r]!) continue;
    const y = gy0 + runs[k]! * CELL_T, x = gx0 + runs[k + 1]! * CELL_T;
    ctx.rect(x, y, (runs[k + 2]! - runs[k + 1]! + 1) * CELL_T, CELL_T); any = true;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!any) return;
  ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.fill(); ctx.globalAlpha = 1;
}

/** the ghost: per label (in draw order) its runs filled and its outline stroked crisp along the cell edges */
function drawGhost(v: WizardView, gh: WizardGhost) {
  const ctx = v.ctx, d = v.dpr;
  for (const s of ORDER) {
    const e = gh.edges.get(s); if (!e) continue;
    const look = LOOK[s] ?? OTHER;
    fillRuns(v, gh.runs, gh.gx0, gh.gy0, s, look.fill);
    v.setIso(ctx); ctx.beginPath();
    for (let k = 0; k < e.length; k += 4) { ctx.moveTo(gh.gx0 + e[k]! * CELL_T, gh.gy0 + e[k + 1]! * CELL_T); ctx.lineTo(gh.gx0 + e[k + 2]! * CELL_T, gh.gy0 + e[k + 3]! * CELL_T); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineCap = 'square'; ctx.strokeStyle = look.edge; ctx.lineWidth = (s === SURF.rough ? 1 : 1.3) * d; ctx.stroke(); ctx.lineCap = 'butt';
  }
}

/** the centre line (tiles), up to share 0..1 of its length, white with a dark under-stroke */
function drawLine(v: WizardView, line: readonly { x: number; y: number }[], share = 1, dash = true) {
  const ctx = v.ctx, d = v.dpr, n = Math.max(2, Math.ceil(line.length * share));
  ctx.beginPath();
  for (let i = 0; i < Math.min(n, line.length); i += i + 3 < n ? 3 : 1) { const p = v.screen(line[i]!.x, line[i]!.y); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(15,23,42,0.6)'; ctx.lineWidth = 4 * d; ctx.stroke();
  if (dash) ctx.setLineDash([7 * d, 5 * d]);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2 * d; ctx.stroke(); ctx.setLineDash([]);
  ctx.lineJoin = 'miter';
}

/** a round handle at tile (x, y): r css px, its fill, a dark ring, and a glyph */
function knob(v: WizardView, x: number, y: number, r: number, fill: string, hot: boolean, glyph = '') {
  const ctx = v.ctx, d = v.dpr, p = v.screen(x, y), R = (hot ? r + 2 : r) * d;
  ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 2 * d; ctx.strokeStyle = hot ? '#fbbf24' : 'rgba(15,23,42,0.85)'; ctx.stroke();
  if (glyph) {
    ctx.font = `bold ${Math.round(r * 1.2 * d)}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0f172a'; ctx.fillText(glyph, p.x, p.y + 0.5 * d);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }
}

/** the handles: '+' points faint, the width handles small amber, the bends white, the tee and the green larger */
function drawHandles(v: WizardView, hs: readonly PlanHandle[], hot: PlanHandle | null) {
  const isHot = (h: PlanHandle) => !!hot && hot.k === h.k && hot.i === h.i;
  for (const h of hs) if (h.k === 'add') knob(v, h.x, h.y, 6, 'rgba(255,255,255,0.55)', isHot(h), '+');
  for (const h of hs) if (h.k === 'wl' || h.k === 'wr') knob(v, h.x, h.y, 5, '#fcd34d', isHot(h));
  for (const h of hs) if (h.k === 'bend') knob(v, h.x, h.y, 7, '#ffffff', isHot(h));
  for (const h of hs) if (h.k === 'tee') knob(v, h.x, h.y, 9, '#a7f3d0', isHot(h), 'T');
  for (const h of hs) if (h.k === 'green') knob(v, h.x, h.y, 9, '#4ade80', isHot(h), '⚑');
}

/** the gold Build pill below the green (P21 3.3: click it or press Enter): its box in css px, or null when not drawn */
function drawPill(v: WizardView, w: HoleWizard, gh: WizardGhost): { x: number; y: number; w: number; h: number } | null {
  const pl = w.plan; if (!pl) return null;
  const ctx = v.ctx, d = v.dpr, c = w.check(), g = v.screen(pl.green.x, pl.green.y);
  const text = c.ok ? `Build · $${gh.cost.toLocaleString()}` : c.why === 'Nothing to change' ? 'No changes' : 'Build';
  ctx.font = `bold ${Math.round(12 * d)}px ui-sans-serif, system-ui, sans-serif`;
  const tw = ctx.measureText(text).width, bw = tw + 22 * d, bh = 24 * d, x0 = Math.round(g.x - bw / 2), y0 = Math.round(g.y + 22 * d);
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y0, bw, bh, bh / 2); else ctx.rect(x0, y0, bw, bh);
  ctx.fillStyle = c.ok ? '#f5c542' : 'rgba(71,85,105,0.9)'; ctx.fill();
  ctx.lineWidth = 1.5 * d; ctx.strokeStyle = c.ok ? '#7c5a06' : 'rgba(15,23,42,0.9)'; ctx.stroke();
  ctx.fillStyle = c.ok ? '#1f1503' : '#cbd5e1'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x0 + bw / 2, y0 + bh / 2 + 0.5 * d);
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  return { x: x0 / d, y: y0 / d, w: bw / d, h: bh / d };
}

/** the build ripple at time now (ms): the line draws itself, then each run pops in its colour and fades (reduced: a plain fade) */
function drawRipple(v: WizardView, w: HoleWizard, now: number, reduced: boolean): boolean {
  const r = w.ripple; if (!r) return false;
  const t = now - r.t0, end = (r.delay.length ? Math.max(...r.delay) : RIPPLE_LINE_MS) + RIPPLE_POP_MS;
  if (t > end) { w.ripple = null; return false; }
  if (t < RIPPLE_LINE_MS + RIPPLE_POP_MS) drawLine(v, r.line, reduced ? 1 : Math.min(1, t / RIPPLE_LINE_MS), false);
  // the runs in bands of the same age: popping (bright) then fading
  const ctx = v.ctx;
  for (const s of [SURF.rough, SURF.fairway, SURF.tee, SURF.green]) {
    const look = LOOK[s]!;
    // four age bands, each one path, so a hole costs a few fills a frame
    for (let band = 0; band < 4; band++) {
      const a0 = (band * RIPPLE_POP_MS) / 4, a1 = ((band + 1) * RIPPLE_POP_MS) / 4;
      v.setIso(ctx); ctx.beginPath(); let any = false;
      for (let k = 0, i = 0; k < r.runs.length; k += 4, i++) {
        if (r.runs[k + 3] !== s) continue;
        const age = t - r.delay[i]!; if (age < a0 || age >= a1) continue;
        ctx.rect(r.gx0 + r.runs[k + 1]! * CELL_T, r.gy0 + r.runs[k]! * CELL_T, (r.runs[k + 2]! - r.runs[k + 1]! + 1) * CELL_T, CELL_T); any = true;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (!any) continue;
      const mid = (a0 + a1) / 2 / RIPPLE_POP_MS, alpha = reduced ? 0.5 * (1 - mid) : mid < 0.2 ? 0.95 : 0.95 * (1 - (mid - 0.2) / 0.8);
      ctx.globalAlpha = alpha; ctx.fillStyle = band === 0 && !reduced ? look.edge : look.fill; ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  return true;
}

/**
 * draws the wizard: the ripple of the last build, then by step: the tee step's hovered plan line (or a tee ring at the pointer); the
 * green step's tee and live ghost; the shape step's ghost, line, handles and pill; and the label beside the pointer. Returns the pill's
 * box (css px) for the click, or null.
 */
export function drawWizard(v: WizardView, w: HoleWizard, mouse: { mx: number; my: number } | null, now: number, reduced: boolean): { x: number; y: number; w: number; h: number } | null {
  drawRipple(v, w, now, reduced);
  let pill: { x: number; y: number; w: number; h: number } | null = null;
  if (w.step === 'tee') {
    const p = w.lineHole ? w.planOf(w.lineHole) : null;
    if (p) {
      const ctx = v.ctx, d = v.dpr, L = w.geomOf(p).line;
      ctx.beginPath();
      for (let i = 0; i < L.length; i += 3) { const s = v.screen(L[i]!.x, L[i]!.y); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); }
      ctx.strokeStyle = 'rgba(251,191,36,0.9)'; ctx.lineWidth = 4 * d; ctx.lineJoin = 'round'; ctx.stroke(); ctx.lineJoin = 'miter';
    } else if (w.cursor) {
      const ctx = v.ctx, d = v.dpr, c = v.screen(w.cursor.x, w.cursor.y);
      ctx.beginPath(); ctx.arc(c.x, c.y, 10 * d, 0, Math.PI * 2); ctx.fillStyle = 'rgba(167,243,208,0.35)'; ctx.fill();
      ctx.lineWidth = 2 * d; ctx.strokeStyle = '#a7f3d0'; ctx.stroke();
    }
  } else {
    const gh = w.ghost();
    if (gh) drawGhost(v, gh);
    if (w.plan) drawLine(v, (gh?.geom ?? w.geomOf(w.plan)).line);
    if (w.step === 'green' && w.tee) knob(v, w.tee.x, w.tee.y, 9, '#a7f3d0', false, 'T');
    if (w.step === 'shape') {
      drawHandles(v, w.handles(), w.drag ?? w.hover);
      if (gh) pill = drawPill(v, w, gh);
    }
  }
  if (mouse) { const l = w.label(); v.hint(mouse.mx, mouse.my, l.text, l.bad); }
  return pill;
}
