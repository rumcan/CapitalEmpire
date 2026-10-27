// What stands in a road route's way (T207, #546): the businesses, the range's buildings, the car parks and the toll plazas a route's corridor may
// not run into, with the refusal's words and the outline the preview draws round the thing in the way. One function judges the ghost while it is
// drawn, each click that adds a point and Build, so they never disagree (the owner, 2026-10-27: a paved drive drawn gold with its price, refused
// three times on Build with "Roads cannot cross a business", "even on the practice area").
//
// The player's own roads on the player's own land (the course classes: cart paths and drives) are refused only by real structures: the range's
// shop, home, covered bays and deck, kiosk and car park building (golf/rangebiz.ts rangeStructures), the clubhouse and the halfway house, other
// businesses; never by the range business's whole rectangle (its front: the strip of the range plot along the road, mostly empty grass), and a
// drive may come up to a car park's edge to join it, as a road joins a road. Town roads keep the whole rectangles, padded. Pure: no DOM.
import type { Leg } from './network';

/** a thing a route may not run into: the refusal's words; zone, where the route's corridor may not reach (a convex world polygon, x y pairs,
 *  padded as the rule wants); outline, the thing itself (x y pairs) the preview draws red; pass, a leg it lets through (a toll plaza: a leg along
 *  its own centre line, upgrading the road) */
export interface Obstacle { why: string; zone: readonly number[]; outline: readonly number[]; pass?: (l: Leg) => boolean }

/** an axis-aligned box as a polygon (x y pairs) */
export const rectPoly = (x0: number, y0: number, x1: number, y1: number): number[] => [x0, y0, x1, y0, x1, y1, x0, y1];
/** the refusal for a route into a named thing */
export const crossWhy = (name: string): string => `Roads cannot cross ${name}`;
/** a business's name in a refusal: the golf buildings and the stadium by name, any other "a business" */
export function bizName(type: string): string {
  return type === 'clubhouse' ? 'the clubhouse' : type === 'halfway' ? 'the halfway house' : type === 'range' ? 'the driving range' : type === 'stadium' ? 'the stadium' : 'a business';
}

/** the corridor of half width hw along leg l as a polygon: its two sides, no caps past the ends (a route's corridor has always been judged so:
 *  a road may end on the edge of what it meets). Null for a leg of no length */
export function corridorPoly(l: Leg, hw: number): number[] | null {
  const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, L = Math.hypot(dx, dy); if (L < 1e-9) return null;
  const nx = -dy / L * hw, ny = dx / L * hw;
  return [l.a.x + nx, l.a.y + ny, l.b.x + nx, l.b.y + ny, l.b.x - nx, l.b.y - ny, l.a.x - nx, l.a.y - ny];
}

/** the span of polygon p projected on the axis (ax, ay) */
function span(p: readonly number[], ax: number, ay: number): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.length; i += 2) { const d = p[i]! * ax + p[i + 1]! * ay; if (d < lo) lo = d; if (d > hi) hi = d; }
  return [lo, hi];
}
/** whether two convex polygons (x y pairs) overlap by more than eps (separating axes): touching edges and corners do not */
export function overlaps(a: readonly number[], b: readonly number[], eps = 1e-6): boolean {
  for (const p of [a, b]) {
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ex = p[j * 2]! - p[i * 2]!, ey = p[j * 2 + 1]! - p[i * 2 + 1]!, L = Math.hypot(ex, ey); if (L < 1e-12) continue;
      const ax = -ey / L, ay = ex / L, [a0, a1] = span(a, ax, ay), [b0, b1] = span(b, ax, ay);
      if (Math.min(a1, b1) - Math.max(a0, b0) <= eps) return false;
    }
  }
  return true;
}
/** the box (x0 y0 x1 y1) of a polygon */
const boxOf = (p: readonly number[]): [number, number, number, number] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]!); x1 = Math.max(x1, p[i]!); y0 = Math.min(y0, p[i + 1]!); y1 = Math.max(y1, p[i + 1]!); }
  return [x0, y0, x1, y1];
};

/** the first obstacle (in the list's order) any leg's corridor of half width hw runs into, or null */
export function inTheWay(legs: readonly Leg[], hw: number, obs: readonly Obstacle[]): Obstacle | null {
  if (!obs.length) return null;
  const cs = legs.map(l => ({ l, c: corridorPoly(l, hw) })).filter((q): q is { l: Leg; c: number[] } => !!q.c).map(q => ({ ...q, b: boxOf(q.c) }));
  for (const o of obs) {
    const ob = boxOf(o.zone);
    for (const { l, c, b } of cs) {
      if (b[2] <= ob[0] || b[0] >= ob[2] || b[3] <= ob[1] || b[1] >= ob[3]) continue;
      if (o.pass?.(l)) continue;
      if (overlaps(c, o.zone)) return o;
    }
  }
  return null;
}

/** a placed rectangle (a business, a car park): x y w h, world tiles */
export interface PlacedRect { x: number; y: number; w: number; h: number }
/** a structure with a footprint (world box x0 y0 x1 y1) and its name in the refusal ("the pro shop") */
export interface Structure { name: string; box: readonly [number, number, number, number] }
/** what a route of a class is judged against: course, a course class (cart paths and drives); the businesses (their type and rect); the car
 *  parks; the range's structures (a range start); the toll plazas (their obstacles, built by the engine) */
export interface RouteWorld { course: boolean; biz: readonly (PlacedRect & { type: string })[]; parks: readonly PlacedRect[]; structures?: readonly Structure[]; tolls?: readonly Obstacle[] }

/** a rect padded by p as an obstacle (its zone padded, its outline the rect) */
const padded = (why: string, r: PlacedRect, p: number): Obstacle => ({ why, zone: rectPoly(r.x - p, r.y - p, r.x + r.w + p, r.y + r.h + p), outline: rectPoly(r.x, r.y, r.x + r.w, r.y + r.h) });

/** the obstacles of a route, in the order they are judged (the first hit names the refusal):
 *  - a town road: every business's whole rectangle, padded (the stadium's by 2 tiles, the others' by 1), then every car park padded by 1, then
 *    the toll plazas;
 *  - a course road (cart paths and drives): the range's structures, the businesses but the range (its rectangle is its front's strip of land,
 *    the player's to cross), each padded as above, the car parks unpadded (a drive may come up to the edge to join one), the toll plazas */
export function routeObstacles(w: RouteWorld): Obstacle[] {
  const out: Obstacle[] = [];
  if (w.course) for (const s of w.structures ?? []) { const [x0, y0, x1, y1] = s.box, r = rectPoly(x0, y0, x1, y1); out.push({ why: crossWhy(s.name), zone: r, outline: r }); }
  for (const b of w.biz) {
    if (w.course && b.type === 'range') continue;
    out.push(padded(crossWhy(bizName(b.type)), b, b.type === 'stadium' ? 2 : 1));
  }
  for (const p of w.parks) out.push(padded(crossWhy('a car park'), p, w.course ? 0 : 1));
  out.push(...(w.tolls ?? []));
  return out;
}
