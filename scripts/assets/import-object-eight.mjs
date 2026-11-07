// Native eight-facing object delivery/import. Never guesses square-cardinal art is yaw8.
// Cut: node scripts/assets/import-object-eight.mjs --manifest INPUT.json --out NEW_VERSION_DIRECTORY
// After visual/anchor/geometry review: node scripts/assets/import-object-eight.mjs --integrate NEW_VERSION_DIRECTORY/manifest.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const KEYS = ['normalNE','yaw8N','normalSE','yaw8E','normalSW','yaw8S','normalNW','yaw8W'];
const LAYOUTS = { normal: ['normalSE','normalSW','normalNW','normalNE'], yaw8: ['yaw8N','yaw8E','yaw8S','yaw8W'] };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const readJSON = file => JSON.parse(fs.readFileSync(file,'utf8'));
const writeNew = (file, content) => fs.writeFileSync(file, content, { flag:'wx' });
const json = o => JSON.stringify(o,null,2)+'\n';
const assert = (ok,message) => { if (!ok) throw new Error(message); };
const positive = n => Number.isFinite(n) && n > 0;
const relative = (from,to) => path.relative(from,to).split(path.sep).join('/');
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
  assert(m.review==='candidate'||m.review==='approved','explicit candidate/approved review required');
  assert(m.source?.normal&&m.source?.yaw8,'two actual source sheets required');
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
export async function cutObject(manifestFile,out) {
  const input=readJSON(manifestFile); validateInput(input);
  assert(!fs.existsSync(out),'Output must be a new version directory; originals are never overwritten');
  const sourceDir=path.dirname(manifestFile), images=[],sources={};
  for(const family of ['normal','yaw8']) {
    const file=path.resolve(sourceDir,input.source[family]),bytes=fs.readFileSync(file),meta=await sharp(bytes).metadata();
    assert(meta.format==='png'&&meta.hasAlpha,`${family}: native alpha PNG required`);
    assert(meta.width%2===0&&meta.height%2===0,`${family}: even 2x2 sheet dimensions required`);
    sources[family]={file:relative(out,file),sha256:hash(bytes),width:meta.width,height:meta.height};
    const w=meta.width/2,h=meta.height/2;
    for(const [cell,key] of LAYOUTS[family].entries()) {
      const left=cell%2*w,top=Math.floor(cell/2)*h;
      const rgba=await sharp(bytes).extract({left,top,width:w,height:h}).ensureAlpha().raw().toBuffer();
      let x0=w,y0=h,x1=-1,y1=-1,clear=0;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++) { const alpha=rgba[(y*w+x)*4+3]; if(alpha===0)clear++; if(alpha>8){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);} }
      assert(x1>=x0&&clear>w*h*.01,`${key}: empty cell or opaque background`);
      assert(x0>0&&y0>0&&x1<w-1&&y1<h-1,`${key}: subject touches cell boundary; review spacing before import`);
      const crop={left:Math.max(0,x0-4),top:Math.max(0,y0-4),width:Math.min(w,x1+5)-Math.max(0,x0-4),height:Math.min(h,y1+5)-Math.max(0,y0-4)};
      const p=await sharp(rgba,{raw:{width:w,height:h,channels:4}}).extract(crop).raw().toBuffer();
      images.push({key,family,cell,width:crop.width,height:crop.height,data:p,crop,cellRect:{left,top,width:w,height:h}});
    }
  }
  validateDistinct(images);
  fs.mkdirSync(out,{recursive:true});
  const views={};
  for(const p of images) {
    const png=await sharp(p.data,{raw:{width:p.width,height:p.height,channels:4}}).png().toBuffer(),filename=`${p.key}.native.png`,v=input.views?.[p.key]??{};
    writeNew(path.join(out,filename),png);
    const anchor=v.anchor?{x:v.anchor.x-p.crop.left,y:v.anchor.y-p.crop.top}:null;
    views[p.key]={file:filename,sha256:hash(png),width:p.width,height:p.height,anchor,headingDegrees:v.headingDegrees??null,boxes:v.boxes??null,sourceFamily:p.family,sourceSha256:sources[p.family].sha256,cell:p.cell,cellRect:p.cellRect,crop:p.crop};
    writeNew(path.join(out,`${p.key}.provenance.json`),json({schema:1,subject:input.subject,version:input.version,key:p.key,source:sources[p.family],cell:p.cell,cellRect:p.cellRect,crop:p.crop,output:filename,sha256:hash(png),operation:'native RGBA cell crop only; no flip/repaint/view synthesis',review:'candidate'}));
  }
  const result={...input,review:'candidate',source:sources,views,artReviewRequired:['same subject across all eight views','normal and actual yaw8 geometry','upper-right daylight and lower-left shadows','true alpha and complete silhouette','per-view ground anchors and physical footprint','no duplicates or fake mirror views']};
  writeNew(path.join(out,'manifest.json'),json(result)); return result;
}
export async function integrateObject(manifestFile,root=ROOT) {
  const m=readJSON(manifestFile); validateInput(m); assert(m.review==='approved','Only an explicitly approved manifest can enter the runtime');
  const dir=path.dirname(manifestFile),images=[];
  for (const family of ['normal','yaw8']) {
    const source=m.source[family];assert(typeof source.file==='string'&&typeof source.sha256==='string',`${family}: native source provenance required`);
    assert(hash(fs.readFileSync(path.resolve(dir,source.file)))===source.sha256,`${family}: original source changed after cutting`);
  }
  for(const key of KEYS) {
    const v=m.views?.[key]; assert(v&&positive(v.width)&&positive(v.height)&&Number.isFinite(v.anchor?.x)&&Number.isFinite(v.anchor?.y)&&Number.isFinite(v.headingDegrees),`${key}: reviewed anchor/heading and native size required`);
    assert(v.anchor.x>=0&&v.anchor.x<=v.width&&v.anchor.y>=0&&v.anchor.y<=v.height,`${key}: ground anchor outside crop`);
    const bytes=fs.readFileSync(path.resolve(dir,v.file)); assert(hash(bytes)===v.sha256,`${key}: source hash changed after review`);
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}); assert(info.width===v.width&&info.height===v.height,`${key}: dimensions changed`);
    images.push({key,width:info.width,height:info.height,data,bytes,v});
  }
  validateDistinct(images);
  const ledgerFile=path.join(root,'scripts/assets/object-eight-registry.json'),ledger=fs.existsSync(ledgerFile)?readJSON(ledgerFile):{schema:1,sets:[],items:[],pages:[]};
  assert(!ledger.sets.some(s=>s.subject===m.subject&&s.version===m.version),'This version is already registered; use a new reviewed version');
  const slug=m.subject.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),tag=`${slug}-${hash(Buffer.from(m.subject)).slice(0,8)}-v${m.version}`,assetDir=path.join(root,'src/assets/object-eight',tag);
  assert(!fs.existsSync(assetDir),'Versioned asset directory exists; do not overwrite'); fs.mkdirSync(assetDir,{recursive:true});
  const set={subject:m.subject,name:m.name,version:m.version,review:'approved',projection:'normal+yaw8',views:{},footprintMetres:m.footprintMetres,baselineScale:m.baselineScale,...(m.capacity===undefined?{}:{capacity:m.capacity}),...(m.visualTier?{visualTier:m.visualTier}:{}),...(m.eventTypes?{eventTypes:m.eventTypes}:{}),...(m.aliases?{aliases:m.aliases}:{})};
  // Shelf pack this immutable version into 2048 pages. Appending pages/items never moves saved indices.
  const PAGE=2048,GUT=8,pages=[];let pg={inputs:[],x:GUT,y:GUT,row:0};pages.push(pg);
  for(const p of images) {
    assert(p.width+2*GUT<=PAGE&&p.height+2*GUT<=PAGE,'Native crop exceeds atlas page; provide a reviewed smaller sheet');
    if(pg.x+p.width+GUT>PAGE){pg.x=GUT;pg.y+=pg.row+GUT;pg.row=0;}
    if(pg.y+p.height+GUT>PAGE){pg={inputs:[],x:GUT,y:GUT,row:0};pages.push(pg);}
    p.page=pages.length-1;p.left=pg.x;p.top=pg.y;pg.inputs.push(p);pg.x+=p.width+GUT;pg.row=Math.max(pg.row,p.height);
    const id=`object8:${tag}:${p.key}`,k=64/m.pixelsPerMetre,v=p.v,boxes=v.boxes??[bounds(m.footprintMetres.width,m.footprintMetres.depth,v.headingDegrees)];
    assert(boxes.length&&boxes.every(b=>positive(b.hx)&&positive(b.hy)&&Number.isFinite(b.dx)&&Number.isFinite(b.dy)),`${p.key}: invalid footprint boxes`);
    set.views[p.key]={id,headingDegrees:v.headingDegrees,boxes};
    ledger.items.push({id,name:`${m.name} (${p.key})`,cat:m.category??'New: Objects',kind:m.kind??'decor',w:p.width*k,h:p.height*k,ax:v.anchor.x*k,ay:v.anchor.y*k,boxes,solid:m.solid??2,big:m.kind==='building',door:false,cost:m.cost??0,tex:[ledger.pages.length+p.page,p.left/PAGE,p.top/PAGE,(p.left+p.width)/PAGE,(p.top+p.height)/PAGE],quad:[0,0,p.width*k,p.height*k]});
  }
  for(const [i,page] of pages.entries()) {
    const full=await sharp({create:{width:PAGE,height:PAGE,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(page.inputs.map(p=>({input:p.bytes,left:p.left,top:p.top}))).png().toBuffer(),files=[];
    for(let mip=0;mip<5;mip++){const file=path.join(assetDir,`page-${i}-${mip}.webp`);await sharp(full).resize(PAGE>>mip,PAGE>>mip).webp({lossless:true}).toFile(file);files.push(relative(path.join(root,'src/game'),file));}
    ledger.pages.push(files);
  }
  ledger.sets.push(set);
  const imports=ledger.pages.flatMap((p,i)=>p.map((file,j)=>`import p${i}m${j} from ${JSON.stringify(file.startsWith('.')?file:'./'+file)};`));
  const code=["// Generated by import-object-eight.mjs; append-only rows preserve saved indices.","import type { LibItem } from './types';","import type { ObjectEightSet } from './object-eight-types';","import { appendExistingObjectEight, EXISTING_OBJECT_EIGHT_SETS } from './object-eight-existing';",...imports,`export const OBJECT_EIGHT_SETS: readonly ObjectEightSet[] = [...EXISTING_OBJECT_EIGHT_SETS, ...${JSON.stringify(ledger.sets)}];`,`const ITEMS: LibItem[] = ${JSON.stringify(ledger.items)};`,`const PAGES: string[][] = [${ledger.pages.map((p,i)=>'['+p.map((_,j)=>`p${i}m${j}`).join(',')+']').join(',')}];`,`export function appendObjectEight(library: LibItem[], pages: string[][]): void { appendExistingObjectEight(library); const base=pages.length; pages.push(...PAGES); for(const item of ITEMS) library.push({...item,tex:[base+item.tex[0],...item.tex.slice(1)] as LibItem['tex']}); }`, ''].join('\n');
  fs.writeFileSync(ledgerFile,json(ledger));fs.writeFileSync(path.join(root,'src/game/object-eight-library.ts'),code);return set;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const a=process.argv.slice(2),get=k=>a[a.indexOf(k)+1];
  try{if(a.includes('--integrate')){const s=await integrateObject(path.resolve(get('--integrate')));console.log(`Imported ${s.subject} v${s.version}: eight reviewed native facings`);}else{assert(a.includes('--manifest')&&a.includes('--out'),'Use --manifest FILE --out NEW_DIRECTORY or --integrate MANIFEST');const m=await cutObject(path.resolve(get('--manifest')),path.resolve(get('--out')));console.log(`Cut ${m.subject}: eight candidate views; review anchors, geometry and imagery before integration`);}}catch(e){console.error(e.message);process.exitCode=1;}
}
