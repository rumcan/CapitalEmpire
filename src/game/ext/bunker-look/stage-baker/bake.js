// Host adaptation of the supplied SDK: the ordinary colour pass is unchanged.
// semanticPass only emits geometry IDs for native floor/wall/lip staging; original vendor files remain preserved.
import {WorldRenderer} from './renderer-world.js';
export const GAME_PROJECTION=Object.freeze({halfWidth:64,halfHeight:32,verticalPixelsPerMetre:80});
export const PREVIEW_PROJECTION=Object.freeze({halfWidth:256,halfHeight:148,verticalPixelsPerMetre:147.8});
export function gridFromGuide(guide){
 const rows=guide?.vertices;if(!Array.isArray(rows)||rows.length<2||!Array.isArray(rows[0])||rows[0].length<2)throw Error('A rectangular binary vertex guide is required');
 const height=rows.length-1,width=rows[0].length-1;
 if(width>512||height>512||rows.some(r=>!Array.isArray(r)||r.length!==width+1||r.some(v=>v!==0&&v!==1)))throw Error('Invalid or oversized guide');
 const grid={width,height,vertices:rows.map(r=>[...r])};grid.caseAt=(x,y)=>{const v=grid.vertices,mask=v[y][x]+2*v[y][x+1]+4*v[y+1][x+1]+8*v[y+1][x];return{mask,variant:'sand'};};return grid;
}
// Host: one picture per slot, chosen per bake (texture-library.ts); crop picks a part of an atlas (fractions of the image).
async function image(material){const r=await fetch(material.url);if(!r.ok)throw Error('Texture load failed: '+material.id);const full=await createImageBitmap(await r.blob());if(!material.crop)return full;
 try{const [x,y,w,h]=material.crop;return await createImageBitmap(full,Math.round(x*full.width),Math.round(y*full.height),Math.max(1,Math.round(w*full.width)),Math.max(1,Math.round(h*full.height)));}finally{full.close();}}
const SLOTS=['sand','soil','rough','firstCut','wall'],MAX_TEXTURES=24;
export class BunkerBaker{
 constructor({maxRenderPixels=4194304,maxOutputEdge=1024}={}){if(!Number.isSafeInteger(maxRenderPixels)||maxRenderPixels<1||!Number.isSafeInteger(maxOutputEdge)||maxOutputEdge<32)throw Error('Invalid bake pixel limits');this.maxRenderPixels=maxRenderPixels;this.maxOutputEdge=maxOutputEdge;this.renderer=null;this.textures=new Map();this.disposed=false;}
 init(){if(this.disposed)throw Error('Baker disposed');return this.renderer??=new WorldRenderer();}
 // GL textures by id (the wall repeats, the rest clamp), least recently used dropped beyond MAX_TEXTURES; a failed load is retried next bake.
 texture(material,repeat){const key=(repeat?'r:':'c:')+material.id;let entry=this.textures.get(key);if(entry){this.textures.delete(key);this.textures.set(key,entry);return entry.ready;}
  entry={ready:image(material).then(img=>{try{if(this.disposed)throw Error('Baker disposed');return {texture:this.renderer.upload(img,repeat),aspect:img.width/img.height};}finally{img.close();}})};
  entry.ready.catch(()=>{if(this.textures.get(key)===entry)this.textures.delete(key);});this.textures.set(key,entry);
  while(this.textures.size>MAX_TEXTURES){const [oldKey,old]=this.textures.entries().next().value;this.textures.delete(oldKey);old.ready.then(t=>this.renderer?.gl.deleteTexture(t.texture),()=>{});}
  return entry.ready;}
 async bake(request){
  const start=performance.now(),renderer=this.init(),grid=gridFromGuide(request.guide),settings={...request.appearance?.settings},depth=request.appearance?.depth??1.5,projection={...GAME_PROJECTION,...request.projection},originTiles=request.guide.originTiles??{x:0,y:0};
  if(this.disposed)throw Error('Baker disposed');
  if(!Number.isFinite(originTiles.x)||!Number.isFinite(originTiles.y))throw Error('Invalid guide tile origin');
  for(const value of Object.values(projection))if(!Number.isFinite(value)||value<=0)throw Error('Invalid projection');
  if(!Number.isFinite(depth)||depth<0||depth>30)throw Error('Invalid bunker depth');
  if(!request.materials||SLOTS.some(slot=>!request.materials[slot]?.url))throw Error('Bunker bake needs a picture for every texture slot');
  const loaded=await Promise.all(SLOTS.map(slot=>this.texture(request.materials[slot],slot==='wall'))),textures=Object.fromEntries(SLOTS.map((slot,i)=>[slot,loaded[i].texture]));
  if(this.disposed)throw Error('Baker disposed');
  for(const name of ['textureScale','roughScale','firstScale','sandScale','soilScale','earthScale'])if(settings[name]!==undefined&&(!Number.isFinite(settings[name])||settings[name]<=0))throw Error('Invalid texture scale: '+name);
  for(const name of ['collar','firstCut','slope'])if(settings[name]!==undefined&&(!Number.isFinite(settings[name])||settings[name]<=0))throw Error('Invalid bank width: '+name);
  for(const name of ['wall','rim','shadow'])if(settings[name]!==undefined&&(!Number.isFinite(settings[name])||settings[name]<0))throw Error('Invalid bank appearance: '+name);
  if((settings.collar??.65)+(settings.firstCut??.9)>7.5)throw Error('Grass bands exceed the supported 15 metre combined width');
  if(request.ringsTiles){let count=0;for(const ring of request.ringsTiles){if(ring.length<6||ring.length%2||Array.from(ring).some(v=>!Number.isFinite(v)))throw Error('Invalid authoritative bunker boundary');count+=ring.length/2;}if(count>65536)throw Error('Bunker boundary is too large');}
  const depthScale=.75/Math.max(1,2*(grid.width+grid.height+32)+depth+(settings.wall??.25)+(settings.rim??.16));
  const face=Array.isArray(request.face)&&request.face.length===2&&request.face.every(Number.isFinite)&&Math.abs(Math.hypot(request.face[0],request.face[1])-1)<.01?request.face:null;
  const renderOptions={...settings,face,textures,wallAspect:loaded[4].aspect,semanticPass:Boolean(request.semanticPass),authoritativeRings:request.ringsTiles,textureOriginTiles:originTiles,depthScale};
  const terrain=renderer.prepare(grid,renderOptions);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const ring of terrain.contours)for(const [x,y]of ring){const px=(x-y)*projection.halfWidth,py=(x+y)*projection.halfHeight;minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);}
  if(!Number.isFinite(minX))throw Error('Guide contains no bunker');
  const band=(settings.collar??.65)+(settings.firstCut??.9)+.15,marginX=band*Math.SQRT2*projection.halfWidth+3,marginY=band*Math.SQRT2*projection.halfHeight+3;
  minX=Math.floor(minX-marginX);maxX=Math.ceil(maxX+marginX);minY=Math.floor(minY-marginY-(settings.rim??.16)*projection.verticalPixelsPerMetre);maxY=Math.ceil(maxY+marginY+(depth+(settings.wall??.25))*projection.verticalPixelsPerMetre);
  const worldW=maxX-minX,worldH=maxY-minY,maxEdge=Math.floor(Math.min(request.maxEdge??this.maxOutputEdge,this.maxOutputEdge)),requestedScale=request.rasterScale??.6;
  if(!Number.isFinite(maxEdge)||maxEdge<32||!Number.isFinite(requestedScale)||requestedScale<=0)throw Error('Invalid raster size');
  const rasterScale=Math.min(requestedScale,maxEdge/Math.max(worldW,worldH));
  const outputWidth=Math.min(maxEdge,Math.max(1,Math.ceil(worldW*rasterScale))),outputHeight=Math.min(maxEdge,Math.max(1,Math.ceil(worldH*rasterScale)));
  // Two samples per final pixel; expensive work only happens on an explicit bake.
  let bakeScale=Math.min(rasterScale*2,Math.sqrt(this.maxRenderPixels/(worldW*worldH)));
  let width=Math.max(1,Math.ceil(worldW*bakeScale)),height=Math.max(1,Math.ceil(worldH*bakeScale));
  while(width*height>this.maxRenderPixels){bakeScale*=Math.sqrt(this.maxRenderPixels/(width*height))*.999999;width=Math.max(1,Math.ceil(worldW*bakeScale));height=Math.max(1,Math.ceil(worldH*bakeScale));}
  const canvas=renderer.render(grid,depth,bakeScale,{x:-minX*bakeScale,y:-minY*bakeScale},Boolean(request.borderOnly),{...renderOptions,width,height,projection});
  if(renderer.gl.isContextLost()||renderer.gl.getError())throw Error('Bunker GPU bake failed');
  const out=typeof document==='undefined'?new OffscreenCanvas(outputWidth,outputHeight):document.createElement('canvas');out.width=outputWidth;out.height=outputHeight;const ctx=out.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(canvas,0,0,outputWidth,outputHeight);
  const bitmap=await createImageBitmap(out,{premultiplyAlpha:'premultiply'});
  out.width=out.height=1;
  if(this.disposed){bitmap.close();throw Error('Baker disposed');}
  const globalX=(originTiles.x-originTiles.y)*projection.halfWidth,globalY=(originTiles.x+originTiles.y)*projection.halfHeight,boundsWorldPx=[minX+globalX,minY+globalY,maxX+globalX,maxY+globalY];
  const result={image:bitmap,width:bitmap.width,height:bitmap.height,anchor:{x:-minX*rasterScale,y:-minY*rasterScale},boundsWorldPx,dirtyBoundsTiles:request.dirtyBoundsTiles,rasterScale,key:request.key,projection,worldOriginTiles:originTiles,geometryMode:request.ringsTiles?'authoritative-rings':'authored-guide',decodedBytes:bitmap.width*bitmap.height*4,bakeMs:performance.now()-start,premultipliedAlpha:true};
  return result;
 }
 dispose(){if(this.disposed)return;this.disposed=true;if(this.renderer){for(const entry of this.textures.values())entry.ready.then(t=>this.renderer?.gl.deleteTexture(t.texture),()=>{});const gl=this.renderer.gl;for(const name of['program','bladeProgram'])if(this.renderer[name])gl.deleteProgram(this.renderer[name]);for(const name of['buffer','bladeBuffer'])if(this.renderer[name])gl.deleteBuffer(this.renderer[name]);gl.getExtension('WEBGL_lose_context')?.loseContext();this.renderer.canvas.width=this.renderer.canvas.height=1;this.renderer=null;}}
}

