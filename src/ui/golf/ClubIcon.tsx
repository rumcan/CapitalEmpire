// T335 (#961): the bag's club icons. A drawn stand-in ("Stand In for club icons", docs/GOLF-SPRITES.md asks for the real ones): a shaft and a head by the club's family, the head tinted by its upgrade level
// (Garage-sale slate, Club sky, Tour green, Prototype gold), lit from the upper right (the owner's single sun). Plain SVG, no atlas page.
import type { Club } from '../../game/golf/play';

/** the head's colour by level: Garage-sale, Club, Tour, Prototype */
export const LEVEL_COLOR: readonly string[] = ['#94a3b8', '#38bdf8', '#34d399', '#fbbf24'];

/** a club's icon: `level` tints the head (0..3), `size` is its side in px */
export function ClubIcon({ club, level = 0, size = 28 }: { club: Club; level?: number; size?: number }) {
  const c = LEVEL_COLOR[Math.min(3, Math.max(0, level))]!, rim = 'rgba(15,23,42,0.85)';
  let head;
  switch (club) {
    case 'driver': head = <ellipse cx="10" cy="24.5" rx="8.6" ry="5" transform="rotate(-22 10 24.5)" fill={c} stroke={rim} strokeWidth="1.2" />; break;
    case 'wood3': case 'wood5': head = <ellipse cx="10.5" cy="24.5" rx="7.2" ry="4.2" transform="rotate(-22 10.5 24.5)" fill={c} stroke={rim} strokeWidth="1.2" />; break;
    case 'hybrid': head = <path d="M13 20.5 C18.5 21 19 26 13.5 28.2 C8 29.6 3.5 28 4 25 C5 22 9 20 13 20.5z" fill={c} stroke={rim} strokeWidth="1.2" strokeLinejoin="round" />; break;
    case 'putter': head = <rect x="5" y="24.5" width="20" height="4.2" rx="1.4" transform="rotate(-6 15 26.6)" fill={c} stroke={rim} strokeWidth="1.2" />; break;
    case 'pw': case 'gw': case 'sw': case 'lw':
      head = (<g><path d="M13.5 20.6 L18.5 23.4 C19.2 26 16 29.2 11 29.4 L4.2 29.2 C2.8 27 3.6 24.6 6 23.4z" fill={c} stroke={rim} strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M6.5 26.2 H13.6 M7 28 H14" stroke={rim} strokeWidth="0.8" opacity="0.7" /></g>);
      break;
    default: // the irons
      head = <path d="M13.2 20.6 L18.6 23.6 L14.6 29.2 L3.6 29.2 L3.2 25.6 L6.4 23.2z" fill={c} stroke={rim} strokeWidth="1.2" strokeLinejoin="round" />;
  }
  const a: [number, number] = club === 'putter' ? [21, 3] : [25.5, 3], b: [number, number] = club === 'putter' ? [15.5, 24.6] : [13, 21.6];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#cbd5e1" strokeWidth="1.8" strokeLinecap="round" />
      {head}
      {/* the sun's glint on the head's upper right edge */}
      <path d="M15.8 21.2 L18 22.6" stroke="rgba(255,255,255,0.75)" strokeWidth="1" strokeLinecap="round" opacity={club === 'putter' ? 0 : 1} />
      {club === 'putter' && <path d="M21.5 25 L24 24.6" stroke="rgba(255,255,255,0.75)" strokeWidth="1" strokeLinecap="round" />}
    </svg>
  );
}
