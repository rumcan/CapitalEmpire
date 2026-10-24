// Which controls the Transport panels show (T039): the Car park, Bus route and Toll gate panels, by golf mode, the All tools toggle and the Developer toggle. Pure TS, no DOM.

/** the facts the rules read: a golf game, the All tools (Advanced) toggle, the Developer toggle (F3) */
export interface TransportPanelFacts { golf: boolean; advanced: boolean; dev: boolean }

/** the Car park panel's controls */
export type ParkControl =
  | 'modeRect'      // the "Rectangle" mode chip
  | 'modeRows'      // the "Rows" mode chip
  | 'modeCurb'      // the "On-street" mode chip
  | 'rowAngle'      // the 90/60/45° chips (rows mode)
  | 'rowColour'     // the yellow/white chips (rows mode)
  | 'fee'           // the parking fee −/+ (a tournament-day lever: always shown)
  | 'counts'        // the "N lots · M on-street runs" line
  | 'demandToggle'  // "Show parking demand"
  | 'parkList'      // the list of car parks with Go
  | 'parkTest';     // the "Test 50 cars" button

const ALL_PARK_CONTROLS: readonly ParkControl[] = [
  'modeRect',
  'modeRows',
  'modeCurb',
  'rowAngle',
  'rowColour',
  'fee',
  'counts',
  'demandToggle',
  'parkList',
  'parkTest',
];

/** the Car park panel's visible controls, in panel order */
export function parkPanelControls(f: TransportPanelFacts): ParkControl[] {
  const full = !f.golf || f.advanced;
  return ALL_PARK_CONTROLS.filter(c => {
    if (c === 'modeRect' || c === 'fee' || c === 'parkList') return true;
    if (c === 'parkTest') return Boolean(f.dev);
    return full;
  });
}

/** the Bus route panel's how-to line: golf mode talks about the clubhouse gates, the stadium game about the stadium doors */
export function busHowTo(golf: boolean): { lead: string; body: string } {
  return golf
    ? {
        lead: 'Click a road beside a car park, then a road by the course gates.',
        body: 'Spectators walk from the bays to the stop and queue there; the shuttles carry them to the gates. Without a route they walk all the way.',
      }
    : {
        lead: 'Click a road beside a car park, then a road near the stadium.',
        body: 'Fans walk from the bays to the stop and queue there; the buses carry them to the doors. Without a route they walk all the way.',
      };
}

/** the Toll gate panel's how-to line */
export function tollHowTo(golf: boolean): { lead: string; body: string } {
  void golf;
  return {
    lead: 'Click a straight road.',
    body: 'The gate is a plaza across it: each car that passes a booth pays the toll. Drivers avoid a toll road when a free way exists.',
  };
}
