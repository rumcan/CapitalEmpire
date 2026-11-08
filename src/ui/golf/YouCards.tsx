// Your character's cards (T240, #704; docs/plans/P28.md section 1): the "Who are you?" card at a new game (your name, your look, your starting
// handicap), the talk card when you walk up to a person (T243 brings the portraits), the first tee's "Start a round" card (T317 builds the round you
// play yourself on it), and the cursors that say what a click does (walk / talk / look / use), as the point-and-click adventure games do.
import { useEffect, useState } from 'react';
import { LIBRARY } from '../../game/library';
import type { RoundState } from '../../game/golf/player';
import type { Verb } from '../../game/golf/you';
import { Icon } from '../Icon';
import { Thumb } from '../Thumb';
import { HoleChoiceBox } from './YourRound';
import { ChallengeBox, type MatchOffer } from './MatchCards';
import { CoursePicker, type Featured } from './CoursePicker';
import type { OsmCourseSpec } from '../../game/golf/osm/types';
import type { HoleChoice, RoundRules } from '../../game/golf/play/yours';
import { bookingLine } from '../../game/golf/startround';

const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

/** a 24 px cursor from an SVG drawing (its hot spot at hx, hy), with a fallback keyword */
const svgCursor = (body: string, hx: number, hy: number, or: string) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>${body}</svg>`)}") ${hx} ${hy}, ${or}`;
const RIM = "stroke='#0f172a' stroke-width='1.5' stroke-linejoin='round'";
/** the cursor of each verb: walk (two footprints), talk (a speech bubble), look (an eye), use (a pointing hand); none: you cannot go there */
export const VERB_CURSOR: Readonly<Record<Verb | 'none', string>> = {
  walk: svgCursor(`<ellipse cx='8' cy='14' rx='3.2' ry='5' fill='#facc15' ${RIM}/><ellipse cx='16' cy='9' rx='3.2' ry='5' fill='#facc15' ${RIM}/>`, 12, 20, 'pointer'),
  talk: svgCursor(`<path d='M3 4h18v11H11l-5 5v-5H3z' fill='#38bdf8' ${RIM}/><circle cx='8' cy='9.5' r='1.3' fill='#0f172a'/><circle cx='12' cy='9.5' r='1.3' fill='#0f172a'/><circle cx='16' cy='9.5' r='1.3' fill='#0f172a'/>`, 4, 4, 'pointer'),
  look: svgCursor(`<path d='M1.5 12C5 6 19 6 22.5 12C19 18 5 18 1.5 12z' fill='#f5f3ff' ${RIM}/><circle cx='12' cy='12' r='3.6' fill='#7c3aed' ${RIM}/>`, 12, 12, 'zoom-in'),
  use: svgCursor(`<path d='M9 2.5a1.8 1.8 0 0 1 3.6 0V10h1.2a1.6 1.6 0 0 1 3.2.4V11a1.6 1.6 0 0 1 3.2.6v4.8c0 3.6-2.6 6.1-6.2 6.1h-1.6c-2 0-3.4-.8-4.6-2.4L3.6 14.6a1.7 1.7 0 0 1 2.6-2.2L9 15z' fill='#4ade80' ${RIM}/>`, 10, 2, 'pointer'),
  none: 'not-allowed',
};

/** "Who are you?" (a new range game, before the welcome card): your name, your look and your starting handicap. Short: one card, one button */
/** T342 (#970): the two looks a new game can start in, each with its preview (a tree, a bush and a flower of its world) */
const THEMES: readonly { desert: boolean; name: string; note: string; ids: readonly string[] }[] = [
  { desert: false, name: 'Autumn', note: 'Maples, oaks and conifers on green grass', ids: ['ref:tree-maple-crimson', 'town:hydrangea'] },
  { desert: true, name: 'Desert', note: 'Palms, cacti and rocks on desert sand', ids: ['newprop:desert-date-palm-pair', 'newprop:desert-saguaro', 'newprop:desert-agave-clump'] },
];
const BY_ID = new Map(LIBRARY.map(it => [it.id, it] as const));
export function WhoCard({ name, look, looks, hcp, onDone, desert, onTheme, course, hidden }: { name: string; look: number; looks: { id: string; sex: 'm' | 'w'; item: number }[]; hcp: string; onDone: (name: string, look: number) => void;
  /** T356: a real course is in hand over the map (the picker's Place it in my map): the card is out of the way, kept mounted so the picker is as it was when the course is placed or put down */ hidden?: boolean;
  /** T342: the game's look (desert or autumn) and the choice (the world changes behind the card at once) */ desert?: boolean; onTheme?: (desert: boolean) => void;
  /** T340 (#967), T358 (#1003): "Your course": build your own, one of the featured real courses, one you downloaded, or one you found (a new game starts on it); current:
   *  the game's now (its id and the name it shows; null: your own) */
  course?: { featured: Featured[]; current: string | null; currentName: string | null; onOwn: () => void; onFeatured: (id: string) => void; onBuild: (spec: OsmCourseSpec) => void;
    /** T356: place a found course on this game's map instead of starting a new game on it */ onPlace?: (spec: OsmCourseSpec) => void } }) {
  const [n, setN] = useState(name), [l, setL] = useState(look), [pick, setPick] = useState(false);
  // (T356: a course placed on this map is the game's course now: the picker closes and the row names it)
  useEffect(() => { setPick(false); }, [course?.current]);
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-wrap items-center justify-center gap-3 overflow-y-auto p-4" style={hidden ? { display: 'none' } : undefined} data-hidden={hidden || undefined}>
      <div className="pointer-events-auto w-[460px] max-w-full space-y-3 rounded-2xl border border-white/10 bg-slate-950/90 p-5 text-slate-200 shadow-2xl backdrop-blur" data-testid="who-card">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">A new game · You</div>
        <div className="font-display text-xl font-bold leading-tight text-[var(--gold-hi)]">Who are you?</div>
        <label className="block text-xs text-slate-400">Your name
          <input className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white" value={n} maxLength={40} placeholder="Your name" autoFocus onChange={e => setN(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onDone(n, l); }} data-testid="who-name" />
        </label>
        <div>
          <div className="mb-1 text-xs text-slate-400">Your look <span className="text-slate-500">(stand-ins until the player looks are made)</span></div>
          <div className="grid grid-cols-5 gap-1.5" data-testid="who-looks">
            {looks.map((o, i) => (
              <button key={o.id} className={`flex h-[72px] items-end justify-center rounded-lg border ${i === l ? 'border-amber-300 bg-amber-300/15' : 'border-white/10 bg-white/5 hover:bg-white/10'}`} onClick={() => setL(i)} title={o.sex === 'w' ? 'A woman' : 'A man'} data-testid={`who-look-${i}`}>
                {LIBRARY[o.item] && <Thumb it={LIBRARY[o.item]!} size={64} />}
              </button>
            ))}
          </div>
        </div>
        {onTheme && (
          <div>
            <div className="mb-1 text-xs text-slate-400">Your world <span className="text-slate-500">(saved with this game; the gear menu changes it later)</span></div>
            <div className="grid grid-cols-2 gap-1.5" data-testid="who-theme">
              {THEMES.map(t => (
                <button key={t.name} className={`flex flex-col items-center rounded-lg border px-1 pb-1 pt-0.5 ${!!desert === t.desert ? 'border-amber-300 bg-amber-300/15' : 'border-white/10 bg-white/5 hover:bg-white/10'}`} onClick={() => onTheme(t.desert)} title={t.note} data-testid={`who-theme-${t.desert ? 'desert' : 'autumn'}`}>
                  <span className="flex h-[60px] items-end justify-center gap-0.5">{t.ids.map(id => BY_ID.get(id)).map((it, i) => it && <Thumb key={i} it={it} size={i ? 40 : 56} />)}</span>
                  <span className="text-sm font-semibold text-white">{t.name}</span>
                  <span className="text-[11px] leading-tight text-slate-400">{t.note}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {course && (
          <div>
            <div className="mb-1 text-xs text-slate-400">Your course <span className="text-slate-500">(build your own, or play a real one)</span></div>
            <button className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs hover:bg-white/10" onClick={() => setPick(o => !o)} aria-expanded={pick} data-testid="who-course-open">
              <span><span className="font-semibold text-white">{course.currentName ?? 'Build your own'}</span> <span className="text-slate-400">{course.currentName ? '(from map data)' : '· a driving range and an empty plot'}</span></span>
              <span className="shrink-0 text-amber-300">{pick ? 'Close' : 'Change or find a course ›'}</span>
            </button>
          </div>
        )}
        <div className="flex items-baseline justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1.5" title="Your skills as a mid-handicap amateur: practise at the range to lower it">
          <span className="text-xs uppercase text-slate-400">Starting handicap</span>
          <span className="text-lg font-bold text-white" data-testid="who-hcp">{hcp}</span>
        </div>
        <p className="text-xs text-slate-400">You stand beside the shack. With Walk (the walking figure on the left; Alt swaps it with Select) click the ground to walk, a person to talk, a building to look, the range to hit a bucket. WASD walk too; the arrows pan. C calls your golf cart, E gets in.</p>
        <button className="btn-gold w-full py-2 text-sm" onClick={() => onDone(n, l)} data-testid="who-go"><Icon name="people" size={18} />That's me</button>
      </div>
      {course && pick && <CoursePicker featured={course.featured} current={course.current} onOwn={course.onOwn} onFeatured={course.onFeatured} onBuild={course.onBuild} onPlace={course.onPlace} onClose={() => setPick(false)} />}
    </div>
  );
}

/** the talk card: you walked up to a person; their name, what they do and a line (T243 gives them portraits, jobs and skills) */
export function TalkCard({ talk, right, onClose, offer, onChallenge, lesson, onLesson }: { talk: { name: string; line: string; what: string; answer?: { yes: boolean; line: string } }; right: string; onClose: () => void;
  /** T244: the money match on their card (they golf), and the challenge */ offer?: MatchOffer | null; onChallenge?: (stake: number, holes: number) => void;
  /** T214: one of your pros: book a lesson (why: '' to book) */ lesson?: { why: string; bonus: number } | null; onLesson?: () => void }) {
  return (
    <div className={`pointer-events-auto absolute ${right} top-[var(--hud-top,6rem)] z-20 w-[300px] space-y-2 rounded-xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur`} data-testid="talk-card">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div>
          <div className="font-semibold text-sky-200">{talk.name}</div>
          <div className="text-[12px] text-slate-400">{talk.what} · Stand In card (portraits come with T243)</div>
        </div>
        <button className="btn-icon" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
      </div>
      <p className="rounded-lg bg-white/5 px-2 py-1.5 text-sm italic text-slate-200">"{talk.line}"</p>
      {offer && onChallenge && <ChallengeBox key={talk.name} o={offer} onChallenge={onChallenge} />}
      {lesson && onLesson && (
        <div className="space-y-1 rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-2 py-1.5 text-xs" data-testid="talk-lesson">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-300">A lesson: your next practice session today gains {Math.round(lesson.bonus * 100)}% more. Free: your own pro.</span>
            <button className="chip chip-on shrink-0 disabled:cursor-not-allowed disabled:opacity-40" disabled={!!lesson.why} onClick={onLesson} data-testid="talk-lesson-book">Book a lesson</button>
          </div>
          {lesson.why && <div className="text-[11px] text-slate-400" data-testid="talk-lesson-why">{lesson.why}</div>}
          {talk.answer && <p className="italic text-emerald-200">"{talk.answer.line}"</p>}
        </div>
      )}
    </div>
  );
}

/** the first tee: start a round. Play in today's tournament while you can join it, else your everyday round on the tee sheet */
export function TeeCard({ view, right, onJoin, onBook, onStart, onAuto, onTourney, onClose, play, onPlay, event, onEvent }: { view: { join: boolean; round: RoundState; name: string; start?: number | null }; right: string; onJoin: () => void; onBook: () => void;
  /** T350: Start round (the clock runs to your booked tee time, then you play it), Let the game play it, and Start round for the tournament you joined */ onStart?: () => void; onAuto?: () => void; onTourney?: () => void; onClose: () => void;
  /** T246: today's club event (the Club Championship, the Mayor's Cup) and its card */ event?: { id: 'club' | 'mayor'; name: string; why: string | null } | null; onEvent?: (id: 'club' | 'mayor') => void;
  /** T317: the holes you may play yourself now (play/yours.ts holeOptions) and the start */ play?: Parameters<typeof HoleChoiceBox>[0]['choices']; onPlay?: (c: HoleChoice, picked: number[], rules: RoundRules) => void }) {
  const r = view.round;
  return (
    <div className={`pointer-events-auto absolute ${right} top-[var(--hud-top,6rem)] z-20 w-[300px] space-y-2 rounded-xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur`} data-testid="tee-card">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div>
          <div className="font-semibold text-emerald-200">The first tee</div>
          <div className="text-[12px] text-slate-400">Start a round, {view.name}</div>
        </div>
        <button className="btn-icon" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
      </div>
      {view.join && <button className="chip chip-on w-full justify-center" onClick={onJoin} data-testid="tee-join">Play in today's tournament</button>}
      {view.start != null && onTourney && <button className="chip chip-on w-full justify-center" onClick={onTourney} data-testid="tee-tourney-start" title="The clock runs to your group's tee time, then you play at the pace of play">Start round: the tournament, tee time {clock(view.start)}</button>}
      {event && onEvent && <button className="chip chip-on w-full justify-center" onClick={() => onEvent(event.id)} title={event.why ?? ''} data-testid="tee-event">Today: the {event.name}{event.why ? ' (see why)' : ''}</button>}
      <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs">
        {r.k === 'none' && <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-slate-300">{r.why ?? (r.next !== null ? `Next free tee time ${clock(r.next)}` : 'No tee times left today')}</span>
          <button className="chip chip-on disabled:opacity-40" disabled={!!r.why || r.next === null} onClick={onBook} data-testid="tee-book">Book {r.next !== null && !r.why ? clock(r.next) : ''}</button></div>}
        {r.k === 'booked' && <div className="space-y-1.5" data-testid="tee-booked">
          <div className="text-slate-300" data-testid="tee-booked-line">{bookingLine(r, clock)}</div>
          {!r.auto && onStart && onAuto && <div className="flex flex-wrap gap-1.5">
            <button className="chip chip-on" onClick={onStart} data-testid="tee-start" title="The clock runs to your tee time, then you play your round yourself at the pace of play">Start round</button>
            <button className="chip" onClick={onAuto} data-testid="tee-auto" title="The game plays the round with your skills and tells you the score when it is done">Let the game play it</button></div>}
        </div>}
        {r.k === 'out' && <div className="text-sky-200">You are out on the course (teed off {clock(r.tee)})</div>}
        {r.k === 'done' && <div className="text-slate-300">You shot <span className="font-semibold text-white">{r.strokes}</span> today</div>}
      </div>
      {play && onPlay && <HoleChoiceBox choices={play} onStart={onPlay} />}
      <p className="text-[11px] text-slate-500" data-testid="tee-note">A booking holds a tee time. Start round runs the clock there and you swing every shot; the game plays it for you only if you say so.</p>
    </div>
  );
}

/** T350 (#993): your booked tee time has come and you are not on the course: play now, or let the game play it. Nothing is played for you unless you say so; the clock waits while this is open */
export function TeeAskCard({ tee, right, onPlay, onAuto, onClose }: { tee: number; right: string; onPlay: () => void; onAuto: () => void; onClose: () => void }) {
  return (
    <div className={`pointer-events-auto absolute ${right} top-[var(--hud-top,6rem)] z-30 w-[300px] space-y-2 rounded-xl border border-amber-300/30 bg-slate-950/92 p-3 text-slate-200 shadow-2xl backdrop-blur`} data-testid="tee-ask">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="font-semibold text-amber-200">Your tee time: {clock(tee)}</div>
        <button className="btn-icon" onClick={onClose} title="Decide later: the clock goes on and your booking stays"><Icon name="close" size={18} /></button>
      </div>
      <p className="text-xs text-slate-300">Your tee time has come. Play now, or let the game play it for you?</p>
      <div className="flex flex-wrap gap-1.5">
        <button className="chip chip-on" onClick={onPlay} data-testid="tee-ask-play" title="Start your round at the first tee: you swing every shot">Play now</button>
        <button className="chip" onClick={onAuto} data-testid="tee-ask-auto" title="The game plays the round with your skills and tells you the score when it is done">Let the game play it</button>
      </div>
    </div>
  );
}
