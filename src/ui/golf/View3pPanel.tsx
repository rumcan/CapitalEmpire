// T416: the view from behind the golfer, full screen over the map (docs/CINDERLINKS-PORT.md). Shown while game.view3pHole is set (the hole card's
// "Play this hole"); it holds the Cinderlinks iframe and the bridge (golf/play/view3p.ts), which sends the hole's course once the view says it is
// ready. Escape (in the view or here) or ✕ closes it and the manager view comes back (engine close3p).
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../../game/engine';
import { View3p, type View3pFrame, type View3pHost } from '../../game/golf/play/view3p';
import type { HostMsg } from '../../game/golf/play/protocol3p';
import { Icon } from '../Icon';

export function View3pPanel({ game }: { game: Game }) {
  const hole = game.view3pHole, box = useRef<HTMLDivElement>(null), bridge = useRef<View3p | null>(null);
  const [state, setState] = useState<'loading' | 'loaded' | string>('loading');

  useEffect(() => {
    if (hole === null || !box.current) return;
    const el = box.current;
    const host: View3pHost = {
      addEventListener: (t: string, fn: (e: never) => void, capture?: boolean) => window.addEventListener(t, fn as unknown as EventListener, !!capture),
      removeEventListener: (t: string, fn: (e: never) => void, capture?: boolean) => window.removeEventListener(t, fn as unknown as EventListener, !!capture),
      mount(src: string): View3pFrame {
        const f = document.createElement('iframe');
        f.src = src; f.title = `Hole ${hole}: the view from behind the golfer`; f.className = 'h-full w-full border-0'; f.setAttribute('data-testid', 'view3p-frame');
        el.appendChild(f);
        f.addEventListener('load', () => f.focus()); // (the view's own keys, Escape among them, work at once)
        return f;
      },
      origin: location.origin,
    } as View3pHost;
    const v = new View3p(host, n => game.course3pMsg(n), import.meta.env.BASE_URL);
    bridge.current = v; setState('loading');
    // T418: once the course is on screen the owner's play starts (his first turn goes over); each input the view sends is played by the model and
    // answered with the strokes, the hole's end and the next turn
    const relay = (ms: readonly HostMsg[]) => { for (const msg of ms) v.send(msg); };
    v.onMessage(m => {
      try {
        if (m.t === 'loaded') { setState('loaded'); relay(game.start3p()); }
        else if (m.t === 'input') relay(game.input3p(m.input));
        else if (m.t === 'gimme') relay(game.gimme3p(m.holeIdx, m.stroke));
        else if (m.t === 'holeDone') relay(game.holeDone3p(m.holeIdx));
        else if (m.t === 'aim') { const p = game.preview3p(m.key, m.input); if (p) v.send(p); }
        else if (m.t === 'error') setState(m.why);
      } catch (err) { console.warn('[view3p] the play could not go on', err); }
    });
    const off = v.onClose(why => { if (why !== 'reopen') game.close3p(); });
    v.open(hole);
    // (unmounting only takes the bridge down: the game's own state is the caller's. React's strict mode runs this once on mount in development)
    return () => { off(); bridge.current = null; v.close('host'); };
  }, [game, hole]);

  if (hole === null) return null;
  return (
    <section className="pointer-events-auto fixed inset-0 z-50 bg-black" data-testid="view3p" aria-label={`Playing hole ${hole}`}>
      <div ref={box} className="h-full w-full" />
      {state !== 'loaded' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[14px] text-slate-300" data-testid="view3p-state">
          {state === 'loading' ? `Walking out to hole ${hole}…` : `The view could not open the course: ${state}`}
        </div>
      )}
      <button className="btn-icon absolute right-3 top-3 bg-slate-950/70" onClick={() => bridge.current?.close('host')} title="Back to the course (Esc)" aria-label="Back to the course">
        <Icon name="close" size={18} />
      </button>
    </section>
  );
}
