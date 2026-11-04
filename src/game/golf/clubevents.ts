// T246 (#708, docs/plans/P28.md section 6): the club's own yearly events you play in: your Club Championship (the members, once your handicap
// qualifies) and the Mayor's Cup (the town's event at your club, you host and may play, the mayor presents). Both are played on an everyday town day:
// the day's tee sheet (T208) is the field and its round (playRound) their scores; you play your own walk-on round (T317, play/yours.ts) under the
// competition's rules (no mulligans, no gimmies) at the tournament's pressure. This module is the pure part: the dates, who may enter, the field, the
// board, the result, the prize and the titles you keep. Pure TS, no DOM.
import { START_YEAR } from '../event/round';
import { SEASON_START } from './calendar';
import { shortName, toParText, ordinal, type BoardRow } from './play/board';
import type { DayRoster } from './everyday';
import type { CourseView, RoundPlan, Standing } from './play/types';
import type { RoundMode } from './play/yours';

export type EventId = 'club' | 'mayor';
/** an event: its name, its calendar month (0 = Jan; held on the first town day of play that starts on or after the 1st), its field (the day's members,
 *  or everyone on the day's sheet), the highest handicap that may enter (null: open), the winner's prize (the club's reputation, $) and its title */
export interface ClubEventDef { id: EventId; name: string; month: number; field: 'members' | 'all'; maxHcp: number | null; win: { rep: number; money: number }; title: string }
/** the highest handicap that enters the Club Championship (you start at 18.5: a session or two at the range gets you in) */
export const CLUB_MAX_HCP = 18;
export const CLUB_EVENTS: Readonly<Record<EventId, ClubEventDef>> = {
  club: { id: 'club', name: 'Club Championship', month: 4, field: 'members', maxHcp: CLUB_MAX_HCP, win: { rep: 1, money: 500 }, title: 'Club Champion' },
  mayor: { id: 'mayor', name: "The Mayor's Cup", month: 9, field: 'all', maxHcp: null, win: { rep: 2, money: 1000 }, title: "Mayor's Cup" },
};
/** your round's mode in an event (play/yours.ts RoundMode, the flag shared with T244's money matches), and the event of a mode (null: not an event) */
export const MODE_OF: Readonly<Record<EventId, RoundMode>> = { club: 'championship', mayor: 'mayors-cup' };
export const eventOfMode = (m: RoundMode | undefined): EventId | null => m === 'championship' ? 'club' : m === 'mayors-cup' ? 'mayor' : null;
/** the season's order (the season starts in September): the Mayor's Cup (October) before the Club Championship (May) */
export const EVENT_IDS: readonly EventId[] = ['mayor', 'club'];
/** the card announces an event this many months before its date */
export const ANNOUNCE_MONTHS = 1;
/** the board's rows (the top, and yours below them) */
export const EVENT_BOARD_ROWS = 8;

/** an event's month in the golf season (0 = September .. 11 = August) */
export const seasonMonthOf = (id: EventId): number => (CLUB_EVENTS[id].month - SEASON_START + 12) % 12;
/** the calendar year an event falls in, in season `season` (0: the first season, Sep 1984 - Aug 1985) */
export const eventYear = (id: EventId, season: number): number => START_YEAR - 1 + Math.floor((SEASON_START + season * 12 + seasonMonthOf(id)) / 12);
/** "May 1985" */
export const eventWhen = (id: EventId, season: number): string => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][CLUB_EVENTS[id].month]} ${eventYear(id, season)}`;

/** one golfer of the day's field as the save keeps it: the name, the total strokes over the day's holes */
export interface FieldFinal { name: string; strokes: number }
/** the event's day: which, the season and town day, the day's course (par, holes) and the field's final scores (the day's round is played whole at the
 *  day's start, so they are known at once and shown as the clock passes them); done once its result is in */
export interface EventDay { id: EventId; season: number; day: number; par: number; holes: number; field: FieldFinal[]; done?: boolean }
/** an event's result: your place (null: you did not play it or did not finish), the field's size with you, your score, the champion(s) and their score,
 *  whether you won (alone or shared), and the prize paid */
export interface EventResult { id: EventId; season: number; year: number; pos: number | null; of: number; strokes: number | null; toPar: number | null;
  champion: string; champToPar: number; won: boolean; rep: number; money: number }
/** the save (GolfSave.clubEvents): the season each event was last held, entered and announced; the event day in play (or the last); the last result
 *  (its card) */
export interface ClubEventsSave { held: Partial<Record<EventId, number>>; entered: Partial<Record<EventId, number>>; announced: Partial<Record<EventId, number>>;
  today?: EventDay; last?: EventResult }
/** a title you won (PlayerProfile.titles) */
export interface Title { id: EventId; name: string; year: number; strokes: number; toPar: number; holes: number }

export const freshEvents = (): ClubEventsSave => ({ held: {}, entered: {}, announced: {} });

/** the event due on a town day of play that starts at month `at` of season `season` (0..12, fractional): the first in the season's order whose date has
 *  come and that was not held this season; null: none */
export function eventDue(s: ClubEventsSave, season: number, at: number): EventId | null {
  for (const id of EVENT_IDS) if (at >= seasonMonthOf(id) && s.held[id] !== season) return id;
  return null;
}
/** the event the card announces at month `at` (from ANNOUNCE_MONTHS before its date until it is held); null: none, or already announced this season */
export function announceDue(s: ClubEventsSave, season: number, at: number): EventId | null {
  for (const id of EVENT_IDS) if (at >= seasonMonthOf(id) - ANNOUNCE_MONTHS && s.held[id] !== season && s.announced[id] !== season) return id;
  return null;
}
/** why you may not enter (null: you may): the Club Championship takes a handicap of CLUB_MAX_HCP or less; the Mayor's Cup is open */
export function entryWhy(id: EventId, hcp: number): string | null {
  const max = CLUB_EVENTS[id].maxHcp;
  return max !== null && hcp > max + 1e-9 ? `The ${CLUB_EVENTS[id].name} takes a handicap of ${max.toFixed(1)} or less: yours is ${hcp.toFixed(1)}` : null;
}
/** you entered the event this season */
export const isEntered = (s: ClubEventsSave, id: EventId, season: number): boolean => s.entered[id] === season;
/** entered (the save passed in is not changed); refused (the same save) when the handicap does not qualify */
export function enter(s: ClubEventsSave, id: EventId, season: number, hcp: number): ClubEventsSave {
  return entryWhy(id, hcp) ? s : { ...s, entered: { ...s.entered, [id]: season } };
}

/** the field's golfer ids on the day's sheet: the member groups' (the Club Championship) or everyone's (the Mayor's Cup). The roster is the day book's
 *  own (a booked round of yours is not on it) */
export function fieldIds(roster: Pick<DayRoster, 'groups' | 'info'>, id: EventId): number[] {
  const out: number[] = [], all = CLUB_EVENTS[id].field === 'all';
  roster.groups.forEach((g, i) => { if (all || roster.info[i]?.member) out.push(...g.players); });
  return out;
}
/** the event's day from the day's round: the field's names and totals over the course's holes */
export function eventDay(id: EventId, season: number, day: number, plan: Pick<RoundPlan, 'golfers' | 'strokes'>, view: Pick<CourseView, 'holes'>, roster: Pick<DayRoster, 'groups' | 'info'>): EventDay {
  const field = fieldIds(roster, id).map(g => ({ name: plan.golfers.find(q => q.id === g)?.name ?? '', strokes: (plan.strokes[g] ?? []).reduce((a, b) => a + b, 0) }));
  return { id, season, day, par: view.holes.reduce((a, h) => a + h.par, 0), holes: view.holes.length, field };
}

/** a row to place on the board: its key, name (in full), to par, holes done, whether it is yours */
export interface BoardEntry { key: number; name: string; toPar: number; thru: number; you: boolean }
/** the board: the started rows by to par (then more holes done, then the name), shared places "T3", the first `limit` and yours below them; F once all
 *  `holes` are done. Your row's golfer key is -1 */
export function eventBoard(entries: readonly BoardEntry[], holes: number, limit = EVENT_BOARD_ROWS): BoardRow[] {
  const rows = entries.filter(e => e.thru > 0 || e.you).slice().sort((a, b) => a.toPar - b.toPar || b.thru - a.thru || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const pos: number[] = []; rows.forEach((r, i) => { pos.push(i > 0 && rows[i - 1]!.toPar === r.toPar ? pos[i - 1]! : i + 1); });
  const row = (i: number): BoardRow => {
    const r = rows[i]!, tied = pos.some((p, j) => j !== i && p === pos[i]);
    return { pos: tied ? `T${pos[i]}` : `${pos[i]}`, name: r.you ? r.name : shortName(r.name), toPar: r.thru > 0 ? toParText(r.toPar) : '–', thru: r.thru >= holes ? 'F' : `${r.thru}`, owner: r.you, golfer: r.you ? -1 : r.key };
  };
  const out: BoardRow[] = [];
  for (let i = 0; i < Math.min(limit, rows.length); i++) out.push(row(i));
  const y = rows.findIndex(r => r.you); if (y >= limit) out.push(row(y));
  return out;
}
/** the field's board entries at a minute of the day (standings of the day's round, round.ts) */
export function fieldEntries(st: readonly Standing[], plan: Pick<RoundPlan, 'golfers'>, ids: readonly number[]): BoardEntry[] {
  const set = new Set(ids), out: BoardEntry[] = [];
  for (const s of st) if (set.has(s.golfer)) out.push({ key: s.golfer, name: plan.golfers.find(g => g.id === s.golfer)?.name ?? '', toPar: s.toPar, thru: s.thru, you: false });
  return out;
}

/** the event's result: the field's finals and your score (null: you did not play, or did not finish every hole: no return). Your place is one more than
 *  the field's scores below yours (a tie shares it); the champion is the lowest score, shared when tied (with you too); you win at a shared first.
 *  The prize (the event's win) is paid to a winner only */
export function eventResult(d: EventDay, you: { name: string; strokes: number; thru: number } | null): EventResult {
  const def = CLUB_EVENTS[d.id], mine = you && you.thru >= d.holes ? you.strokes : null;
  const all = [...d.field.map(f => ({ name: f.name, strokes: f.strokes })), ...(mine !== null ? [{ name: you!.name, strokes: mine }] : [])];
  const best = all.length ? Math.min(...all.map(a => a.strokes)) : 0, champs = all.filter(a => a.strokes === best).map(a => a.name);
  const pos = mine !== null ? 1 + d.field.filter(f => f.strokes < mine).length : null, won = pos === 1;
  const champion = champs.length <= 1 ? champs[0] ?? '' : `${champs.slice(0, -1).join(', ')} and ${champs[champs.length - 1]}`;
  return { id: d.id, season: d.season, year: eventYear(d.id, d.season), pos, of: all.length, strokes: mine, toPar: mine !== null ? mine - d.par : null,
    champion, champToPar: all.length ? best - d.par : 0, won, rep: won ? def.win.rep : 0, money: won ? def.win.money : 0 };
}
/** the result as a line: "You finished 3rd of 14 at +4 · Carol Roberts wins at −1" */
export function resultLine(r: EventResult): string {
  const champ = r.champion ? `${r.champion} ${r.champion.includes(' and ') ? 'share it' : 'wins'} at ${toParText(r.champToPar)}` : 'No one finished';
  if (r.pos === null) return champ;
  if (r.won) return `You win the ${CLUB_EVENTS[r.id].name} at ${toParText(r.toPar!)}${r.champion.includes(' and ') ? ' (shared)' : ''}`;
  return `You finished ${ordinal(r.pos)} of ${r.of} at ${toParText(r.toPar!)} · ${champ}`;
}

/** a title won, into your titles (the profile's `titles`, oldest first; the profile passed in is not changed) */
export function withTitle<P extends { titles?: Title[] }>(p: P, r: EventResult, holes: number): P {
  if (!r.won || r.strokes === null) return p;
  const t: Title = { id: r.id, name: CLUB_EVENTS[r.id].name, year: r.year, strokes: r.strokes, toPar: r.toPar ?? 0, holes };
  return { ...p, titles: [...(p.titles ?? []), t].slice(-TITLES_MAX) };
}
export const TITLES_MAX = 40;
/** a title as the player card writes it: "Club Champion 1986 · 74 (+2)" */
export const titleText = (t: Title): string => `${CLUB_EVENTS[t.id].title} ${t.year} · ${t.strokes} (${t.toPar === 0 ? 'E' : t.toPar > 0 ? `+${t.toPar}` : `−${-t.toPar}`})${t.holes !== 18 ? ` over ${t.holes}` : ''}`;

const isId = (x: unknown): x is EventId => x === 'club' || x === 'mayor';
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** saved titles, well formed (bad ones dropped); undefined with none */
export function normalizeTitles(x: unknown): Title[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const out = x.filter(t => t && isId(t.id) && fin(t.year) && fin(t.strokes)).slice(-TITLES_MAX)
    .map(t => ({ id: t.id as EventId, name: CLUB_EVENTS[t.id as EventId].name, year: Math.round(t.year), strokes: Math.round(t.strokes), toPar: fin(t.toPar) ? Math.round(t.toPar) : 0, holes: fin(t.holes) ? Math.round(t.holes) : 18 }));
  return out.length ? out : undefined;
}
/** a saved events state, well formed; a fresh one when there is none (an older save) */
export function normalizeEvents(x: unknown): ClubEventsSave {
  const s = freshEvents(); if (!x || typeof x !== 'object') return s;
  const o = x as Partial<ClubEventsSave>;
  const rec = (r: unknown): Partial<Record<EventId, number>> => { const out: Partial<Record<EventId, number>> = {}; if (r && typeof r === 'object') for (const k of EVENT_IDS) { const v = (r as Record<string, unknown>)[k]; if (fin(v)) out[k] = Math.round(v); } return out; };
  s.held = rec(o.held); s.entered = rec(o.entered); s.announced = rec(o.announced);
  const d = o.today;
  if (d && isId(d.id) && fin(d.season) && fin(d.day) && fin(d.par) && fin(d.holes) && Array.isArray(d.field)) {
    s.today = { id: d.id, season: Math.round(d.season), day: Math.round(d.day), par: Math.round(d.par), holes: Math.round(d.holes),
      field: d.field.filter(f => f && typeof f.name === 'string' && fin(f.strokes)).map(f => ({ name: f.name.slice(0, 60), strokes: Math.round(f.strokes) })), ...(d.done ? { done: true } : {}) };
  }
  const l = o.last;
  if (l && isId(l.id) && fin(l.season) && fin(l.of)) {
    s.last = { id: l.id, season: Math.round(l.season), year: fin(l.year) ? l.year : eventYear(l.id, l.season), pos: fin(l.pos) ? l.pos : null, of: l.of, strokes: fin(l.strokes) ? l.strokes : null,
      toPar: fin(l.toPar) ? l.toPar : null, champion: typeof l.champion === 'string' ? l.champion.slice(0, 120) : '', champToPar: fin(l.champToPar) ? l.champToPar : 0, won: l.won === true, rep: fin(l.rep) ? l.rep : 0, money: fin(l.money) ? l.money : 0 };
  }
  return s;
}
