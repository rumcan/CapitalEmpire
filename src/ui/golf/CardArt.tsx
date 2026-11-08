// T336 (#962): the cards' pictures. A card with a TrickOrTreat painting (`art`: src/assets/cards/<art>.webp, cut by scripts/assets/prep-card-art.mjs) shows it; every other card is a drawn glyph on a dark frame lit from the
// upper right (the owner's single sun): a labelled stand-in ("Stand In for card art"; docs/GOLF-SPRITES.md asks for the real paintings). Plain SVG, no atlas page. The vending machine's duds (golf junk) are glyphs too, in grey.
import type { ReactNode } from 'react';
import type { Glyph } from '../../game/golf/cards';

// Vite fills the glob in when it builds; under plain node (the esbuild test bundle that renders the panels) there is none, so no pictures (the glyph shows)
const URLS: Record<string, string> = (() => { try { return import.meta.glob('../../assets/cards/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>; } catch { return {}; } })();
/** the url of a card's painting (undefined: it has none, or there is no bundler) */
export const cardArtUrl = (art: string | undefined): string | undefined => (art ? URLS[`../../assets/cards/${art}.webp`] : undefined);

const OUT = '#0b0a14', STEEL = '#cbd5e1';
/** each glyph in a 32 x 32 box, tinted by `c` (the card's rarity) */
const GLYPHS: Record<Glyph, (c: string) => ReactNode> = {
  wedge: c => <><line x1="25" y1="3" x2="14.5" y2="21" stroke={STEEL} strokeWidth="1.8" strokeLinecap="round" /><path d="M14 21 L19 24 C19.6 26.6 16.2 29.6 11 29.6 L4.6 29.4 C3.4 27 4.4 24.6 6.8 23.4z" fill={c} stroke={OUT} strokeWidth="1.2" strokeLinejoin="round" /><path d="M6.6 26.4 H13.8 M7 28.2 H14.2" stroke={OUT} strokeWidth="0.8" opacity="0.6" /></>,
  driver: c => <><line x1="26" y1="3" x2="13" y2="21" stroke={STEEL} strokeWidth="1.8" strokeLinecap="round" /><ellipse cx="10" cy="24.5" rx="8.6" ry="5" transform="rotate(-22 10 24.5)" fill={c} stroke={OUT} strokeWidth="1.2" /></>,
  putter: c => <><line x1="21" y1="3" x2="15.5" y2="24.6" stroke={STEEL} strokeWidth="1.8" strokeLinecap="round" /><rect x="5" y="24.5" width="20" height="4.2" rx="1.4" transform="rotate(-6 15 26.6)" fill={c} stroke={OUT} strokeWidth="1.2" /></>,
  hybrid: c => <><line x1="25.5" y1="3" x2="13" y2="21" stroke={STEEL} strokeWidth="1.8" strokeLinecap="round" /><path d="M13 20.5 C18.5 21 19 26 13.5 28.2 C8 29.6 3.5 28 4 25 C5 22 9 20 13 20.5z" fill={c} stroke={OUT} strokeWidth="1.2" strokeLinejoin="round" /></>,
  bucket: c => <><path d="M6.5 11 H25.5 L23.5 28.5 H8.5z" fill={c} stroke={OUT} strokeWidth="1.2" strokeLinejoin="round" /><ellipse cx="16" cy="11" rx="9.5" ry="3" fill={OUT} /><circle cx="11.5" cy="9.4" r="2.3" fill="#f8fafc" /><circle cx="16.8" cy="8.4" r="2.3" fill="#f8fafc" /><circle cx="21" cy="10" r="2" fill="#f8fafc" /></>,
  sticks: c => <><line x1="6" y1="27" x2="21" y2="6" stroke={c} strokeWidth="3" strokeLinecap="round" /><line x1="11" y1="28" x2="25" y2="9" stroke={STEEL} strokeWidth="3" strokeLinecap="round" /><line x1="16" y1="28.5" x2="28" y2="13" stroke={c} strokeWidth="3" strokeLinecap="round" opacity="0.8" /></>,
  coin: c => <><circle cx="16" cy="16" r="11.5" fill={c} stroke={OUT} strokeWidth="1.4" /><circle cx="16" cy="16" r="8" fill="none" stroke={OUT} strokeWidth="1" opacity="0.5" /><path d="M16 9.5 l2 4.2 4.6 0.6 -3.4 3.2 0.9 4.5 -4.1 -2.3 -4.1 2.3 0.9 -4.5 -3.4 -3.2 4.6 -0.6z" fill={OUT} opacity="0.75" /></>,
  tape: c => <><circle cx="15" cy="16" r="11" fill={c} stroke={OUT} strokeWidth="1.2" /><circle cx="15" cy="16" r="4.6" fill={OUT} /><path d="M24 22 L30 28 L26 29 L21 25z" fill={c} stroke={OUT} strokeWidth="1" strokeLinejoin="round" /></>,
  button: c => <><ellipse cx="16" cy="24" rx="12.5" ry="4.2" fill="#334155" stroke={OUT} strokeWidth="1.2" /><path d="M5 17 V23 A11 4 0 0 0 27 23 V17z" fill={c} stroke={OUT} strokeWidth="1.2" opacity="0.85" /><ellipse cx="16" cy="17" rx="11" ry="4.6" fill={c} stroke={OUT} strokeWidth="1.2" /><ellipse cx="19" cy="15.8" rx="5" ry="1.5" fill="#fff" opacity="0.45" /></>,
  hoop: c => <><ellipse cx="16" cy="17" rx="12.5" ry="7" fill="none" stroke={c} strokeWidth="4" /><ellipse cx="16" cy="17" rx="12.5" ry="7" fill="none" stroke={OUT} strokeWidth="1" opacity="0.5" /><path d="M10 11.5 C12 8 20 8 22 11.5" fill="none" stroke={STEEL} strokeWidth="1.6" strokeLinecap="round" /></>,
  whisper: c => <><circle cx="8" cy="16" r="3.4" fill={c} /><path d="M14 10.5 q5 5.5 0 11 M19.5 7 q8 9 0 18 M25 3.5 q11 12.5 0 25" stroke={c} fill="none" strokeWidth="2" strokeLinecap="round" /></>,
  van: c => <><rect x="2.5" y="10" width="20.5" height="13" rx="2" fill={c} stroke={OUT} strokeWidth="1.2" /><path d="M23 13 H28 L30.5 18 V23 H23z" fill={c} stroke={OUT} strokeWidth="1.2" strokeLinejoin="round" /><rect x="5" y="12.5" width="9" height="4" rx="1" fill={OUT} opacity="0.55" /><circle cx="9" cy="24" r="3.4" fill={OUT} stroke={STEEL} strokeWidth="1.2" /><circle cx="25" cy="24" r="3.4" fill={OUT} stroke={STEEL} strokeWidth="1.2" /></>,
  monitor: c => <><rect x="3" y="5" width="26" height="18" rx="2" fill={OUT} stroke={c} strokeWidth="2" /><path d="M6.5 19 L12 12.5 L16 16.5 L24.5 8.5" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><rect x="11.5" y="24.5" width="9" height="3" fill={c} /></>,
  bottle: c => <><path d="M12.6 3.5 H19.4 V8 L22.6 12 V27 A2.4 2.4 0 0 1 20.2 29.4 H11.8 A2.4 2.4 0 0 1 9.4 27 V12 L12.6 8z" fill={c} stroke={OUT} strokeWidth="1.2" strokeLinejoin="round" /><rect x="12.2" y="2.5" width="7.6" height="3.4" rx="1" fill={STEEL} stroke={OUT} strokeWidth="1" /><path d="M10.4 17 H21.6 M10.4 22 H21.6" stroke={OUT} strokeWidth="1" opacity="0.4" /></>,
  flame: c => <><path d="M16 2.5 C19.2 8 25 11.5 25 19 A9 9 0 0 1 7 19 C7 14.6 9.4 12.4 11.6 10 C11.8 13.2 13.6 14.4 14.6 14.4 C14.6 9 13.4 6 16 2.5z" fill={c} stroke={OUT} strokeWidth="1.2" strokeLinejoin="round" /><path d="M16 16.6 C18.4 20 20.6 21 20.6 24.4 A4.6 4.6 0 0 1 11.4 24.4 C11.4 21.6 13.8 20.4 16 16.6z" fill="#fff3b0" /></>,
  star: c => <path d="M16 3 L20 12 L29.6 13 L22.4 19.6 L24.6 29 L16 24 L7.4 29 L9.6 19.6 L2.4 13 L12 12z" fill={c} stroke={OUT} strokeWidth="1.2" strokeLinejoin="round" />,
  tee: c => <><path d="M7 5.5 H23 L21 9.4 H9z" fill={c} stroke={OUT} strokeWidth="1.1" strokeLinejoin="round" /><path d="M13.6 9.4 L14.6 17" stroke={c} strokeWidth="2.6" strokeLinecap="round" /><path d="M17.6 20 L18 28 L16.4 28 L15.8 22" fill={c} stroke={OUT} strokeWidth="1" strokeLinejoin="round" /></>,
  retriever: c => <><line x1="5" y1="29" x2="25" y2="7" stroke={c} strokeWidth="2.6" strokeLinecap="round" /><path d="M25 7 L29 9 M25 7 L24 2.5" stroke={c} strokeWidth="2" strokeLinecap="round" fill="none" /></>,
  pencil: c => <><path d="M5 25 L21 9 L25.5 13.5 L9.5 29.5 L4 30z" fill={c} stroke={OUT} strokeWidth="1.2" strokeLinejoin="round" /><path d="M21 9 L23.4 6.6 L28 11.2 L25.5 13.5z" fill="#f4a0a0" stroke={OUT} strokeWidth="1" /><path d="M4 30 L5.4 26.6 L7.4 28.6z" fill={OUT} /></>,
  divot: c => <><path d="M16 3 V16" stroke={c} strokeWidth="3" strokeLinecap="round" /><path d="M16 16 L9.5 28 M16 16 L22.5 28" stroke={c} strokeWidth="3" strokeLinecap="round" /><path d="M14.5 10 L17.6 13" stroke={OUT} strokeWidth="1.2" /></>,
  ball: c => <><circle cx="16" cy="16" r="12" fill={c} stroke={OUT} strokeWidth="1.2" /><circle cx="12" cy="12" r="1.5" fill={OUT} opacity="0.3" /><circle cx="18" cy="10.5" r="1.5" fill={OUT} opacity="0.3" /><circle cx="20" cy="17" r="1.5" fill={OUT} opacity="0.3" /><circle cx="13" cy="19.5" r="1.5" fill={OUT} opacity="0.3" /></>,
  visor: c => <><path d="M6 17 C6 9 12 6 17 6 C22 6 26 9 26 17z" fill={c} stroke={OUT} strokeWidth="1.2" strokeLinejoin="round" /><path d="M4 17 H29 C29 21 21 22.6 4 21z" fill={c} stroke={OUT} strokeWidth="1.2" strokeLinejoin="round" opacity="0.85" /></>,
  sunscreen: c => <><rect x="9.5" y="10" width="13" height="19" rx="2.6" fill={c} stroke={OUT} strokeWidth="1.2" /><rect x="12.4" y="3.5" width="7.2" height="7" rx="1.4" fill={STEEL} stroke={OUT} strokeWidth="1" /><circle cx="16" cy="19" r="4" fill="#fde68a" stroke={OUT} strokeWidth="1" /></>,
  bag: c => <><path d="M10 12 H22 L24 29 H8z" fill={c} stroke={OUT} strokeWidth="1.2" strokeLinejoin="round" /><line x1="12.5" y1="12" x2="11" y2="3.5" stroke={STEEL} strokeWidth="1.6" strokeLinecap="round" /><line x1="16" y1="12" x2="16.4" y2="2.5" stroke={STEEL} strokeWidth="1.6" strokeLinecap="round" /><line x1="19.5" y1="12" x2="22" y2="4" stroke={STEEL} strokeWidth="1.6" strokeLinecap="round" /><path d="M10.4 17 H21.6" stroke={OUT} strokeWidth="1" opacity="0.5" /></>,
};

/** the picture of a card or a dud: its painting when it has one, else its glyph tinted by `color` on a dark frame lit from the upper right; `className` sizes it (a box: it fills it). Decorative: the tile around it carries the name */
export function CardArt({ glyph, art, color, className = '', locked = false }: { glyph: Glyph; art?: string; color: string; className?: string; locked?: boolean }) {
  const url = cardArtUrl(art);
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: `radial-gradient(circle at 74% 20%, ${color}${locked ? '22' : '55'}, #0b0a14 64%)` }} aria-hidden="true">
      {locked ? <span className="absolute inset-0 flex items-center justify-center text-xl font-bold" style={{ color: `${color}88` }}>?</span>
        : url ? <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none object-cover" />
        : <svg viewBox="0 0 32 32" className="absolute inset-0 m-auto h-[80%] w-[80%]" style={{ filter: `drop-shadow(0 0 3px ${color}99)` }}>{GLYPHS[glyph](color)}</svg>}
    </div>
  );
}
