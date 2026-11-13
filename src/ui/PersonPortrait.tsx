import { useState } from 'react';
import type { PersonIdentity } from '../game/person-identity';
import { JAM } from '../game/features';
import { PORTRAIT_MANIFEST, portraitOf, type PortraitManifest } from '../game/portraits';

// URL imports are strings: image bytes are requested only by the mounted portrait's img, never by an unopened TalkCard.
const URLS: Record<string, string> = (() => { try { return import.meta.glob('../assets/portraits/*.{webp,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>; } catch { return {}; } })();

/** A lazy large portrait matching the actor's real look; missing files remain an honest pending-art state. */
export function PersonPortrait({ person, manifest = PORTRAIT_MANIFEST, urls = URLS }: {
  person: PersonIdentity; manifest?: PortraitManifest; urls?: Readonly<Record<string, string>>;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const pic = portraitOf(person, manifest), url = pic ? urls[`../assets/portraits/${pic.file}`] : undefined;
  if (JAM && !(pic && url && failed !== pic.file)) return null; // the jam build shows no "not yet available" placeholder
  return <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-900" data-testid="person-portrait" data-person-id={person.id} data-look-id={person.lookId}>
    {pic && url && failed !== pic.file ? <img key={pic.file} src={url} width={pic.w} height={pic.h} loading="lazy" decoding="async"
      alt={`${person.name}, ${person.job.toLowerCase()}`} className="max-h-80 w-full object-cover" onError={() => setFailed(pic.file)} data-testid="person-portrait-image" />
      : <p className="px-3 py-5 text-center text-xs text-slate-400" data-testid="person-portrait-pending">Portrait not yet available for this person.</p>}
  </div>;
}
