// Native eight-facing object delivery/import. Never guesses square-cardinal art is yaw8.
// Cut: node scripts/assets/import-object-eight.mjs --manifest INPUT.json --out NEW_VERSION_DIRECTORY
// After visual/anchor/geometry review: node scripts/assets/import-object-eight.mjs --integrate NEW_VERSION_DIRECTORY/manifest.json
// Shared pages: node scripts/assets/import-object-eight.mjs --integrate-batch TAG [--density 0.6] A/manifest.json B/manifest.json ...
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const KEYS = ['normalNE','yaw8N','normalSE','yaw8E','normalSW','yaw8S','normalNW','yaw8W'];
const LAYOUTS = { normal: ['normalSE','normalSW','normalNW','normalNE'], yaw8: ['yaw8N','yaw8E','yaw8S','yaw8W'] };
/** T398: a per-view source may name an existing library picture instead of a file ({ "reuse": "<library id>" }, the normal views only; T351: any of the four, so a set can
 *  keep the pictures the game has and add the corners it lacks): the set's normal
 *  view is then an appended alias of that picture's atlas cell (no second copy of its pixels; the old picture still draws as before: the set is runtimeReuse) */
const isReuse = v => typeof v?.reuse === 'string' && v.reuse.length > 0;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PAGE=2048,GUT=8;
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const readJSON = file => JSON.parse(fs.readFileSync(file,'utf8'));
const writeNew = (file, content) => fs.writeFileSync(file, content, { flag:'wx' });
const json = o => JSON.stringify(o,null,2)+'\n';
const assert = (ok,message) => { if (!ok) throw new Error(message); };
const positive = n => Number.isFinite(n) && n > 0;
const relative = (from,to) => path.relative(from,to).split(path.sep).join('/');
/** Read the real engine projection; diamond width is not camera pixels per metre. */
export function readGameProjection(root=ROOT) {
  const iso=fs.readFileSync(path.join(root,'src/game/iso.ts'),'utf8'),types=fs.readFileSync(path.join(root,'src/game/golf/types.ts'),'utf8');
  const scalar=(text,name)=>{const match=new RegExp(`export\\s+const\\s+${name}\\s*=\\s*([0-9]+(?:\\.[0-9]+)?)\\s*;`).exec(text);assert(match,`Cannot read engine ${name}; review object-art calibration`);return Number(match[1]);};
  const projection={HW:scalar(iso,'HW'),HH:scalar(iso,'HH'),tileMetres:scalar(types,'TILE_M')};
  assert(positive(projection.HW)&&positive(projection.HH)&&positive(projection.tileMetres),'Invalid engine projection');
  assert(Math.abs(projection.HH/projection.HW-.5)<1e-9,'Native30degree camera no longer matches engine ground foreshortening; review calibration');
  return projection;
}
/** True source camera ppm is measured before heading and pitch foreshortening. */
export function objectDisplayScale(pixelsPerMetre,projection=readGameProjection()) {
  assert(positive(pixelsPerMetre),'Positive orthographic camera pixelsPerMetre required');
  // Native X=(metresX-metresY)*ppm/sqrt(2); game X=(metresX-metresY)*HW/TILE_M.
  return Math.SQRT2*projection.HW/projection.tileMetres/pixelsPerMetre;
}
function viewCalibration(m,v) {
  assert(v.pixelsPerMetre===undefined||positive(v.pixelsPerMetre),'Invalid per-view camera pixelsPerMetre');
  if(v.pixelsPerMetre!==undefined&&v.pixelsPerMetre!==m.pixelsPerMetre)assert(typeof v.calibrationEvidence==='string'&&v.calibrationEvidence.trim().length>0,'A per-view scale override requires measured calibrationEvidence');
  return v.pixelsPerMetre??m.pixelsPerMetre;
}
function bounds(width,depth,degrees) {
  const a=degrees*Math.PI/180,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a));
  return {hx:(width*c+depth*s)/2,hy:(width*s+depth*c)/2,dx:0,dy:0};
}
export function validateInput(m) {
  assert(m.schema===1 && m.projection==='normal+yaw8','schema:1 and projection:"normal+yaw8" required; square cardinal axes are not yaw8');
  assert(typeof m.subject==='string' && m.subject.length>0 && typeof m.name==='string','subject and name required');
  assert(Number.isSafeInteger(m.version)&&m.version>0,'positive integer version required');
  assert(positive(m.footprintMetres?.width)&&positive(m.footprintMetres?.depth),'physical width/depth in metres required');
  assert(positive(m.pixelsPerMetre)&&positive(m.baselineScale),'pixelsPerMetre and baselineScale required');
  assert(m.pixelCalibrationSpace===undefined||m.pixelCalibrationSpace==='orthographic-camera','pixelsPerMetre must use the true orthographic-camera convention');
  assert(m.review==='candidate'||m.review==='approved','explicit candidate/approved review required');
  // Input manifests give path strings; integrated manifests give the cut records (objects with a file).
  assert((m.source?.normal&&m.source?.yaw8)||(m.source?.views&&KEYS.every(k=>typeof m.source.views[k]==='string'||typeof m.source.views[k]?.file==='string'||(isReuse(m.source.views[k])&&k.startsWith('normal')))),'two actual source sheets or eight per-view source files required (a normal view may name an existing library picture to reuse)');
}
/** Preserve local-metre seating only after checking real row counts, access and approval. No generated guesses unlock a facility. */
export function validateSeating(layout,capacity,footprint) {
  const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
  assert(layout?.review==='approved','Seating layout must be explicitly approved');
  assert(layout.verticalPixelsPerMetre===undefined||positive(layout.verticalPixelsPerMetre),'Invalid bench height calibration');
  assert(point(layout.front)&&Math.hypot(layout.front.x,layout.front.y)>0,'Seating facing is required');
  assert(Number.isSafeInteger(capacity)&&capacity>0,'Seating capacity is required');
  assert(Array.isArray(layout.entries)&&layout.entries.length&&layout.entries.every(point),'Seating entry anchors are required');
  assert(Array.isArray(layout.rows)&&layout.rows.length,'Seating rows are required');
  let total=0;
  for(const r of layout.rows) {
    assert(point(r.start)&&point(r.step)&&Math.hypot(r.step.x,r.step.y)>=.3&&Number.isSafeInteger(r.seats)&&r.seats>0&&Number.isFinite(r.seatHeightMetres)&&r.seatHeightMetres>=0,'Invalid seating row');
    assert(!r.front||(point(r.front)&&Math.hypot(r.front.x,r.front.y)>0),'Invalid seat bank facing');
    for(const p of [r.start,{x:r.start.x+r.step.x*(r.seats-1),y:r.start.y+r.step.y*(r.seats-1)}])assert(Math.abs(p.x)<=footprint.width/2&&Math.abs(p.y)<=footprint.depth/2,'Seating lies outside physical footprint');
    total+=r.seats;
  }
  assert(total===capacity,`Seating rows must contain exactly ${capacity} places`);
}
/** Reject repeated and horizontally mirrored native pixels, rather than counting metadata as new art. */
export function validateDistinct(images) {
  const seen=new Set();
  for(const p of images) {
    const digest=hash(Buffer.concat([Buffer.from(`${p.width},${p.height}:`),p.data]));
    assert(!seen.has(digest),`Duplicate or mirrored view: ${p.key}`);
    const mirror=Buffer.alloc(p.data.length);
    for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)p.data.copy(mirror,(y*p.width+x)*4,(y*p.width+p.width-x-1)*4,(y*p.width+p.width-x)*4);
    const flipped=hash(Buffer.concat([Buffer.from(`${p.width},${p.height}:`),mirror]));
    assert(!seen.has(flipped),`Mirrored view: ${p.key}`); seen.add(digest); seen.add(flipped);
  }
}
/** Crop one native cell (a sheet quadrant or a whole per-view file) to its alpha subject plus a 4px margin. */
async function cropCell(bytes,cellRect,key) {
  const {left,top,width:w,height:h}=cellRect,rgba=await sharp(bytes).extract({left,top,width:w,height:h}).ensureAlpha().raw().toBuffer();
  let x0=w,y0=h,x1=-1,y1=-1,clear=0,edge=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) { const alpha=rgba[(y*w+x)*4+3]; if(alpha===0)clear++; if(alpha>8){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);} if(alpha>128&&(x===0||y===0||x===w-1||y===h-1))edge++; }
  assert(x1>=x0&&clear>w*h*.01,`${key}: empty cell or opaque background`);
  // Only the opaque core counts as touching: an authored tight crop may graze the edge with antialiased pixels (alpha <= 128).
  assert(!edge,`${key}: subject touches cell boundary; review spacing before import`);
  const crop={left:Math.max(0,x0-4),top:Math.max(0,y0-4),width:Math.min(w,x1+5)-Math.max(0,x0-4),height:Math.min(h,y1+5)-Math.max(0,y0-4)};
  return {crop,data:await sharp(rgba,{raw:{width:w,height:h,channels:4}}).extract(crop).raw().toBuffer()};
}
export async function cutObject(manifestFile,out) {
  const input=readJSON(manifestFile); validateInput(input);
  assert(!fs.existsSync(out),'Output must be a new version directory; originals are never overwritten');
  const sourceDir=path.dirname(manifestFile), images=[],sources={};
  if(input.source.views) {
    // Per-view files: each whole PNG is the single cell for its key.
    for(const key of KEYS) {
      if(isReuse(input.source.views[key])){sources[key]={reuse:input.source.views[key].reuse};continue;}
      const file=path.resolve(sourceDir,input.source.views[key]),bytes=fs.readFileSync(file),meta=await sharp(bytes).metadata();
      assert(meta.format==='png'&&meta.hasAlpha,`${key}: native alpha PNG required`);
      sources[key]={file:relative(out,file),sha256:hash(bytes),width:meta.width,height:meta.height};
      const cellRect={left:0,top:0,width:meta.width,height:meta.height},{crop,data}=await cropCell(bytes,cellRect,key);
      images.push({key,family:'view',cell:0,width:crop.width,height:crop.height,data,crop,cellRect});
    }
  } else for(const family of ['normal','yaw8']) {
    const file=path.resolve(sourceDir,input.source[family]),bytes=fs.readFileSync(file),meta=await sharp(bytes).metadata();
    assert(meta.format==='png'&&meta.hasAlpha,`${family}: native alpha PNG required`);
    assert(meta.width%2===0&&meta.height%2===0,`${family}: even 2x2 sheet dimensions required`);
    sources[family]={file:relative(out,file),sha256:hash(bytes),width:meta.width,height:meta.height};
    const w=meta.width/2,h=meta.height/2;
    for(const [cell,key] of LAYOUTS[family].entries()) {
      const left=cell%2*w,top=Math.floor(cell/2)*h,cellRect={left,top,width:w,height:h},{crop,data}=await cropCell(bytes,cellRect,key);
      images.push({key,family,cell,width:crop.width,height:crop.height,data,crop,cellRect});
    }
  }
  validateDistinct(images);
  fs.mkdirSync(out,{recursive:true});
  const views={};
  for(const p of images) {
    const png=await sharp(p.data,{raw:{width:p.width,height:p.height,channels:4}}).png().toBuffer(),filename=`${p.key}.native.png`,v=input.views?.[p.key]??{},source=sources[p.family==='view'?p.key:p.family];
    writeNew(path.join(out,filename),png);
    const anchor=v.anchor?{x:v.anchor.x-p.crop.left,y:v.anchor.y-p.crop.top}:null;
    viewCalibration(input,v);
    views[p.key]={file:filename,sha256:hash(png),width:p.width,height:p.height,anchor,headingDegrees:v.headingDegrees??null,boxes:v.boxes??null,...(v.pixelsPerMetre===undefined?{}:{pixelsPerMetre:v.pixelsPerMetre,calibrationEvidence:v.calibrationEvidence}),...(v.seating?{seating:v.seating}:{}),sourceFamily:p.family,sourceSha256:source.sha256,cell:p.cell,cellRect:p.cellRect,crop:p.crop};
    writeNew(path.join(out,`${p.key}.provenance.json`),json({schema:1,subject:input.subject,version:input.version,key:p.key,source,cell:p.cell,cellRect:p.cellRect,crop:p.crop,output:filename,sha256:hash(png),operation:'native RGBA cell crop only; no flip/repaint/view synthesis',review:'candidate'}));
  }
  for(const key of KEYS)if(isReuse(sources[key])){const v=input.views?.[key]??{};views[key]={reuse:sources[key].reuse,anchor:null,headingDegrees:v.headingDegrees??null,boxes:v.boxes??null,sourceFamily:'reuse'};}
  const result={...input,pixelCalibrationSpace:'orthographic-camera',review:'candidate',source:input.source.views?{views:sources}:sources,views,artReviewRequired:['same subject across all eight views','normal and actual yaw8 geometry','upper-right daylight and lower-left shadows','true alpha and complete silhouette','per-view ground anchors and physical footprint','no duplicates or fake mirror views']};
  writeNew(path.join(out,'manifest.json'),json(result)); return result;
}
/** Shared checks and native image loading for integration: approval, seating, source hashes, reviewed views and distinct pixels. */
async function loadApproved(manifestFile,projection) {
  const m=readJSON(manifestFile); validateInput(m); assert(m.review==='approved','Only an explicitly approved manifest can enter the runtime');
  if(m.seating)validateSeating(m.seating,m.capacity,m.footprintMetres);
  for(const key of KEYS)if(m.views?.[key]?.seating)validateSeating(m.views[key].seating,m.capacity,m.footprintMetres);
  const dir=path.dirname(manifestFile),images=[],reused=[],records=m.source.views?KEYS.filter(key=>!isReuse(m.source.views[key])).map(key=>[key,m.source.views[key]]):['normal','yaw8'].map(family=>[family,m.source[family]]);
  for(const [name,source] of records) {
    assert(typeof source.file==='string'&&typeof source.sha256==='string',`${name}: native source provenance required`);
    assert(hash(fs.readFileSync(path.resolve(dir,source.file)))===source.sha256,`${name}: original source changed after cutting`);
  }
  for(const key of KEYS) {
    if(m.source.views&&isReuse(m.source.views[key])) {
      const v=m.views?.[key]; assert(v&&Number.isFinite(v.headingDegrees),`${key}: reviewed heading required`);
      const boxes=v.boxes??[bounds(m.footprintMetres.width,m.footprintMetres.depth,v.headingDegrees)];
      assert(boxes.length&&boxes.every(b=>positive(b.hx)&&positive(b.hy)&&Number.isFinite(b.dx)&&Number.isFinite(b.dy)),`${key}: invalid footprint boxes`);
      reused.push({key,reuse:m.source.views[key].reuse,v,boxes});continue;
    }
    const v=m.views?.[key]; assert(v&&positive(v.width)&&positive(v.height)&&Number.isFinite(v.anchor?.x)&&Number.isFinite(v.anchor?.y)&&Number.isFinite(v.headingDegrees),`${key}: reviewed anchor/heading and native size required`);
    viewCalibration(m,v);
    assert(v.anchor.x>=0&&v.anchor.x<=v.width&&v.anchor.y>=0&&v.anchor.y<=v.height,`${key}: ground anchor outside crop`);
    const bytes=fs.readFileSync(path.resolve(dir,v.file)); assert(hash(bytes)===v.sha256,`${key}: source hash changed after review`);
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}); assert(info.width===v.width&&info.height===v.height,`${key}: dimensions changed`);
    const boxes=v.boxes??[bounds(m.footprintMetres.width,m.footprintMetres.depth,v.headingDegrees)];
    assert(boxes.length&&boxes.every(b=>positive(b.hx)&&positive(b.hy)&&Number.isFinite(b.dx)&&Number.isFinite(b.dy)),`${key}: invalid footprint boxes`);
    images.push({key,width:info.width,height:info.height,data,bytes,v,k:objectDisplayScale(viewCalibration(m,v),projection),boxes});
  }
  validateDistinct(images); return {m,dir,images,reused};
}
function subjectTag(m) {
  const slug=m.subject.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  return `${slug}-${hash(Buffer.from(m.subject)).slice(0,8)}-v${m.version}`;
}
function setOf(m) {
  return {subject:m.subject,name:m.name,version:m.version,review:'approved',projection:'normal+yaw8',views:{},footprintMetres:m.footprintMetres,baselineScale:m.baselineScale,...(m.capacity===undefined?{}:{capacity:m.capacity}),...(m.seating?{seating:m.seating}:{}),...(m.visualTier?{visualTier:m.visualTier}:{}),...(m.eventTypes?{eventTypes:m.eventTypes}:{}),...(m.aliases?{aliases:m.aliases}:{})};
}
/** Shelf pack images (each with pw/ph) into 2048 pages in list order. Appending pages/items never moves saved indices. */
function shelfPack(list) {
  const pages=[];let pg={inputs:[],x:GUT,y:GUT,row:0};pages.push(pg);
  for(const p of list) {
    assert(p.pw+2*GUT<=PAGE&&p.ph+2*GUT<=PAGE,'Native crop exceeds atlas page; provide a reviewed smaller sheet');
    if(pg.x+p.pw+GUT>PAGE){pg.x=GUT;pg.y+=pg.row+GUT;pg.row=0;}
    if(pg.y+p.ph+GUT>PAGE){pg={inputs:[],x:GUT,y:GUT,row:0};pages.push(pg);}
    p.page=pages.length-1;p.left=pg.x;p.top=pg.y;pg.inputs.push(p);pg.x+=p.pw+GUT;pg.row=Math.max(pg.row,p.ph);
  }
  return pages;
}
/** Ledger items for one set; tex points at the packed rectangle, quad keeps the native display size. */
function registerItems(ledger,set,m,tag,images,base,reused=[]) {
  for(const r of reused) {
    const id=`object8:${tag}:${r.key}`;
    set.views[r.key]={id,headingDegrees:r.v.headingDegrees,boxes:r.boxes};(set.sourceIds??={})[r.key]=r.reuse;set.runtimeReuse=true;
    ledger.items.push({id,name:`${m.name} (${r.key})`,cat:m.category??'New: Objects',boxes:r.boxes,reuse:r.reuse});
  }
  for(const p of images) {
    const id=`object8:${tag}:${p.key}`,v=p.v,k=p.k,boxes=p.boxes;
    set.views[p.key]={id,headingDegrees:v.headingDegrees,boxes,...(v.seating?{seating:v.seating}:{})};
    ledger.items.push({id,name:`${m.name} (${p.key})`,cat:m.category??'New: Objects',kind:m.kind??'decor',w:p.width*k,h:p.height*k,ax:v.anchor.x*k,ay:v.anchor.y*k,boxes,solid:m.solid??2,big:m.kind==='building',door:false,cost:m.cost??0,tex:[base+p.page,p.left/PAGE,p.top/PAGE,(p.left+p.pw)/PAGE,(p.top+p.ph)/PAGE],quad:[0,0,p.width*k,p.height*k]});
  }
}
function calibrationOf(m,images,projection,density) {
  return {schema:1,space:'orthographic-camera',engineProjection:projection,targetCameraPixelsPerMetre:Math.SQRT2*projection.HW/projection.tileMetres,sourcePixelsPerMetre:m.pixelsPerMetre,views:Object.fromEntries(images.map(p=>[p.key,{sourcePixelsPerMetre:viewCalibration(m,p.v),displayScale:p.k,anchorSourcePixels:p.v.anchor,...(p.v.calibrationEvidence?{measurement:p.v.calibrationEvidence}:{}),...(p.r===undefined?{}:{atlasResize:p.r})}])),...(density===undefined?{}:{atlasDensity:density})};
}
/** Write each page as five lossless mips and append their file lists to the ledger. */
async function writePages(pages,assetDir,root,ledger) {
  for(const [i,page] of pages.entries()) {
    const full=await sharp({create:{width:PAGE,height:PAGE,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(page.inputs.map(p=>({input:p.bytes,left:p.left,top:p.top}))).png().toBuffer(),files=[];
    for(let mip=0;mip<5;mip++){const file=path.join(assetDir,`page-${i}-${mip}.webp`);await sharp(full).resize(PAGE>>mip,PAGE>>mip).webp({lossless:true}).toFile(file);files.push(relative(path.join(root,'src/game'),file));}
    ledger.pages.push(files);
  }
}
/** Regenerate the dedicated library module from the append-only registry. */
function writeLibrary(ledger,root,ledgerFile) {
  const imports=ledger.pages.flatMap((p,i)=>p.map((file,j)=>`import p${i}m${j} from ${JSON.stringify(file.startsWith('.')?file:'./'+file)};`));
  const code=["// Generated by import-object-eight.mjs; append-only rows preserve saved indices.","import type { LibItem } from './types';","import type { ObjectEightSet } from './object-eight-types';","import { appendExistingObjectEight, EXISTING_OBJECT_EIGHT_SETS } from './object-eight-existing';",...imports,`const NATIVE_OBJECT_EIGHT_SETS: readonly ObjectEightSet[] = ${JSON.stringify(ledger.sets)};`,`export const OBJECT_EIGHT_SETS: readonly ObjectEightSet[] = [...EXISTING_OBJECT_EIGHT_SETS, ...NATIVE_OBJECT_EIGHT_SETS];`,`/** a reused view (T398): an alias of an existing library picture's atlas cell, resolved in place when the library is built */`,`interface ReuseItem { id: string; name: string; cat: string; boxes: LibItem['boxes']; reuse: string }`,`const ITEMS: (LibItem | ReuseItem)[] = ${JSON.stringify(ledger.items)};`,`const PAGES: string[][] = [${ledger.pages.map((p,i)=>'['+p.map((_,j)=>`p${i}m${j}`).join(',')+']').join(',')}];`,`export function appendObjectEight(library: LibItem[], pages: string[][]): void {`,`  appendExistingObjectEight(library); const base=pages.length; pages.push(...PAGES); const by=new Map(library.map(i=>[i.id,i]));`,`  for(const item of ITEMS) {`,`    if('reuse' in item) { const src=by.get(item.reuse); if(src) library.push({...src,id:item.id,name:item.name,cat:item.cat,boxes:item.boxes}); continue; }`,`    library.push({...item,tex:[base+item.tex[0],...item.tex.slice(1)] as LibItem['tex']});`,`  }`,`}`, ''].join('\n');
  fs.writeFileSync(ledgerFile,json(ledger));fs.writeFileSync(path.join(root,'src/game/object-eight-library.ts'),code);
}
export async function integrateObject(manifestFile,root=ROOT) {
  const projection=readGameProjection(),{m,images,reused}=await loadApproved(manifestFile,projection);
  const ledgerFile=path.join(root,'scripts/assets/object-eight-registry.json'),ledger=fs.existsSync(ledgerFile)?readJSON(ledgerFile):{schema:1,sets:[],items:[],pages:[]};
  assert(!ledger.sets.some(s=>s.subject===m.subject&&s.version===m.version),'This version is already registered; use a new reviewed version');
  const tag=subjectTag(m),assetDir=path.join(root,'src/assets/object-eight',tag);
  assert(!fs.existsSync(assetDir),'Versioned asset directory exists; do not overwrite'); fs.mkdirSync(assetDir,{recursive:true});
  const set=setOf(m);
  for(const p of images)p.pw=p.width,p.ph=p.height;
  const pages=shelfPack(images),base=ledger.pages.length;
  registerItems(ledger,set,m,tag,images,base,reused);
  writeNew(path.join(assetDir,'calibration.json'),json(calibrationOf(m,images,projection)));
  await writePages(pages,assetDir,root,ledger);
  ledger.sets.push(set);
  writeLibrary(ledger,root,ledgerFile);return set;
}
/** Several approved subjects share 2048 pages. Cells are stored at min(1, density x display scale); display size and anchors are unchanged. */
export async function integrateObjects(manifestFiles,{root=ROOT,tag,density=.6}={}) {
  assert(typeof tag==='string'&&/^[a-z0-9-]+$/.test(tag),'Batch tag must use lowercase letters, digits and hyphens');
  assert(positive(density),'Positive atlas density required');
  const assetDir=path.join(root,'src/assets/object-eight',`${tag}-v1`);
  assert(!fs.existsSync(assetDir),'Batch asset directory exists; do not overwrite');
  const projection=readGameProjection(),ledgerFile=path.join(root,'scripts/assets/object-eight-registry.json'),ledger=fs.existsSync(ledgerFile)?readJSON(ledgerFile):{schema:1,sets:[],items:[],pages:[]};
  const sets=[],seen=new Set(),cells=[];
  for(const file of manifestFiles) {
    const {m,images,reused}=await loadApproved(file,projection),id=`${m.subject}#${m.version}`;
    assert(!seen.has(id),`Duplicate subject version in batch: ${id}`);seen.add(id);
    assert(!ledger.sets.some(s=>s.subject===m.subject&&s.version===m.version),`${id}: already registered; use a new reviewed version`);
    for(const p of images) {
      p.r=Math.min(1,density*p.k);p.pw=Math.max(1,Math.round(p.width*p.r));p.ph=Math.max(1,Math.round(p.height*p.r));
      p.bytes=await sharp(p.bytes).resize(p.pw,p.ph,{kernel:'lanczos3',fit:'fill'}).png().toBuffer();cells.push(p);
    }
    sets.push({m,images,reused,tag:subjectTag(m),set:setOf(m)});
  }
  cells.sort((a,b)=>b.ph-a.ph);
  const pages=shelfPack(cells),base=ledger.pages.length;
  fs.mkdirSync(assetDir,{recursive:true});
  for(const s of sets) {
    registerItems(ledger,s.set,s.m,s.tag,s.images,base,s.reused);
    writeNew(path.join(assetDir,`${s.tag}.calibration.json`),json(calibrationOf(s.m,s.images,projection,density)));
    ledger.sets.push(s.set);
  }
  await writePages(pages,assetDir,root,ledger);
  writeLibrary(ledger,root,ledgerFile);
  return sets.map(s=>s.set);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const a=process.argv.slice(2),get=k=>a[a.indexOf(k)+1];
  try{
    if(a.includes('--integrate-batch')){const tag=get('--integrate-batch'),sets=await integrateObjects(a.filter(x=>x.endsWith('.json')).map(x=>path.resolve(x)),{tag,density:a.includes('--density')?Number(get('--density')):undefined}),pages=fs.readdirSync(path.join(ROOT,'src/assets/object-eight',`${tag}-v1`)).filter(f=>/^page-\d+-0\.webp$/.test(f)).length;console.log(`Imported ${sets.length} sets into ${tag}: ${pages} shared pages`);}
    else if(a.includes('--integrate')){const s=await integrateObject(path.resolve(get('--integrate')));console.log(`Imported ${s.subject} v${s.version}: eight reviewed native facings`);}else{assert(a.includes('--manifest')&&a.includes('--out'),'Use --manifest FILE --out NEW_DIRECTORY or --integrate MANIFEST');const m=await cutObject(path.resolve(get('--manifest')),path.resolve(get('--out')));console.log(`Cut ${m.subject}: eight candidate views; review anchors, geometry and imagery before integration`);}
  }catch(e){console.error(e.message);process.exitCode=1;}
}
