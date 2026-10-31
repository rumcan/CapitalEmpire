import type {BunkerBakeResult} from '../baker/bake-client.js';
export function loadPrebakedSprite(url:URL|string,record:{gameProjectionCompatible:boolean;referenceProjection?:boolean;width:number;height:number;worker:Omit<BunkerBakeResult,'image'>},options?:{expectedKey?:string}):Promise<BunkerBakeResult>;
export function cloneBunkerForWorker<T extends {image:ImageBitmap}>(sprite:T):Promise<T>;
