export type Bounds = [number,number,number,number];
export interface Projection { readonly halfWidth:number; readonly halfHeight:number; readonly verticalPixelsPerMetre:number }
export const GAME_PROJECTION: Readonly<Projection>;
export const GAME_TARGET: Readonly<{commit:string;surface:6;fillCode:12;lipCode:13;wallMaterial:1}>;
export interface Guide { vertices:number[][]; width:number; height:number; originTiles:{x:number;y:number} }
/** collar/firstCut/slope are 2 m tile units; wall/rim/depth are metres. */
export interface Appearance { depth:number; settings:{collar?:number;firstCut?:number;slope?:number;wall?:number;rim?:number;shadow?:number;roundness?:number;textureScale?:number;roughScale?:number;firstScale?:number;sandScale?:number;earthScale?:number;fairwayScale?:number;[name:string]:unknown};[name:string]:unknown }
export interface CourseTex {tex:string;sc:number;a:number;x?:number;m?:{t:string;s:number;f:number;p:number}}
export interface CourseLayer extends CourseTex {
  s:number;e:string;fill:Float32Array[];edges:Float32Array[];soft?:Float32Array[];joint?:Float32Array[];
  collar?:CourseTex&{n:'first-cut'|'fringe'|'lip'|'bank';w?:number;fill:Float32Array[];edges:Float32Array[];soft?:Float32Array[];g?:CourseTex};
  stripes?:{hole:number;line:number[];runs?:Float32Array;a?:number;f?:number[]}[];
  alts?:{look:CourseTex;band?:CourseTex;g?:CourseTex;runs:Float32Array}[];b?:number;
}
export interface CourseWall {p:Float32Array;lo:number;m:number;hs?:number;f?:number;r?:number}
export interface CourseRim {p:Float32Array;hi:number}
export interface CoursePatch {cx:number;cy:number;size:number;layers:CourseLayer[];walls?:CourseWall[];rims?:CourseRim[];grow?:Uint8Array;sh?:number[];st?:number[];spill?:{p:Float32Array;o:number}[];z:number}
export interface BakeRequest {id:string;revision:string|number;guide:Guide;ringsTiles:Float64Array[];appearance:Appearance;projection:Readonly<Projection>;rasterScale:number;maxEdge:number;dirtyBoundsTiles:Bounds;key:string}
export interface Bake {image:CanvasImageSource;width?:number;height?:number;anchor?:unknown;boundsWorldPx:Bounds;dirtyBoundsTiles?:Bounds;rasterScale:number;key:string}
export interface ReplacementOwnership {
  active:boolean;nativeFallback:boolean;expectedKey:string|undefined;surface:6;fillCode:12;lipCode:13;wallMaterial:1;preserveNonBunkers:true;
  suppress:{sandFill:boolean;floorLighting:boolean;grassLip:boolean;wallSand:boolean;ownedRims:boolean};rimRule:string;
}
export function createGuideFromRings(ringsTiles:readonly ArrayLike<number>[],paddingTiles?:number):Guide;
export function unionDirtyBounds(...bounds:(Bounds|null|undefined)[]):Bounds|null;
export function getDirtyBoundsTiles(ringsTiles:readonly ArrayLike<number>[],appearance?:Partial<Appearance>,previousBounds?:Bounds|null):Bounds;
export function projectBoundsTiles(bounds:Bounds,projection?:Projection,heightRangeMetres?:[number,number]):Bounds;
export function buildBakeRequest(options:{id:string;revision:string|number;ringsTiles:readonly ArrayLike<number>[];appearance:Appearance;paddingTiles?:number;rasterScale?:number;maxEdge?:number;previousDirtyBounds?:Bounds|null}):BakeRequest;
export function assembleBoundaryRings(boundaryRuns:readonly ArrayLike<number>[],tolerance?:number):Float64Array[];
/** Deterministic geometry identities; componentKey is not a gameplay/entity id. */
export function splitBunkerComponents(ringsTiles:readonly ArrayLike<number>[]):Array<{ringsTiles:Float64Array[];componentKey:string;boundsTiles:Bounds}>;
export function isBunkerLayer(layer:unknown):layer is CourseLayer;
export function isBunkerWall(wall:unknown):wall is CourseWall;
export function extractBunkerGeometry(coursePatches:readonly CoursePatch[],options?:{ringsTiles?:readonly ArrayLike<number>[];tolerance?:number}):{
  ringsTiles:Float64Array[];boundaryRuns:Float32Array[];sourcePatchKeys:string[];layers:CourseLayer[];wallRuns:CourseWall[];
  rimCandidates:(CourseRim&{sourcePatch:string})[];ownership:{surface:6;fillCode:12;lipCode:13;wallMaterial:1;rimRule:string};
}|null;
export function getReplacementOwnership(bake:Bake|null|undefined,expectedKey:string|undefined):ReplacementOwnership;
export function drawBunkerIntoChunk(ctx:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D,bake:Bake|null|undefined,chunk:{worldX0:number;worldY0:number;rasterScale:number}):boolean;

