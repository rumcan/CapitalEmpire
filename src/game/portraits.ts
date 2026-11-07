import MANIFEST_FILE from '../assets/portraits/manifest.json';
import type { PersonIdentity, PersonRole } from './person-identity';

/** A large portrait of an actual rendered look. Optional personId/role restrict an image to that identity or role. Dimensions are pixels. */
export interface PortraitPic { lookId: string; file: string; w: number; h: number; bytes: number; personId?: string; role?: PersonRole; state?: 'one' | 'rundown' | 'upgraded' }
/** Approved imported portraits, not a list of requested or queued pictures. */
export interface PortraitManifest { v: number; pictures: readonly PortraitPic[] }
export const PORTRAIT_MANIFEST = MANIFEST_FILE as PortraitManifest;

/** Resolve the clicked actor's exact look; never borrow a different person's appearance or rich-state picture for a rundown request. */
export function portraitOf(person: PersonIdentity, manifest: PortraitManifest = PORTRAIT_MANIFEST, state: 'one' | 'rundown' | 'upgraded' = 'one'): PortraitPic | null {
  const states = state === 'upgraded' ? ['upgraded', 'rundown', 'one'] : state === 'rundown' ? ['rundown', 'one'] : ['one'];
  for (const wanted of states) {
    const matches = manifest.pictures.filter(p => p.lookId === person.lookId && (p.state ?? 'one') === wanted
      && (!p.personId || p.personId === person.id) && (!p.role || p.role === person.role));
    matches.sort((a, b) => Number(!!b.personId) - Number(!!a.personId) || Number(!!b.role) - Number(!!a.role));
    if (matches[0]) return matches[0];
  }
  return null;
}
