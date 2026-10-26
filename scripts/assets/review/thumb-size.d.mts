// Types for thumb-size.mjs (the studio's thumbnail size steps, T144); the rule itself is documented there.
/** the long sides a thumbnail is served at, in device px; the largest is the cap */
export const THUMB_STEPS: readonly number[];
/** the step a wanted long side (device px) is served at: the smallest step not below it, the cap past the largest, the smallest for nothing sensible */
export function thumbStep(px: unknown): number;
