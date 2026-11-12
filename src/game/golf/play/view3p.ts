// The host side of the bridge to the view from behind the golfer (T416, docs/CINDERLINKS-PORT.md sections 2 and 4). It opens Cinderlinks in an
// iframe in host mode (/cinderlinks/index.html?host=1), waits for the view's `ready`, sends the hole's `course` once, and relays the messages both
// ways after that: only messages that pass the protocol3p.ts guards, and from the view only those whose source is that iframe's window (anything
// else is dropped). It closes on the view's `exit` (Escape inside the view) or on Escape in the host page, telling the view (`leave`) and whoever
// listens (onClose).
//
// No React and no direct DOM: the page is reached through View3pHost (a window to listen on and a way to mount the iframe), so the tests can hand it
// a fake window and a fake iframe. The React panel (src/ui/golf/View3pPanel.tsx) and the engine's course export (engine.course3pMsg) fill those in.
import { isHostMsg, isViewMsg, type CourseMsg, type HostMsg, type ViewMsg } from './protocol3p';

/** the view's page, from the site's root (npm run cinder:build writes it to public/cinderlinks/) */
export const VIEW_PATH = 'cinderlinks/index.html?host=1';

/** what the bridge needs of the iframe: its window (null until it loads, or once it is gone) and a way to take it out of the page */
export interface View3pFrame { readonly contentWindow: { postMessage(m: unknown, targetOrigin: string): void } | null; remove(): void }
/** a message event as the bridge reads it */
export interface View3pEvent { data: unknown; source: unknown; origin: string }
/** a key event as the bridge reads it (the host page's Escape) */
export interface View3pKey { key: string; preventDefault(): void; stopImmediatePropagation(): void }
/** what the bridge needs of the page: a window to hear messages and keys on, a way to put the view's iframe in the page, and the page's origin
 *  (the view is served from the same site; messages are sent to it and only accepted from it) */
export interface View3pHost {
  addEventListener(type: 'message', fn: (e: View3pEvent) => void): void;
  addEventListener(type: 'keydown', fn: (e: View3pKey) => void, capture: boolean): void;
  removeEventListener(type: 'message', fn: (e: View3pEvent) => void): void;
  removeEventListener(type: 'keydown', fn: (e: View3pKey) => void, capture: boolean): void;
  mount(src: string): View3pFrame;
  origin: string;
}
/** why the view closed: its own Escape (`exit`), Escape in the host page, the host closing it, or a newer open */
export type View3pCloseWhy = 'exit' | 'esc' | 'host' | 'reopen';

/** the bridge: open(hole), close(), send(msg), onMessage(fn), onClose(fn). One view at a time; opening again closes the last */
export class View3p {
  private frame: View3pFrame | null = null;
  private hole = 0;
  /** the course was asked for (after `ready`): it is sent once per open */
  private courseAsked = false;
  /** bumped at each open and close: a course still being built for an older open is dropped */
  private gen = 0;
  private listeners = new Set<(m: ViewMsg) => void>();
  private closers = new Set<(why: View3pCloseWhy) => void>();

  /** host: the page; course: the course message for a hole (the engine's export; null: none to send, the view is closed). base: the site's base path */
  constructor(private readonly host: View3pHost, private readonly course: (hole: number) => Promise<CourseMsg | null>, private readonly base = '/') {}

  /** whether a view is open */
  get isOpen(): boolean { return this.frame !== null; }
  /** the hole the open view was opened on (0: none open) */
  get openHole(): number { return this.frame ? this.hole : 0; }

  /** opens the view on hole n (from 1): mounts the iframe and waits for its `ready` */
  open(hole: number): void {
    if (this.frame) this.close('reopen');
    this.gen++; this.hole = hole; this.courseAsked = false;
    this.frame = this.host.mount(this.base.replace(/\/?$/, '/') + VIEW_PATH);
    this.host.addEventListener('message', this.onWindowMessage);
    this.host.addEventListener('keydown', this.onKey, true);
  }

  /** closes the view: tells it to stop (`leave`), takes the iframe out, stops listening, and tells onClose. Nothing when none is open */
  close(why: View3pCloseWhy = 'host'): void {
    const f = this.frame; if (!f) return;
    this.send({ v: 1, t: 'leave' });
    this.frame = null; this.gen++;
    this.host.removeEventListener('message', this.onWindowMessage);
    this.host.removeEventListener('keydown', this.onKey, true);
    f.remove();
    for (const fn of [...this.closers]) fn(why);
  }

  /** sends a message to the view; one that fails the guard, or with no view open (or not loaded yet), is dropped. True when sent */
  send(msg: HostMsg): boolean {
    const w = this.frame?.contentWindow;
    if (!w || !isHostMsg(msg)) return false;
    w.postMessage(msg, this.host.origin);
    return true;
  }

  /** hears every message from the view that passes the guards (after the bridge has acted on it); returns the way to stop hearing */
  onMessage(fn: (m: ViewMsg) => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  /** hears the view closing, and why; returns the way to stop hearing */
  onClose(fn: (why: View3pCloseWhy) => void): () => void { this.closers.add(fn); return () => { this.closers.delete(fn); }; }

  private onWindowMessage = (e: View3pEvent): void => {
    const f = this.frame;
    if (!f || !f.contentWindow || e.source !== f.contentWindow) return; // only the view's own window
    if (e.origin !== this.host.origin) return;                          // and only from this site
    const m = e.data; if (!isViewMsg(m)) return;
    if (m.t === 'ready' && !this.courseAsked) { this.courseAsked = true; void this.sendCourse(this.gen); }
    for (const fn of [...this.listeners]) fn(m);
    if (m.t === 'exit') this.close('exit');
  };

  /** the host page's Escape closes the view (before the manager game's own Escape sees it) */
  private onKey = (e: View3pKey): void => {
    if (e.key !== 'Escape' || !this.frame) return;
    e.preventDefault(); e.stopImmediatePropagation();
    this.close('esc');
  };

  private async sendCourse(gen: number): Promise<void> {
    let msg: CourseMsg | null = null;
    try { msg = await this.course(this.hole); } catch (err) { console.warn('[view3p] the course could not be exported', err); }
    if (gen !== this.gen) return; // closed or opened again meanwhile
    if (!msg) { this.close('host'); return; }
    this.send(msg);
  }
}

/** a whole-number seed from the course's name (FNV-1a), so its fine detail grows the same on every visit */
export function seedOf(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h | 0;
}
