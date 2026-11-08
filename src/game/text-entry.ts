// T359 (#1006): which focused element keeps Ctrl+Z for itself. Pure: no DOM, importable from node tests.

/** whether a focused element takes typed text and so keeps its own undo (Ctrl+Z inside it is the field's): a text, search, number or other
 *  typing box, a text area, an editable region. A slider, a tick box, a radio, a button, a colour well or a file picker does not: Ctrl+Z from
 *  one of those (the slider just dragged keeps the focus) is the game's, which undoes the last menu setting or edit */
export function isTextEntry(el: { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && !/^(checkbox|radio|range|button|color|file|image|reset|submit)$/i.test(el.type ?? '');
}
