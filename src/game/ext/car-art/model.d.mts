// Types for model.mjs (the car model rule, shared with the asset scripts); the rule itself is documented there.
/** the model of a car id (the key its studio size is kept by) */
export function carModel(id: string): string;
/** the models whose name is not read from their id */
export const CAR_MODEL_NAMES: Readonly<Record<string, string>>;
/** a model's name on its studio card */
export function carModelName(model: string): string;
/** a model's size in a sizes table: its own key, else the largest kept under one of its pictures' ids; undefined when none is set */
export function carModelSize(sizes: Readonly<Record<string, number>>, model: string): number | undefined;
/** the sizes with every car's keys folded into its model's (the largest), the other keys as they are; a new object */
export function foldCarSizes(sizes: Readonly<Record<string, number>>, carIds: Iterable<string>): Record<string, number>;
