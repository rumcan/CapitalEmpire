// J11 (#1270): the UI's sounds, from one hook and not a call in every component. One delegated listener on the page hears every click on a button, a tab, a
// tick box, a menu row or a link and plays the sound that fits what was pressed (pickUiSound, pure: the tests give it plain facts); a slider plays a tick
// when it is let go. A control that wants another sound, or none, says so with data-sound ("none", or the sound's name: click, tick, on, off, open, close);
// a region opts out the same way (its controls inherit). The explicit sounds (cash for a purchase, the low "can't" for a refusal, the chimes) are played by
// the code that knows (sfx.ts) and win over the plain click that went with them: the click waits one turn of the event loop and gives way to anything that
// sounded meanwhile (SoundCore.lastPlayedAt).
import { sound as theSound, type SoundCore } from './core';
import { playSfx, type SfxName } from './sfx';

export type UiSoundId = Extract<SfxName, 'click' | 'tick' | 'on' | 'off' | 'open' | 'close'>;
const UI_IDS: readonly string[] = ['click', 'tick', 'on', 'off', 'open', 'close'];

/** what the hook needs to know about the control that was pressed (read from the element by factsOf, or made up in a test) */
export interface UiFacts {
  /** the lower-case tag name, the input's type, the ARIA role */
  tag: string; type: string; role: string;
  /** data-sound of the control or of the nearest region that has one ('' when none) */
  sound: string;
  /** what the control says: aria-label, else title, else its text (short) and its test id */
  label: string; testid: string;
  /** a tick box's or radio's state AFTER the click; aria-expanded and aria-pressed (null: the control has none); a summary's <details> open BEFORE the click */
  checked: boolean; expanded: boolean | null; pressed: boolean | null; open: boolean;
  disabled: boolean;
}
const CLOSE_WORDS = /^(close|dismiss|cancel|back to|hide|skip tutorial|skip guide)\b|^[✕×✖xX]$/i;
const CLOSE_ID = /(^|[-_:])(close|dismiss|x)$/;

/** the sound a press on a control with these facts makes: null for none */
export function pickUiSound(f: UiFacts): UiSoundId | null {
  if (f.disabled) return null;
  const s = f.sound.trim().toLowerCase();
  if (s === 'none') return null;
  if (UI_IDS.includes(s)) return s as UiSoundId;
  if (f.tag === 'input') return f.type === 'checkbox' || f.type === 'radio' ? (f.checked ? 'on' : 'off') : null; // (a slider plays when it is let go; text and files are not buttons)
  if (f.tag === 'select' || f.tag === 'textarea') return null;
  if (f.tag === 'summary') return f.open ? 'close' : 'open';
  if (f.expanded !== null) return f.expanded ? 'close' : 'open';
  if (CLOSE_WORDS.test(f.label.trim()) || CLOSE_ID.test(f.testid)) return 'close';
  if (f.role === 'tab' || f.pressed !== null) return 'tick';
  return 'click';
}

/** the controls a click is about: the nearest of these above the target (a button's icon or text is the target; the button is what counts) */
const CONTROL = 'button, a[href], summary, input, select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"], .chip, .btn, .btn-icon';

/** the facts of the control a click landed on (null: it landed on no control: the map, the page's background, plain text) */
export function factsOf(target: EventTarget | null): UiFacts | null {
  const el = target as Element | null;
  if (!el || typeof el.closest !== 'function') return null;
  const c = el.closest(CONTROL) as (HTMLElement & { checked?: boolean; disabled?: boolean; type?: string }) | null;
  if (!c) return null;
  const tag = c.tagName.toLowerCase(), attr = (n: string): string | null => c.getAttribute(n);
  const tri = (n: string): boolean | null => { const v = attr(n); return v === 'true' ? true : v === 'false' ? false : null; };
  const region = c.closest('[data-sound]');
  const text = (attr('aria-label') || attr('title') || (c.textContent ?? '')).replace(/\s+/g, ' ').trim().slice(0, 40);
  return {
    tag, type: tag === 'input' ? String(c.type ?? '').toLowerCase() : '', role: attr('role') ?? '', sound: region?.getAttribute('data-sound') ?? '',
    label: text, testid: attr('data-testid') ?? '', checked: !!c.checked, expanded: tri('aria-expanded'), pressed: tri('aria-pressed'),
    open: tag === 'summary' ? !!(c.parentElement as HTMLDetailsElement | null)?.open : false,
    disabled: !!c.disabled || attr('aria-disabled') === 'true',
  };
}

/** the page's listeners: returns the way to take them away. doc: the document (null: no page, nothing to hook) */
export function installUiSounds(doc: Pick<Document, 'addEventListener' | 'removeEventListener'> | null = typeof document === 'undefined' ? null : document, core: SoundCore = theSound, play: (id: SfxName) => boolean = playSfx, later: (fn: () => void) => void = fn => { setTimeout(fn, 0); }): () => void {
  if (!doc) return () => { /* no page */ };
  const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  // capture phase: before the page's own handlers run, so aria-expanded and <details> still show their state from before the click
  const onClick = (e: Event): void => {
    const id = pickUiSound(factsOf(e.target) ?? NONE);
    if (!id) return;
    const t0 = now();
    later(() => { if (core.lastPlayedAt >= t0) return; play(id); }); // (a purchase, a refusal or a chime made meanwhile has answered the click already)
  };
  const onChange = (e: Event): void => {
    const el = e.target as HTMLInputElement | null;
    if (el && el.tagName === 'INPUT' && el.type === 'range' && !el.closest('[data-sound="none"]')) play('tick');
  };
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('change', onChange, true);
  return () => { doc.removeEventListener('click', onClick, true); doc.removeEventListener('change', onChange, true); };
}
/** facts of "no control": makes pickUiSound answer null */
const NONE: UiFacts = { tag: '', type: '', role: '', sound: 'none', label: '', testid: '', checked: false, expanded: null, pressed: null, open: false, disabled: true };

/** the Mute key (F8): everything off, or back on; a window listener in the capture phase. Returns the way to take it away */
export const MUTE_KEY = 'F8';
export function installMuteKey(win: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = typeof window === 'undefined' ? null : window, core: SoundCore = theSound): () => void {
  if (!win) return () => { /* no page */ };
  const h = (e: Event): void => {
    const k = e as KeyboardEvent;
    if (k.key !== MUTE_KEY || k.ctrlKey || k.metaKey || k.altKey || k.shiftKey || k.repeat) return;
    k.preventDefault();
    const muted = core.toggleMute();
    if (!muted) playSfx('tick'); // (back on: a tick says so)
  };
  win.addEventListener('keydown', h, true);
  return () => win.removeEventListener('keydown', h, true);
}
