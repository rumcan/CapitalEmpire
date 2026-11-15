// #1305: the unlock bar's fill (UnlockBar.tsx), kept apart so the tests read it under plain node.

/** how full the bar is (0..100, whole): have of need, clamped; a need of 0 or less is full */
export function unlockPct(have: number, need: number): number {
  if (!(need > 0)) return 100;
  return Math.max(0, Math.min(100, Math.floor((Math.max(0, have) / need) * 100)));
}
