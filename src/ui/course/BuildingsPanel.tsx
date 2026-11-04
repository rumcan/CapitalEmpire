import type { Game } from '../../game/engine';
import { BUSINESS, CLUBHOUSE_RANGE_COST } from '../../game/business/catalogue';
import { HALFWAY_COST, HALFWAY_TEE_REACH } from '../../game/golf/halfway';
import { HUT_COST, HUT_MAX, HUT_REACH, HUT_UPKEEP, OFFICE_CLUB_REACH, OFFICE_COST, OFFICE_UPKEEP } from '../../game/golf/pros';
import { LIBRARY } from '../../game/library';
import { Thumb } from '../Thumb';
import { ToolHead } from '../ToolHead';

/** the starting clubhouse's picture (the tin-and-tarp shack the game places: business/art.ts) */
const CLUB_ART = LIBRARY.find(it => it.id === 'golf:clubhouse-shanty');
/** the halfway house's picture (T187: the pavilion) */
const HALFWAY_ART = LIBRARY.find(it => it.id === 'business:golf-halfway-pavilion');
/** T214: the pro's office's and the teaching hut's stand-ins (business/art.ts) */
const OFFICE_ART = LIBRARY.find(it => it.id === 'business:golf-pro-shop'), HUT_ART = LIBRARY.find(it => it.id === 'expansion:lean-to-shed');

/** the Buildings panel (plan P23 4.8, P1-E; was the Course tool's Buildings tab): the houses of the course town. Phase 1 has the clubhouse,
 *  a card with its picture, price and "one only"; picking it arms its ghost (Buildings arms it on opening until it stands), placed as before:
 *  its front snaps to a drive within 12 m, R turns it, Esc puts it down */
export function BuildingsPanel({ game }: { game: Game }) {
  const built = game.bizDefs.some(d => d.type === 'clubhouse'), placing = game.clubPlacing, B = BUSINESS.clubhouse;
  return (
    <div className="tp" data-panel="buildings">
      <ToolHead icon="house" title="Buildings" desc="The houses of your course town, the clubhouse first" />
      <button className={`card gap-1 ${placing ? 'card-on' : ''}`} data-card="clubhouse" data-guide="clubhouse-card" aria-pressed={placing} disabled={built} onClick={() => game.placeClubhouse(!placing)} title={built ? 'Your clubhouse stands: there is one only' : placing ? 'Placing: click beside a drive (Esc puts it down)' : 'Pick to place it'}>
        <div className="flex w-full items-center gap-3">
          {CLUB_ART && <div className="grid h-16 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/30"><Thumb it={CLUB_ART} size={60} /></div>}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2"><span className="font-semibold">Clubhouse</span><span className="text-amber-200">{built ? '✓ Built' : `$${CLUBHOUSE_RANGE_COST.toLocaleString()}`}</span></div>
            <div className="sub-line">{`${B.footprint.w} × ${B.footprint.h} tiles · one only`}</div>
          </div>
        </div>
        <div className="sub-line leading-snug">The course's front door: green fees start, the tournament's crowd heads here, and the tour needs it before it invites you.</div>
      </button>
      <p className="mt-2 leading-snug">{built ? 'Your clubhouse stands: there is one only.' : placing ? 'Click beside a drive on your land (its front snaps to the drive); R turns it, Esc puts it down.' : 'Pick the clubhouse to place it.'}</p>
      {/* T187: the halfway house, placed like the clubhouse: on the course by a tee, its front on a cart path */}
      <HalfwayCard game={game} />
      {/* T214 (P26 3.1): the pro's office by the clubhouse, the teaching huts at the range's mats and the practice greens */}
      <ProBuildingCard game={game} kind="prooffice" />
      <ProBuildingCard game={game} kind="teachhut" />
      {!built && game.clubDriveOffer && (
        <div className="mt-2 rounded-lg border border-amber-400/40 bg-amber-400/10 p-2" data-testid="club-drive-offer">
          <div className="flex items-center gap-1.5 text-amber-200"><span aria-hidden className="font-bold">!</span>No drive within reach of the spot you tried</div>
          <button className="chip chip-on mt-1.5" onClick={() => game.drawDriveForClub()} data-testid="club-draw-drive">Draw a drive</button>
          <div className="sub-line mt-1 leading-snug">It starts at the nearest road. When it is built, the clubhouse comes back armed at that spot.</div>
        </div>
      )}
    </div>
  );
}

/** the halfway house's card (T187, golf/halfway.ts): its picture, price, one only; picking it arms its ghost; built, its takings so far */
function HalfwayCard({ game }: { game: Game }) {
  const built = game.bizDefs.some(d => d.type === 'halfway'), placing = game.halfwayPlacing, B = BUSINESS.halfway;
  return (
    <>
      <button className={`card mt-2 gap-1 ${placing ? 'card-on' : ''}`} data-card="halfway" aria-pressed={placing} disabled={built} onClick={() => game.placeHalfway(!placing)}
        title={built ? 'Your halfway house stands: there is one only' : placing ? 'Placing the halfway house (click to put it down)' : 'Place the halfway house'}>
        <div className="flex w-full items-center gap-3">
          {HALFWAY_ART && <div className="grid h-16 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/30"><Thumb it={HALFWAY_ART} size={60} /></div>}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2"><span className="font-semibold">Halfway house</span><span className="text-amber-200">{built ? '✓ Built' : `$${HALFWAY_COST.toLocaleString()}`}</span></div>
            <div className="sub-line">{`${B.footprint.w} × ${B.footprint.h} tiles · one only`}</div>
          </div>
        </div>
        <div className="sub-line leading-snug">{B.blurb} Half the clubhouse's golfers stop and spend $4.</div>
      </button>
      <p className="mt-1 leading-snug" data-testid="halfway-note">{built ? `Its takings this session: $${game.halfwayTaken.toLocaleString()}.` : placing ? `Click on your course by a tee (within ${HALFWAY_TEE_REACH * 2} m; between holes 9 and 10 is the classic spot), off the fairways and greens, its front on a cart path; R turns it, Esc puts it down.` : 'Pick the halfway house to place it.'}</p>
    </>
  );
}

/** T214 (P26 3.1, golf/pros.ts): the pro's office's or a teaching hut's card: its stand-in picture, price and upkeep, how many; picking it arms
 *  its ghost (the room check and its rules say why a spot is refused); built, the Staff card hires its people */
function ProBuildingCard({ game, kind }: { game: Game; kind: 'prooffice' | 'teachhut' }) {
  const office = kind === 'prooffice', n = game.bizDefs.filter(d => d.type === kind).length, max = office ? 1 : HUT_MAX, full = n >= max;
  const placing = game.proPlacing === kind, B = BUSINESS[kind], art = office ? OFFICE_ART : HUT_ART, cost = office ? OFFICE_COST : HUT_COST, upkeep = office ? OFFICE_UPKEEP : HUT_UPKEEP;
  const name = office ? "Pro's office" : 'Teaching hut';
  return (
    <>
      <button className={`card mt-2 gap-1 ${placing ? 'card-on' : ''}`} data-card={kind} aria-pressed={placing} disabled={full} onClick={() => game.placePro(placing ? null : kind)}
        title={full ? (office ? "Your pro's office stands: there is one only" : `You have ${max} teaching huts: the most`) : placing ? `Placing the ${name.toLowerCase()} (click to put it down; R turns it, Esc puts it down)` : `Place the ${name.toLowerCase()}`}>
        <div className="flex w-full items-center gap-3">
          {art && <div className="relative grid h-16 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/30"><Thumb it={art} size={60} /><span className="absolute bottom-0 left-0 right-0 bg-black/60 text-center text-[9px] leading-tight text-slate-200">Stand In</span></div>}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2"><span className="font-semibold">{name}</span><span className="text-amber-200">{full ? '✓ Built' : `$${cost.toLocaleString()}`}</span></div>
            <div className="sub-line">{`${B.footprint.w} × ${B.footprint.h} tiles · $${upkeep} a month · ${office ? 'one only' : `${n} of ${max}`}`}</div>
          </div>
        </div>
        <div className="sub-line leading-snug">{B.blurb}</div>
      </button>
      <p className="mt-1 leading-snug" data-testid={`${kind}-note`}>{placing
        ? (office ? `Click within ${OFFICE_CLUB_REACH * 2} m of the clubhouse, on your land, off the course; its front on a path, drive or road. R turns it, Esc puts it down.` : `Click within ${HUT_REACH * 2} m of the range's mats or a practice green, on your land, off the course. One hut a place.`)
        : n > 0 ? <>Its people are hired on the <button className="underline" onClick={() => game.openStaffCard(true)} data-testid={`${kind}-staff`}>Staff card</button>.</> : (office ? 'The head pro and the membership secretary work from here.' : 'Each hut takes one teaching pro.')}</p>
    </>
  );
}
