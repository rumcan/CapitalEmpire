// The messages between CapitalEmpire (the host) and the view from behind the golfer (Cinderlinks, in an iframe), version 1
// (docs/CINDERLINKS-PORT.md section 4, T413). Plain JSON, { v: 1, t: <type>, ... }, sent by postMessage. The host decides every result; the view
// only shows it and sends back what the player did. If the host does not answer, the view waits.
//
// THE FRAME: every position that crosses the bridge is in METRES in the view's frame: the origin is the course's centre, x grows east and y grows
// SOUTH (down on a north-up map), as Cinderlinks' course files and features are. Never tiles. The game's map is also x east, y south, in tiles of
// TILE_M metres, so toView and fromView only shift by the centre and scale; nothing is flipped. The centre (tiles) is the one the course exporter
// (export3p.ts, T412) computes; until it lands, the caller passes it in.
//
// Pure TS, no DOM: types and tiny helpers only.
import { TILE_M } from '../types';
import type { Action, Club, Lie, Pt } from './types';
import type { OwnerInput } from './live';
import type { LieKind, Slope } from './lies';
import type { WindNow } from './wind';
import type { ClubKit } from './mods';
import type { WeatherCondition } from '../weather';
import type { FeaturesFile } from './features3p';
import type { Earned } from './unlocks';
import type { Green3p } from './green3p';
import type { LieGrid } from './lies3p';

/** the protocol's version: every message carries it, and a message of another version is refused (isHostMsg / isViewMsg) */
export const PROTOCOL_V = 1;

/** a point in the view's frame: [x east, y south] in metres from the course's centre */
export type ViewPt = [number, number];
/** a point of a flight in the view's frame: [x east, y south, height above the ground] in metres */
export type ViewPt3 = [number, number, number];

/** the view's point (metres from the centre, y south) of the game's tile point pt; centre is the course's centre in tiles */
export function toView(pt: Pt, centre: Pt): ViewPt {
  return [(pt.x - centre.x) * TILE_M, (pt.y - centre.y) * TILE_M];
}
/** the game's tile point of the view's point v (metres from the centre, y south); centre is the course's centre in tiles */
export function fromView(v: readonly [number, number], centre: Pt): Pt {
  return { x: centre.x + v[0] / TILE_M, y: centre.y + v[1] / TILE_M };
}

// ---------------------------------------------------------------- host to view

/** how the course is kept, which picks Cinderlinks' course type (section 2: neglected plays as public, well kept as private, a tour week as tour) */
export type CourseType = 'public' | 'private' | 'tour';

/** the course: the course file (export3p.ts, T412: shapes in metres and the packed height grid; typed loosely until that exporter lands), the
 *  placed things (features3p.ts), the biome, the course type and the seed fine detail is grown from (from the course's name, so it looks the same on
 *  every visit) */
export interface CourseMsg { v: 1; t: 'course'; course: Record<string, unknown>; features: FeaturesFile; biome: string; type: CourseType; seed: number;
  /** the course's size (1: true size, what the host sends; the view's own saved courses play at 0.6) and the hole to open, from 1 (T416; absent: 1) */
  scale?: number; hole?: number;
  /** T437: the player's golfer in his player card's clothes (look3p.ts playerDress; absent: the view's own red polo) */
  golfer?: Dress;
  /** T449: the time the round is played at: 'night' for night golf (the view draws its darkest time until it draws night with the floodlights); T448:
   *  'day', 'golden' (Golden hour) or 'dusk'; absent: the view's own (Golden hour). Older views ignore it */
  time?: 'day' | 'golden' | 'dusk' | 'night' }

/** what an actor is: a golfer, a caddie, a cart, or a gallery (a crowd standing at one spot, `count` people) */
export type ActorRole = 'golfer' | 'caddie' | 'cart' | 'gallery';
/** one actor on the course: its id (a golfer's is the golfer's id in the round; carts, caddies and galleries have their own), its role, where it is,
 *  the hole it is on (1-based; 0: none), what it is doing (a golfer: types.ts Action), its ball (a golfer; null: in hand or holed), its heading
 *  (degrees clockwise from east, absent: not known), and for a golfer his name, sex and look, whether he is the owner, the cart he rides (an actor id)
 *  and whether he has a caddie; for a gallery its size */
export interface Actor { id: number; role: ActorRole; at: ViewPt; hole: number; action?: Action; ball?: ViewPt | null; heading?: number;
  name?: string; sex?: 'm' | 'w'; look?: number; owner?: true; cart?: number; caddie?: true; count?: number;
  /** T424 (actors3p.ts; optional so an older host's message still reads): what the view draws him doing (Doing), how far through it (0..1: an address from
   *  stepping up to the strike, a swing from the strike to the finish, a putt from stepping up to the end of the stroke; absent: 0), and how he looks (Dress) */
  doing?: Doing; phase?: number; dress?: Dress;
  /** T424: a cart's riders (golfer actor ids, the driver first) */
  riders?: number[];
  /** T429: a gallery's fans, each where the manager view draws him (crowdview.ts galleryPeople: an arc round a tee, a ring round a green, the seats of a stand):
   *  [x, y, the height he sits at (m; 0 standing)] in the view's frame, and the point they face (the pin, the tee, the stand's front); `count` is how many */
  fans?: ViewPt3[]; focus?: ViewPt; seated?: true;
  /** T426: he tends the flag (stands at the pin for another's long putt) */
  tend?: true;
  /** T433: a ghost round's golfer (ghost3p.ts): drawn see-through, never in the way */
  ghost?: true }
/** T424: what the view draws a person doing: walking, standing, addressing the ball, swinging, putting, riding in a cart (a golfer; the cart carries him) or
 *  watching another's shot (standing turned to it) */
export type Doing = 'walk' | 'stand' | 'address' | 'swing' | 'putt' | 'ride' | 'watch';
/** T424: how a person is drawn: the shirt, trousers, cap, skin and hair colours ('#rrggbb'), his build (a height factor, about 0.92..1.06) and sex */
export interface Dress { shirt: string; trousers: string; cap: string; skin: string; hair: string; build: number; sex: 'm' | 'w' }
/** who is on the course and where at game minute t: the full list each time (an actor missing from it has left) */
export interface ActorsMsg { v: 1; t: 'actors'; at: number; actors: Actor[];
  /** T425: a list of a played round (play3p.ts with company): the view keeps it by its minute and places people by the play's own minute, not as it arrives */
  play?: true }

/** a club the owner may choose at his turn: the club, its full carry in metres and its scatter (the spread of where it lands, metres either side at
 *  full carry) after his skills, bag and mods for this lie, and the kit those numbers come from (mods.ts ClubKit) */
export interface ClubChoice { club: Club; carryM: number; scatterM: number; kit: ClubKit;
  /** T418 (turn3p.ts; optional so an older host's message still reads): the full carry once the lie, the slope and the wind now are on it along the suggested line
   *  (conditions.ts previewShot; m), the distance scatter (two standard deviations, m, at the full carry), the chance of a mishit, the meter's sweet spot (half width,
   *  meter units: swing.ts sweetSpot) and the marker's speed (meter units a second), the loft (degrees) and the launch in words, the run after landing (a factor on
   *  the surface's share of the carry: shot.ts CLUB_RUN times his mods), the most backspin and the most top or side spin this lie lets on (0..1: spin.ts spinCap),
   *  and whether he may pick a shape (shape.ts) or a spin with this club */
  playsM?: number; longM?: number; mishitP?: number; sweet?: number; speed?: number; loftDeg?: number; launch?: string; run?: number;
  backspin?: number; topspin?: number; shapes?: boolean; spin?: boolean;
  /** T420: where the full shot lands off the aim's line along the suggested line (m, + right as he faces it: the wind's drift and the slope's pull;
   *  conditions.ts previewShot sideM) */
  sideM?: number;
  /** T419: the putter's fitting in words (the shaft and head fitted beyond the stock ones, bag.ts putterFitName); absent: none, or another club */
  fit?: string }
/** T418: what the owner may do beyond a plain swing (T443 turns these into earned unlocks): pick a shape (draw or fade, high or low), put spin on the ball, add spin
 *  in the air (the `airspin` mechanic), the Space power boost (the `boost` mechanic). Today only the two mechanics are earned (mods.ts hasMech); shapes and spin are
 *  open to every golfer */
export interface Unlocks { shapes: boolean; spin: boolean; airspin: boolean; boost: boolean }
/** the owner's turn (live.ts OwnerTurn in the view's frame, with what the view shows around it): his golfer, the hole (index, number, par), the
 *  stroke, the minute he strikes, his lie (the play lie and the finer lies.ts kind), his ball, the pin, the distance to the pin (m), the wind now, the
 *  slope under his ball, the clubs he may choose and the model's suggested shot */
export interface TurnMsg { v: 1; t: 'turn'; golfer: number; holeIdx: number; hole: number; par: number; stroke: number; at: number;
  lie: Lie; lieKind: LieKind; ball: ViewPt; pin: ViewPt; distM: number; wind: WindNow; slope: Slope; clubs: ClubChoice[];
  suggested: { club: Club; aim: ViewPt; power: number };
  /** T418: what he may do beyond a plain swing (absent: an older host: all of it) */
  can?: Unlocks;
  /** T422: the lie as the card names it and what it does (lies.ts LIE_FX), and the day's gust peak (mph; absent: none known) */
  lieName?: string; lieNote?: string; gust?: number;
  /** T443: what he has earned (unlocks.ts; absent: an older host, everything) and the boost charges left on this hole */
  earned?: Earned; charges?: number;
  /** T423: on the green, the green as the host reads it (green3p.ts: the slope grid, the read, a holed putt's way and its start line), and the gimme the round's rule
   *  allows (m; absent or 0: none, as in a match) */
  green?: Green3p; gimmeM?: number }

/** a decided shot, the owner's or anyone's: who, the hole (1-based) and stroke, the club, where it was struck from, the flight's samples (x, y and
 *  the height, evenly spaced in time from the strike to the landing; a putt has none), the bounces (each touch of the ground after the landing),
 *  the roll's path to rest, the rest and its lie, whether it was holed, a penalty stroke (water or out), and the game minute it was struck */
export interface ShotMsg { v: 1; t: 'shot'; golfer: number; hole: number; stroke: number; club: Club; from: ViewPt; flight: ViewPt3[];
  bounces: ViewPt[]; roll: ViewPt[]; rest: ViewPt; restLie: Lie; holed: boolean; penalty: 0 | 1; at: number;
  /** T418 (shot3p.ts; optional so an older host's message still reads): the seconds from the strike of each flight sample (rising; the last is the landing), the
   *  landing's lie, the surface of each bounce, the seconds from the strike and the height (m above the ground) of each roll point (the bounces' hops are in
   *  them), a spin back's check (the point the ball skids to before it comes back), and with a penalty the drop: where the next stroke is played from and its lie
   *  (rest is where the ball itself stopped: in the water, or out of bounds) */
  flightT?: number[]; landLie?: Lie; bounceLies?: Lie[]; rollT?: number[]; rollZ?: number[]; check?: ViewPt; drop?: ViewPt; dropLie?: Lie ;
  /** T433: a ghost round's stroke (ghost3p.ts): played back see-through, beside the play, never in its way */
  ghost?: true }

/** T427: the leaderboard at game minute `at` (board.ts boardRows: the leaders, then the owner's row when he is below them) and the owner's group's wait
 *  on the group ahead in words (board.ts waitText; null: none) */
export interface BoardMsg { v: 1; t: 'board'; at: number; rows: { pos: string; name: string; toPar: string; thru: string; owner: boolean;
  /** T436: his handicap as golfers write it ('12.4', '+1.0'; 'level' when everyone plays the same kit) and his net to par (absent: the field's board) */
  hcp?: string; net?: string }[]; wait: string | null;
  /** T436: the kit the round is played with ('own': each his own, scored net of handicaps; 'level': everyone the same, scored as played); absent: the field */
  mode?: 'own' | 'level' }

/** T441, T442: the model's shot for an input as the view would strike it, with no luck in it (the mean: no scatter, no mishit, no flier), so the view draws the
 *  curve, the landing and the bounce and roll of the shape and spin picked: `key` answers the view's `aim`; `shot` the stroke as a ShotMsg (its flight, roll
 *  and rest); `spread` the factor the shape puts on the scatter (the ring's size); null shot: none to show (a putt, no turn) */
export interface PreviewMsg { v: 1; t: 'preview'; key: number; shot: ShotMsg | null; spread: number }

/** T428: a money match (match.ts) as the view shows it: why it is sent (the match begins, a hole is decided, the match is over), the opponent's name and
 *  handicap, the stake ($), the holes of the match, each decided hole's result (1 you, 0 halved, -1 them), the score (match.ts MatchScore: "2 UP", "3 & 2"),
 *  and for a decided hole its number and both sides' strokes (null: picked up) */
export interface MatchMsg { v: 1; t: 'match'; why: 'start' | 'hole' | 'end'; name: string; hcp: number; stake: number; holes: number; res: (1 | 0 | -1)[];
  score: { text: string; short: string; up: number; played: number; left: number; over: boolean; result: 'w' | 'l' | 'h' | null };
  hole?: number; you?: number | null; opp?: number | null }

/** the time and weather: the game minute of the day, the weather (weather.ts) and the wind now */
export interface ClockMsg { v: 1; t: 'clock'; minute: number; weather: WeatherCondition; wind: WindNow }

/** T418: the owner's hole is over (holed, or picked up): the hole (index, number, par), his strokes on it, and whether this was his last turn of the
 *  session (last: no turn follows; else the next hole's turn comes after this message) */
export interface HoleEndMsg { v: 1; t: 'holeEnd'; holeIdx: number; hole: number; par: number; strokes: number; last: boolean }

/** the host closes the view: why, in the owner's words (absent: none to show) */
export interface LeaveMsg { v: 1; t: 'leave'; why?: string }
/** T438: the host's lies (lies3p.ts), sent after the course once they are read (the first picture does not wait for them); the view draws its grass by
 *  them from then on. The first turn comes after them */
export interface LiesMsg { v: 1; t: 'lies'; lk: LieGrid }

export type HostMsg = CourseMsg | ActorsMsg | BoardMsg | MatchMsg | TurnMsg | ShotMsg | HoleEndMsg | PreviewMsg | ClockMsg | LeaveMsg | LiesMsg;

// ---------------------------------------------------------------- view to host

/** the view's page has started and waits for a course */
export interface ReadyMsg { v: 1; t: 'ready' }
/** the view has drawn the course it was sent and can take turns: the course file's id, or (what the view sends today, T415) its number of holes */
export interface LoadedMsg { v: 1; t: 'loaded'; course?: string; holes?: number }
/** the view could not use what it was sent (a course without id, holes or shapes; one that could not be laid out): why, in plain words (T415) */
export interface ErrorMsg { v: 1; t: 'error'; why: string }

/** the owner's input for a turn (live.ts OwnerInput) as the view sends it: the aim in the view's frame. The host fills in what the view does not
 *  decide: the conditions (env) and the model version (v), so those two never cross the bridge */
export type ViewInput = Omit<OwnerInput, 'aim' | 'env' | 'v'> & { aim: ViewPt };
export interface InputMsg { v: 1; t: 'input'; input: ViewInput }
/** T441, T442: what the shot picked now would do (answered with a `preview` of the same key); the input as it would be struck at full power */
export interface AimMsg { v: 1; t: 'aim'; key: number; input: ViewInput }

/** where the owner's golfer (or his cart, cart: true) is now, for pace and so others can react to him */
export interface WalkedMsg { v: 1; t: 'walked'; golfer: number; at: ViewPt; cart?: true }
/** the owner took a gimme on this hole (index) and stroke: the putt is counted and the ball picked up */
export interface GimmeMsg { v: 1; t: 'gimme'; holeIdx: number; stroke: number }
/** the owner has seen the hole (index) out: the view is ready for the next */
export interface HoleDoneMsg { v: 1; t: 'holeDone'; holeIdx: number }
/** the owner left the view (Esc, the round over, or a page error): why */
export interface ExitMsg { v: 1; t: 'exit'; why?: 'esc' | 'done' | 'error'; detail?: string }

export type ViewMsg = ReadyMsg | LoadedMsg | ErrorMsg | InputMsg | AimMsg | WalkedMsg | GimmeMsg | HoleDoneMsg | ExitMsg;

/** the message types each side sends */
export const HOST_TYPES: readonly HostMsg['t'][] = ['course', 'actors', 'board', 'match', 'turn', 'shot', 'holeEnd', 'preview', 'clock', 'leave', 'lies'];
export const VIEW_TYPES: readonly ViewMsg['t'][] = ['ready', 'loaded', 'error', 'input', 'aim', 'walked', 'gimme', 'holeDone', 'exit'];

const isMsg = (m: unknown, types: readonly string[]): boolean =>
  typeof m === 'object' && m !== null && (m as { v?: unknown }).v === PROTOCOL_V && types.includes((m as { t?: unknown }).t as string);
/** m is a host-to-view message of this version (its version and type only: the fields are trusted, both sides being ours) */
export const isHostMsg = (m: unknown): m is HostMsg => isMsg(m, HOST_TYPES);
/** m is a view-to-host message of this version (its version and type only) */
export const isViewMsg = (m: unknown): m is ViewMsg => isMsg(m, VIEW_TYPES);
