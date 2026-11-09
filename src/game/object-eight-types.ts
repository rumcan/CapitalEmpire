import type { Box } from './types';
import type { AuthoredSeating } from './golf/event-seating';

/** These are two authored camera families, not an instruction to rotate an image in 2D. */
export const OBJECT_FACING_KEYS = ['normalNE', 'yaw8N', 'normalSE', 'yaw8E', 'normalSW', 'yaw8S', 'normalNW', 'yaw8W'] as const;
export type ObjectFacingKey = typeof OBJECT_FACING_KEYS[number];
export interface ObjectEightView { id: string; headingDegrees: number; boxes: Box[]; /** Optional view-specific adjustment to the same physical seating. */ seating?: AuthoredSeating }
export interface ObjectEightSet {
  subject: string; name: string; version: number; review: 'approved'; projection: 'normal+yaw8';
  views: Record<ObjectFacingKey, ObjectEightView>;
  baselineScale: number; footprintMetres: { width: number; depth: number };
  capacity?: number; visualTier?: string; eventTypes?: string[]; aliases?: string[];
  /** Authored local-metre seat rows and entry anchors, reviewed against the actual eight pictures. */
  seating?: AuthoredSeating;
  /** Reuses existing atlas pixels through appended IDs; does not replace normal road-lot pictures. */
  runtimeReuse?: true;
}
export const isObjectFacing = (v: unknown): v is ObjectFacingKey => typeof v === 'string' && (OBJECT_FACING_KEYS as readonly string[]).includes(v);
export const objectFacingLabel = (key: ObjectFacingKey): string => key.startsWith('normal') ? key.slice(6) : `${key.slice(4)} (8°)`;
/** Place a picture's ground anchor so its authored collision bounds are centred in the target rectangle. */
export function objectAnchor(boxes: readonly Box[], rect: readonly [number, number, number, number], scale = 1): { x: number; y: number } {
  const minX = Math.min(...boxes.map(b => b.dx-b.hx)), maxX = Math.max(...boxes.map(b => b.dx+b.hx));
  const minY = Math.min(...boxes.map(b => b.dy-b.hy)), maxY = Math.max(...boxes.map(b => b.dy+b.hy));
  return { x: rect[0] + rect[2]/2 - (boxes.length ? (minX+maxX)*scale/4 : 0), y: rect[1] + rect[3]/2 - (boxes.length ? (minY+maxY)*scale/4 : 0) };
}
/** Axis-aligned collision bounds of a physical rectangle, in metres; no sprite mirroring. */
export function objectFootprint(width: number, depth: number, headingDegrees: number): Box {
  const a = headingDegrees * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return { hx: (width * c + depth * s) / 2, hy: (width * s + depth * c) / 2, dx: 0, dy: 0 };
}
