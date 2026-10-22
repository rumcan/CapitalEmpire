// Multi-day golf tournament resolution (docs/GOLF-PLAN.md sections 2.1, 5.1, and 5.5). Pure TS, no DOM.
import { dayShare, tierInfo } from './tour';
import { evaluateEventToolDay, type PlacedEventStructure } from './eventtool';
import type { Hole } from './holes';

/** inputs for resolving a multi-day tournament from live day measurements */
export interface ResolveMultiDayInput {
  tier: number;
  liveArrived: number;
  liveTents?: number;
  ticketPrice?: number;
  sponsorIncome?: number;
  tvIncome?: number;
  purse?: number;
  structures?: readonly PlacedEventStructure[];
  holes?: readonly Hole[];
}

/** performance and financial breakdown for one day of the tournament */
export interface DayResultSummary {
  dayIndex: number;
  label: string;
  isLive: boolean;
  share: number;
  ratio: number;
  spectators: number;
  tickets: number;
  tents: number;
  sponsors: number;
  totalIncome: number;
}

/** complete multi-day tournament resolution summary */
export interface MultiDaySummary {
  tier: number;
  totalDays: number;
  liveDays: number;
  resolvedDays: number;
  statusLine: string;
  days: DayResultSummary[];
  totalSpectators: number;
  totalTickets: number;
  totalTents: number;
  totalSponsors: number;
  tvIncome: number;
  purse: number;
  totalRevenue: number;
  netCommercial: number;
}

/** format human-readable status line, e.g. "Day 1 live, 2 resolved" */
export function formatMultiDayStatus(liveDays: number, resolvedDays: number): string {
  if (resolvedDays <= 0) return `${liveDays} day live`;
  return `Day 1 live, ${resolvedDays} resolved`;
}

/**
 * Resolve multi-day tournament attendance, tickets, tents, and sponsorship from live day measurements.
 *
 * Tiers 2 and up have multiple tournament days (tour.ts days). The first day is played live,
 * and subsequent days are resolved deterministically using dayShare ratios.
 */
export function resolveMultiDayTournament(input: ResolveMultiDayInput): MultiDaySummary {
  const tInfo = tierInfo(input.tier);
  const totalDays = tInfo.days;
  const liveDays = 1;
  const resolvedDays = Math.max(0, totalDays - liveDays);
  const ticketUnit = input.ticketPrice ?? tInfo.ticket;
  const totalSponsors = input.sponsorIncome ?? 0;
  const tvIncome = input.tvIncome ?? 0;
  const purse = input.purse ?? tInfo.purse;

  const liveShare = dayShare(0, totalDays);
  const days: DayResultSummary[] = [];

  // Day 1 (Live)
  const liveSpectators = input.liveArrived;
  const liveTickets = Math.round(liveSpectators * ticketUnit);
  let liveTents = input.liveTents ?? 0;
  if (input.liveTents === undefined && input.structures && input.structures.length > 0) {
    const tentEval = evaluateEventToolDay({
      placed: input.structures,
      holes: input.holes ?? [],
      gates: [],
      tier: input.tier,
      spectators: liveSpectators,
    });
    liveTents = tentEval.totalRevenue;
  }
  const sponsorPerDay = totalDays > 0 ? Math.round(totalSponsors / totalDays) : 0;

  days.push({
    dayIndex: 0,
    label: 'Day 1 (live)',
    isLive: true,
    share: liveShare,
    ratio: 1,
    spectators: liveSpectators,
    tickets: liveTickets,
    tents: liveTents,
    sponsors: sponsorPerDay,
    totalIncome: liveTickets + liveTents + sponsorPerDay,
  });

  // Resolved Days (Days 2 .. totalDays)
  for (let d = 1; d < totalDays; d++) {
    const share = dayShare(d, totalDays);
    const ratio = liveShare > 0 ? share / liveShare : 1;
    const spectators = Math.round(liveSpectators * ratio);
    const tickets = Math.round(spectators * ticketUnit);

    let tents = 0;
    if (input.structures && input.structures.length > 0) {
      const tentEval = evaluateEventToolDay({
        placed: input.structures,
        holes: input.holes ?? [],
        gates: [],
        tier: input.tier,
        spectators,
      });
      tents = tentEval.totalRevenue;
    } else {
      tents = Math.round(liveTents * ratio);
    }

    const sponsors = (d === totalDays - 1) ? (totalSponsors - sponsorPerDay * (totalDays - 1)) : sponsorPerDay;

    days.push({
      dayIndex: d,
      label: `Day ${d + 1} (resolved)`,
      isLive: false,
      share,
      ratio,
      spectators,
      tickets,
      tents,
      sponsors,
      totalIncome: tickets + tents + sponsors,
    });
  }

  const totalSpectators = days.reduce((sum, d) => sum + d.spectators, 0);
  const totalTickets = days.reduce((sum, d) => sum + d.tickets, 0);
  const totalTents = days.reduce((sum, d) => sum + d.tents, 0);
  const totalRevenue = totalTickets + totalTents + totalSponsors + tvIncome;
  const netCommercial = totalRevenue - purse;

  return {
    tier: input.tier,
    totalDays,
    liveDays,
    resolvedDays,
    statusLine: formatMultiDayStatus(liveDays, resolvedDays),
    days,
    totalSpectators,
    totalTickets,
    totalTents,
    totalSponsors,
    tvIncome,
    purse,
    totalRevenue,
    netCommercial,
  };
}
