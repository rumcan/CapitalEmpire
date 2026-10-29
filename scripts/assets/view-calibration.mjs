// A one-face art repair may retain the other native pictures at their existing game size.
// Both door readings and retained scales apply only to the exact PNG they describe.
export function calibratedViewScale(measure, hash, standardDoor, gaugeScale) {
  if (measure?.sha256 !== hash) return 0;
  if (Number.isFinite(measure.nativeScale) && measure.nativeScale > 0) return measure.nativeScale;
  return Number.isFinite(measure.door) && measure.door > 0 ? standardDoor / (measure.door * gaugeScale) : 0;
}

// Keep the collision/placement footprint while a repaired camera changes the painted width.
// The version binding prevents this exception carrying into a later, unrelated art revision.
export function calibratedFootprintScale(measure, version, derived) {
  return measure?.version === version && Number.isFinite(measure.footprintScale) && measure.footprintScale > 0
    ? measure.footprintScale : derived;
}
