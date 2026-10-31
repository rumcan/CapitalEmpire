// Proposed replacement binding; no game files were changed.
import {BunkerCache,StaleBakeError} from '../runtime/bunker-cache.js';
import {buildBakeRequest,getReplacementOwnership,drawBunkerIntoChunk,unionDirtyBounds} from '../runtime/capital-empire-adapter.js';
import {APPROVED_APPEARANCE} from '../approved-preset.js';
export class BunkerLookBridge{
 constructor({bake,invalidate,maxBytes=32*1024*1024,appearance=APPROVED_APPEARANCE}){
  this.ready=new Map();this.expected=new Map();this.invalidate=invalidate;this.appearance=appearance;
  this.cache=new BunkerCache({maxBytes,maxConcurrentBakes:1,bake,onEvict:(id,sprite)=>{if(this.ready.get(id)===sprite)this.ready.delete(id);}});
 }
 async upsert({id,revision,ringsTiles}){
  const previous=this.ready.get(id),request=buildBakeRequest({id,revision,ringsTiles,appearance:this.appearance,rasterScale:.6,maxEdge:1024,previousDirtyBounds:previous?.dirtyBoundsTiles});
  this.expected.set(id,request.key);
  try{const result=await this.cache.request(id,request);if(this.expected.get(id)!==request.key)return false;this.ready.set(id,result);this.invalidate(unionDirtyBounds(previous?.dirtyBoundsTiles,result.dirtyBoundsTiles),true);return true;}
  catch(error){if(error instanceof StaleBakeError)return false;throw error;}
 }
 paint(ctx,id,chunk){const bake=this.cache.get(id),ownership=getReplacementOwnership(bake,this.expected.get(id));if(ownership.active)drawBunkerIntoChunk(ctx,bake,chunk);return ownership;}
 remove(id){const old=this.ready.get(id);this.expected.delete(id);this.cache.delete(id);this.ready.delete(id);if(old)this.invalidate(old.dirtyBoundsTiles,true);}
 dispose(){this.cache.dispose();this.ready.clear();this.expected.clear();}
}

