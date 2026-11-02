import assert from 'node:assert/strict';
import {WorkerBunkerBaker} from '../baker/bake-client.js';
import {BunkerBaker,gridFromGuide,GAME_PROJECTION} from '../baker/bake.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
class FakeWorker {constructor(){this.messages=[];this.terminated=0;}postMessage(message){if(message.request?.bad)throw new DOMException('Cannot clone','DataCloneError');this.messages.push(message);}terminate(){this.terminated++;}}
const fakeImage=()=>({closed:0,close(){this.closed++;}});
let groups=0;
{
 const worker=new FakeWorker(),client=new WorkerBunkerBaker({workerFactory:()=>worker});
 await assert.rejects(client.bake({key:'bad',bad:true}),/clone/);assert.equal(client.pending.size,0);
 const result=client.bake({key:'ok'});worker.onmessage({data:{id:worker.messages[0].id,sprite:{key:'ok'}}});assert.equal((await result).key,'ok');client.dispose();assert.equal(worker.terminated,1);groups++;
}
{
 const worker=new FakeWorker(),client=new WorkerBunkerBaker({workerFactory:()=>worker}),pending=client.bake({key:'pending'}),rejected=assert.rejects(pending,/fatal/);
 worker.onerror({message:'fatal'});await rejected;assert.equal(client.pending.size,0);assert.equal(worker.terminated,1);await assert.rejects(client.bake({key:'future'}),/fatal/);client.dispose();assert.equal(worker.terminated,1);groups++;
}
{
 const worker=new FakeWorker(),client=new WorkerBunkerBaker({workerFactory:()=>worker}),pending=client.bake({key:'pending'}),rejected=assert.rejects(pending,/decoded/);
 worker.onmessageerror({});await rejected;assert.equal(worker.terminated,1);groups++;
}
{
 const worker=new FakeWorker(),client=new WorkerBunkerBaker({workerFactory:()=>worker}),pending=client.bake({key:'pending'}),rejected=assert.rejects(pending,/disposed/);const id=worker.messages[0].id;client.dispose();await rejected;const late=fakeImage();worker.onmessage({data:{id,sprite:{image:late}}});assert.equal(late.closed,1);groups++;
}
const saved={fetch:globalThis.fetch,createImageBitmap:globalThis.createImageBitmap,OffscreenCanvas:globalThis.OffscreenCanvas};
try {
 const images=[];globalThis.createImageBitmap=async()=>{const image=fakeImage();images.push(image);return image;};
 globalThis.fetch=async url=>({ok:url!=='bad',blob:async()=>({})});
 const baker=new BunkerBaker({materialURLs:{material:'ok',rough:'bad',firstCut:'ok',earth:'ok'}});
 await assert.rejects(baker.init(),/Texture load/);assert.equal(images.length,3);assert.ok(images.every(image=>image.closed===1));assert.equal(baker.ready,null);baker.dispose();groups++;
 const gate=deferred(),lateImages=[];globalThis.fetch=async()=>{await gate.promise;return {ok:true,blob:async()=>({})}};globalThis.createImageBitmap=async()=>{const image=fakeImage();lateImages.push(image);return image;};
 const closing=new BunkerBaker({materialURLs:{material:'ok',rough:'ok',firstCut:'ok',earth:'ok'}}),pending=closing.init(),rejected=assert.rejects(pending,/disposed/);closing.dispose();gate.resolve();await rejected;assert.equal(lateImages.length,4);assert.ok(lateImages.every(image=>image.closed===1));groups++;
 // A fake renderer tests pixel caps and projection/metadata without creating GL.
 let renderOptions;const renderer={prepare(){return {contours:[[[0,0],[4,0],[4,4],[0,4],[0,0]]]};},render(grid,depth,scale,origin,border,options){renderOptions=options;return {width:options.width,height:options.height};},gl:{isContextLost(){return false},getError(){return 0}}};
 globalThis.OffscreenCanvas=class {constructor(width,height){this.width=width;this.height=height;}getContext(){return {drawImage(){}}}};
 globalThis.createImageBitmap=async canvas=>({width:canvas.width,height:canvas.height,close(){}});
 const capped=new BunkerBaker({maxRenderPixels:64,maxOutputEdge:64});capped.init=async()=>renderer;
 const result=await capped.bake({key:'cap',guide:{vertices:[[1,1],[1,1]],originTiles:{x:3,y:7}},appearance:{depth:1,settings:{}}});
 assert.ok(renderOptions.width*renderOptions.height<=64);assert.ok(result.width<=64&&result.height<=64);assert.deepEqual(result.projection,GAME_PROJECTION);assert.equal(result.premultipliedAlpha,true);assert.deepEqual(result.worldOriginTiles,{x:3,y:7});result.image.close();capped.dispose();groups++;
 assert.equal(gridFromGuide({vertices:[[0,1],[0,0]]}).width,1);groups++;
} finally {for(const [key,value]of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
await tick();console.log(JSON.stringify({status:'passed',testGroups:groups}));
