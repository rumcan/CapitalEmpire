import {
  BunkerCache, WorkerBunkerBaker, StaleBakeError, buildBakeRequest,
  getReplacementOwnership, drawBunkerIntoChunk, createGuideFromRings,
  projectBoundsTiles, splitBunkerComponents, GAME_PROJECTION,
  type Appearance, type BakeRequest, type BunkerBakeRequest,
  type BunkerBakeResult, type BunkerCacheOptions, type CacheBakeRequest,
  type CoursePatch, extractBunkerGeometry,
} from '../../index.js';

const appearance: Appearance = {depth:1.5,settings:{collar:2,firstCut:2,slope:2.5,wall:1.5,roundness:.75}};
const rings:readonly Float32Array[]=[new Float32Array([0,0,4,0,4,4,0,4,0,0])];
const guide=createGuideFromRings(rings);
const request: BakeRequest=buildBakeRequest({id:'existing-owner',revision:1,ringsTiles:rings,appearance});
const workerRequest:BunkerBakeRequest=request;
const baker=new WorkerBunkerBaker({maxRenderPixels:4*1024*1024,maxOutputEdge:1024});

// A real adapter request has no catch-all index signature; it must remain valid.
const options:BunkerCacheOptions<BakeRequest,BunkerBakeResult>={bake:value=>baker.bake(value)};
const cache=new BunkerCache<BakeRequest,BunkerBakeResult>(options);
const promise:Promise<BunkerBakeResult>=cache.request('existing-owner',request);
const maybeReady:BunkerBakeResult|undefined=cache.get('existing-owner');
const ctx=document.createElement('canvas').getContext('2d')!;
getReplacementOwnership(maybeReady,request.key);
drawBunkerIntoChunk(ctx,maybeReady,{worldX0:0,worldY0:0,rasterScale:1});
promise.then(result=>{cache.load('prebaked',result);cache.draw(ctx,'prebaked',10,20,1,{x:0,y:0,width:1920,height:1080});});
promise.then(result=>{const mode:'authoritative-rings'|'authored-guide'=result.geometryMode;void mode;});
const removed:boolean=cache.delete('existing-owner');
const inferred=new BunkerCache({bake:(value:BakeRequest)=>baker.bake(value)});
const inferredPromise:Promise<BunkerBakeResult>=inferred.request('inferred',request);
const dynamic:CacheBakeRequest={key:'dynamic',custom:guide};void dynamic;
const runtimeOnly=new BunkerCache();
runtimeOnly.load('static',{image:{} as ImageBitmap,width:512,height:331,anchor:{x:50,y:100}});
const parts=splitBunkerComponents(rings);parts.forEach(part=>{const key:string=part.componentKey;projectBoundsTiles(part.boundsTiles,GAME_PROJECTION,[0,2]);void key;});
const patches:CoursePatch[]=[];extractBunkerGeometry(patches,{ringsTiles:rings});
const handled=promise.catch(error=>{if(error instanceof StaleBakeError)return undefined;throw error;});
void [workerRequest,removed,inferredPromise,handled];
// @ts-expect-error A public request needs its version key.
cache.request('missing-key',{guide});
// @ts-expect-error Anchors are pixel points, not opaque metadata.
runtimeOnly.load('bad-anchor',{image:{} as ImageBitmap,width:10,height:10,anchor:{x:'wrong',y:0}});
cache.dispose();inferred.dispose();runtimeOnly.dispose();baker.dispose();
