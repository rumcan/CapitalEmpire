/** id -> the largest preset scale of its props (above 1, at most 1.5); a missing or unreadable presets file gives an empty map */
export function presetScales(root: string): Map<string, number>;
