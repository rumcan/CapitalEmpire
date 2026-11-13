// The Event tool's purpose groups: which structure types go together in the Event Structures panel, in the panel's order. Pure TS, no DOM.

/** one panel section: its id, its heading and the structure types it shows, in order */
export const STRUCTURE_GROUPS: readonly { id: string; name: string; ids: readonly string[] }[] = [
  { id: 'entry', name: 'Entry & tickets', ids: ['gate', 'info'] },
  { id: 'needs', name: 'Spectator needs', ids: ['toilets', 'firstAid'] },
  { id: 'food', name: 'Food & drink', ids: ['foodTent', 'kiosk', 'foodTruck', 'drinksTent'] },
  { id: 'seating', name: 'Seating & viewing', ids: ['compactBleacher60', 'seatedPavilion24', 'seatedPavilion60', 'seatedPavilion120', 'standS', 'standM', 'standL', 'rangeStand'] },
  { id: 'scoring', name: 'Scoring', ids: ['holeBoard', 'leaderboard', 'screen'] },
  { id: 'tv', name: 'TV & media', ids: ['tvTower', 'broadcast', 'media'] },
  { id: 'shops', name: 'Shops & sponsors', ids: ['merchTent', 'merchPavilion', 'sponsorDisplay'] },
  { id: 'hospitality', name: 'Hospitality', ids: ['chalet', 'village', 'helipad', 'hotel'] },
  { id: 'transport', name: 'Transport', ids: ['rideshare', 'coach', 'interchange'] },
  { id: 'lights', name: 'Lights', ids: ['floodlight'] },
];

/** the purpose group a structure type belongs to (undefined when it is in none) */
export function groupOf(typeId: string): (typeof STRUCTURE_GROUPS)[number] | undefined { return STRUCTURE_GROUPS.find(g => g.ids.includes(typeId)); }
