// Multi-day golf tournament resolution (docs/GOLF-PLAN.md sections 2.1, 5.1, and 5.5). Pure TS, no DOM.
import { PRACTICE_SHARE, dayShare, tierInfo } from './tour';
import { WEATHER_INFO, applyWeatherToTentRevenue, getTournamentWeather, type WeatherCondition, type WeatherInfo } from './weather';
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
  includePractice?: boolean;
  practiceDays?: number;
  seed?: number;
  run?: number;
  practiceWeather?: readonly (WeatherCondition | WeatherInfo)[];
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
  isPractice?: boolean;
  totalIncome: number;
  weather?: WeatherInfo;
}

/** complete multi-day tournament resolution summary */
export interface MultiDaySummary {
  tier: number;
  totalDays: number;
  liveDays: number;
  resolvedDays: number;
  practiceDays?: number;
  practiceList?: DayResultSummary[];
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
/** practice day tickets are half the tournament day ticket price (GOLF-PLAN 2.2) */
export const PRACTICE_TICKET_SHARE = 0.5;

/** resolve deterministic weather for a practice day (0-based practiceIndex before Day 1) */
export function resolvePracticeWeather(
  input: ResolveMultiDayInput,
  practiceIndex: number,
  totalDays = tierInfo(input.tier).days,
): WeatherInfo {
  const explicit = input.practiceWeather?.[practiceIndex];
  if (explicit) return typeof explicit === 'string' ? WEATHER_INFO[explicit] : explicit;
  if (input.seed !== undefined) {
    return getTournamentWeather(input.seed, input.run ?? 1, totalDays + practiceIndex);
  }
  return WEATHER_INFO.clear;
}

/**
 * Resolve pre-tournament practice days for tiers 3 and up (tour.ts practiceDays: 1, 2, 3).
 * Each practice day uses a negative dayIndex (-practiceDays .. -1) -> PRACTICE_SHARE (0.3) of build-up,
 * spectators from the live day's arrived times dayShare ratio (adjusted for storm stay-home),
 * half-price tickets, tent takings, and the weather of that day.
 */
export function resolvePracticeDays(input: ResolveMultiDayInput, resolvedLiveTents?: number): DayResultSummary[] {
  const tInfo = tierInfo(input.tier);
  const totalDays = tInfo.days;
  const practiceCount = Math.max(0, Math.floor(input.practiceDays ?? tInfo.practiceDays));
  if (practiceCount <= 0) return [];

  const liveShare = dayShare(0, totalDays);
  const liveSpectators = input.liveArrived;
  const practiceTicketUnit = (input.ticketPrice ?? tInfo.ticket) * PRACTICE_TICKET_SHARE;

  let baseLiveTents = resolvedLiveTents ?? input.liveTents ?? 0;
  if (resolvedLiveTents === undefined && input.liveTents === undefined && input.structures && input.structures.length > 0) {
    baseLiveTents = evaluateEventToolDay({
      placed: input.structures,
      holes: input.holes ?? [],
      gates: [],
      tier: input.tier,
      spectators: liveSpectators,
    }).totalRevenue;
  }

  const out: DayResultSummary[] = [];
  for (let p = 0; p < practiceCount; p++) {
    const dayIndex = p - practiceCount;
    const share = dayShare(dayIndex, totalDays) || PRACTICE_SHARE;
    const ratio = liveShare > 0 ? share / liveShare : 1;
    const weather = resolvePracticeWeather(input, p, totalDays);
    const rawSpectators = Math.round(liveSpectators * ratio);
    const spectators = Math.round(rawSpectators * (1 - weather.stayHomeShare));
    const tickets = Math.round(spectators * practiceTicketUnit);

    let tents = 0;
    if (input.structures && input.structures.length > 0) {
      const tentEval = evaluateEventToolDay({
        placed: input.structures,
        holes: input.holes ?? [],
        gates: [],
        tier: input.tier,
        spectators,
      });
      tents = applyWeatherToTentRevenue(tentEval.totalRevenue, weather.condition, tentEval.byStructure);
    } else {
      const scaledTents = Math.round(baseLiveTents * ratio * (1 - weather.stayHomeShare));
      tents = applyWeatherToTentRevenue(scaledTents, weather.condition);
    }

    out.push({
      dayIndex,
      label: `Practice ${p + 1} (resolved)`,
      isLive: false,
      isPractice: true,
      share,
      ratio,
      spectators,
      tickets,
      tents,
      sponsors: 0,
      totalIncome: tickets + tents,
      weather,
    });
  }
  return out;
}

/** resolve multi-day tournament with tier practice days (tiers 3..5: 1, 2, 3 practice days) summed into all multi-day totals */
export function resolveMultiDayWithPractice(input: ResolveMultiDayInput): MultiDaySummary {
  return resolveMultiDayTournament({ ...input, includePractice: true });
}

export function formatMultiDayStatus(liveDays: number, resolvedDays: number, practiceDays = 0): string {
  if (resolvedDays <= 0 && practiceDays <= 0) return `${liveDays} day live`;
  const base = resolvedDays > 0 ? `Day 1 live, ${resolvedDays} resolved` : `${liveDays} day live`;
  return practiceDays > 0 ? `${base}, ${practiceDays} practice` : base;
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

  const practiceList = resolvePracticeDays(input, liveTents);
  const practiceDays = practiceList.length;
  const foldPractice = Boolean(input.includePractice || input.practiceDays !== undefined || input.seed !== undefined || input.practiceWeather !== undefined);
  if (foldPractice && practiceDays > 0) days.unshift(...practiceList);
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
    practiceDays,
    practiceList,
    statusLine: formatMultiDayStatus(liveDays, resolvedDays, foldPractice ? practiceDays : 0),
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
