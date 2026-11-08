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
  | 'tee' | 'retriever' | 'pencil' | 'divot' | 'ball' | 'visor' | 'sunscreen' | 'bag'
  | 'flag' | 'beer' | 'dice' | 'wind' | 'slope' | 'robot' | 'mic' | 'trophy' | 'eye' | 'eraser' | 'heart' | 'laser';

/** T337: the economy a card changes, each a factor (1: none): what a money match you win pays, how big a stake your opponents take (their purse), what a title's prize pays, what your pro's lesson adds to practice */
export interface CardEco { matchPay: number; matchStake: number; prize: number; lesson: number }
export const ECO_KEYS: readonly (keyof CardEco)[] = ['matchPay', 'matchStake', 'prize', 'lesson'];

/** what a card does, as data */
export interface CardFx {
  /** stat changes and factors on the shot (the bag's own `Mod`s: stats added in 0..1 units, factors for the carry, scatter, sweet spot, marker, run, spin, feel, line, the wind, the swing's miss, the slope, a mishit chance, luck), for every club or the listed ones, and for a moment (`when`) */
  mods?: ReadonlyArray<Omit<Mod, 'id' | 'name'>>;
  /** the mechanics it unlocks (mods.ts MechId) */
  mech?: readonly MechId[];
  /** a factor on what your practice sessions gain (1.5: half as much again) */
  practice?: number;
  /** T337: the economy (CardEco), the factors it changes */
  eco?: Partial<CardEco>;
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
  // ---- T337 (#963): the rest of the catalogue ----
  // common
  { id: 'putting-mirror', name: 'Putting Mirror', rarity: 0, glyph: 'putter', fx: { mods: [{ clubs: ['putter'], line: 1.15, sweet: 1.1 }] },
    text: 'A little mirror on the green: your eyes are square to the line, so the aim window is wider.', flavour: 'Hello, handsome. Now hold still.',
    inspiration: 'The putting-mirror training aids that sit on every practice green.' },
  { id: 'routine-card', name: 'Pre-Shot Routine Card', rarity: 0, glyph: 'pencil', fx: { mods: [{ sweet: 1.1, speed: 0.95 }] },
    text: 'Two practice swings, one deep breath, one waggle: a slower marker and a wider sweet spot on every club.', flavour: 'Breathe in. Waggle. Breathe out. Forget the water.',
    inspiration: 'The pre-shot routine videos: count your breaths, count your waggles.' },
  { id: 'tall-tees', name: 'Tall Tees', rarity: 0, glyph: 'tee', fx: { mods: [{ when: 'tee', carry: 1.04, spread: 0.97 }] },
    text: 'Tee it high and let it fly: +4% carry and a tighter spread, but only off the tee.', flavour: 'Reaching for the sky since 1985.',
    inspiration: 'The "tee it higher" driver tips, and the bags of a hundred extra-long tees.' },
  { id: 'hackout-boots', name: 'Hack-Out Boots', rarity: 0, glyph: 'divot', fx: { mods: [{ when: 'rough', carry: 1.1, spread: 0.85 }] },
    text: 'Heavy boots and a heavier swing: from the rough every club carries 10% further and scatters 15% less.', flavour: 'The long grass does not bite. It is bitten.',
    inspiration: 'The "play it from the worst lie in the park" challenge videos.' },
  { id: 'weighted-donut', name: 'Weighted Donut', rarity: 0, glyph: 'hoop', fx: { mods: [{ stats: { power: 0.06 } }] },
    text: 'A lead ring on the club for practice swings: +6 power, and a strange look from the starter.', flavour: 'Heavier on the way up. Lighter on the way home.',
    inspiration: 'The weighted-donut warm-up that every swing-speed video swears by.' },
  // uncommon
  { id: 'yardage-book', name: 'Tour Caddie’s Yardage Book', rarity: 1, glyph: 'pencil', fx: { mods: [{ stats: { accuracy: 0.06, short: 0.06 } }] },
    text: 'Every sprinkler head and slope written in tiny pencil: +6 accuracy and +6 wedges.', flavour: 'Page 14 has a coffee ring and the answer.',
    inspiration: 'The tour caddies’ yardage books, and the reviewers who photograph every page.' },
  { id: 'persimmon', name: 'Dad’s Old Persimmon', rarity: 1, glyph: 'driver', fx: { mods: [{ clubs: ['wood'], carry: 0.97, sweet: 1.25, roll: 1.2 }] },
    text: 'A wooden-headed driver from the garage: a little shorter, a much wider sweet spot, and it runs on.', flavour: 'It sounds like someone knocking. It never misses.',
    inspiration: 'The classic wooden woods that dads keep in the garage, and the reviewers who finally try one.' },
  { id: 'tour-balls', name: 'Tour Issue Balls', rarity: 1, glyph: 'ball', fx: { mods: [{ spin: 1.15, roll: 0.95, carry: 1.01 }] },
    text: 'Soft covers by the dozen: every club takes 15% more spin, runs a little less and carries a touch further.', flavour: 'Twelve of them. Eleven will be lost by Tuesday.',
    inspiration: 'The ball-testing videos with a robot, a hundred balls and one very small chart.' },
  { id: 'rocket-balls', name: 'Two-Piece Rocket Balls', rarity: 1, glyph: 'ball', fx: { mods: [{ carry: 1.03, spin: 0.8, roll: 1.1 }] },
    text: 'A hard cover and a hot core: +3% carry and more run, with less spin to hold the green.', flavour: 'Guaranteed not to cut. Not guaranteed to stop.',
    inspiration: 'The "distance ball" reviews: a hundred yards past the pro, and none of it on the green.' },
  { id: 'bunker-rake', name: 'Rake of Truth', rarity: 1, glyph: 'divot', fx: { mods: [{ when: 'bunker', carry: 1.15, spread: 0.8, mishit: -0.03 }] },
    text: 'The sand tells the truth: from a bunker every club carries 15% further, scatters 20% less and mishits three in a hundred less.', flavour: 'Open the face. Trust the sand. Rake it after.',
    inspiration: 'The bunker-escape lessons: open the face and splash it out.' },
  { id: 'laser-rangefinder', name: 'Laser Rangefinder', rarity: 1, glyph: 'laser', fx: { mech: ['laser'] },
    text: 'Unlocks the laser: the panel gives the distance to the pin to a tenth of a metre, and the carry to water, sand and the green along your line.', flavour: 'Beep. 143.6. Beep. Still 143.6.',
    inspiration: 'The laser rangefinders every golf-gear review compares, and the pin-seeking jolt.' },
  { id: 'fairway-finder', name: 'Fairway Finder', rarity: 1, glyph: 'flag', banned: 'competition', fx: { mech: ['finder'] },
    text: 'A tee shot that ends up in the rough rolls back to the fairway three times in ten.', flavour: 'It is not luck. It is a very small magnet in the tee.',
    inspiration: 'The magnetic tee gadgets that promise to find the short grass.' },
  { id: 'cold-beer', name: 'Cold Beer, Hot Hands', rarity: 1, glyph: 'beer', fx: { mech: ['hands'] },
    text: 'After a birdie or better in your own round your nerve is +20 for the next two holes.', flavour: 'One cold one on the 9th tee. Do not tell the pro.',
    inspiration: 'The "one drink per birdie" challenge rounds.' },
  { id: 'lesson-book', name: 'Lesson Voucher Book', rarity: 1, glyph: 'bag', fx: { eco: { lesson: 2 } },
    text: 'A book of lesson vouchers: a lesson from your pro adds double to the next practice session.', flavour: 'Ten lessons for the price of eight. Five used.',
    inspiration: 'The lesson packages that every driving range sells in a book of tickets.' },
  { id: 'gamblers-dice', name: 'Gambler’s Dice', rarity: 1, glyph: 'dice', fx: { mods: [{ clubs: ['putter'], luck: 0.5, line: 0.95 }] },
    text: 'Roll them on the green: now and then a bad putt drops anyway, and now and then a good one lips out.', flavour: 'Snake eyes. Putt drops anyway.',
    inspiration: 'The skins-game bar bets, and the putt that always seems to drop on the 18th.' },
  // rare
  { id: 'slow-mo-app', name: 'Slow-Mo Swing App', rarity: 2, glyph: 'monitor', fx: { mods: [{ speed: 0.85, sweet: 1.05 }] },
    text: 'Your swing in slow motion on your phone: the marker runs 15% slower on every club, with a slightly wider sweet spot.', flavour: 'Frame 41. There. That is where it all went wrong.',
    inspiration: 'The swing-analysis apps with a drawn line and a free trial.' },
  { id: 'stimp-nerd', name: 'Stimpmeter Nerd', rarity: 2, glyph: 'putter', fx: { mods: [{ clubs: ['putter'], feel: 1.25, sweet: 1.1 }] },
    text: 'He measures every green before the round: the pace window is 25% wider and the leave 25% closer.', flavour: '"It is a ten today." He has said that before.',
    inspiration: 'The green-speed nerds with a ramp, a ball and a notebook.' },
  { id: 'wind-whisperer', name: 'Wind Whisperer', rarity: 2, glyph: 'wind', fx: { mods: [{ wind: 0.5 }] },
    text: 'The wind affects your ball half as much: half the headwind, half the tailwind, half the drift.', flavour: 'It is not that the wind is kind. It is that you are not listening.',
    inspiration: 'The links-golf videos where a pro plays a stinger into a gale.' },
  { id: 'slope-mode', name: 'Slope Mode', rarity: 2, glyph: 'slope', banned: 'competition', fx: { mech: ['slope'], mods: [{ slope: 0.5 }] },
    text: 'Unlocks plays-like with elevation: the panel gives the rise to the pin, and the slope under the ball costs you half as much.', flavour: 'The hill is a number now. Numbers are polite.',
    inspiration: 'The slope-adjusted rangefinders, and the one switch that makes them illegal.' },
  { id: 'pace-robot', name: 'Pace Putting Robot', rarity: 2, glyph: 'robot', fx: { mech: ['pace'], mods: [{ clubs: ['putter'], feel: 1.3 }] },
    text: 'Unlocks the pace window: the putting meter shows where to stop the power so the putt can still drop, and your feel is 30% better.', flavour: 'BEEP. SPEED: PERFECT. BEEP. SPEED: YOU.',
    inspiration: 'The putting robots that roll a thousand putts to find the perfect pace.' },
  { id: 'mic-caddie', name: 'Mic’d-Up Caddie', rarity: 2, glyph: 'mic', fx: { mech: ['caddie'], mods: [{ when: 'follow', stats: { driving: 0.05, irons: 0.05, short: 0.05, putting: 0.05, power: 0.05, accuracy: 0.05, touch: 0.05 } }] },
    text: 'Unlocks the caddie: he says the club and the line on the panel, and when you play his club on his line you are +5 on every skill and stat for that shot.', flavour: '"Trust me. I have seen this one break left all day."',
    inspiration: 'The mic’d-up caddie videos: every doubt, every number, every "good shot".' },
  { id: 'skins-hustler', name: 'Skins Hustler', rarity: 2, glyph: 'coin', fx: { eco: { matchPay: 2, matchStake: 2 } },
    text: 'A money match you win pays double (the side bets), and your opponents carry twice the purse: they accept bigger stakes.', flavour: '"Loser buys. Winner takes the crowd."',
    inspiration: 'The skins games with a hat full of notes and a lot of friendly trash talk.' },
  { id: 'deck-driver', name: 'Driver Off the Deck', rarity: 2, glyph: 'driver', fx: { mech: ['deck'], mods: [{ clubs: ['driver'], when: 'deck', carry: 0.93, roll: 1.7, wind: 0.6, spread: 0.8, mishit: -0.02 }] },
    text: 'Unlocks the driver off the fairway: a lower flight (7% less carry, the wind catches it 40% less), a long run and 20% less scatter.', flavour: 'Take a breath. Pick the club that scares you.',
    inspiration: 'The "driver off the deck" challenge videos.' },
  { id: 'scramble-captain', name: 'Scramble Captain', rarity: 2, glyph: 'star', banned: 'competition', fx: { mech: ['scramble'] },
    text: 'Once on each nine, after a tee shot in your own round, hit a second ball: the better of the two stands. Not for competition.', flavour: '"We take the best one. We always take the best one."',
    inspiration: 'The scramble format of every charity day.' },
  { id: 'sponsor-tent', name: 'Sponsor Tent', rarity: 2, glyph: 'trophy', fx: { eco: { prize: 1.5 } },
    text: 'A sponsor with a tent and a chequebook: a title’s prize money is half as much again.', flavour: 'A big cheque. A bigger photo.',
    inspiration: 'The sponsor tents at every pro-am and their giant cardboard cheques.' },
  // epic
  { id: 'carbon-bag', name: 'Carbon Everything', rarity: 3, glyph: 'bag', fx: { mods: [{ carry: 1.04, sweet: 1.1, speed: 0.93 }] },
    text: 'Carbon shafts, a carbon bag, a carbon fibre tee: every club carries 4% further, with a wider sweet spot and a slower marker.', flavour: 'Lighter by a pound. Heavier by a lot of money.',
    inspiration: 'The all-carbon equipment reviews, and the wallet that reviewed them.' },
  { id: 'putter-whisperer', name: 'The Hole-Whisperer’s Putter', rarity: 3, glyph: 'putter', fx: { mods: [{ clubs: ['putter'], feel: 1.3, line: 1.3, luck: 0.2 }] },
    text: 'It talks to the hole: a wider pace window, a wider line window, and now and then a lucky drop.', flavour: 'The cup leans in. Slightly.',
    inspiration: 'The putter-fitting videos where a stranger finds the one true putter.' },
  { id: 'read-the-feet', name: 'Read the Feet', rarity: 3, glyph: 'eye', fx: { mech: ['read'], mods: [{ clubs: ['putter'], line: 1.3 }] },
    text: 'Unlocks the read: on every putt the panel says how the green breaks (left to right or right to left) and whether it runs uphill or downhill, and the line window is 30% wider.', flavour: 'Stand, feel, lean. The green tells you where.',
    inspiration: 'The foot-read green-reading method: feel the slope through your soles, find the aim point.' },
  { id: 'trick-shot', name: 'Backyard Trick Shot', rarity: 3, glyph: 'star', art: 'yoyo', fx: { mech: ['trick'] },
    text: 'Unlocks the flop and the bump-and-run from any lie: a wedge plays out of the rough, the sand or the fescue as if it sat on the fairway, and a short one now and then drops.', flavour: 'Do not try this at home. Try it at the club.',
    inspiration: 'The trick-shot channels: flops over cars, bump-and-runs off the cart path.' },
  // legendary
  { id: 'snowman-eraser', name: 'The Snowman Eraser', rarity: 4, glyph: 'eraser', banned: 'competition', fx: { mech: ['eraser'] },
    text: 'Once a round, in your own round, a double bogey or worse on a hole is rubbed out to a bogey.', flavour: 'There was no eight. Nobody saw an eight.',
    inspiration: 'The "pencil-whipped" scorecards of every Saturday four-ball.' },
  { id: 'self-correcting-ball', name: 'Self-Correcting Ball', rarity: 4, glyph: 'ball', banned: 'competition', fx: { mods: [{ miss: 0.5 }] },
    text: 'The ball curls back to the line: every miss from the swing meter is half as big, hooks and slices included. Banned in competition.', flavour: 'It knows where you meant to hit it. It is judging you.',
    inspiration: 'The anti-slice "self-correcting" balls from the late-night adverts.' },
  { id: 'ace-magnet', name: 'Ace Magnet', rarity: 4, glyph: 'flag', banned: 'competition', fx: { mech: ['ace'] },
    text: 'On a par 3, a tee shot that finishes within 6 m of the pin drops one time in five.', flavour: 'The cup has a rare-earth magnet. Do not tell the committee.',
    inspiration: 'The hole-in-one insurance hats, and the grandmother who aced the 12th.' },
  { id: 'clutch-gene', name: 'Clutch Gene', rarity: 4, glyph: 'heart', fx: { mods: [{ when: 'last', sweet: 2.4, spread: 0.85 }] },
    text: 'On the last hole of the round, the 18th or a match’s last, the sweet spot of your swing is huge and the scatter is smaller.', flavour: 'Your hands know. Your hands have always known.',
    inspiration: 'The last-hole pressure videos where the scratch golfer needs a par to win.' },
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
export const MECH_NAME: Readonly<Record<MechId, string>> = {
  boost: 'Space power-spam', airspin: 'spin in the air', deck: 'the driver off the fairway', finder: 'a tee shot in the rough rolls back to the fairway', trick: 'wedges from any lie, and short ones that drop', ace: 'par-3 tee shots that drop',
  scramble: 'a second tee ball once a nine', eraser: 'a snowman rubbed out once a round', hands: 'nerve after a birdie', caddie: 'the caddie’s club and line', laser: 'the laser: exact distances and carries', slope: 'plays-like with elevation',
  read: 'the green read', pace: 'the pace window on the putting meter',
};
const pct = (f: number): string => `${f >= 1 ? '+' : '-'}${Math.abs(Math.round((f - 1) * 1000) / 10)}%`;
/** the moment a mod is for, as the card says it */
const WHEN_NAME: Readonly<Record<string, string>> = { tee: 'off the tee', deck: 'off the deck', rough: 'from the rough', bunker: 'from a bunker', last: 'on the last hole', follow: 'when you follow him' };

/** a mod's effect as lines: its stat changes ("+10 power"), its factors ("+10% carry", "scatter -20%", "marker speed -12%", "run +10%", "spin +40%"), a mishit chance and luck, each led by the clubs it is for */
export function modLines(m: Omit<Mod, 'id' | 'name'>): string[] {
  const where = [scopeText(m.clubs), m.when ? WHEN_NAME[m.when] ?? '' : ''].filter(Boolean).join(' '), lead = where ? where[0]!.toUpperCase() + where.slice(1) : '', out: string[] = [], tag = (s: string) => (lead ? `${lead}: ${s}` : s);
  if (m.stats) {
    const ks = STAT_IDS.filter(k => m.stats![k]), vals = ks.map(k => Math.round(m.stats![k]! * 100)), sign = (n: number) => `${n > 0 ? '+' : '-'}${Math.abs(n)}`;
    if (ks.length === STAT_IDS.length && vals.every(v => v === vals[0])) out.push(tag(`${sign(vals[0]!)} to every skill and stat`));
    else if (ks.length) out.push(tag(ks.map((k, i) => `${sign(vals[i]!)} ${STAT_NAME[k]}`).join(', ')));
  }
  // (the putter's scatter is its leave, as the bag card says it)
  const f = fxLines(m, m.clubs?.length === 1 && m.clubs[0] === 'putter' ? 'leave' : 'scatter');
  if (m.speed && m.speed !== 1) f.push(`marker speed ${pct(m.speed)}`);
  if (m.roll && m.roll !== 1) f.push(`run ${pct(m.roll)}`);
  if (m.wind && m.wind !== 1) f.push(`wind ${pct(m.wind)}`);
  if (m.miss && m.miss !== 1) f.push(`swing miss ${pct(m.miss)}`);
  if (m.slope && m.slope !== 1) f.push(`slope ${pct(m.slope)}`);
  if (f.length) out.push(tag(f.join(' · ')));
  return out;
}
/** a card's effect as lines for its face: each mod, the mechanics it unlocks, the practice bonus, and the ban */
export function cardLines(c: CardDef): string[] {
  const out: string[] = [];
  for (const m of c.fx.mods ?? []) out.push(...modLines(m));
  for (const k of c.fx.mech ?? []) out.push(`Unlocks: ${MECH_NAME[k]}`);
  if (c.fx.practice && c.fx.practice !== 1) out.push(`Practice gains ${pct(c.fx.practice)}`);
  const e = c.fx.eco;
  if (e?.matchPay && e.matchPay !== 1) out.push(`Money matches you win pay x${e.matchPay}`);
  if (e?.matchStake && e.matchStake !== 1) out.push(`Opponents take stakes up to x${e.matchStake}`);
  if (e?.prize && e.prize !== 1) out.push(`Title prizes ${pct(e.prize)}`);
  if (e?.lesson && e.lesson !== 1) out.push(`A lesson adds x${e.lesson}`);
  if (c.banned) out.push('Banned in competition');
  return out;
}

/** a card's mods as the shot model reads them: each one with an id (`card:<id>`, `card:<id>:<n>` for a second) and the card's name, in the card's own order */
export function cardMods(c: CardDef): Mod[] {
  return (c.fx.mods ?? []).map((m, i) => ({ ...m, id: i ? `card:${c.id}:${i}` : `card:${c.id}`, name: c.name }));
}

/** a card's rarity as its record */
export const rarityOf = (c: { rarity: number }): (typeof RARITIES)[number] => RARITIES[Math.min(4, Math.max(0, c.rarity))]!;
