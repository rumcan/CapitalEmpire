/** Observe actual viewport/scroll-container visibility once, before requesting a large source image. */
export function onceVisible(target: Element, reveal: () => void, Observer = globalThis.IntersectionObserver): () => void {
  let done = false, cancelled = false, observer: IntersectionObserver | null = null;
  const show = () => { if (done || cancelled) return; done = true; observer?.disconnect(); reveal(); };
  if (Observer) {
    observer = new Observer(entries => { if (entries.some(e => e.isIntersecting)) show(); }, { rootMargin: '0px', threshold: 0 });
    observer.observe(target);
    return () => { cancelled = true; observer?.disconnect(); };
  }
  // Older browsers: intersect with the viewport and each clipping ancestor, checking on captured scrolls.
  const check = () => {
    const r = target.getBoundingClientRect(); let left = Math.max(0, r.left), top = Math.max(0, r.top), right = Math.min(innerWidth, r.right), bottom = Math.min(innerHeight, r.bottom);
    for (let p = target.parentElement; p; p = p.parentElement) {
      const style = getComputedStyle(p), b = p.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, b.left); right = Math.min(right, b.right); }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom); }
    }
    if (right > left && bottom > top) show();
  };
  const scroll = () => { check(); if (done) { removeEventListener('scroll', scroll, true); removeEventListener('resize', scroll); } };
  addEventListener('scroll', scroll, true); addEventListener('resize', scroll); scroll();
  return () => { cancelled = true; removeEventListener('scroll', scroll, true); removeEventListener('resize', scroll); };
}
