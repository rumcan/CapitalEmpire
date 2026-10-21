// Deterministic, presentation-only battles. Coordinates are tiles of 2 m; time is simulation seconds.
import type { Disaster } from '../disasters';
import { mulberry } from '../../iso';

/** Monster variants backed by the TrickOrTreat character library. */
export const PARANORMAL_MONSTERS = ['zombie', 'skeleton', 'ghost', 'werewolf', 'bat', 'witch', 'pumpkin'] as const;
/** A sampled battle sprite; facing is radians in world tile space. Light radius is tiles. */
export interface ParanormalActor {
  id: number; kind: 'kid' | typeof PARANORMAL_MONSTERS[number]; x: number; y: number;
  facing: number; action: 'walk' | 'fight' | 'defeated'; alpha: number;
  light: { radius: number; intensity: number; color: string };
}
/** The minimal disaster shape accepted by the renderer (area in tile coordinates). */
export type ParanormalBattle = Pick<Disaster, 'id' | 'kind' | 'start' | 'end' | 'area'>;

/** Reconstruct the same six kid-versus-monster fights at any time, without mutable state or frame-rate dependence.
 * Before the warning ends and after dawn there are no actors. Each 40 s wave approaches, fights, then fades. */
export function sampleParanormalBattle(disaster: ParanormalBattle, simTime: number): ParanormalActor[] {
  if (disaster.kind !== 'paranormal' || !Number.isFinite(simTime) || simTime < disaster.start || simTime >= disaster.end || !disaster.area.length) return [];
  let cx = 0, cy = 0;
  for (const p of disaster.area) { cx += p.x; cy += p.y; }
  cx /= disaster.area.length; cy /= disaster.area.length;
  let radius = 0;
  for (const p of disaster.area) radius = Math.max(radius, Math.hypot(p.x - cx, p.y - cy));
  const elapsed = simTime - disaster.start, actors: ParanormalActor[] = [];
  const wave = Math.floor(elapsed / 40), phase = elapsed % 40;
  const random = mulberry((disaster.id * 2654435761 + wave * 97) >>> 0);
  const approach = Math.min(1, phase / 12), fighting = phase >= 12 && phase < 31, defeated = phase >= 31;
  for (let pair = 0; pair < 7; pair++) {
    const angle = random() * Math.PI * 2, ring = radius * (0.15 + random() * 0.43);
    const x = cx + Math.cos(angle) * ring, y = cy + Math.sin(angle) * ring;
    const facing = random() * Math.PI * 2, spread = (1 - approach) * radius * 0.14 + 1.3;
    const dx = Math.cos(facing) * spread, dy = Math.sin(facing) * spread;
    const shake = fighting ? Math.sin(elapsed * 9 + pair) * 0.25 : 0;
    const kidAction = fighting ? 'fight' : 'walk';
    actors.push({ id: pair * 2, kind: 'kid', x: x - dx + shake, y: y - dy, facing,
      action: kidAction, alpha: 1, light: { radius: 6, intensity: fighting ? 0.8 + 0.2 * Math.sin(elapsed * 12) : 0.7, color: '#ffd38a' } });
    actors.push({ id: pair * 2 + 1, kind: PARANORMAL_MONSTERS[(pair + wave + disaster.id) % PARANORMAL_MONSTERS.length],
      x: x + dx - shake, y: y + dy, facing: facing + Math.PI,
      action: defeated ? 'defeated' : fighting ? 'fight' : 'walk', alpha: defeated ? Math.max(0, 1 - (phase - 31) / 9) : 1,
      light: { radius: 3.5, intensity: defeated ? 0 : 0.3, color: '#a3c7ff' } });
  }
  return actors;
}
