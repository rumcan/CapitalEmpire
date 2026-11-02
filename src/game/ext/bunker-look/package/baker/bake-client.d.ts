export interface Projection {halfWidth:number;halfHeight:number;verticalPixelsPerMetre:number}
export interface Guide {vertices:number[][];width?:number;height?:number;originTiles?:{x:number;y:number}}
export interface BunkerBakeRequest {key:string;guide:Guide;ringsTiles?:readonly ArrayLike<number>[];appearance:{depth:number;settings:Record<string,number|unknown>};projection?:Projection;rasterScale?:number;maxEdge?:number;dirtyBoundsTiles?:[number,number,number,number];borderOnly?:boolean}
export interface BunkerBakeResult {key:string;image:ImageBitmap;width:number;height:number;anchor:{x:number;y:number};boundsWorldPx:[number,number,number,number];dirtyBoundsTiles?:[number,number,number,number];rasterScale:number;projection:Projection;worldOriginTiles:{x:number;y:number};geometryMode:'authoritative-rings'|'authored-guide';decodedBytes:number;bakeMs:number;premultipliedAlpha:true}
export interface BakerOptions {workerFactory?:()=>Worker;textureBaseURL?:URL|string;materialURLs?:Record<'material'|'rough'|'firstCut'|'earth',string>;maxRenderPixels?:number;maxOutputEdge?:number}
export class WorkerBunkerBaker {constructor(options?:BakerOptions);bake(request:BunkerBakeRequest):Promise<BunkerBakeResult>;dispose():void}

