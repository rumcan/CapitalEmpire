import {DEFAULT_MATERIAL_URLS} from './material-urls.js';
export class WorkerBunkerBaker{
 constructor({workerFactory=()=>new Worker(new URL('./bake.worker.js',import.meta.url),{type:'module'}),textureBaseURL,materialURLs,maxRenderPixels=4194304,maxOutputEdge=1024}={}){
 this.worker=workerFactory();this.pending=new Map();this.next=1;this.options={materialURLs:materialURLs??(textureBaseURL?undefined:DEFAULT_MATERIAL_URLS),textureBaseURL:textureBaseURL?String(textureBaseURL):undefined,maxRenderPixels,maxOutputEdge};this.closed=false;
 this.worker.onmessage=({data})=>{const job=this.pending.get(data.id);if(!job){data.sprite?.image?.close();return;}this.pending.delete(data.id);if(data.error)job.reject(Error(data.error));else job.resolve(data.sprite);};
 this.worker.onerror=event=>this.fail(Error(event.message||'Bunker worker failed'));
 this.worker.onmessageerror=()=>this.fail(Error('Bunker worker message could not be decoded'));
 }
 bake(request){if(this.closed)return Promise.reject(this.failure??Error('Baker disposed'));const id=this.next++;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});try{this.worker.postMessage({type:'bake',id,request,options:this.options});}catch(error){this.pending.delete(id);reject(error);}});}
 fail(error){if(this.closed)return;this.failure=error;this.closed=true;for(const job of this.pending.values())job.reject(error);this.pending.clear();this.worker.terminate();}
 dispose(){if(this.closed)return;this.closed=true;for(const job of this.pending.values())job.reject(Error('Baker disposed'));this.pending.clear();this.worker.terminate();}
}

