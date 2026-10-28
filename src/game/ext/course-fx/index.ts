// Grow-in masks and placement effects (plan P21, T076):
// 0–4 grow stages, chunk grow-in masks and keys, deterministic splash particles,
// squash scale curves, and hover breathing animations.
// Pure TypeScript, no DOM, deterministic.
// Units: time in ms and months, positions in tiles or screen px, sizes in px or cells.

import { CELL_T, SURF, type Grid } from '../course-grid';
import { mulberry } from '../../iso';

export { mulberry };

/** grow-in stage (0 to 4 quarters): 0 = seeded dirt, 2 = half-grown, 4 = fully grown grass */
export function growStage(share: number): number {
  if (share <= 0) return 0;
  if (share >= 1) return 4;
  return Math.min(4, Math.max(0, Math.round(share * 4)));
}

/** the grow stage a seeded cell shows `share` (0..1) of the way through its grow-in (P23 4.6, T121: readable grow-in): sprouts from day one, a
 *  quarter grass (stage 1) for the first third, half (2) and three quarters (3) for the next thirds, full grass (stage 4) only when the
 *  grow-in is done, so a just built fairway, tee or green already reads as one and never as bare soil */
export function seededStage(share: number): number {
  if (share >= 1) return 4;
  return 1 + Math.min(2, Math.floor(3 * Math.max(0, share)));
}

/** grow-in duration in months for each course surface id (P21 section 3.4 & GOLF-PLAN 4.1) */
export const SURF_GROW_MONTHS: Readonly<Record<number, number>> = {
  [SURF.none]: 0,
  [SURF.rough]: 2,
  [SURF.fescue]: 3,
  [SURF.water]: 0,
  [SURF.fairway]: 3,
  [SURF.tee]: 3,
  [SURF.bunker]: 0,
  [SURF.waste]: 0,
  [SURF.green]: 6,
  [SURF.longGrass]: 2,
};

/**
 * calculates a chunk's growth mask: a Uint8Array of one byte per cell (row-major).
 * alpha = round(255 * (1 - stage/4)), the stage by seededStage (a seeded cell starts at a quarter grass: 191, never 255). Sod, established
 * cells and zero-grow-in surfaces give 0.
 *
 * g: global course grid.
 * cx, cy: the chunk's index (its box starts at tile cx * size, cy * size).
 * size: chunk dimension (default 64 tiles = 128 cells).
 * nowMonth: current game month, on the grid's month scale (the course grid stores month + MONTH_BASE, established cells 0: pass the
 *   effective game month + MONTH_BASE; ext/course-grid/patch.ts courseGrow does).
 */
export function growMask(
  g: Grid,
  cx: number,
  cy: number,
  size = 64,
  nowMonth: number,
): Uint8Array {
  // the chunk's tile origin (cx, cy are always chunk indices: guessing a tile origin from a small value picked the wrong box)
  const tileX0 = cx * size;
  const tileY0 = cy * size;

  // chunk dimension in cells (1 tile = 2 cells)
  const cellW = Math.round(size / CELL_T);
  const cellH = cellW;
  const totalCells = cellW * cellH;
  const mask = new Uint8Array(totalCells);

  const startCx = Math.round((tileX0 - g.x0) / CELL_T);
  const startCy = Math.round((tileY0 - g.y0) / CELL_T);

  for (let dy = 0; dy < cellH; dy++) {
    const curCy = startCy + dy;
    if (curCy < 0 || curCy >= g.h) continue;

    for (let dx = 0; dx < cellW; dx++) {
      const curCx = startCx + dx;
      if (curCx < 0 || curCx >= g.w) continue;

      const idx = curCy * g.w + curCx;
      const surf = g.surf[idx]!;
      const totalMonths = SURF_GROW_MONTHS[surf] ?? 0;

      // zero-grow-in surfaces give 0 alpha
      if (totalMonths <= 0 || surf === SURF.none) {
        mask[dy * cellW + dx] = 0;
        continue;
      }

      const plantedMonth = g.month[idx]!;
      const elapsed = Math.max(0, nowMonth - plantedMonth);
      const share = Math.min(1, elapsed / totalMonths);
      const stage = seededStage(share);

      // alpha = round(255 * (1 - stage / 4))
      const alpha = Math.round(255 * (1 - stage / 4));
      mask[dy * cellW + dx] = alpha;
    }
  }

  return mask;
}

/** particle material type for dab/brush placement splash */
export type SplashKind = 'dirt' | 'sand' | 'water';

/** particle thrown up and out on placement */
export interface SplashParticle {
  /** current screen / world position */
  x: number;
  y: number;
  /** velocity in px / s */
  vx: number;
  vy: number;
  /** remaining lifetime in ms (starts at 450 ms) */
  lifeMs: number;
  /** initial lifetime in ms */
  maxLifeMs: number;
  /** particle radius in px */
  size: number;
  /** particle color hex */
  color: string;
  /** whether particle is dead (lifeMs <= 0) */
  dead: boolean;
  /** material kind */
  kind: SplashKind;
}

/** material particle colors */
const SPLASH_COLORS: Record<SplashKind, string> = {
  dirt: '#5a3d28',
  sand: '#d9c89e',
  water: '#4898c8',
};

/**
 * spawns 8–12 deterministic splash particles thrown up and out with 450 ms lifetime.
 * seed: deterministic RNG seed.
 * x, y: center of splash.
 * r: splash spread radius.
 * kind: 'dirt' (default), 'sand', or 'water'.
 */
export function spawnSplash(
  seed: number,
  x: number,
  y: number,
  r = 10,
  kind: SplashKind = 'dirt',
): SplashParticle[] {
  const rand = mulberry(seed);
  // 8 to 12 particles
  const count = 8 + Math.floor(rand() * 5);
  const particles: SplashParticle[] = [];
  const color = SPLASH_COLORS[kind] ?? SPLASH_COLORS.dirt;

  for (let i = 0; i < count; i++) {
    // angle around circle with upward bias (negative y in screen coordinates)
    const angle = rand() * 2 * Math.PI;
    const speed = 40 + rand() * 80;
    // initial outward offset
    const offset = rand() * r;
    const px = x + Math.cos(angle) * offset;
    const py = y + Math.sin(angle) * offset * 0.5; // isometric compression

    // velocity: radial outward velocity plus upward boost in screen y (-vy)
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed * 0.5 - (60 + rand() * 50);

    particles.push({
      x: px,
      y: py,
      vx,
      vy,
      lifeMs: 450,
      maxLifeMs: 450,
      size: 1.5 + rand() * 2.0,
      color,
      dead: false,
      kind,
    });
  }

  return particles;
}

/**
 * steps splash particles forward by dtMs milliseconds:
 * applies downward gravity in screen y and marks particles dead after 450 ms.
 */
export function stepSplash(
  particles: SplashParticle[],
  dtMs: number,
): SplashParticle[] {
  const dtSec = dtMs / 1000;
  // screen gravity pulling downward (+y)
  const gravity = 280;

  for (const p of particles) {
    if (p.dead) continue;

    p.lifeMs -= dtMs;
    if (p.lifeMs <= 0) {
      p.lifeMs = 0;
      p.dead = true;
      continue;
    }

    p.vy += gravity * dtSec;
    p.x += p.vx * dtSec;
    p.y += p.vy * dtSec;
  }

  return particles;
}

/**
 * easeOutBack easing function over [0, 1].
 * s controls overshoot amplitude (default 1.70158).
 */
export function easeOutBack(t: number, s = 1.70158): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}

/**
 * placement squash-and-stretch scale over 260 ms:
 * starts at 0.90, peaks at 1.04 ±0.01, settles at 1.00 at 260 ms.
 */
export function squash(tMs: number): number {
  if (tMs <= 0) return 0.90;
  if (tMs >= 260) return 1.00;

  const tau = tMs / 260;
  // with s = 4.17, easeOutBack overshoots 1 by ~0.4018
  // 0.90 + 0.10 * (1 + 0.4018) = 1.04018 (peak 1.04 ± 0.01)
  const g = easeOutBack(tau, 4.17);
  return 0.90 + 0.10 * g;
}

/** hover breathing effect values */
export interface BreatheEffect {
  /** outline opacity between 0.6 and 0.9 */
  alpha: number;
  /** scale factor between 1.00 and 1.03 */
  scale: number;
}

/**
 * 1.4-second sinusoidal hover breathing animation (P21 section 3.5):
 * alpha cycles 0.6..0.9 and scale cycles 1.00..1.03.
 */
export function breathe(nowMs: number): BreatheEffect {
  // 1.4 s cycle period (1400 ms)
  const phase = (nowMs % 1400) / 1400;
  const sin = 0.5 + 0.5 * Math.sin(phase * 2 * Math.PI);
  return {
    alpha: 0.6 + 0.3 * sin,
    scale: 1.00 + 0.03 * sin,
  };
}
