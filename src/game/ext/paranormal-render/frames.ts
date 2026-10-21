import manifest from '../../../assets/paranormal/manifest.json';
import type { ParanormalActor } from '../paranormal';
import type { DisasterView } from '../../city';
export type ParanormalSpriteKey = keyof typeof manifest;

/** Native character grid selection: four hero rows (front idle/walk, back idle/walk); monsters have one strip. */
export function paranormalFrame(key: ParanormalSpriteKey, simTime: number, action: ParanormalActor['action'], facing: number, id: number) {
  const m = manifest[key], back = Math.cos(facing) + Math.sin(facing) < 0;
  const row = m.rows === 4 ? (back ? 2 : 0) + (action === 'defeated' ? 0 : 1) : 0;
  const count = m.rowFrames[row] || m.cols;
  const frame = Math.floor(Math.max(0, simTime) * (action === 'fight' ? 10 : 6) + id * 1.7) % count;
  return { sx: frame * m.fw, sy: row * m.fh, sw: m.fw, sh: m.fh, ax: m.ax, ay: m.ay, flip: Math.cos(facing) - Math.sin(facing) < 0 };
}

/** Night fades over eight simulation seconds, and disappears outside the actual battle (not during its warning). */
export function paranormalNightStrength(disasters: readonly Pick<DisasterView, 'kind' | 'start' | 'end'>[], simTime: number): number {
  let strength = 0;
  for (const d of disasters) if (d.kind === 'paranormal' && simTime >= d.start && simTime < d.end)
    strength = Math.max(strength, Math.min(1, (simTime - d.start) / 8, (d.end - simTime) / 8));
  return strength;
}

