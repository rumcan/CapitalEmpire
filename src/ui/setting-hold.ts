// T359 (#1006): a slider's drag is one undo step, put on the stack when the pointer lets go (the owner, 2026-11-08: "a slider drag is one step,
// recorded on release, not one per pixel"). The page tells the Paint tool when a slider is held (the pointer down on it, or a key held on it) and
// when it is let go (the pointer up anywhere, the window or the pointer lost); the tool joins the changes in between into one gesture
// (PaintTool.holdSetting). The Pan texture drag on the map is held by the tool itself.

/** whether a pointer or key target is a slider */
const isSlider = (t: EventTarget | null): boolean => !!t && (t as { tagName?: string }).tagName === 'INPUT' && (t as HTMLInputElement).type === 'range';

/** installs the page's listeners (capture phase: nothing can stop them); returns the function that takes them off */
export function installSettingHold(hold: (on: boolean) => void): () => void {
  const down = (e: PointerEvent) => { if (isSlider(e.target)) hold(true); };
  const up = () => hold(false);
  // a key on a focused slider (an arrow, page, home or end key; held, it repeats) is one gesture, until the key is let go
  const kd = (e: KeyboardEvent) => { if (isSlider(e.target) && /^(Arrow|Page|Home$|End$)/.test(e.key)) hold(true); };
  const ku = (e: KeyboardEvent) => { if (isSlider(e.target)) hold(false); };
  window.addEventListener('pointerdown', down, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
  window.addEventListener('keydown', kd, true); window.addEventListener('keyup', ku, true); window.addEventListener('blur', up);
  return () => {
    window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true);
    window.removeEventListener('keydown', kd, true); window.removeEventListener('keyup', ku, true); window.removeEventListener('blur', up);
  };
}
