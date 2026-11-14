// J7e (#1258; the owner, 2026-11-14: "no vector distance signs. only png sprites allowed. please make sure they replace those with images from chat gpt images"):
// the range's yardage signs are ChatGPT pictures with their distance painted on, one sprite a distance, drawn as the range scene's pieces (rangebiz.ts rangeScene)
// beside the 50 m markers and the target greens in the jam build. The table is the one place their library ids go: null until the picture lands, and a
// distance without a picture gets no sign at all (never a code-drawn board). Pure TS, no DOM.

/** the painted distances (m) and each one's library id (null: its picture has not landed yet) */
export const YARDAGE_SIGN_IDS: Readonly<Record<number, string | null>> = Object.freeze({
  50: null, 75: null, 100: null, 125: null, 150: null, 175: null, 200: null, 250: null,
});

/** the sign for a distance of m metres: its library id when its picture has landed and the library holds it (has), else null (no sign) */
export function yardageSignId(m: number, has: (id: string) => boolean, table: Readonly<Record<number, string | null>> = YARDAGE_SIGN_IDS): string | null {
  const id = table[Math.round(m)] ?? null;
  return id && has(id) ? id : null;
}
