import assert from 'node:assert/strict';
import {BunkerCache, StaleBakeError} from './bunker-cache.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const sprite=(key,width=4,height=4)=>({key,width,height,anchor:{x:1,y:2},image:{closed:0,close(){this.closed++}}});
let passed=0;

// Static/prebaked production path: no baker, no terrain dependencies, anchor culling.
{
 const cache=new BunkerCache({maxBytes:128}),s=sprite('static'),calls=[];cache.load('a',s);
 assert.equal(cache.draw({drawImage(...args){calls.push(args)}},'a',10,20,2,{x:0,y:0,width:100,height:100}),true);
 assert.deepEqual(calls[0],[s.image,8,16,8,8]);assert.equal(calls.length,1);
 assert.equal(cache.draw({drawImage(){throw Error('Culled draw')}},'a',-100,-100,1,{x:0,y:0,width:20,height:20}),false);
 assert.equal(cache.metrics.draws,1);assert.equal(cache.metrics.culled,1);assert.equal(cache.metrics.bytes,64);
 await assert.rejects(cache.request('missing',{key:'new'}),/No baker/);cache.dispose();assert.equal(s.image.closed,1);passed++;
}
// Same id/key coalesces, ready hits do not bake, concurrency is one.
{
 const jobs=[],cache=new BunkerCache({bake(request){const job=deferred();jobs.push({request,...job});return job.promise}});
 const a=cache.request('a',{key:'v1'}),same=cache.request('a',{key:'v1'}),b=cache.request('b',{key:'v1'});assert.equal(a,same);assert.equal(jobs.length,1);assert.equal(cache.metrics.queuedBakes,1);
 const sa=sprite('v1');jobs[0].resolve(sa);await a;await flush();assert.equal(jobs.length,2);jobs[1].resolve(sprite('v1'));await b;
 const hit=await cache.request('a',{key:'v1'});assert.equal(hit.image,sa.image);assert.equal(cache.metrics.bakes,2);cache.dispose();passed++;
}
// Old ready pixels survive a pending edit; stale completion is closed.
{
 const jobs=[],cache=new BunkerCache({bake(){const job=deferred();jobs.push(job);return job.promise}}),old=sprite('old');cache.load('a',old);
 const first=cache.request('a',{key:'edit1'});const rejection=assert.rejects(first,StaleBakeError);const second=cache.request('a',{key:'edit2'});
 const seen=[];cache.draw({drawImage(image){seen.push(image)}},'a',0,0);assert.equal(seen[0],old.image);assert.equal(old.image.closed,0);
 const stale=sprite('edit1');jobs[0].resolve(stale);await rejection;await flush();assert.equal(stale.image.closed,1);assert.equal(jobs.length,2);const fresh=sprite('edit2');jobs[1].resolve(fresh);await second;assert.equal(old.image.closed,1);assert.equal(fresh.image.closed,0);assert.equal(cache.metrics.staleResults,1);cache.dispose();passed++;
}
// LRU budget uses ready RGBA bytes and does not keep offscreen sprites MRU.
{
 const evicted=[],cache=new BunkerCache({maxBytes:128,onEvict(id,s,reason){if(reason==='lru')evicted.push(id)}}),a=sprite('a'),b=sprite('b'),c=sprite('c');cache.load('a',a);cache.load('b',b);cache.draw({drawImage(){}},'a',0,0);cache.load('c',c);assert.deepEqual(evicted,['b']);assert.equal(b.image.closed,1);assert.equal(cache.metrics.bytes,128);assert.equal(cache.metrics.evictions,1);
 const tooLarge=sprite('huge',100,100);assert.throws(()=>cache.load('huge',tooLarge),RangeError);assert.equal(tooLarge.image.closed,0,'Failed load retains caller ownership');assert.equal(cache.metrics.bytes,128);cache.dispose();passed++;
}
// Physical bitmap dimensions cannot under-report decoded memory usage.
{
 const cache=new BunkerCache({maxBytes:64}),bad=sprite('bad');bad.image.width=1024;bad.image.height=1024;
 assert.throws(()=>cache.load('bad',bad),/metadata/);assert.equal(cache.metrics.bytes,0);assert.equal(bad.image.closed,0);cache.dispose();passed++;
}
// An oversized baked replacement is closed; existing ready sprite remains usable.
{
 const huge=sprite('big',10,10),old=sprite('old'),cache=new BunkerCache({maxBytes:64,bake:async()=>huge});cache.load('a',old);await assert.rejects(cache.request('a',{key:'big'}),RangeError);assert.equal(huge.image.closed,1);assert.equal(old.image.closed,0);assert.equal(cache.metrics.bytes,64);cache.dispose();passed++;
}
// Manual load invalidates pending versions; shared ImageBitmap closes only once.
{
 const job=deferred(),cache=new BunkerCache({bake:()=>job.promise}),pending=cache.request('a',{key:'pending'}),rejected=assert.rejects(pending,StaleBakeError),staticSprite=sprite('static');cache.load('a',staticSprite);cache.load('b',staticSprite);job.resolve(sprite('pending'));await rejected;await flush();cache.load('a',sprite('replacement'));assert.equal(staticSprite.image.closed,0);cache.dispose();assert.equal(staticSprite.image.closed,1);passed++;
}
// Dispose rejects queued work, never starts it, and closes late active results.
{
 const job=deferred();let calls=0;const cache=new BunkerCache({bake(){calls++;return job.promise}}),a=cache.request('a',{key:'a'}),b=cache.request('b',{key:'b'}),ra=assert.rejects(a,StaleBakeError),rb=assert.rejects(b,StaleBakeError);cache.dispose();await Promise.all([ra,rb]);const late=sprite('late');job.resolve(late);await flush();assert.equal(late.image.closed,1);assert.equal(calls,1);assert.equal(cache.metrics.bytes,0);assert.equal(cache.metrics.activeBakes,0);assert.throws(()=>cache.draw({drawImage(){}},'a',0,0),/disposed/);cache.dispose();passed++;
}
// Higher configured concurrency is respected without exceeding it.
{
 const jobs=[],cache=new BunkerCache({maxConcurrentBakes:2,bake(){const job=deferred();jobs.push(job);return job.promise}}),requests=['a','b','c'].map(id=>cache.request(id,{key:id}));assert.equal(jobs.length,2);assert.equal(cache.metrics.activeBakes,2);jobs[0].resolve(sprite('a'));await requests[0];await flush();assert.equal(jobs.length,3);jobs[1].resolve(sprite('b'));jobs[2].resolve(sprite('c'));await Promise.all(requests);assert.equal(cache.metrics.bakes,3);cache.dispose();passed++;
}
// Custom composition get() preserves MRU, delete() releases immediately.
{
 const cache=new BunkerCache({maxBytes:128}),a=sprite('a'),b=sprite('b');cache.load('a',a);cache.load('b',b);
 assert.equal(cache.get('a').image,a.image);cache.load('c',sprite('c'));assert.equal(b.image.closed,1);assert.equal(cache.get('b'),undefined);
 assert.equal(cache.delete('a'),true);assert.equal(a.image.closed,1);assert.equal(cache.metrics.bytes,64);assert.equal(cache.delete('a'),false);cache.dispose();passed++;
}
// Removing an id cancels both pixels and pending work; late results are closed.
{
 const job=deferred(),cache=new BunkerCache({bake:()=>job.promise}),old=sprite('old');cache.load('a',old);
 const pending=cache.request('a',{key:'new'}),rejected=assert.rejects(pending,StaleBakeError);assert.equal(cache.delete('a'),true);await rejected;
 const late=sprite('new');job.resolve(late);await flush();assert.equal(old.image.closed,1);assert.equal(late.image.closed,1);assert.equal(cache.metrics.bytes,0);assert.equal(cache.get('a'),undefined);cache.dispose();passed++;
}
console.log(JSON.stringify({status:'passed',testGroups:passed}));
