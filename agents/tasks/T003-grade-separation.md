# T003 · Grade separation: bridges over roads and tunnels under them

Status: in review (#2)
Module: `src/game/ext/grade/` · Tests: `tests/ext-grade.test.ts`
Spec by the lead, 2026-10-18. Read `agents/arena/INSTRUCTIONS.md` first.

## Why
Today a road that crosses another road always makes a junction. The owner wants **bridges that build over other roads
and highways** (and roads that dive under), the base for highways and interchanges.

## What to build (pure geometry, no rendering)
Given a new road's centre line (a polyline of legs in tiles), the existing roads it crosses (each as a segment with a
deck height in metres: 0 for ground roads, more for existing bridges), and the terrain heights, produce an **elevation
profile** for the new road that clears every crossing it is told to clear:
- Clearance: 5.5 m between decks (a bridge over a road) or a tunnel below (−6 m, cut-and-cover).
- Grades: at most 6% for roads (`maxGrade` parameter; 4% for highways), with vertical curves (no kinks).
- The ramps up and down fit within the route; if they cannot (crossings too close to the ends or to each other), say
  where and why.
- Output per tile along the route: the height, and the kind of each stretch (`ground`, `ramp`, `bridge`, `tunnel`).

## API
```ts
export interface Crossing { a: Pt; b: Pt; deck: number /* m */ }
export interface Profile { s: number[] /* tiles along the route */; z: number[] /* m */; kinds: ('ground' | 'ramp' | 'bridge' | 'tunnel')[]; ok: boolean; why: string }
export function planProfile(route: Pt[], crossings: Crossing[], ground: (x: number, y: number) => number /* m */, opts: { over: boolean; maxGrade: number; clearance?: number }): Profile;
export function crossingsOf(route: Pt[], roads: { a: Pt; b: Pt; deck: number }[]): { at: number /* tiles along the route */; deck: number }[];
```

## Tests and numbers
A straight road over one road (ramps both sides, max grade respected, 5.5 m clear at the crossing); over two close
roads (one long bridge); too close to the end (not ok, with the reason); under a road (tunnel); over a hill-side road
(terrain heights vary). Print the ramp lengths for 4% and 6%.

## Integration notes expected
What the lead needs: the network storing deck heights per seg, the lane graph ignoring crossings between different
levels, the renderer's elevated layer (piers, decks, shadows).
