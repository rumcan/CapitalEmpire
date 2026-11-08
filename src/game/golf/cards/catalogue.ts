// T336 (#962; the owner, 2026-11-04: "Lets steal art from trickorTreat repo and create some kick ass special cards you earn and can apply to your player. 8 cards slots and you get cards
// when you win tournaments ... Lets have your cards unlock complex mechanics to improve shots like the spacbar power spam and adding spin mid flight aswell as skills ... Every card should
// have a youtube gold inspiration ... Make cards that are overpowered, we can always delete some"): the cards, as plain data.
// - A card is an id, a made-up name (never a trademark or a real person), a rarity (common to legendary), an effect, a line of text, a flavour line and its inspiration (a golf-video moment, a
//   wacky product or real tech, described and never named).
// - Its effect (`fx`) is data and nothing else: `mods`, the same `Mod`s the bag makes (stat changes and factors on the shot, for every club or the listed ones: play/mods.ts), which reach the shot
//   through `applyMods` and nowhere else; `mech`, the mechanics it unlocks (the Space power-spam, spin added in the air: mods.ts MechId); `practice`, a factor on what your practice gains.
//   A card that unlocks a move the swing or the shot code lets you make is a flag those read (`hasMech`), never a second shot path.
// - To cut a card, delete its line: a save that owns it drops it on load (collection.ts normalizeCards). To add one, add a line (T337 adds the rest of the catalogue).
// Pure TS, no DOM.
import { fxLines } from '../play/bag';
import { STAT_IDS, type MechId, type Mod, type StatId } from '../play/mods';
import type { Club } from '../play/types';

/** the five rarities, common to legendary (the loot colours every player knows: grey, green, blue, purple, orange; TrickOrTreat's) */
export const RARITIES = [
  { id: 'common', name: 'Common', color: '#a6a5a2' },
  { id: 'uncommon', name: 'Uncommon', color: '#64ff3a' },
  { id: 'rare', name: 'Rare', color: '#36d7ff' },
  { id: 'epic', name: 'Epic', color: '#c52aff' },
  { id: 'legendary', name: 'Legendary', color: '#ff9d1e' },
] as const;
/** a rarity as its index into RARITIES (0 common .. 4 legendary) */
export type Rarity = 0 | 1 | 2 | 3 | 4;

/** the pictures a card can have: a drawn glyph (CardArt), or a TrickOrTreat treat's painting (`art`) */
export type Glyph = 'wedge' | 'driver' | 'putter' | 'hybrid' | 'bucket' | 'sticks' | 'coin' | 'tape' | 'button' | 'hoop' | 'whisper' | 'van' | 'monitor' | 'bottle' | 'flame' | 'star'
  | 'tee' | 'retriever' | 'pencil' | 'divot' | 'ball' | 'visor' | 'sunscreen' | 'bag';

/** what a card does, as data */
export interface CardFx {
  /** stat changes and factors on the shot (the bag's own `Mod`s: stats added in 0..1 units, factors for the carry, scatter, sweet spot, marker, run, spin, feel, line, a mishit chance, luck), for every club or the listed ones */
  mods?: ReadonlyArray<Omit<Mod, 'id' | 'name'>>;
  /** the mechanics it unlocks (mods.ts MechId) */
  mech?: readonly MechId[];
  /** a factor on what your practice sessions gain (1.5: half as much again) */
  practice?: number;
}
/** a card */
export interface CardDef {
  id: string; name: string; rarity: Rarity; glyph: Glyph;
  /** a TrickOrTreat treat's painting (src/assets/cards/<art>.webp, scripts/assets/prep-card-art.mjs); absent: the glyph, a drawn stand-in */
  art?: string;
  fx: CardFx;
  /** what it does, in a sentence or two */
  text: string;
  flavour: string;
  /** the golf video, wacky product or real tech it comes from (described, never named) */
  inspiration: string;
  /** not in play in competition (the club's events and the tournament): the Club Championship, the Mayor's Cup, the tour's tournament */
  banned?: 'competition';
}

/** all the cards (the starter set; T337 fills the rest of the catalogue). Overpowered is fine: the owner can always delete some, one line each */
export const CARDS: readonly CardDef[] = [
  // ---- common
  { id: 'wonder-wedge', name: 'Infomercial Wonder-Wedge', rarity: 0, glyph: 'wedge', fx: { mods: [{ clubs: ['wedge'], spin: 1.4, carry: 0.9 }] },
    text: 'A wedge off the late-night shopping channel: it grabs the green like glue and flies a little short.', flavour: '"Order in the next ten minutes and we will double the grooves!"',
    inspiration: 'The shopping-channel wedges that promise to spin like a pro, and the reviewer who bought every one.' },
  { id: 'range-rat', name: 'Range Rat', rarity: 0, glyph: 'bucket', art: 'batteries', fx: { practice: 1.5 },
    text: 'Headphones on, bucket by the mat: every practice session teaches you half as much again.', flavour: 'He knows every ball in the bucket by name.',
    inspiration: 'The "a hundred balls a day for a year" range vlogs, one song on repeat.' },
  { id: 'overspeed-sticks', name: 'Overspeed Sticks', rarity: 0, glyph: 'sticks', fx: { mods: [{ stats: { power: 0.1 } }] },
    text: 'Three light sticks and a lot of swishing: +10 power, so every club carries further.', flavour: 'Swish, swish, swish. The neighbours have moved.',
    inspiration: 'The swing-speed training clips with the colour-coded whip sticks.' },
  { id: 'lucky-marker', name: 'Lucky Ball Marker', rarity: 0, glyph: 'coin', fx: { mods: [{ clubs: ['putter'], luck: 0.35 }] },
    text: 'A coin from somebody else’s wedding: now and then a putt that missed drops anyway (and a good one may lip out).', flavour: 'It has never once been wrong. It has never once been asked.',
    inspiration: 'Every pro’s lucky ball marker, and every club golfer’s copy of it.' },
  { id: 'lead-tape', name: 'Lead Tape Special', rarity: 0, glyph: 'tape', fx: { mods: [{ clubs: ['wood'], sweet: 1.12, spread: 0.96 }] },
    text: 'A strip of lead tape on the back of every wood: a wider sweet spot and a tighter spread.', flavour: 'The roll is half empty. That is how you know it works.',
    inspiration: 'The club-tinkering videos where a strip of lead tape fixes everything.' },
  // ---- uncommon
  { id: 'power-mash', name: 'Power Mash', rarity: 1, glyph: 'button', art: 'masher', fx: { mech: ['boost'] },
    text: 'Unlocks the Space power-spam: tap Space during your swing for extra power (1% a tap, at most 6%), at the cost of a narrower sweet spot.', flavour: 'Mash it like it owes you money.',
    inspiration: 'The long-drive grid, where the crowd screams "send it" and the player’s thumb has a mind of its own.' },
  { id: 'arm-lock', name: 'Arm-Lock Putter Grip', rarity: 1, glyph: 'putter', fx: { mods: [{ clubs: ['putter'], line: 1.25, sweet: 1.1, feel: 0.88 }] },
    text: 'The shaft locked against your forearm: less wobble on the line, less feel for the pace.', flavour: 'Your wrist has been asked to leave the stroke.',
    inspiration: 'The arm-lock putting method that the putting-lesson channels cannot stop arguing about.' },
  { id: 'broomstick', name: 'Broomstick Putter', rarity: 1, glyph: 'putter', fx: { mods: [{ clubs: ['putter'], line: 1.3, sweet: 1.2, feel: 0.8 }] },
    text: 'A putter as long as a broom, anchored at the chest: dead straight, and you cannot feel a thing.', flavour: 'It sweeps the green. It also sweeps the greenkeeper’s patience.',
    inspiration: 'The long anchored putters that were everywhere on tour, until they were not.' },
  { id: 'swing-hoop', name: 'Swing-Plane Hoop', rarity: 1, glyph: 'hoop', fx: { mods: [{ stats: { accuracy: 0.1 } }] },
    text: 'A hoop round your waist keeps the club on plane: +10 accuracy, a tighter scatter and a wider sweet spot.', flavour: 'Do not ask how the straps go.',
    inspiration: 'The swing-plane trainer gadgets with a suspicious number of straps.' },
  // ---- rare
  { id: 'mid-flight-whisper', name: 'Mid-Flight Whisper', rarity: 2, glyph: 'whisper', fx: { mech: ['airspin'] },
    text: 'Unlocks spin in the air: while the ball flies, click the spin ball (or press F) to add more of the spin you chose, up to the club’s and the lie’s cap.', flavour: 'Talk to it. Quietly. It likes that.',
    inspiration: 'The trick-shot videos where the ball listens, and the commentator is the only one who does not look surprised.' },
  { id: 'hybrid-hero', name: 'Hybrid Hero', rarity: 2, glyph: 'hybrid', fx: { mods: [{ clubs: ['hybrid', 'wood5'], carry: 1.05, spread: 0.8, sweet: 1.25, mishit: -0.02 }] },
    text: 'The hybrid (or the 5-wood in its slot) that forgives everything: +5% carry, a much wider sweet spot, fewer mishits.', flavour: 'Why was the long iron ever allowed in the bag?',
    inspiration: 'The "throw away your long irons" hybrid evangelists.' },
  { id: 'tour-van-fitting', name: 'Tour Van Fitting', rarity: 2, glyph: 'van', fx: { mods: [{ spread: 0.9, sweet: 1.12, mishit: -0.01 }] },
    text: 'A stranger in a van watches you swing and adjusts the whole bag: every club scatters 10% less, with a wider sweet spot and fewer mishits.', flavour: '"Interesting. Very interesting. That will be a lot of money."',
    inspiration: 'The tour trucks where a fitter watches one swing and sells you a new bag.' },
  // ---- epic
  { id: 'long-drive-shaft', name: 'Long Drive Shaft', rarity: 3, glyph: 'driver', fx: { mods: [{ clubs: ['driver'], carry: 1.1, sweet: 0.8 }] },
    text: 'About 25 yards more off the tee (+10% driver carry), and the sweet spot gets narrow: hit it clean or pay.', flavour: 'It bends like a fishing rod and launches like a regret.',
    inspiration: 'The long-drive shafts the champions swear by, and the club golfers who snap them.' },
  { id: 'flatstick', name: 'Lie-Angle Balanced Flatstick', rarity: 3, glyph: 'putter', fx: { mods: [{ clubs: ['putter'], line: 1.8, sweet: 1.3, spread: 0.5 }] },
    text: 'The face stays square through the stroke: putting misses roughly halve (a far wider line window, a leave half as long).', flavour: 'It does not hope. It aims.',
    inspiration: 'The lab-tested putters with the lie angle balanced so the face never twists.' },
  { id: 'launch-monitor', name: 'Garage Launch Monitor', rarity: 3, glyph: 'monitor', fx: { mods: [{ stats: { accuracy: 0.15, power: 0.1 } }] },
    text: 'Numbers in the garage, numbers on the course: +15 accuracy and +10 power.', flavour: '"Look at that smash factor!" Nobody asked.',
    inspiration: 'The basement launch monitors and the dads who talk about smash factor.' },
  // ---- legendary
  { id: 'pro-in-a-bottle', name: 'Tour Pro in a Bottle', rarity: 4, glyph: 'bottle', fx: { mods: [{ stats: { driving: 0.15, irons: 0.15, short: 0.15, putting: 0.15, power: 0.15, accuracy: 0.15, touch: 0.15 } }] },
    text: '+15 to every skill and stat: you play like a tour pro for as long as the card is in a slot.', flavour: 'Shake well. Do not read the label.',
    inspiration: 'The "I played like a pro for a day" challenge videos.' },
  { id: 'hot-driver', name: 'Non-Conforming Driver', rarity: 4, glyph: 'flame', fx: { mods: [{ clubs: ['driver'], carry: 1.18, sweet: 1.15 }] }, banned: 'competition',
    text: 'A face hot as a pan: +18% driver carry and a wider sweet spot. Banned in competition: the Club Championship, the Mayor’s Cup and the tournament.', flavour: 'The ball leaves the face like a rifle shot. The rules officials leave the room.',
    inspiration: 'The "illegally hot driver" tests where a ball comes off the face like a rifle shot.' },
];

/** a card by id (undefined: not a card, or a card since cut) */
const BY_ID = new Map(CARDS.map(c => [c.id, c] as const));
export const cardById = (id: string): CardDef | undefined => BY_ID.get(id);

/** what the vending machine can hand out that is no card: the junk of a pro shop's lost-and-found (a dud wins nothing) */
export interface DudDef { id: string; name: string; glyph: Glyph; quote: string }
export const DUDS: readonly DudDef[] = [
  { id: 'broken-tee', name: 'Broken Tee', glyph: 'tee', quote: 'Snapped on the first swing of the day.' },
  { id: 'retriever', name: 'Ball Retriever (No Head)', glyph: 'retriever', quote: 'Just a pole, now. A long, sad pole.' },
  { id: 'pencil', name: 'Scorecard Pencil', glyph: 'pencil', quote: 'Two inches long. Chewed. Still writes a bogey.' },
  { id: 'divot-tool', name: 'Cracked Divot Tool', glyph: 'divot', quote: 'Repairs nothing, not even itself.' },
  { id: 'lost-ball', name: 'Somebody Else’s Ball', glyph: 'ball', quote: 'Found in the rough. Claimed by nobody. Cursed by several.' },
  { id: 'visor', name: 'Sun-Bleached Visor', glyph: 'visor', quote: 'It used to be red. It used to be a lot of things.' },
  { id: 'sunscreen', name: 'Expired Sunscreen', glyph: 'sunscreen', quote: 'SPF "good luck".' },
  { id: 'range-bag', name: 'Empty Range Bag', glyph: 'bag', quote: 'Rattles. Contains one tee and a receipt.' },
];

// ---- the card's words ----
/** the clubs a mod names, as the card writes them ("Driver", "Wedges", "Hybrid, 5-wood"); '' for every club */
const SCOPE_NAME: Readonly<Record<string, string>> = { driver: 'Driver', wood3: '3-wood', wood5: '5-wood', hybrid: 'Hybrid', iron4: '4-iron', iron5: '5-iron', iron6: '6-iron', iron7: '7-iron', iron8: '8-iron', iron9: '9-iron', pw: 'Pitching wedge', gw: 'Gap wedge', sw: 'Sand wedge', lw: 'Lob wedge', putter: 'Putter', wood: 'Woods', iron: 'Irons', wedge: 'Wedges' };
export const scopeText = (clubs: readonly (Club | string)[] | undefined): string => clubs?.length ? clubs.map(c => SCOPE_NAME[c] ?? c).join(', ') : '';
const STAT_NAME: Readonly<Record<StatId, string>> = { driving: 'driving', irons: 'irons', short: 'wedges', putting: 'putting', power: 'power', accuracy: 'accuracy', touch: 'touch' };
/** the mechanics as the card writes them */
export const MECH_NAME: Readonly<Record<MechId, string>> = { boost: 'Space power-spam', airspin: 'spin in the air' };
const pct = (f: number): string => `${f >= 1 ? '+' : '-'}${Math.abs(Math.round((f - 1) * 1000) / 10)}%`;

/** a mod's effect as lines: its stat changes ("+10 power"), its factors ("+10% carry", "scatter -20%", "marker speed -12%", "run +10%", "spin +40%"), a mishit chance and luck, each led by the clubs it is for */
export function modLines(m: Omit<Mod, 'id' | 'name'>): string[] {
  const lead = scopeText(m.clubs), out: string[] = [], tag = (s: string) => (lead ? `${lead}: ${s}` : s);
  if (m.stats) {
    const ks = STAT_IDS.filter(k => m.stats![k]), vals = ks.map(k => Math.round(m.stats![k]! * 100)), sign = (n: number) => `${n > 0 ? '+' : '-'}${Math.abs(n)}`;
    if (ks.length === STAT_IDS.length && vals.every(v => v === vals[0])) out.push(tag(`${sign(vals[0]!)} to every skill and stat`));
    else if (ks.length) out.push(tag(ks.map((k, i) => `${sign(vals[i]!)} ${STAT_NAME[k]}`).join(', ')));
  }
  // (the putter's scatter is its leave, as the bag card says it)
  const f = fxLines(m, m.clubs?.length === 1 && m.clubs[0] === 'putter' ? 'leave' : 'scatter');
  if (m.speed && m.speed !== 1) f.push(`marker speed ${pct(m.speed)}`);
  if (m.roll && m.roll !== 1) f.push(`run ${pct(m.roll)}`);
  if (f.length) out.push(tag(f.join(' · ')));
  return out;
}
/** a card's effect as lines for its face: each mod, the mechanics it unlocks, the practice bonus, and the ban */
export function cardLines(c: CardDef): string[] {
  const out: string[] = [];
  for (const m of c.fx.mods ?? []) out.push(...modLines(m));
  for (const k of c.fx.mech ?? []) out.push(`Unlocks: ${MECH_NAME[k]}`);
  if (c.fx.practice && c.fx.practice !== 1) out.push(`Practice gains ${pct(c.fx.practice)}`);
  if (c.banned) out.push('Banned in competition');
  return out;
}

/** a card's mods as the shot model reads them: each one with an id (`card:<id>`, `card:<id>:<n>` for a second) and the card's name, in the card's own order */
export function cardMods(c: CardDef): Mod[] {
  return (c.fx.mods ?? []).map((m, i) => ({ ...m, id: i ? `card:${c.id}:${i}` : `card:${c.id}`, name: c.name }));
}

/** a card's rarity as its record */
export const rarityOf = (c: { rarity: number }): (typeof RARITIES)[number] => RARITIES[Math.min(4, Math.max(0, c.rarity))]!;
