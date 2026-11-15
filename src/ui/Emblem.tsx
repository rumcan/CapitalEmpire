// #1304 (the owner, 2026-11-14: "mayors cup logo is not a generated image. pls replace stand in vectors"): the painted emblems (transparent pictures in
// src/assets/ui/emblems, imported by scripts/assets/prep-1304-1300.mjs from the bridge's queue-icons1304.json): the Mayor's Cup, the Club Championship,
// Night golf, the tour's event and your club's crest. Each is drawn where its line icon was; until its picture lands (or with ui-art-look.ts 'vector',
// the old look) the fallback is drawn instead. Under plain node (the test bundle) there is no glob, so the fallback.
import type { ReactNode } from 'react';
import { paintedUi } from './ui-art-look';

const URLS: Record<string, string> = (() => { try { return import.meta.glob('../assets/ui/emblems/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>; } catch { return {}; } })();

export type EmblemId = 'mayors-cup' | 'club-championship' | 'night-golf' | 'tour-event' | 'club-crest';
/** the club events' emblems (golf/clubevents.ts EventId) */
export const EVENT_EMBLEM: Readonly<Record<string, EmblemId>> = { mayor: 'mayors-cup', club: 'club-championship', night: 'night-golf' };
/** a won title's emblem (player.ts titles: the events' names; anything else is the tour's) */
export function emblemOfTitle(title: string): EmblemId {
  return /mayor/i.test(title) ? 'mayors-cup' : /club champ/i.test(title) ? 'club-championship' : /night/i.test(title) ? 'night-golf' : 'tour-event';
}
/** an emblem's URL (undefined: not painted yet) */
export const emblemUrl = (id: EmblemId): string | undefined => URLS[`../assets/ui/emblems/${id}.webp`];

/** the emblem at size px (its longest side; the picture keeps its shape), or the fallback */
export function Emblem({ id, size, fallback, className = '' }: { id: EmblemId | undefined; size: number; fallback?: ReactNode; className?: string }) {
  const src = id && paintedUi() ? emblemUrl(id) : undefined;
  if (!src) return <>{fallback ?? null}</>;
  return <img src={src} width={size} height={size} alt="" aria-hidden="true" draggable={false} data-emblem={id} className={`pointer-events-none shrink-0 select-none object-contain ${className}`} />;
}
