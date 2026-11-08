// "Your course" (T340 #967, T358 #1003): the picker that opens beside the Who-are-you card. Build your own stays first; the shipped real courses are Featured;
// the courses the player fetched are Downloaded courses (Refresh, Delete); and Find a real course is a search box: a name (Nominatim, on submit only), an
// openstreetmap.org link or way/123. A pick fetches the course with ONE Overpass query (kept in IndexedDB), then the card shows a preview with a quality
// grade (Full, Partial, Outline only), the counts and the size, and "Build this course" starts a new game on it. The steps and every network rule are in
// golf/osm/find.ts and polite.ts; this file is the card. The credit "© OpenStreetMap contributors" is on the card, as everywhere a real course shows.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Icon } from '../Icon';
import { fetchPreview, hintOfCandidate, hintOfHit, previewOfKept, realDeps, search, sizeLine, type FindDeps, type Hint, type Near, type Preview } from '../../game/golf/osm/find';
import { hitLine, type Hit } from '../../game/golf/osm/nominatim';
import type { Candidate } from '../../game/golf/osm/overpass';
import type { CourseRecord } from '../../game/golf/osm/library';
import type { Grade } from '../../game/golf/osm/grade';
import { paintPreview, previewOps } from '../../game/golf/osm/preview';
import { BUSY_MESSAGE, DOWN_MESSAGE, Cancelled, ServerBusy, ServerDown } from '../../game/golf/osm/polite';
import { refText, type OsmRef } from '../../game/golf/osm/query';
import { OSM_CREDIT, type OsmCourseSpec } from '../../game/golf/osm/types';
import { DemUnavailable, fetchLand, tilesKept, tilesOfCourse } from '../../game/golf/osm/dem';
import type { OsmLand } from '../../game/golf/osm/land';
import { DEM_CREDIT_DEFAULT } from '../../game/golf/osm/terrarium';

/** a shipped real course, as the card lists it */
export interface Featured { id: string; name: string; place: string; holes: number; par: number; mappedPar: number; scale?: number; /** the source of its real ground height ("SRTM, 30 m"), T357 */ ground?: string }

type View =
  | { v: 'home' }
  | { v: 'working'; text: string }
  | { v: 'hits'; q: string; hits: Hit[] }
  | { v: 'near'; q: string; near: Near; cands: Candidate[] }
  | { v: 'preview'; p: Preview; from: View };

const GRADE_STYLE: Record<Grade, string> = {
  full: 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200', partial: 'border-amber-300/50 bg-amber-300/15 text-amber-200', outline: 'border-slate-400/40 bg-slate-400/10 text-slate-300',
};
const GRADE_NAME: Record<Grade, string> = { full: 'Full', partial: 'Partial', outline: 'Outline only' };
const date = (iso: string) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

export function GradeChip({ grade, id }: { grade: Grade; id?: string }) {
  return <span className={`shrink-0 rounded-full border px-2 py-[1px] text-[11px] font-semibold ${GRADE_STYLE[grade]}`} data-testid={id ?? 'find-grade'} data-grade={grade}>{GRADE_NAME[grade]}</span>;
}

/** the preview picture of a course on a canvas (a w x h box in CSS pixels, drawn at the screen's pixel ratio) */
function PreviewCanvas({ p, w = 440, h = 280 }: { p: Preview; w?: number; h?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintPreview(ctx, previewOps(p.json, { w, h }, p.spec), { w, h });
  }, [p, w, h]);
  return <canvas ref={ref} style={{ width: w, height: h }} className="mx-auto block rounded-lg border border-white/10" data-testid="find-canvas" role="img" aria-label={`Top-down preview of ${p.record.name}`} />;
}

/** a previewed course's two ways in (T358, T356): "Build this course" starts a new game on it (this map is replaced); "Place it in my map" (given a way to place one: the
 *  owner, 2026-11-08, "place the imported course with the placing mode, and back out if they decide not to use it, rather than starting a new game straight away") takes
 *  it in hand over this game's map, as Course > Place a real course does: the outline follows the pointer, R turns it, the price shows, Esc puts it down and this card is back */
export function PreviewButtons({ can, holes, onBuild, onPlace }: { can: boolean; holes: number; onBuild: () => void; onPlace?: () => void }) {
  const why = holes === 0 ? 'Cannot be built' : 'Too big for the map';
  return (
    <div className="space-y-1.5" data-testid="find-actions">
      <button className="btn-gold w-full py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40" disabled={!can} onClick={onBuild} title="Start a new game on this course: this map is replaced" data-testid="find-build">{can ? 'Build this course' : why}</button>
      {onPlace && <button className="btn w-full py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40" disabled={!can} onClick={onPlace} title="Keep this map and place the course on it: move it over the map, turn it to fit, see the price; Esc puts it down and brings this card back" data-testid="find-place">Place it in my map</button>}
      {onPlace && can && <div className="text-[11px] leading-tight text-slate-500" data-testid="find-place-note">Build starts a new game on it. Place keeps this map: you move the course over it, R turns it, the price shows, and Esc puts it down and brings this card back.</div>}
    </div>
  );
}

export function CoursePicker({ featured, current, onOwn, onFeatured, onBuild, onPlace, onClose, deps: given }: {
  featured: Featured[]; current: string | null; onOwn: () => void; onFeatured: (id: string) => void; onBuild: (spec: OsmCourseSpec, land: OsmLand | null) => void;
  /** T356: take a previewed course in hand over this game's map (the card hides until it is placed or put down); absent: only Build this course */ onPlace?: (spec: OsmCourseSpec, land: OsmLand | null) => void;
  onClose: () => void;
  /** the parts the card runs on (default: the browser's network and the IndexedDB library) */ deps?: Promise<FindDeps>;
}) {
  const [deps, setDeps] = useState<FindDeps | null>(null);
  const [view, setView] = useState<View>({ v: 'home' });
  const [text, setText] = useState(''), [msg, setMsg] = useState(''), [kept, setKept] = useState<CourseRecord[]>([]), [armed, setArmed] = useState<string | null>(null);
  // T357: the real ground height of a downloaded course: ticked by default; the elevation tiles are fetched when the course is built (how many, and how many are kept already, is shown)
  const [withLand, setWithLand] = useState(true), [tiles, setTiles] = useState<{ n: number; kept: number } | null>(null);
  const shown = view.v === 'preview' ? view.p : null;
  useEffect(() => {
    setTiles(null);
    if (!shown || !deps) return;
    let on = true; const keys = tilesOfCourse(shown.spec, shown.json);
    void tilesKept(keys, deps.lib.answers()).then(kept => { if (on) setTiles({ n: keys.length, kept }); });
    return () => { on = false; };
  }, [shown, deps]);
  const ctl = useRef<AbortController | null>(null), alive = useRef(true);
  const listKept = (d: FindDeps) => { d.lib.list().then(l => { if (alive.current) setKept(l); }, () => undefined); };
  useEffect(() => {
    alive.current = true;
    (given ?? realDeps()).then(d => { if (!alive.current) return; setDeps(d); listKept(d); }, () => { if (alive.current) setMsg('This browser cannot keep downloaded courses.'); });
    return () => { alive.current = false; ctl.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** runs a step that talks to the map servers: the card shows its progress, a cancel stops it, and a failure says why in the card's words */
  const run = async (first: string, task: (signal: AbortSignal, step: (t: string) => void) => Promise<void>, back: View): Promise<void> => {
    if (!deps || view.v === 'working') return;
    const c = new AbortController(); ctl.current = c;
    setMsg(''); setView({ v: 'working', text: first });
    try { await task(c.signal, t => { if (alive.current) setView({ v: 'working', text: t }); }); }
    catch (e) {
      if (!alive.current) return;
      if (e instanceof Cancelled || c.signal.aborted) setView(back);
      else { setMsg(e instanceof ServerBusy ? BUSY_MESSAGE : e instanceof ServerDown ? DOWN_MESSAGE : `That did not work: ${(e as Error).message}`); setView(back); }
    } finally { ctl.current = null; }
  };
  const fetchAndShow = async (ref: OsmRef, hint: Hint, from: View, signal: AbortSignal, refresh = false, step?: (t: string) => void) => {
    const p = await fetchPreview(ref, hint, deps!, { refresh, signal, onStep: step });
    if (alive.current) { setView({ v: 'preview', p, from }); listKept(deps!); }
  };
  const submit = () => {
    const q = text.trim();
    if (!q) { setMsg('Type a golf course\'s name, or paste its openstreetmap.org link or way/123.'); return; }
    void run('Searching the map...', async (signal, step) => {
      const o = await search(q, deps!, signal, step);
      if (!alive.current) return;
      if (o.kind === 'hits') setView({ v: 'hits', q: o.query, hits: o.hits });
      else if (o.kind === 'near') setView({ v: 'near', q: o.query, near: o.near, cands: o.candidates });
      else if (o.kind === 'ref') { step(`Fetching ${refText(o.ref)} from the map servers (one request; a big course can take a minute)...`); await fetchAndShow(o.ref, {}, { v: 'home' }, signal, false, step); }
      else { setMsg(o.message); setView({ v: 'home' }); }
    }, { v: 'home' });
  };
  const pick = (ref: OsmRef, hint: Hint, list: View) =>
    void run(`Fetching ${hint.name ?? refText(ref)} from the map servers (one request; a big course can take a minute)...`, (signal, step) => fetchAndShow(ref, hint, list, signal, false, step), list);
  const openKept = (r: CourseRecord) => void run(`Reading ${r.name}...`, async () => {
    const p = await previewOfKept(r.id, deps!);
    if (!alive.current) return;
    if (p) setView({ v: 'preview', p, from: { v: 'home' } }); else { setMsg('That course is no longer kept.'); setView({ v: 'home' }); listKept(deps!); }
  }, { v: 'home' });
  const refresh = (r: CourseRecord) => { const [t, id] = r.id.split('/'); void run(`Fetching ${r.name} again (one request)...`, (signal, step) => fetchAndShow({ type: t as OsmRef['type'], id: Number(id) }, {}, { v: 'home' }, signal, true, step), { v: 'home' }); };
  const remove = async (r: CourseRecord) => {
    if (armed !== r.id) { setArmed(r.id); return; }
    setArmed(null); await deps?.lib.remove(r.id); if (deps) listKept(deps);
  };
  const back = (to: View) => { setMsg(''); setView(to); };
  /** Build this course, or Place it in my map (T356): with the ground height ticked, the elevation tiles are read first (kept ones from the library, the rest one request each),
   *  then the course goes on with its land; if they cannot be read the box is unticked and the card says why, so the next press makes the course flat (or the player ticks it and
   *  tries again) */
  const act = (how: 'build' | 'place', p: Preview, from: View) => {
    const go = (land: OsmLand | null) => { if (how === 'place') onPlace?.(p.spec, land); else onBuild(p.spec, land); };
    if (!withLand) { go(null); return; }
    const here: View = { v: 'preview', p, from };
    void run('Reading the ground height...', async (signal, step) => {
      let land: OsmLand | null = null;
      try { land = await fetchLand(p.spec, p.json, { net: deps!.net, cache: deps!.lib.answers() }, { signal, onStep: step, anyTurn: how === 'place' }); }
      catch (e) {
        if (!(e instanceof DemUnavailable) || !alive.current) throw e;
        setWithLand(false); setMsg(`The ground height could not be read: ${e.message}. The box is unticked: ${how === 'place' ? 'Place it in my map' : 'Build this course'} makes the course flat, or tick it and try again.`); setView(here);
        return;
      }
      if (alive.current) { setView(here); go(land); } // (the card shows the preview again before the course goes on: Place it keeps this card mounted behind the placing mode, and it must be as it was when the course is put down)
    }, here);
  };
  const working = view.v === 'working';

  const row = 'rounded-lg border px-2 py-1 text-left text-xs';
  const pickRow = (on: boolean) => `${row} ${on ? 'border-amber-300 bg-amber-300/15' : 'border-white/10 bg-white/5 hover:bg-white/10'}`;
  const hdr = (title: string, onBack?: () => void) => (
    <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
      <div className="flex items-center gap-2">
        {onBack && <button className="btn-icon" onClick={onBack} title="Back" aria-label="Back" data-testid="find-back">‹</button>}
        <div className="font-display text-lg font-bold leading-tight text-[var(--gold-hi)]">{title}</div>
      </div>
      <button className="btn-icon" onClick={onClose} title="Close" aria-label="Close" data-testid="find-close"><Icon name="close" size={18} /></button>
    </div>
  );

  let body: ReactElement;
  if (view.v === 'working') {
    body = (
      <div className="space-y-2 py-6 text-center" data-testid="find-working">
        <div className="text-sm text-slate-200" data-testid="find-progress">{view.text}</div>
        <button className="chip" onClick={() => ctl.current?.abort()} data-testid="find-cancel">Cancel</button>
      </div>
    );
  } else if (view.v === 'hits') {
    body = (
      <div className="space-y-2" data-testid="find-hits">
        {hdr('Golf courses found', () => back({ v: 'home' }))}
        <div className="text-xs text-slate-400">{view.hits.length} golf course{view.hits.length === 1 ? '' : 's'} for "{view.q}". Pick one to fetch its map data (one request).</div>
        <div className="flex flex-col gap-1">
          {view.hits.map(h => (
            <button key={h.id} className={pickRow(false)} onClick={() => pick(h.ref, hintOfHit(h), view)} data-testid={`find-hit-${h.id.replace('/', '-')}`}>
              <span className="font-semibold text-white">{h.name}</span> <span className="text-slate-400">· {hitLine(h) || h.id}</span>
            </button>
          ))}
        </div>
      </div>
    );
  } else if (view.v === 'near') {
    body = (
      <div className="space-y-2" data-testid="find-near">
        {hdr('Golf near that place', () => back({ v: 'home' }))}
        <div className="text-xs text-slate-400">No golf course is tagged "{view.q}" on the map. Golf features were found near {view.near.name}: pick the course or the area that holds it.</div>
        <div className="flex flex-col gap-1">
          {view.cands.map(c => (
            <button key={c.id} className={pickRow(false)} onClick={() => pick(c.ref, hintOfCandidate(c, view.near), view)} data-testid={`find-cand-${c.id.replace('/', '-')}`}>
              <span className="font-semibold text-white">{c.name}</span>{' '}
              <span className="text-slate-400">· {c.kind === 'course' ? 'a golf course' : c.what}{c.features ? `, ${c.features} golf features` : ''}{c.sizeM[0] ? `, ${km(c.sizeM[0])} x ${km(c.sizeM[1])}` : ''}</span>
            </button>
          ))}
        </div>
      </div>
    );
  } else if (view.v === 'preview') {
    const p = view.p, r = p.report, c = r.counts, can = r.holes > 0 && r.fits, from = view.from;
    body = (
      <div className="space-y-2" data-testid="find-preview">
        {hdr('Find a real course', () => back(from))}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-sky-200" data-testid="find-name">{p.record.name}</div>
            <div className="text-[11px] text-slate-400">{p.record.place || p.record.id}</div>
          </div>
          <GradeChip grade={r.grade} />
        </div>
        <PreviewCanvas p={p} />
        <div className="text-xs text-slate-200" data-testid="find-counts">{r.holes} hole{r.holes === 1 ? '' : 's'} · {c.greens} greens · {c.bunkers} bunkers · {c.pins} pins <span className="text-slate-400">· {c.tees} tees, {c.fairways} fairways, {c.water} water</span></div>
        <p className="text-xs text-slate-300" data-testid="find-summary">{r.summary}</p>
        <div className="text-xs text-slate-400" data-testid="find-size">{sizeLine(r)}{r.holes > 0 ? ` · par ${r.par}${r.mappedPar !== r.par ? ` (${r.mappedPar} on the map)` : ''} · ${km(r.lengthM)} of holes` : ''}</div>
        {r.madeUpLine && <div className="text-[11px] text-amber-200/80" data-testid="find-madeup">Made up where the map had none: {r.madeUpLine}.</div>}
        <label className="flex items-start gap-2 text-xs text-slate-200" data-testid="find-land-row">
          <input type="checkbox" className="mt-0.5" checked={withLand} onChange={e => setWithLand(e.target.checked)} disabled={!can || working} data-testid="find-land" />
          <span>Real ground height <span className="text-slate-400" data-testid="find-land-note">{tiles ? `(the land's slopes, from public elevation data: ${tiles.n} tile${tiles.n === 1 ? '' : 's'} from AWS Terrain Tiles${tiles.kept ? `, ${tiles.kept} kept in this browser already` : ''}; one request each, only when you build)` : "(the land's slopes, from public elevation data: a few tiles from AWS Terrain Tiles, one request each, only when you build)"}</span></span>
        </label>
        <PreviewButtons can={can} holes={r.holes} onBuild={() => act('build', p, from)} onPlace={onPlace ? () => act('place', p, from) : undefined} />
        <div className="text-[11px] text-slate-500" data-testid="find-credit">Map data {OSM_CREDIT} (ODbL), fetched {date(p.record.fetchedAt)}. Kept in this browser under Downloaded courses. Ground height: public elevation data via AWS Terrain Tiles (USGS and other national sources, credited in the menu).</div>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3" data-testid="find-home">
        {hdr('Your course')}
        <div className="flex flex-col gap-1">
          <button className={pickRow(current === null)} onClick={() => current !== null && onOwn()} data-testid="who-course-own">
            <span className="font-semibold text-white">Build your own</span> <span className="text-slate-400">· a driving range and an empty plot</span>
          </button>
        </div>
        <div>
          <div className="mb-1 text-xs text-slate-400">Featured <span className="text-slate-500">(a real course starts a new game on it)</span></div>
          <div className="flex flex-col gap-1" data-testid="who-course">
            {featured.map(o => (
              <button key={o.id} className={pickRow(current === o.id)} onClick={() => current !== o.id && onFeatured(o.id)} data-testid={`who-course-${o.id}`}>
                <span className="font-semibold text-white">{o.name}</span> <span className="text-slate-400">· {o.holes} holes, par {o.par}{o.mappedPar !== o.par ? ` (${o.mappedPar} on the map)` : ''}{o.scale ? ` · scaled to ${Math.round(o.scale * 100)}%` : ''} · {o.place}</span>
                {o.ground && <span className="block text-[11px] text-slate-400" data-testid={`who-ground-${o.id}`}>Real ground height ({o.ground})</span>}
              </button>
            ))}
          </div>
        </div>
        <div data-testid="find-downloaded">
          <div className="mb-1 text-xs text-slate-400">Downloaded courses{kept.length ? ` (${kept.length})` : ''} <span className="text-slate-500">(kept in this browser{deps && !deps.lib.persistent ? ', for this visit only' : ''})</span></div>
          {kept.length === 0 ? <div className="rounded-lg border border-dashed border-white/10 px-2 py-1.5 text-xs text-slate-500" data-testid="find-downloaded-empty">None yet: find a course below and it is kept here.</div> : (
            <div className="flex flex-col gap-1">
              {kept.map(r => (
                <div key={r.id} className={`${pickRow(current === r.id)} flex items-center gap-2`} data-testid={`dl-row-${r.id.replace('/', '-')}`}>
                  <button className="min-w-0 flex-1 text-left" onClick={() => openKept(r)} title="Open the preview" data-testid={`dl-open-${r.id.replace('/', '-')}`}>
                    <span className="font-semibold text-white">{r.name}</span>{' '}
                    <span className="text-slate-400">· {r.holes !== undefined ? `${r.holes} holes` : 'not read yet'}{r.place ? ` · ${r.place}` : ''} · fetched {date(r.fetchedAt)}</span>
                  </button>
                  {r.grade && <GradeChip grade={r.grade} id={`dl-grade-${r.id.replace('/', '-')}`} />}
                  <button className="chip shrink-0" onClick={() => refresh(r)} title="Fetch this course again from the map servers (one request)" data-testid={`dl-refresh-${r.id.replace('/', '-')}`}>Refresh</button>
                  <button className={`chip shrink-0 ${armed === r.id ? '!border-red-400 !text-red-300' : ''}`} onClick={() => void remove(r)} title="Delete the kept course" data-testid={`dl-delete-${r.id.replace('/', '-')}`}>{armed === r.id ? 'Sure?' : 'Delete'}</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="mb-1 text-xs text-slate-400">Find a real course <span className="text-slate-500">(from OpenStreetMap)</span></div>
          <div className="flex gap-1.5">
            <input className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white" value={text} maxLength={120} placeholder="A name, an openstreetmap.org link or way/123" autoFocus
              onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} disabled={working || !deps} data-testid="find-input" aria-label="Find a real course" />
            <button className="btn-gold px-3 text-sm disabled:opacity-40" onClick={submit} disabled={working || !deps} data-testid="find-go">Search</button>
          </div>
          {msg && <div className="mt-1 rounded-lg border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-xs text-amber-100" data-testid="find-msg" role="status">{msg}</div>}
          <div className="mt-1 text-[10px] leading-tight text-slate-500">One request to the public map servers per search, only when you press Search; what is found is kept so it is not asked twice.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="pointer-events-auto max-h-[calc(100vh-2rem)] w-[500px] max-w-full space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/90 p-5 text-slate-200 shadow-2xl backdrop-blur" data-testid="find-card">
      {body}
      <div className="border-t border-white/10 pt-1.5 text-[10px] leading-tight text-slate-500" data-testid="find-footer">Real courses are built from map data {OSM_CREDIT}. Their ground height is public elevation data: {DEM_CREDIT_DEFAULT}, via Tilezen's terrain tiles.</div>
    </div>
  );
}
