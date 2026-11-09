import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { transformSync } from 'esbuild';
import ts from 'typescript';
import { KEYS, cutObject, integrateObject, integrateObjects, validateDistinct, validateSeating, readGameProjection, objectDisplayScale } from './import-object-eight.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const parent=path.join(root,'output'); fs.mkdirSync(parent,{recursive:true});
test('true 44px/m camera ground segments map to the actual game projection at every facing',async()=>{
  const projection=readGameProjection(),sourcePpm=44,k=objectDisplayScale(sourcePpm,projection);
  // Execute the actual engine projection functions, rather than duplicating their formula as the expected result.
  const compiled=transformSync(fs.readFileSync(path.join(root,'src/game/iso.ts'),'utf8'),{loader:'ts',format:'esm'}).code;
  const engine=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const corners=[[-6,-4],[6,-4],[6,4],[-6,4]],near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
  for(const degrees of [0,37,90,127,180,217,270,307]){
    const a=degrees*Math.PI/180,painted=[],expected=[];
    for(const [x,y]of corners){
      const wx=x*Math.cos(a)-y*Math.sin(a),wy=x*Math.sin(a)+y*Math.cos(a);
      const native=[(wx-wy)/Math.SQRT2*sourcePpm,(wx+wy)/Math.SQRT2*.5*sourcePpm];
      const game=[engine.worldX(wx/projection.tileMetres,wy/projection.tileMetres),engine.worldY(wx/projection.tileMetres,wy/projection.tileMetres)];
      near(native[0]*k,game[0]);near(native[1]*k,game[1]);painted.push(native.map(v=>v*k));expected.push(game);
    }
    for(let axis=0;axis<2;axis++){const span=pts=>Math.max(...pts.map(p=>p[axis]))-Math.min(...pts.map(p=>p[axis]));near(span(painted),span(expected));}
    if(degrees===0){near(Math.max(...painted.map(p=>p[0]))-Math.min(...painted.map(p=>p[0])),640);near(Math.max(...painted.map(p=>p[1]))-Math.min(...painted.map(p=>p[1])),320);}
  }
  near(k,45.254833995939045/44);
  assert.throws(()=>objectDisplayScale(0),/Positive/);
});
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(parent,'object-eight-test-'));
  t.after(()=>{ assert.ok(path.resolve(dir).startsWith(path.resolve(parent)+path.sep));fs.rmSync(dir,{recursive:true,force:true}); });return dir;
}
async function sheet(file,offset=0) {
  const W=128,H=128,data=Buffer.alloc(W*H*4);
  for(let cell=0;cell<4;cell++) { const ox=cell%2*64+10,oy=Math.floor(cell/2)*64+10,n=cell+offset;
    for(let y=0;y<20+n;y++)for(let x=0;x<15+n;x++)if(x<5||y>10){const k=((oy+y)*W+ox+x)*4;data[k]=40+n*20;data[k+1]=90+n*5;data[k+2]=170-n*10;data[k+3]=255;}
  }
  await sharp(data,{raw:{width:W,height:H,channels:4}}).png().toFile(file);
}
test('native two-sheet importer keeps sources, holds candidates and appends reviewed runtime IDs',async t=>{
  const dir=fixture(t);await sheet(path.join(dir,'normal.png'));await sheet(path.join(dir,'yaw8.png'),4);
  const seating={review:'approved',front:{x:0,y:1},rows:[{start:{x:-.5,y:0},step:{x:1,y:0},seats:2,seatHeightMetres:.45}],entries:[{x:-3,y:2}]};
  const input={schema:1,projection:'normal+yaw8',subject:'test:stand',name:'Test stand',version:1,review:'candidate',source:{normal:'normal.png',yaw8:'yaw8.png'},pixelsPerMetre:16,baselineScale:1,footprintMetres:{width:8,depth:4},eventTypes:['standS'],visualTier:'worn',capacity:2,seating,views:{normalNE:{seating:{...seating,entries:[{x:3,y:2}]}}}};
  const inputFile=path.join(dir,'input.json');fs.writeFileSync(inputFile,JSON.stringify(input));
  const out=path.join(dir,'v1');const result=await cutObject(inputFile,out);assert.equal(Object.keys(result.views).length,8);assert.equal(result.review,'candidate');
  assert.equal(result.views.normalNE.cell,3);assert.equal(result.views.yaw8N.cell,0);assert.equal(result.views.yaw8W.cell,3);
  await assert.rejects(()=>cutObject(inputFile,out),/new version/);
  const candidate=path.join(out,'manifest.json');await assert.rejects(()=>integrateObject(candidate,dir),/approved/);
  result.review='approved';for(const [i,key]of KEYS.entries()){const v=result.views[key];v.anchor={x:v.width/2,y:v.height-5};v.headingDegrees=i%2?i*45-8:i*45;}
  fs.mkdirSync(path.join(dir,'scripts/assets'),{recursive:true});fs.mkdirSync(path.join(dir,'src/game'),{recursive:true});fs.writeFileSync(candidate,JSON.stringify(result));
  result.views.normalNE.pixelsPerMetre=32;fs.writeFileSync(candidate,JSON.stringify(result));
  await assert.rejects(()=>integrateObject(candidate,dir),/calibrationEvidence/);
  result.views.normalNE.calibrationEvidence='Synthetic fixture calibration:32camera pixels per metre, independent of its global16px/m default.';fs.writeFileSync(candidate,JSON.stringify(result));
  const imported=await integrateObject(candidate,dir);assert.equal(imported.projection,'normal+yaw8');assert.equal(new Set(Object.values(imported.views).map(v=>v.id)).size,8);
  assert.deepEqual(imported.seating,seating);assert.deepEqual(imported.views.normalNE.seating,input.views.normalNE.seating);
  const ledger=JSON.parse(fs.readFileSync(path.join(dir,'scripts/assets/object-eight-registry.json'),'utf8'));assert.equal(ledger.items.length,8);assert.equal(ledger.items[0].tex[0],0);
  const row=ledger.items.find(i=>i.id===imported.views.normalNE.id),view=result.views.normalNE;assert.equal(row.w,view.width*objectDisplayScale(32));assert.equal(row.ax,view.anchor.x*objectDisplayScale(32));
  const calibration=JSON.parse(fs.readFileSync(path.join(path.dirname(path.resolve(dir,'src/game',ledger.pages[0][0])),'calibration.json'),'utf8'));
  assert.equal(calibration.space,'orthographic-camera');assert.equal(calibration.engineProjection.tileMetres,2);assert.equal(calibration.views.normalNE.sourcePixelsPerMetre,32);
  assert.ok(fs.readFileSync(path.join(dir,'src/game/object-eight-library.ts'),'utf8').includes('appendObjectEight'));
  // Compile the emitted module against the real facing/seating contract. A spread
  // of untyped inline objects widens review/projection and fails only on first import.
  const game=path.join(dir,'src/game');fs.mkdirSync(path.join(game,'golf'),{recursive:true});
  fs.copyFileSync(path.join(root,'src/game/object-eight-types.ts'),path.join(game,'object-eight-types.ts'));
  fs.copyFileSync(path.join(root,'src/game/golf/event-seating.ts'),path.join(game,'golf/event-seating.ts'));
  fs.writeFileSync(path.join(game,'types.ts'),"export interface Box {hx:number;hy:number;dx:number;dy:number}\nexport interface LibItem {tex:[number,number,number,number,number];[key:string]:unknown}\n");
  fs.writeFileSync(path.join(game,'object-eight-existing.ts'),"import type {LibItem} from './types';import type {ObjectEightSet} from './object-eight-types';export declare const EXISTING_OBJECT_EIGHT_SETS:readonly ObjectEightSet[];export declare function appendExistingObjectEight(items:LibItem[]):void;\n");
  fs.writeFileSync(path.join(game,'assets.d.ts'),"declare module '*.webp' {const src:string;export default src;}\n");
  const program=ts.createProgram([path.join(game,'object-eight-library.ts'),path.join(game,'assets.d.ts')],{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noEmit:true,skipLibCheck:true,types:[]});
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[]);
  await assert.rejects(()=>integrateObject(candidate,dir),/already registered/);
  assert.ok(fs.existsSync(path.join(dir,'normal.png'))&&fs.existsSync(path.join(out,'normalNE.native.png')));
});
test('seating metadata rejects draft, wrong capacity, missing access and rows outside the structure',()=>{
  const layout={review:'approved',front:{x:0,y:1},rows:[{start:{x:-.5,y:0},step:{x:1,y:0},seats:2,seatHeightMetres:.45}],entries:[{x:-3,y:2}]};
  const foot={width:8,depth:4};
  assert.doesNotThrow(()=>validateSeating(layout,2,foot));
  assert.throws(()=>validateSeating({...layout,review:'draft'},2,foot),/approved/);
  assert.throws(()=>validateSeating(layout,24,foot),/exactly 24/);
  assert.throws(()=>validateSeating({...layout,entries:[]},2,foot),/entry/);
  assert.throws(()=>validateSeating({...layout,rows:[{...layout.rows[0],start:{x:5,y:0}}]},2,foot),/footprint/);
});
test('opaque sheets, duplicates and mirrored sources are rejected before they can count as eight',async t=>{
  const dir=fixture(t);await sharp({create:{width:128,height:128,channels:4,background:'#234567'}}).png().toFile(path.join(dir,'opaque.png'));
  const input={schema:1,projection:'normal+yaw8',subject:'test:bad',name:'Bad',version:1,review:'candidate',source:{normal:'opaque.png',yaw8:'opaque.png'},pixelsPerMetre:16,baselineScale:1,footprintMetres:{width:8,depth:4}};
  const file=path.join(dir,'input.json');fs.writeFileSync(file,JSON.stringify(input));await assert.rejects(()=>cutObject(file,path.join(dir,'bad')),/opaque background/);
  const data=Buffer.from([1,2,3,255,4,5,6,255]);assert.throws(()=>validateDistinct([{key:'a',width:2,height:1,data},{key:'b',width:2,height:1,data:Buffer.from([4,5,6,255,1,2,3,255])}]),/Duplicate|mirrored/);
});
/** One distinct asymmetric alpha view per key: size, colour and a left stripe differ, so no two are mirrors. */
async function viewPng(file,i) {
  const W=48+i*2,H=40+i,data=Buffer.alloc(W*H*4);
  for(let y=8;y<H-8;y++)for(let x=8;x<W-8;x++)if(x<12+i||y>H/2){const k=(y*W+x)*4;data[k]=30+i*25;data[k+1]=200-i*15;data[k+2]=90+i*10;data[k+3]=255;}
  await sharp(data,{raw:{width:W,height:H,channels:4}}).png().toFile(file);
}
test('per-view source files cut as whole cells, and a changed original blocks integration',async t=>{
  const dir=fixture(t),views={};
  for(const [i,key] of KEYS.entries()){views[key]=`${key}.png`;await viewPng(path.join(dir,views[key]),i);}
  const input={schema:1,projection:'normal+yaw8',subject:'test:views',name:'Per-view test',version:1,review:'candidate',source:{views},pixelsPerMetre:16,baselineScale:1,footprintMetres:{width:8,depth:4}};
  const inputFile=path.join(dir,'input.json');fs.writeFileSync(inputFile,JSON.stringify(input));
  const out=path.join(dir,'v1');const result=await cutObject(inputFile,out);
  assert.equal(Object.keys(result.views).length,8);assert.equal(Object.keys(result.source.views).length,8);
  assert.equal(new Set(KEYS.map(k=>result.views[k].sha256)).size,8);
  assert.deepEqual(result.views.normalNE.cellRect,{left:0,top:0,width:48,height:40});assert.deepEqual(result.views.normalNE.crop,{left:4,top:4,width:40,height:32});
  assert.equal(result.views.normalNE.cell,0);assert.equal(result.views.normalNE.sourceFamily,'view');
  const candidate=path.join(out,'manifest.json');
  result.review='approved';for(const [i,key]of KEYS.entries()){const v=result.views[key];v.anchor={x:v.width/2,y:v.height-5};v.headingDegrees=i*45;}
  fs.mkdirSync(path.join(dir,'scripts/assets'),{recursive:true});fs.mkdirSync(path.join(dir,'src/game'),{recursive:true});
  fs.writeFileSync(candidate,JSON.stringify(result));
  const imported=await integrateObject(candidate,dir);assert.equal(new Set(Object.values(imported.views).map(v=>v.id)).size,8);
  await viewPng(path.join(dir,'normalNE.png'),3);
  await assert.rejects(()=>integrateObject(candidate,dir),/normalNE: original source changed after cutting/);
});
/** Cut one per-view subject and mark it approved with explicit anchors and headings. */
async function approvedViewSet(dir,name,subject) {
  const src=path.join(dir,name);fs.mkdirSync(src,{recursive:true});const views={};
  for(const [i,key] of KEYS.entries()){views[key]=`${key}.png`;await viewPng(path.join(src,views[key]),i);}
  const input={schema:1,projection:'normal+yaw8',subject,name,version:1,review:'candidate',source:{views},pixelsPerMetre:44,pixelCalibrationSpace:'orthographic-camera',baselineScale:1,footprintMetres:{width:8,depth:4}};
  const inputFile=path.join(src,'input.json');fs.writeFileSync(inputFile,JSON.stringify(input));
  const out=path.join(src,'v1');const result=await cutObject(inputFile,out);
  result.review='approved';for(const [i,key]of KEYS.entries()){const v=result.views[key];v.anchor={x:v.width/2,y:v.height-5};v.headingDegrees=i*45;}
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result));return path.join(out,'manifest.json');
}
test('batch integration packs several per-view subjects into shared pages at atlas density',async t=>{
  const dir=fixture(t);const a=await approvedViewSet(dir,'a','test:batch-a'),b=await approvedViewSet(dir,'b','test:batch-b');
  fs.mkdirSync(path.join(dir,'scripts/assets'),{recursive:true});fs.mkdirSync(path.join(dir,'src/game'),{recursive:true});
  await assert.rejects(()=>integrateObjects([a],{root:dir,tag:'Bad Tag'}),/lowercase/);
  const sets=await integrateObjects([a,b],{root:dir,tag:'batch'});
  assert.equal(sets.length,2);
  const assetDir=path.join(dir,'src/assets/object-eight/batch-v1'),files=fs.readdirSync(assetDir);
  assert.equal(files.filter(f=>/^page-\d+-0\.webp$/.test(f)).length,1);assert.equal(files.filter(f=>f.endsWith('.calibration.json')).length,2);
  const ledger=JSON.parse(fs.readFileSync(path.join(dir,'scripts/assets/object-eight-registry.json'),'utf8'));
  assert.equal(ledger.pages.length,1);assert.equal(ledger.items.length,16);
  const lib=fs.readFileSync(path.join(dir,'src/game/object-eight-library.ts'),'utf8');
  for(const s of sets)assert.ok(lib.includes(`"subject":"${s.subject}"`));
  const k=objectDisplayScale(44),native=JSON.parse(fs.readFileSync(a,'utf8')).views.normalNE,item=ledger.items.find(i=>i.id===sets[0].views.normalNE.id);
  assert.equal(item.w,native.width*k);assert.equal(item.h,native.height*k);
  assert.equal(Math.round((item.tex[3]-item.tex[1])*2048),Math.round(native.width*Math.min(1,.6*k)));
});
test('T398: a set can reuse four existing pictures as its normal views and add the four straight-on ones as new atlas cells',async t=>{
  const dir=fixture(t),src=path.join(dir,'reuse');fs.mkdirSync(src,{recursive:true});
  const views={};for(const key of KEYS)views[key]=key.startsWith('normal')?{reuse:`old:${key}`}:`${key}.png`;
  for(const [i,key] of KEYS.entries())if(key.startsWith('yaw8'))await viewPng(path.join(src,`${key}.png`),i);
  const input={schema:1,projection:'normal+yaw8',subject:'test:reuse',name:'Reuse test',version:1,review:'candidate',source:{views},pixelsPerMetre:44,pixelCalibrationSpace:'orthographic-camera',baselineScale:1.25,footprintMetres:{width:8,depth:4},category:'Eight-view buildings',kind:'building'};
  const inputFile=path.join(src,'input.json');fs.writeFileSync(inputFile,JSON.stringify(input));
  // reuse covers all four normal views or none, and never a straight-on one
  const half={...input,source:{views:{...views,normalSW:'yaw8N.png'}}};fs.writeFileSync(path.join(src,'half.json'),JSON.stringify(half));
  await assert.rejects(()=>cutObject(path.join(src,'half.json'),path.join(dir,'half')),/all four normal views or none/);
  const bad={...input,source:{views:{...views,yaw8N:{reuse:'old:x'}}}};fs.writeFileSync(path.join(src,'bad.json'),JSON.stringify(bad));
  await assert.rejects(()=>cutObject(path.join(src,'bad.json'),path.join(dir,'bad')),/eight per-view source files/);
  const out=path.join(src,'v1'),result=await cutObject(inputFile,out);
  assert.equal(Object.keys(result.views).length,8);assert.equal(result.views.normalNE.reuse,'old:normalNE');assert.equal(result.views.normalNE.sourceFamily,'reuse');
  assert.ok(!fs.existsSync(path.join(out,'normalNE.native.png')));assert.ok(fs.existsSync(path.join(out,'yaw8N.native.png')));
  result.review='approved';const heading={normalNE:0,yaw8N:37,normalSE:90,yaw8E:127,normalSW:180,yaw8S:217,normalNW:270,yaw8W:307};
  for(const key of KEYS){const v=result.views[key];v.headingDegrees=heading[key];if(!key.startsWith('normal'))v.anchor={x:v.width/2,y:v.height-5};}
  const manifest=path.join(out,'manifest.json');fs.writeFileSync(manifest,JSON.stringify(result));
  fs.mkdirSync(path.join(dir,'scripts/assets'),{recursive:true});fs.mkdirSync(path.join(dir,'src/game'),{recursive:true});
  const [set]=await integrateObjects([manifest],{root:dir,tag:'reuse'});
  assert.equal(set.runtimeReuse,true);assert.equal(set.sourceIds.normalSE,'old:normalSE');assert.equal(Object.keys(set.sourceIds).length,4);assert.equal(new Set(Object.values(set.views).map(v=>v.id)).size,8);
  // the reused normal views carry the physical footprint at their heading (a quarter turn swaps the box), the straight-on ones the box turned 37 degrees
  assert.deepEqual(set.views.normalNE.boxes,[{hx:4,hy:2,dx:0,dy:0}]);assert.ok(Math.abs(set.views.normalSE.boxes[0].hx-2)<1e-9&&Math.abs(set.views.normalSE.boxes[0].hy-4)<1e-9);
  const ledger=JSON.parse(fs.readFileSync(path.join(dir,'scripts/assets/object-eight-registry.json'),'utf8'));
  assert.equal(ledger.items.length,8);assert.equal(ledger.items.filter(i=>i.reuse).length,4);assert.ok(ledger.items.filter(i=>i.reuse).every(i=>!('tex' in i)));assert.equal(ledger.pages.length,1);
  const files=fs.readdirSync(path.join(dir,'src/assets/object-eight/reuse-v1')),cal=JSON.parse(fs.readFileSync(path.join(dir,'src/assets/object-eight/reuse-v1',files.find(f=>f.endsWith('.calibration.json'))),'utf8'));
  assert.deepEqual(Object.keys(cal.views).sort(),['yaw8E','yaw8N','yaw8S','yaw8W']);
  // the generated library module aliases the reused views in place and keeps the pixel ones on their atlas cells
  const lib=fs.readFileSync(path.join(dir,'src/game/object-eight-library.ts'),'utf8');assert.ok(lib.includes("'reuse' in item")&&lib.includes('"reuse":"old:normalNE"'));
  assert.ok(ts.transpileModule(lib,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},reportDiagnostics:true}).diagnostics.length===0);
});
