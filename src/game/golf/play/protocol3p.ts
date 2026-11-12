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
export interface CourseMsg { v: 1; t: 'course'; course: Record<string, unknown>; features: FeaturesFile; biome: string; type: CourseType; seed: number }

/** what an actor is: a golfer, a caddie, a cart, or a gallery (a crowd standing at one spot, `count` people) */
export type ActorRole = 'golfer' | 'caddie' | 'cart' | 'gallery';
/** one actor on the course: its id (a golfer's is the golfer's id in the round; carts, caddies and galleries have their own), its role, where it is,
 *  the hole it is on (1-based; 0: none), what it is doing (a golfer: types.ts Action), its ball (a golfer; null: in hand or holed), its heading
 *  (degrees clockwise from east, absent: not known), and for a golfer his name, sex and look, whether he is the owner, the cart he rides (an actor id)
 *  and whether he has a caddie; for a gallery its size */
export interface Actor { id: number; role: ActorRole; at: ViewPt; hole: number; action?: Action; ball?: ViewPt | null; heading?: number;
  name?: string; sex?: 'm' | 'w'; look?: number; owner?: true; cart?: number; caddie?: true; count?: number }
/** who is on the course and where at game minute t: the full list each time (an actor missing from it has left) */
export interface ActorsMsg { v: 1; t: 'actors'; at: number; actors: Actor[] }

/** a club the owner may choose at his turn: the club, its full carry in metres and its scatter (the spread of where it lands, metres either side at
 *  full carry) after his skills, bag and mods for this lie, and the kit those numbers come from (mods.ts ClubKit) */
export interface ClubChoice { club: Club; carryM: number; scatterM: number; kit: ClubKit }
/** the owner's turn (live.ts OwnerTurn in the view's frame, with what the view shows around it): his golfer, the hole (index, number, par), the
 *  stroke, the minute he strikes, his lie (the play lie and the finer lies.ts kind), his ball, the pin, the distance to the pin (m), the wind now, the
 *  slope under his ball, the clubs he may choose and the model's suggested shot */
export interface TurnMsg { v: 1; t: 'turn'; golfer: number; holeIdx: number; hole: number; par: number; stroke: number; at: number;
  lie: Lie; lieKind: LieKind; ball: ViewPt; pin: ViewPt; distM: number; wind: WindNow; slope: Slope; clubs: ClubChoice[];
  suggested: { club: Club; aim: ViewPt; power: number } }

/** a decided shot, the owner's or anyone's: who, the hole (1-based) and stroke, the club, where it was struck from, the flight's samples (x, y and
 *  the height, evenly spaced in time from the strike to the landing; a putt has none), the bounces (each touch of the ground after the landing),
 *  the roll's path to rest, the rest and its lie, whether it was holed, a penalty stroke (water or out), and the game minute it was struck */
export interface ShotMsg { v: 1; t: 'shot'; golfer: number; hole: number; stroke: number; club: Club; from: ViewPt; flight: ViewPt3[];
  bounces: ViewPt[]; roll: ViewPt[]; rest: ViewPt; restLie: Lie; holed: boolean; penalty: 0 | 1; at: number }

/** the time and weather: the game minute of the day, the weather (weather.ts) and the wind now */
export interface ClockMsg { v: 1; t: 'clock'; minute: number; weather: WeatherCondition; wind: WindNow }

/** the host closes the view: why, in the owner's words (absent: none to show) */
export interface LeaveMsg { v: 1; t: 'leave'; why?: string }

export type HostMsg = CourseMsg | ActorsMsg | TurnMsg | ShotMsg | ClockMsg | LeaveMsg;

// ---------------------------------------------------------------- view to host

/** the view's page has started and waits for a course */
export interface ReadyMsg { v: 1; t: 'ready' }
/** the view has drawn the course it was sent (the course file's id) and can take turns */
export interface LoadedMsg { v: 1; t: 'loaded'; course: string }

/** the owner's input for a turn (live.ts OwnerInput) as the view sends it: the aim in the view's frame. The host fills in what the view does not
 *  decide: the conditions (env) and the model version (v), so those two never cross the bridge */
export type ViewInput = Omit<OwnerInput, 'aim' | 'env' | 'v'> & { aim: ViewPt };
export interface InputMsg { v: 1; t: 'input'; input: ViewInput }

/** where the owner's golfer (or his cart, cart: true) is now, for pace and so others can react to him */
export interface WalkedMsg { v: 1; t: 'walked'; golfer: number; at: ViewPt; cart?: true }
/** the owner took a gimme on this hole (index) and stroke: the putt is counted and the ball picked up */
export interface GimmeMsg { v: 1; t: 'gimme'; holeIdx: number; stroke: number }
/** the owner has seen the hole (index) out: the view is ready for the next */
export interface HoleDoneMsg { v: 1; t: 'holeDone'; holeIdx: number }
/** the owner left the view (Esc, the round over, or a page error): why */
export interface ExitMsg { v: 1; t: 'exit'; why: 'esc' | 'done' | 'error'; detail?: string }

export type ViewMsg = ReadyMsg | LoadedMsg | InputMsg | WalkedMsg | GimmeMsg | HoleDoneMsg | ExitMsg;

/** the message types each side sends */
export const HOST_TYPES: readonly HostMsg['t'][] = ['course', 'actors', 'turn', 'shot', 'clock', 'leave'];
export const VIEW_TYPES: readonly ViewMsg['t'][] = ['ready', 'loaded', 'input', 'walked', 'gimme', 'holeDone', 'exit'];

const isMsg = (m: unknown, types: readonly string[]): boolean =>
  typeof m === 'object' && m !== null && (m as { v?: unknown }).v === PROTOCOL_V && types.includes((m as { t?: unknown }).t as string);
/** m is a host-to-view message of this version (its version and type only: the fields are trusted, both sides being ours) */
export const isHostMsg = (m: unknown): m is HostMsg => isMsg(m, HOST_TYPES);
/** m is a view-to-host message of this version (its version and type only) */
export const isViewMsg = (m: unknown): m is ViewMsg => isMsg(m, VIEW_TYPES);
