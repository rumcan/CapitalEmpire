// Lettering: the building art whose signs read as text. Art with lettering is never mirrored (docs/GAME-PLAN.md 2.2, the facing rule):
// a flipped sign reads backwards, so the composer and the business art never flip these sprites.
import { LIBRARY } from '../library';
import { EAST_PAIRS } from '../east-library';

/** shop words, matched as whole words (or a word with a plural / a compound) against the sprite id and its library name. 'garage' is not
 *  a word: the house garages say it too often (the commercial one, the golf cart garage, is in INCLUDE) */
const WORDS = ['shops?', 'stores?', 'grocer(?:y|ies)?', 'markets?', 'mart', 'diners?', 'cafes?', 'bars?', 'pubs?', 'taverns?', 'saloons?',
  'motels?', 'hotels?', 'inns?', 'banks?', 'gas', 'stations?', 'pharmac(?:y|ies)', 'drug(?:store)?s?', 'bakery', 'laundr(?:omat|y|ies)?',
  'salons?', 'barbers?(?:hop)?', 'cinemas?', 'theat(?:re|er)s?', 'arcades?', 'video(?:_rental)?', 'pizza', 'burgers?', 'restaurants?', 'delis?',
  'post[ _-]?office', 'hardware', 'books?(?:hop)?', 'toys?', 'liquor', 'bowling', 'signs?', 'billboards?', 'casinos?', 'sportsbar', 'taxis?',
  'buscompany', 'tackle'];
/** a word is a run of letters not preceded or followed by a letter ('_', '-', ':', ' ' and '.' separate words; 'barn' and 'workshop' do not match) */
const SHOP = new RegExp(`(?<![a-z])(?:${WORDS.join('|')})(?![a-z])`, 'i');
/** residential, yard and industrial sprites the words catch by accident (a washing line says laundry, a ride-on toy car, a station wagon,
 *  an auto body or machine 'shop' with no shop front), never lettering */
const EXCLUDE = new Set<string>([
  'expansion:washing-line', 'expansion:kiddie-car', 'variation:expansion-kiddie-car-32e1f227:1', 'variation:expansion-kiddie-car-32e1f227:2',
  'variation:expansion-kiddie-car-32e1f227:3', 'variation:expansion-kiddie-car-32e1f227:4', 'expansion:stationwagon-rear',
  'variation:industrial-auto-body-shop-63875699:1', 'variation:industrial-brick-machine-shop-34206b23:1',
]);
/** lettering the words miss: the commercial golf cart garage (its sign reads GARAGE, and 'garage' is not a word) */
const INCLUDE = new Set<string>(['business:golf-cart-garage']);
/** art with a sign painted on its walls, whatever its name says: the works buildings ("MAPLE FALLS BOTTLING CO", "BODY SHOP"...), the
 *  abandoned workshop and the town water tower (the owner, 2026-10-21, when they joined the lots) */
const PAINTED_SIGNS = /^(?:variation:industrial-|world:watertower$|expansion:abandoned-workshop$|variation:expansion-abandoned-workshop-)/;
/** the rear views (a shop's back, a store's rear, with their variations) carry no readable sign: they may be flipped. The id decides, not the name */
const REAR = /[-_]rear(?:[-_]v2)?(?=[-:]|$)/;

/** does a sprite carry readable signs (never mirrored): its id or library name holds a shop word, unless excluded or a rear view; INCLUDE always holds.
 *  The east-facing art (east:*) is lettering too: it is drawn unflipped only, through EAST_FACING */
export function hasLettering(id: string, name?: string): boolean {
  if (INCLUDE.has(id) || id.startsWith('east:') || PAINTED_SIGNS.test(id)) return true;
  if (EXCLUDE.has(id) || REAR.test(id)) return false;
  return SHOP.test(id) || (name !== undefined && SHOP.test(name));
}

/** the east-facing (+X) art of a front shop, by the front sprite's id (EAST_PAIRS, from east-library.ts, made by scripts/assets/prep-east.mjs):
 *  a flipped lot draws it unflipped (its signs read right, the art faces +X) in place of the front sprite. */
export const EAST_FACING: Record<string, string> = Object.fromEntries(EAST_PAIRS);

/** the library ids (over LIBRARY) that carry lettering: the test and the audit list */
export const LETTERING_IDS: ReadonlySet<string> = new Set(LIBRARY.filter(i => hasLettering(i.id, i.name)).map(i => i.id));
