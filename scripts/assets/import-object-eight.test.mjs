import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { KEYS, cutObject, integrateObject, validateDistinct } from './import-object-eight.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const parent=path.join(root,'output'); fs.mkdirSync(parent,{recursive:true});
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
  const input={schema:1,projection:'normal+yaw8',subject:'test:stand',name:'Test stand',version:1,review:'candidate',source:{normal:'normal.png',yaw8:'yaw8.png'},pixelsPerMetre:16,baselineScale:1,footprintMetres:{width:8,depth:4},eventTypes:['standS'],visualTier:'worn'};
  const inputFile=path.join(dir,'input.json');fs.writeFileSync(inputFile,JSON.stringify(input));
  const out=path.join(dir,'v1');const result=await cutObject(inputFile,out);assert.equal(Object.keys(result.views).length,8);assert.equal(result.review,'candidate');
  assert.equal(result.views.normalNE.cell,3);assert.equal(result.views.yaw8N.cell,0);assert.equal(result.views.yaw8W.cell,3);
  await assert.rejects(()=>cutObject(inputFile,out),/new version/);
  const candidate=path.join(out,'manifest.json');await assert.rejects(()=>integrateObject(candidate,dir),/approved/);
  result.review='approved';for(const [i,key]of KEYS.entries()){const v=result.views[key];v.anchor={x:v.width/2,y:v.height-5};v.headingDegrees=i%2?i*45-8:i*45;}
  fs.mkdirSync(path.join(dir,'scripts/assets'),{recursive:true});fs.mkdirSync(path.join(dir,'src/game'),{recursive:true});fs.writeFileSync(candidate,JSON.stringify(result));
  const imported=await integrateObject(candidate,dir);assert.equal(imported.projection,'normal+yaw8');assert.equal(new Set(Object.values(imported.views).map(v=>v.id)).size,8);
  const ledger=JSON.parse(fs.readFileSync(path.join(dir,'scripts/assets/object-eight-registry.json'),'utf8'));assert.equal(ledger.items.length,8);assert.equal(ledger.items[0].tex[0],0);
  assert.ok(fs.readFileSync(path.join(dir,'src/game/object-eight-library.ts'),'utf8').includes('appendObjectEight'));
  await assert.rejects(()=>integrateObject(candidate,dir),/already registered/);
  assert.ok(fs.existsSync(path.join(dir,'normal.png'))&&fs.existsSync(path.join(out,'normalNE.native.png')));
});
test('opaque sheets, duplicates and mirrored sources are rejected before they can count as eight',async t=>{
  const dir=fixture(t);await sharp({create:{width:128,height:128,channels:4,background:'#234567'}}).png().toFile(path.join(dir,'opaque.png'));
  const input={schema:1,projection:'normal+yaw8',subject:'test:bad',name:'Bad',version:1,review:'candidate',source:{normal:'opaque.png',yaw8:'opaque.png'},pixelsPerMetre:16,baselineScale:1,footprintMetres:{width:8,depth:4}};
  const file=path.join(dir,'input.json');fs.writeFileSync(file,JSON.stringify(input));await assert.rejects(()=>cutObject(file,path.join(dir,'bad')),/opaque background/);
  const data=Buffer.from([1,2,3,255,4,5,6,255]);assert.throws(()=>validateDistinct([{key:'a',width:2,height:1,data},{key:'b',width:2,height:1,data:Buffer.from([4,5,6,255,1,2,3,255])}]),/Duplicate|mirrored/);
});
