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
/** a class of car */
export type CarClass = 'compact' | 'sedan' | 'suv' | 'pickup' | 'van' | 'bus';
/** the real-world length in metres of each class of car (T313) */
export const CLASS_LENGTH: Readonly<Record<CarClass, number>>;
/** each car model's class (T313) */
export const CAR_CLASS: Readonly<Record<string, CarClass>>;
/** a car picture's factor on top of its model's size in a lengths table (car-lengths.json): its model's reference length over its own; 1 unmeasured */
export function carPictureFactorIn(lengths: { models: Readonly<Record<string, number>>; pictures: Readonly<Record<string, number>> }, id: string): number;
