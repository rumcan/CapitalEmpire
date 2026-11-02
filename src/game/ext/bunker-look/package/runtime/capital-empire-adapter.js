/** Standalone binding helpers; nothing here installs or mutates Capital Empire. */
export const GAME_PROJECTION = Object.freeze({halfWidth:64, halfHeight:32, verticalPixelsPerMetre:80});
export const GAME_TARGET = Object.freeze({commit:'4676a0184aebcdb0b1e27af649607cf759e4143e',surface:6,fillCode:12,lipCode:13,wallMaterial:1});
const finite = value => Number.isFinite(value);
const copyLine = line => Float32Array.from(line);
function ringPoints(ring) {
  if (!ring || ring.length < 6 || ring.length % 2 || !Array.from(ring).every(finite)) throw new TypeError('Rings require at least three finite x/y pairs in 2 m tiles.');
  return ring;
}
function ringBounds(rings) {
  if (!rings?.length) throw new TypeError('At least one complete feature ring is required.');
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for (const ring of rings) { ringPoints(ring); for(let i=0;i<ring.length;i+=2){x0=Math.min(x0,ring[i]);y0=Math.min(y0,ring[i+1]);x1=Math.max(x1,ring[i]);y1=Math.max(y1,ring[i+1]);} }
  return [x0,y0,x1,y1];
}
function inRing(ring,x,y) {
  let inside=false;
  for(let i=0,j=ring.length-2;i<ring.length;j=i,i+=2){
    const ax=ring[j],ay=ring[j+1],bx=ring[i],by=ring[i+1],dx=bx-ax,dy=by-ay;
    const cross=(x-ax)*dy-(y-ay)*dx;
    if((dx||dy)&&Math.abs(cross)<=1e-9*Math.max(1,Math.hypot(dx,dy))&&x>=Math.min(ax,bx)-1e-9&&x<=Math.max(ax,bx)+1e-9&&y>=Math.min(ay,by)-1e-9&&y<=Math.max(ay,by)+1e-9)return true;
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
  }
  return inside;
}
/** Complete world-tile rings -> one-tile (2 m) vertex guide; even-odd supports holes/components. */
export function createGuideFromRings(ringsTiles,paddingTiles=4) {
  if(!finite(paddingTiles)||paddingTiles<0)throw new RangeError('paddingTiles must be finite and nonnegative.');
  const b=ringBounds(ringsTiles),x0=Math.floor(b[0]-paddingTiles),y0=Math.floor(b[1]-paddingTiles);
  const width=Math.max(1,Math.ceil(b[2]+paddingTiles)-x0),height=Math.max(1,Math.ceil(b[3]+paddingTiles)-y0);
  if((width+1)*(height+1)>4e6)throw new RangeError('Guide exceeds four million vertices; split the design before baking.');
  const vertices=Array.from({length:height+1},()=>Array(width+1).fill(0));
  for(let y=0;y<=height;y++)for(let x=0;x<=width;x++){let inside=false;for(const ring of ringsTiles)if(inRing(ring,x0+x,y0+y))inside=!inside;vertices[y][x]=Number(inside);}
  return {vertices,width,height,originTiles:{x:x0,y:y0}};
}
/** Union of old/new tile-space dirty rectangles; null means no affected area. */
export function unionDirtyBounds(...bounds) {
  const valid=bounds.filter(Boolean);if(!valid.length)return null;
  for(const b of valid)if(b.length!==4||!Array.from(b).every(finite)||b[2]<b[0]||b[3]<b[1])throw new TypeError('Invalid tile-space bounds.');
  return [Math.min(...valid.map(b=>b[0])),Math.min(...valid.map(b=>b[1])),Math.max(...valid.map(b=>b[2])),Math.max(...valid.map(b=>b[3]))];
}
/** Conservative old/new invalidation in tiles, including collars, height projection and cast shadow. */
export function getDirtyBoundsTiles(ringsTiles,appearance={},previousBounds=null) {
  const b=ringBounds(ringsTiles),s=appearance.settings??{},positive=(v,f=0)=>Math.max(0,finite(v)?v:f);
  // collar/firstCut/slope are tile units; depth/wall/rim are metres.
  const band=positive(s.collar,.65)+positive(s.firstCut,.9)+positive(s.slope,1.1);
  const h=positive(appearance.depth,1.5)+positive(s.wall,.25)+positive(s.rim,.16);
  const reach=band+h*(80/64+.9*Math.max(1,positive(s.shadow,1.5)))+1;
  return unionDirtyBounds(previousBounds,[Math.floor(b[0]-reach),Math.floor(b[1]-reach),Math.ceil(b[2]+reach),Math.ceil(b[3]+reach)]);
}
/** Tile rectangle and metre height range -> projected world-pixel rectangle at zoom 1. */
export function projectBoundsTiles(bounds,projection=GAME_PROJECTION,heightRangeMetres=[0,0]) {
  unionDirtyBounds(bounds);
  const {halfWidth:hw,halfHeight:hh,verticalPixelsPerMetre:v}=projection;
  if(![hw,hh,v].every(n=>finite(n)&&n>0)||!heightRangeMetres.every(finite))throw new TypeError('Invalid projection or height range.');
  const [a,b,c,d]=bounds,x=[(a-b)*hw,(c-b)*hw,(a-d)*hw,(c-d)*hw],y=[(a+b)*hh,(c+b)*hh,(a+d)*hh,(c+d)*hh];
  return [Math.min(...x),Math.min(...y)-Math.max(...heightRangeMetres)*v,Math.max(...x),Math.max(...y)-Math.min(...heightRangeMetres)*v];
}
function canonical(value) {
  if(ArrayBuffer.isView(value))return Array.from(value);
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
function hash(value) {const text=JSON.stringify(canonical(value));let n=0x811c9dc5;for(let i=0;i<text.length;i++){n^=text.charCodeAt(i);n=Math.imul(n,0x01000193);}return (n>>>0).toString(16).padStart(8,'0');}
function normalizedRing(ring) {
  ringPoints(ring);
  const points=[];
  for(let i=0;i<ring.length;i+=2){const x=ring[i]===0?0:ring[i],y=ring[i+1]===0?0:ring[i+1],last=points.at(-1);if(!last||last[0]!==x||last[1]!==y)points.push([x,y]);}
  if(points.length>1&&points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1])points.pop();
  if(points.length<3)throw new TypeError('Component rings require three distinct corners.');
  let first=0;for(let i=1;i<points.length;i++)if(points[i][0]<points[first][0]||points[i][0]===points[first][0]&&points[i][1]<points[first][1])first=i;
  const n=points.length,forward=[],backward=[];
  for(let i=0;i<n;i++){forward.push(...points[(first+i)%n]);backward.push(...points[(first-i+n)%n]);}
  let chosen=forward;for(let i=0;i<forward.length;i++){if(forward[i]===backward[i])continue;if(backward[i]<forward[i])chosen=backward;break;}
  const output=Float64Array.from(chosen);let area=0;
  for(let i=0,j=output.length-2;i<output.length;j=i,i+=2)area+=output[j]*output[i+1]-output[i]*output[j+1];
  if(Math.abs(area)<1e-12)throw new TypeError('Component rings must enclose nonzero area.');
  return {ring:output,area:Math.abs(area)/2,bounds:ringBounds([output]),stamp:JSON.stringify(Array.from(output))};
}
/** Split complete nonintersecting rings (2 m tiles) into outer+hole components; keys identify geometry, never entities. */
export function splitBunkerComponents(ringsTiles) {
  if(!ringsTiles?.length)return [];
  // Identical rings cancel in the input's even-odd fill, irrespective of winding/start.
  const unique=new Map();
  for(const ring of ringsTiles){const item=normalizedRing(ring);if(unique.has(item.stamp))unique.delete(item.stamp);else unique.set(item.stamp,item);}
  const items=[...unique.values()];
  for(let i=0;i<items.length;i++){
    const item=items[i];item.parent=-1;
    for(let j=0;j<items.length;j++){
      if(i===j)continue;const candidate=items[j],b=item.bounds,c=candidate.bounds;
      if(candidate.area<=item.area||b[0]<c[0]||b[1]<c[1]||b[2]>c[2]||b[3]>c[3])continue;
      if(inRing(candidate.ring,item.ring[0],item.ring[1])&&(item.parent<0||candidate.area<items[item.parent].area))item.parent=j;
    }
  }
  const result=[];
  for(let i=0;i<items.length;i++){
    let depth=0,parent=items[i].parent;while(parent>=0){depth++;parent=items[parent].parent;}
    if(depth%2)continue;
    const holes=items.filter(item=>item.parent===i).sort((a,b)=>a.stamp<b.stamp?-1:a.stamp>b.stamp?1:0);
    const rings=[items[i].ring,...holes.map(item=>item.ring)];
    result.push({ringsTiles:rings,componentKey:'bunker-component-v1:'+hash(rings),boundsTiles:ringBounds(rings)});
  }
  return result.sort((a,b)=>a.boundsTiles[0]-b.boundsTiles[0]||a.boundsTiles[1]-b.boundsTiles[1]||(a.componentKey<b.componentKey?-1:a.componentKey>b.componentKey?1:0));
}
/** Build a pure-data edit-time request; id/revision are the existing owner's, never a new game entity. */
export function buildBakeRequest({id,revision,ringsTiles,appearance,paddingTiles,rasterScale=.6,maxEdge=1024,previousDirtyBounds=null}) {
  if(typeof id!=='string'||!id||revision===undefined)throw new TypeError('Existing owner id and revision are required.');
  if(!appearance?.settings||!finite(appearance.depth))throw new TypeError('Approved appearance.settings and depth are required.');
  if(!finite(rasterScale)||rasterScale<=0||!Number.isInteger(maxEdge)||maxEdge<32)throw new RangeError('Invalid bake resolution.');
  const exactRings=ringsTiles.map(ring=>Float64Array.from(ringPoints(ring)));
  const settings={...appearance.settings},look={...appearance,settings};
  const pad=paddingTiles??Math.ceil(Math.max(0,settings.collar??.65)+Math.max(0,settings.firstCut??.9)+1);
  const guide=createGuideFromRings(exactRings,pad),dirtyBoundsTiles=getDirtyBoundsTiles(exactRings,look,previousDirtyBounds);
  // Exact game rings are authoritative; the guide is only authoring/bounds fallback.
  const request={id,revision,ringsTiles:exactRings,guide,appearance:look,projection:GAME_PROJECTION,rasterScale,maxEdge,dirtyBoundsTiles};
  request.key='capital-empire-bunker-v1:'+id+':'+hash(request);
  return request;
}
/** Stitch true boundary segments globally. Never close an artificial clipped-fill edge. */
export function assembleBoundaryRings(boundaryRuns,tolerance=1e-4) {
  if(!finite(tolerance)||tolerance<=0)throw new RangeError('Boundary tolerance must be positive.');
  const nodes=new Map(),edges=[],seen=new Set(),key=(x,y)=>Math.round(x/tolerance)+','+Math.round(y/tolerance);
  const node=(x,y)=>{const k=key(x,y);if(!nodes.has(k))nodes.set(k,{point:[x,y],edges:[]});return k;};
  for(const run of boundaryRuns){
    if(!run||run.length<4||run.length%2||!Array.from(run).every(finite))throw new TypeError('Boundary runs require finite x/y pairs.');
    for(let i=0;i+3<run.length;i+=2){const a=node(run[i],run[i+1]),b=node(run[i+2],run[i+3]);if(a===b)continue;const stamp=a<b?a+'|'+b:b+'|'+a;if(seen.has(stamp))continue;seen.add(stamp);const id=edges.length;edges.push([a,b]);nodes.get(a).edges.push(id);nodes.get(b).edges.push(id);}
  }
  if(!edges.length)throw new Error('No true bunker boundary: provide whole feature rings or all neighbouring CourseLayer.edges.');
  for(const n of nodes.values())if(n.edges.length!==2)throw new Error('Bunker boundary is incomplete or ambiguous. Supply all neighbouring true edges or whole feature rings; clipped fills cannot be baked independently.');
  const visited=new Set(),rings=[];
  for(let seed=0;seed<edges.length;seed++){
    if(visited.has(seed))continue;
    const start=edges[seed][0],points=[];let at=start,edge=seed;
    do{
      points.push(...nodes.get(at).point);visited.add(edge);
      const pair=edges[edge],next=pair[0]===at?pair[1]:pair[0];at=next;
      if(at===start)break;
      edge=nodes.get(at).edges.find(id=>!visited.has(id));
      if(edge===undefined)throw new Error('Bunker boundary did not close; provide whole feature rings.');
    }while(points.length<=edges.length*2+2);
    points.push(...nodes.get(start).point);if(points.length<8)throw new Error('Bunker boundary has fewer than three points.');
    rings.push(Float64Array.from(points));
  }
  return rings;
}
export const isBunkerLayer = layer => layer?.s===GAME_TARGET.surface;
export const isBunkerWall = wall => wall?.m===GAME_TARGET.wallMaterial&&wall.lo===GAME_TARGET.fillCode;
/** Extract only SURF 6 appearance inputs from complete neighbouring course patches; originals stay untouched. */
export function extractBunkerGeometry(coursePatches,{ringsTiles,tolerance=1e-4}={}) {
  const layers=[],wallRuns=[],rimCandidates=[],sources=[],boundaryRuns=[];
  for(const patch of coursePatches){
    const selected=(patch.layers??[]).filter(isBunkerLayer);if(!selected.length)continue;
    const patchKey='cg:'+patch.cx+':'+patch.cy;sources.push(patchKey);
    for(const layer of selected){layers.push(layer);for(const edge of layer.edges??[])boundaryRuns.push(copyLine(edge));}
    for(const wall of patch.walls??[])if(isBunkerWall(wall))wallRuns.push({...wall,p:copyLine(wall.p)});
    // Rim hi belongs to the HIGHER neighbour; do not assume hi===13 or drop all rims.
    for(const rim of patch.rims??[])rimCandidates.push({...rim,p:copyLine(rim.p),sourcePatch:patchKey});
  }
  if(!layers.length)return null;
  const rings=ringsTiles?.length?ringsTiles.map(r=>Float64Array.from(ringPoints(r))):assembleBoundaryRings(boundaryRuns,tolerance);
  return {ringsTiles:rings,boundaryRuns,sourcePatchKeys:[...new Set(sources)],layers,wallRuns,rimCandidates,ownership:{surface:6,fillCode:12,lipCode:13,wallMaterial:1,rimRule:'owned-boundary-only'}};
}
function bakeSize(bake) {
  const image=bake?.image,w=bake?.width??image?.naturalWidth??image?.width,h=bake?.height??image?.naturalHeight??image?.height;
  return {w,h};
}
/** A pending/stale/invalid bake never disables the native bunker appearance. */
export function getReplacementOwnership(bake,expectedKey) {
  const {w,h}=bakeSize(bake),b=bake?.boundsWorldPx;
  const active=Boolean(expectedKey&&bake?.key===expectedKey&&bake.image&&finite(w)&&w>0&&finite(h)&&h>0&&finite(bake.rasterScale)&&bake.rasterScale>0&&b?.length===4&&b.every(finite)&&b[2]>b[0]&&b[3]>b[1]);
  return {active,nativeFallback:!active,expectedKey,surface:6,fillCode:12,lipCode:13,wallMaterial:1,preserveNonBunkers:true,
    suppress:{sandFill:active,floorLighting:active,grassLip:active,wallSand:active,ownedRims:active},
    rimRule:'Only selected bunker-boundary rim spans, including those attached to a higher neighbour. Other rims remain native.'};
}
/** Draw an already projected raster into a cached ground chunk; no geometry/SDF work occurs here. */
export function drawBunkerIntoChunk(ctx,bake,{worldX0,worldY0,rasterScale}) {
  if(!getReplacementOwnership(bake,bake?.key).active)return false;
  if(![worldX0,worldY0,rasterScale].every(finite)||rasterScale<=0)throw new TypeError('Chunk origin is world pixels; rasterScale must be positive.');
  const [x0,y0,x1,y1]=bake.boundsWorldPx,{w,h}=bakeSize(bake);
  const dx=(x0-worldX0)*rasterScale,dy=(y0-worldY0)*rasterScale,dw=(x1-x0)*rasterScale,dh=(y1-y0)*rasterScale;
  const canvas=ctx.canvas;
  if(finite(canvas?.width)&&finite(canvas?.height)&&(dx>=canvas.width||dy>=canvas.height||dx+dw<=0||dy+dh<=0))return false;
  ctx.save();
  try{
    ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.imageSmoothingEnabled=true;
    ctx.drawImage(bake.image,0,0,w,h,dx,dy,dw,dh);
  }finally{ctx.restore();}
  return true;
}

