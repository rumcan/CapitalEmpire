// T242 (#702, plan P28 3): the set-the-scene card. A large picture card over the map: the place's name, its painted 1985 view for the state it
// is in now (game/scenes.ts picks it), its other views as tabs that wrap (the range's road, bays, shop, green and home; a business's Outside and
// Inside), the line written for the picture and the place's numbers. It sits left of the card on the right (the range's, the club's, a place's)
// and fits from 1366 px wide. The picture is fetched only when the card shows it: the URLs are plain strings until an <img> asks; nothing of it
// runs while the card is shut. Esc, the close button or a press on the map put it away.
import type { SceneCardView } from '../game/scenes';
import { Icon } from './Icon';

// Vite fills the glob in when it builds (each picture a hashed file next to the page); under plain node (the esbuild test bundle) there is none
const URLS: Record<string, string> = (() => { try { return import.meta.glob('../assets/scenes/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>; } catch { return {}; } })();
/** a scene picture's URL by its manifest file (undefined under node) */
export const sceneUrl = (file: string): string | undefined => URLS[`../assets/scenes/${file}`];

const STATE_WORD: Record<string, string> = { rundown: 'Run-down', upgraded: 'Upgraded', one: '' };
const stateWord = (s: string) => STATE_WORD[s] ?? (/^tier(\d)$/.test(s) ? `Tier ${s.slice(4)}` : s);

export function SceneCard({ view, onView, onClose, padRight = '1rem' }: { view: SceneCardView; onView: (id: string) => void; onClose: () => void; /** room kept on the right for the card there (a CSS length) */ padRight?: string }) {
  const v = view.views[view.at] ?? view.views[0]!, url = sceneUrl(v.pic.file), word = stateWord(v.state);
  const cols = Math.min(4, Math.max(1, v.tiles.length));
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4" style={{ paddingRight: padRight }}>
      <section className="pointer-events-auto max-h-full overflow-y-auto overflow-x-hidden rounded-2xl border border-white/10 bg-slate-950/95 p-3 text-slate-200 shadow-2xl backdrop-blur"
        style={{ width: 'min(760px, 100%, calc((var(--vh-ui, 100vh) - 19rem) * 1.79 + 1.5rem))' }}
        data-testid="scene-card" data-scene={v.slug} data-state={v.state} aria-label={`Set the scene: ${view.title}`}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-400/80">{view.kicker}</div>
            <div className="font-display text-lg font-bold leading-tight text-[var(--gold-hi)]" data-testid="scene-title">{view.title}{view.views.length > 1 ? <span className="font-normal text-slate-300"> · {v.label}</span> : null}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {word && <span className={`rounded-full border px-2 py-0.5 text-[11px] ${v.state === 'rundown' ? 'border-amber-500/30 text-amber-200/90' : 'border-emerald-500/30 text-emerald-300'}`} data-testid="scene-state">{word}</span>}
            <button className="btn-icon -mr-1" onClick={onClose} title="Close (Esc)" aria-label="Close"><Icon name="close" size={18} /></button>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-900" style={{ aspectRatio: `${v.pic.w} / ${v.pic.h}` }}>
          {url && <img key={v.pic.file} src={url} width={v.pic.w} height={v.pic.h} alt={`${view.title}: ${v.label}`} decoding="async" draggable={false} className="block h-full w-full select-none object-cover" data-testid="scene-picture" />}
        </div>
        {view.views.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Views">
            {view.views.map((w, i) => (
              <button key={w.id} role="tab" aria-selected={i === view.at} className={`chip ${i === view.at ? 'chip-on' : ''}`} onClick={() => onView(w.id)} data-testid={`scene-tab-${w.id}`}>{w.label}</button>
            ))}
          </div>
        )}
        {v.line && <p className="mt-2 font-display text-[15px] italic leading-snug text-amber-50/90" data-testid="scene-line">{v.line}</p>}
        {v.tiles.length > 0 && (
          <div className="mt-2 grid gap-1.5 text-center" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} data-testid="scene-numbers">
            {v.tiles.map(t => (
              <div key={t.label} className="min-w-0 rounded-lg border border-white/10 bg-white/5 p-1.5">
                <div className="truncate text-[12px] uppercase text-slate-400">{t.label}</div>
                <div className={`truncate text-sm font-bold ${t.tone === 'good' ? 'text-emerald-300' : t.tone === 'bad' ? 'text-rose-300' : 'text-white'}`}>{t.value}</div>
                {t.sub && <div className="truncate text-[12px] text-slate-400">{t.sub}</div>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
