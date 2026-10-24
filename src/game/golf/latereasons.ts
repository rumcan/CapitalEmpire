// Why fans were late or missed, and the Traffic satisfaction line (P03 / T060a): the results card's reason table (each count with the fix the
// player can make), the Traffic line (the day's car trips against free flow) and the spend it costs in the tents. Pure TS, no DOM, no random:
// a lead wires it into the round results and the card (T060b). Counts are fans; trip times are sim s (game minutes).

/** the measured counts behind late or missed fans (fans, not cars) and the worst junctions from the bottleneck report (names, worst first) */
export interface LateFacts { onRoadAtFirstTee: number; turnedAway: number; stranded: number; lost: number; lateAtGate: number; worstJunctions: readonly string[] }
/** the five reasons; this order is the tie-break on the card */
export type LateKey = 'onRoad' | 'turnedAway' | 'stranded' | 'lost' | 'lateAtGate';
/** one line of the card's "Why fans were late or missed" block: its key, its fans (whole fans, at least 1), its label and the fix the player can make */
export interface LateReason { key: LateKey; fans: number; label: string; fix: string }

/** the reasons in their tie-break order (see LateKey) */
const KEYS: readonly LateKey[] = ['onRoad', 'turnedAway', 'stranded', 'lost', 'lateAtGate'];

/** a count of fans as whole fans: rounded down; a negative or non-finite count is 0 */
function fansOf(x: number): number { return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0; }

/** the card's reason rows (fans): one row per reason with at least 1 fan, most fans first (ties in KEYS order); the fix for onRoad names the first three worstJunctions (or the busiest junctions when there are none) */
export function lateReasons(f: LateFacts): LateReason[] {
  const junctions = f.worstJunctions.slice(0, 3);
  const onRoadFix = junctions.length ? `Upgrade or police these junctions: ${junctions.join(', ')}` : 'Upgrade or police the busiest junctions';
  const rows: LateReason[] = [
    { key: 'onRoad', fans: fansOf(f.onRoadAtFirstTee), label: 'Still on the road at first tee', fix: onRoadFix },
    { key: 'turnedAway', fans: fansOf(f.turnedAway), label: 'Turned away (car parks full)', fix: 'Add bays or park and ride' },
    { key: 'stranded', fans: fansOf(f.stranded), label: 'Stranded (no road to the course)', fix: 'Connect their homes to the course roads' },
    { key: 'lost', fans: fansOf(f.lost), label: 'Lost on the way', fix: 'Check for dead ends and missing turns' },
    { key: 'lateAtGate', fans: fansOf(f.lateAtGate), label: 'Late at the gate', fix: 'More gate lanes' },
  ];
  return rows.filter(r => r.fans >= 1).sort((a, b) => b.fans - a.fans || KEYS.indexOf(a.key) - KEYS.indexOf(b.key));
}

/** the trip-time ratio (trip over free flow, unitless) up to which the Traffic line is full marks */
export const TRAFFIC_FULL = 1.2;
/** the trip-time ratio (unitless) from which the Traffic line is zero */
export const TRAFFIC_ZERO = 3;

/** the Traffic satisfaction line (marks 0..100, whole) for a day's mean car trip meanTripS (sim s) against its free-flow time freeFlowS (sim s):
 *  100 up to TRAFFIC_FULL times free flow, 0 from TRAFFIC_ZERO times, linear between; 100 when freeFlowS is 0 or less or an input is not finite */
export function trafficSatisfaction(meanTripS: number, freeFlowS: number): number {
  if (!(freeFlowS > 0) || !Number.isFinite(meanTripS) || !Number.isFinite(freeFlowS)) return 100;
  const r = meanTripS / freeFlowS;
  if (r <= TRAFFIC_FULL) return 100;
  if (r >= TRAFFIC_ZERO) return 0;
  return Math.round(100 * (TRAFFIC_ZERO - r) / (TRAFFIC_ZERO - TRAFFIC_FULL));
}

/** the share (0..1, unitless) of a full tent spend that angry fans (no Traffic satisfaction) still spend */
export const TENT_SPEND_FLOOR = 0.5;

/** the tents' spend factor (0..1, unitless) for a Traffic satisfaction (marks 0..100): 1 at 100, TENT_SPEND_FLOOR at 0, linear between; the marks are clamped to 0..100 and a non-finite mark counts as 100 */
export function tentSpendFactor(trafficSat: number): number {
  const s = Number.isFinite(trafficSat) ? Math.min(100, Math.max(0, trafficSat)) : 100;
  return TENT_SPEND_FLOOR + (1 - TENT_SPEND_FLOOR) * s / 100;
}
