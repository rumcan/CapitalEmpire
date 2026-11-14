// J11 (#1270; the owner, 2026-11-14: "create voice overs for the tutorial", "make sure the tutorial voices dont sound like steven hawking"): the steps that have a
// voice-over, the key of each one's file, and the words the voice says. Pure TypeScript, shared by the game (voice.ts: a step opens, its file is found by key) and
// by scripts/jam/make-voice.mjs (which makes one audio file per step).
//   - The voice says exactly the text on the screen, the step's title and then its words, with the numbers and the symbols written out as words (spokenText), for
//     the voice only: the card keeps showing the text as it is.
//   - The key of a file is the step's id and a hash of the text that is shown, so a step whose words changed has no voice (until the files are made again) and a
//     step is never read the wrong words; the text is always on screen as the caption.
import { JAM_TOUR, TOWN_TOUR } from '../ext/progressive-ui/tour';
import { RANGE_GUIDE, type GuideStep } from '../ext/progressive-ui/guide';

export interface VoiceStep { id: string; title: string; body: string; /** where the step is shown: the jam's tutorial, the town game's tutorial, the range guide */ set: 'jam' | 'tour' | 'guide' }

/** every step that gets a voice-over, in the order the game shows them: the jam tutorial's 3, the town tutorial's 4 and the range guide's 3 (#1297: it had 9) */
export function voiceSteps(): VoiceStep[] {
  const of = (set: VoiceStep['set'], steps: readonly GuideStep[]): VoiceStep[] => steps.map(s => ({ id: s.id, title: s.title, body: s.body, set }));
  return [...of('jam', JAM_TOUR), ...of('tour', TOWN_TOUR.filter(s => !JAM_TOUR.some(j => j.id === s.id && j.body === s.body))), ...of('guide', RANGE_GUIDE)];
}

/** FNV-1a, 32 bits, as 8 hex digits */
export function hash8(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
/** the key of a step's voice file: its id and the hash of the text shown (the title, a line break, the words) */
export function voiceKey(id: string, title: string, body: string): string { return `${id}-${hash8(`${title}\n${body}`)}`; }

// ---------------------------------------------------------------- numbers and symbols as words (for the voice only)

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const BELOW_THOUSAND = (n: number): string => {
  const h = Math.floor(n / 100), r = n % 100, parts: string[] = [];
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) parts.push(r < 20 ? ONES[r]! : TENS[Math.floor(r / 10)]! + (r % 10 ? `-${ONES[r % 10]}` : ''));
  return parts.join(' ');
};
/** a whole number in English words ("seventy-five thousand"); numbers past the trillions are said digit by digit; a negative says "minus" */
export function numberToWords(n: number): string {
  if (!Number.isFinite(n) || !Number.isInteger(n)) return String(n);
  if (n < 0) return `minus ${numberToWords(-n)}`;
  if (n < 20) return ONES[n]!;
  if (n >= 1e15) return String(n).split('').map(d => ONES[+d]).join(' ');
  const out: string[] = [];
  for (const [size, name] of [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']] as const) { if (n >= size) { out.push(`${BELOW_THOUSAND(Math.floor(n / size))} ${name}`); n %= size; } }
  if (n) out.push(BELOW_THOUSAND(n));
  return out.join(' ');
}
/** a year as it is said ("nineteen eighty-five", "two thousand twenty-six") */
function yearToWords(y: number): string {
  if (y >= 2000 && y < 2010) return y === 2000 ? 'two thousand' : `two thousand ${ONES[y - 2000]}`;
  const a = Math.floor(y / 100), b = y % 100;
  return b === 0 ? `${numberToWords(a)} hundred` : `${numberToWords(a)} ${b < 10 ? `oh ${ONES[b]}` : numberToWords(b)}`;
}

/** a number as written: groups of thousands with commas (the comma that ends a phrase is not one of them) or plain digits, and an optional fraction */
const NUM = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;

/** the text as a voice should say it: amounts, percents and numbers in words, menu arrows and symbols as the words they stand for; letters and punctuation as they are */
export function spokenText(text: string): string {
  let s = text;
  // money first: $75,000 -> seventy-five thousand dollars; $1 -> one dollar
  s = s.replace(new RegExp(String.raw`\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?`, 'g'), (_m, whole: string, cents?: string) => {
    const n = Number(whole.replace(/,/g, '')), c = cents ? Number(cents.padEnd(2, '0')) : 0;
    return `${numberToWords(n)} dollar${n === 1 ? '' : 's'}${c ? ` and ${numberToWords(c)} cent${c === 1 ? '' : 's'}` : ''}`;
  });
  s = s.replace(new RegExp(`(${NUM})\\s?%`, 'g'), (_m, v: string) => `${spokenNumber(v)} percent`);
  s = s.replace(/\b(1[1-9]\d\d|20\d\d)\b(?![,.]\d)/g, (_m, y: string) => yearToWords(Number(y)));
  s = s.replace(/(\d+)\s?[-–]\s?(\d+)/g, (_m, a: string, b: string) => `${numberToWords(Number(a))} to ${numberToWords(Number(b))}`);
  s = s.replace(new RegExp(NUM, 'g'), v => spokenNumber(v));
  // symbols
  s = s.replace(/\s*[›▸»]\s*/g, ', then ').replace(/\s+>\s+/g, ', then ').replace(/&/g, ' and ').replace(/\+/g, ' plus ').replace(/=/g, ' equals ').replace(/×/g, ' times ')
    .replace(/\s*[—–]\s*/g, ', ').replace(/✓/g, ' done ').replace(/\s\/\s/g, ' or ').replace(/[▴▾↑↓→←•·]/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  return s.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/,\s*,/g, ',').trim();
}
function spokenNumber(v: string): string {
  const clean = v.replace(/,/g, ''), [whole, frac] = clean.split('.');
  const w = numberToWords(Number(whole));
  return frac ? `${w} point ${frac.split('').map(d => ONES[+d]).join(' ')}` : w;
}
/** what the voice says for a step: the title, then the words, each as a sentence */
export function spokenStep(title: string, body: string): string {
  const end = (t: string): string => (/[.!?…]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);
  return `${end(spokenText(title))} ${end(spokenText(body))}`;
}
