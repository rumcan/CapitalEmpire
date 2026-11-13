// J4 (#1207, docs/JAM.md): the money words, explained where they are used. <Term id="apr">APR</Term> underlines the word (dotted) and shows a
// one or two sentence plain explanation on hover, on a tap, and on keyboard focus (Tab reaches it; Enter or Space pins it, Escape closes it).
// The explanations are written for a player who has never borrowed money: no word in them needs its own explanation.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { JAM } from '../../game/features';

export type TermId = 'apr' | 'compound' | 'principal' | 'instalment' | 'murabaha' | 'markup' | 'credit' | 'overdraft' | 'networth' | 'asset'
  | 'liability' | 'premium' | 'deductible' | 'emergency' | 'payback' | 'profit' | 'cashflow' | 'estimate';

/** each term's name (what <Term> shows when it has no children) and its explanation */
export const GLOSSARY: Readonly<Record<TermId, { word: string; text: string }>> = {
  apr: { word: 'APR', text: 'Annual percentage rate: what borrowing costs in a year, as a share of what you owe. A $10,000 loan at 10% APR costs about $1,000 a year in interest.' },
  compound: { word: 'compound interest', text: 'Interest charged on the interest too: each month it is added to what you owe, so next month\'s interest is a little bigger. Savings grow the same way, in your favour.' },
  principal: { word: 'principal', text: 'The money you borrowed, before any interest. Each payment pays some interest and pays down some principal.' },
  instalment: { word: 'instalment', text: 'One of the equal payments you make each month until a loan or a purchase is paid off.' },
  murabaha: { word: 'murabaha', text: 'A sale at cost plus a markup agreed up front, paid in instalments; used in Islamic finance instead of interest. The price never grows, however long you take.' },
  markup: { word: 'markup', text: 'The amount added on top of what something cost, agreed before you sign. In a murabaha it is the bank\'s fixed profit.' },
  credit: { word: 'credit score', text: 'A number from 300 to 850 that says how reliably you repay. Paying on time raises it; a missed payment drops it, and lenders then charge you more.' },
  overdraft: { word: 'overdraft', text: 'Spending more than you have: your cash goes below zero and the bank charges high interest on the shortfall until you pay it back.' },
  networth: { word: 'net worth', text: 'Everything you own minus everything you owe. It is the truest score of how well your business is doing.' },
  asset: { word: 'asset', text: 'Something you own that has value: cash, savings, your holes and buildings.' },
  liability: { word: 'liability', text: 'Something you owe: a loan, a murabaha still being paid, an overdraft.' },
  premium: { word: 'insurance premium', text: 'What you pay each month to be insured, whether or not anything goes wrong.' },
  deductible: { word: 'deductible', text: 'The part of each claim you pay yourself before the insurance pays. A higher deductible usually means a cheaper premium.' },
  emergency: { word: 'emergency fund', text: 'Savings kept aside for surprises, such as a storm or a broken pump, so a bad month does not force you to borrow.' },
  payback: { word: 'payback', text: 'How long an investment takes to earn back what it cost, from the extra money it brings in each month after its upkeep.' },
  profit: { word: 'profit', text: 'What is left of the money coming in after every cost is paid. Takings are not profit until the costs are taken off.' },
  cashflow: { word: 'cash flow', text: 'The money coming in and going out each month. A profitable business can still run out of cash if big bills come before the income.' },
  estimate: { word: 'estimate', text: 'A best guess from how your golfers behave now. Weather, the town and your choices will move the real number.' },
};

/** one money word, explained on hover, tap or focus. children: the word as written (default: the glossary's own word). The explanation is drawn
 *  in a fixed box on the page's body (a card's scrolling would clip it), below the word or, near the bottom of the window, above it */
/** a word with its plain meaning on hover, focus or tap; in the jam MVP (T459) plain text, no underline (docs/JAM.md "Future development") */
export function Term({ id, children }: { id: TermId; children?: ReactNode }) {
  if (JAM) return <>{children ?? GLOSSARY[id]?.word}</>;
  return <TermTip id={id}>{children}</TermTip>;
}
function TermTip({ id, children }: { id: TermId; children?: ReactNode }) {
  const g = GLOSSARY[id], tipId = useId(), [hover, setHover] = useState(false), [focus, setFocus] = useState(false), [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null), box = useRef<HTMLDivElement>(null), open = !!g && (hover || focus || pinned);
  // a tap elsewhere unpins it
  useEffect(() => {
    if (!pinned) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setPinned(false); };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, [pinned]);
  // placed once its size is known, kept inside the window
  useLayoutEffect(() => {
    const b = box.current, el = ref.current; if (!open || !b || !el) return;
    const w = el.getBoundingClientRect(), r = b.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    const below = w.bottom + 6 + r.height <= H - 6, top = below ? w.bottom + 6 : w.top - 6 - r.height;
    b.style.left = `${Math.min(Math.max(6, w.left), W - 6 - r.width)}px`; b.style.top = `${Math.max(6, top)}px`; b.style.visibility = 'visible';
  }, [open]);
  if (!g) return <>{children}</>;
  const label = typeof children === 'string' ? children : g.word;
  return (
    <span ref={ref} className="inline" data-term={id}>
      <span role="button" tabIndex={0} aria-describedby={open ? tipId : undefined} aria-expanded={open} aria-label={`${label}: what it means`}
        className="cursor-help underline decoration-dotted decoration-1 underline-offset-2 focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-amber-300"
        onPointerEnter={e => { if (e.pointerType === 'mouse') setHover(true); }} onPointerLeave={() => setHover(false)} onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); setPinned(false); }}
        onClick={e => { e.stopPropagation(); e.preventDefault(); setPinned(p => !p); }}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.stopPropagation(); setPinned(false); setFocus(false); setHover(false); (e.currentTarget as HTMLElement).blur(); }
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setPinned(p => !p); }
        }}>
        {children ?? g.word}
      </span>
      {open && typeof document !== 'undefined' && createPortal(
        <div ref={box} id={tipId} role="tooltip" className="ui-tip" style={{ left: 0, top: 0, visibility: 'hidden', display: 'block' }} data-testid={`term-tip-${id}`}>
          <span className="block font-semibold text-amber-200">{g.word}</span>{g.text}
        </div>, document.body)}
    </span>
  );
}
