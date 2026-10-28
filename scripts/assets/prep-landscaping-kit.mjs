// T274: accepted native-alpha organic sheets. Native exports preserve every nonzero-alpha source pixel;
// runtime masters follow the existing kit's metre scale. prep-golf packs these AFTER all existing art.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const LANDSCAPING_SHEETS=[
  {slug:'golf-stone-boulders-grey-v1',id:'golf:stone-boulders-grey',kind:'rock',subjects:[
    ['granite-small-grey','Small grey granite boulder',0.6],['granite-broad-rosegrey','Broad rose-grey granite boulder',1.1],
    ['granite-tall-fern','Tall granite boulder with fern',1.8],['granite-moss-split','Mossy split granite boulder',0.8],
    ['granite-golden-grass','Granite boulder with golden grass',1.5],['granite-pale-fern','Pale granite boulder with fern',2],
  ]},
  {slug:'golf-water-edge-plants-v1',id:'golf:water-edge-plants',kind:'shrub',subjects:[
    ['water-edge-fern','Water-edge fern',1],['water-edge-sedge','Water-edge sedge',0.8],
    ['water-edge-cattails','Water-edge cattails',1.5,'height'],['water-edge-juniper','Water-edge juniper',1],
    ['water-edge-golden-grass','Water-edge golden grass',0.75],['water-edge-red-shrub','Water-edge red shrub',0.9],
  ]},
];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const round=n=>+n.toFixed(4);
/** Six large alpha>8 components define the subjects, not guessed grid boundaries. A nearest-core
 * partition assigns every faint edge pixel (alpha1..8) exactly once, even where soft edges connect. */
export function partitionSheet(data,W,H,count=6){
  const N=W*H,labels=new Int32Array(N).fill(-1),stack=new Int32Array(N),components=[];
  for(let start=0;start<N;start++){
    if(labels[start]>=0||data[start*4+3]<=8)continue;
    const id=components.length;let pending=1,n=0,x0=W,y0=H,x1=-1,y1=-1;stack[0]=start;labels[start]=id;
    while(pending){const p=stack[--pending],x=p%W,y=Math.floor(p/W);n++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const X=x+dx,Y=y+dy,q=Y*W+X;if(X>=0&&X<W&&Y>=0&&Y<H&&labels[q]<0&&data[q*4+3]>8){labels[q]=id;stack[pending++]=q;}}}
    components.push({id,n,x0,y0,x1,y1});
  }
  const cores=components.sort((a,b)=>b.n-a.n).slice(0,count);
  if(cores.length!==count||cores.some(c=>c.n<20))throw Error(`Expected ${count} separate substantial silhouettes`);
  const split=(Math.min(...cores.map(c=>(c.y0+c.y1)/2))+Math.max(...cores.map(c=>(c.y0+c.y1)/2)))/2;
  cores.sort((a,b)=>Number((a.y0+a.y1)/2>split)-Number((b.y0+b.y1)/2>split)||(a.x0+a.x1)-(b.x0+b.x1));
  const byCore=new Map(cores.map((c,i)=>[c.id,i])),owner=new Uint8Array(N).fill(255),queue=new Int32Array(N);let tail=0;
  for(let p=0;p<N;p++){const i=byCore.get(labels[p]);if(i!==undefined){owner[p]=i;queue[tail++]=p;}}
  for(let head=0;head<tail;head++){const p=queue[head],x=p%W;for(const q of [x?p-1:-1,x<W-1?p+1:-1,p>=W?p-W:-1,p<N-W?p+W:-1])if(q>=0&&owner[q]===255){owner[q]=owner[p];queue[tail++]=q;}}
  const bounds=cores.map(()=>({x0:W,y0:H,x1:-1,y1:-1,n:0}));
  for(let p=0;p<N;p++)if(data[p*4+3]){const b=bounds[owner[p]],x=p%W,y=Math.floor(p/W);b.x0=Math.min(b.x0,x);b.x1=Math.max(b.x1,x);b.y0=Math.min(b.y0,y);b.y1=Math.max(b.y1,y);b.n++;}
  return cores.map((core,i)=>{
    const b=bounds[i],left=Math.max(0,b.x0-2),top=Math.max(0,b.y0-2),width=Math.min(W,b.x1+3)-left,height=Math.min(H,b.y1+3)-top,rgba=Buffer.alloc(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=(top+y)*W+left+x;if(owner[p]===i)data.copy(rgba,(y*width+x)*4,p*4,p*4+4);}
    return {rgba,width,height,sourceRect:{left,top,width,height},coreBounds:{left:core.x0,top:core.y0,width:core.x1-core.x0+1,height:core.y1-core.y0+1},nonzeroPixels:b.n};
  });
}
export async function prepLandscapingKit(root=ROOT){
  const sourceDir=path.join(root,'art/theme-consistency/generated/landscaping'),out=path.join(root,'art/landscaping-kit'),items=[],reports=[];
  await fs.mkdir(out,{recursive:true});
  for(const sheet of LANDSCAPING_SHEETS){
    const source=path.join(sourceDir,sheet.slug+'.png'),bytes=await fs.readFile(source),sha256=hash(bytes),reviewPath=source.replace(/\.png$/,'.appearance.json'),review=JSON.parse(await fs.readFile(reviewPath,'utf8'));
    const relative=path.relative(root,source).replaceAll('\\','/');
    if(review.decision!=='accepted-for-art-appearance'||!review.files.some(f=>f.file===relative&&f.sha256===sha256))throw Error(`Source lacks exact primary appearance acceptance: ${relative}`);
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const pieces=partitionSheet(data,info.width,info.height),nativeDir=source.slice(0,-4);await fs.mkdir(nativeDir,{recursive:true});
    const report={schema:1,id:sheet.id,source:{file:relative,sha256,dimensions:[info.width,info.height]},sourceAppearance:{file:path.relative(root,reviewPath).replaceAll('\\','/'),sha256:hash(await fs.readFile(reviewPath))},processing:'Native RGBA pixels assigned once by nearest alpha>8 subject core; mask separates neighboring silhouettes, no resample/repaint/flip/warp. Every nonzero-alpha source pixel preserved exactly once.',subjects:[]};
    for(const [i,p]of pieces.entries()){
      const [slug,name,metres,dimension='width']=sheet.subjects[i],id='kit:'+slug;
      const native=await sharp(p.rgba,{raw:{width:p.width,height:p.height,channels:4}}).png().toBuffer(),nativePath=path.join(nativeDir,`${String(i+1).padStart(2,'0')}-${slug}.native.png`);await fs.writeFile(nativePath,native);
      const k=64*metres/(dimension==='height'?p.coreBounds.height:p.coreBounds.width),w=p.width*k,h=p.height*k,box=(dimension==='height'?0.32:metres*0.35);
      let sx=0,n=0;for(let y=Math.max(0,p.coreBounds.top+p.coreBounds.height-6);y<p.coreBounds.top+p.coreBounds.height;y++)for(let x=p.coreBounds.left;x<p.coreBounds.left+p.coreBounds.width;x++){const xx=x-p.sourceRect.left,yy=y-p.sourceRect.top;if(xx>=0&&xx<p.width&&yy>=0&&yy<p.height&&p.rgba[(yy*p.width+xx)*4+3]>8){sx+=xx;n++;}}
      const ax=(n?sx/n:p.width/2)*k,ay=(p.coreBounds.top+p.coreBounds.height-p.sourceRect.top)*k-16*box;
      const mk=Math.min(1,2*k),mw=Math.max(1,Math.round(p.width*mk)),mh=Math.max(1,Math.round(p.height*mk)),master=await sharp(native).resize(mw,mh,{fit:'fill',kernel:'lanczos3'}).webp({lossless:true,effort:6}).toBuffer();
      await fs.writeFile(path.join(out,slug+'.webp'),master);
      const crop={id,name,metres,dimension,file:path.relative(root,nativePath).replaceAll('\\','/'),sha256:hash(native),sourceRect:p.sourceRect,coreBounds:p.coreBounds,nonzeroPixels:p.nonzeroPixels};report.subjects.push(crop);
      items.push({id,name,cat:'Painted landscaping',kind:sheet.kind,w:round(w),h:round(h),ax:round(ax),ay:round(ay),boxes:[{hx:round(box),hy:round(box),dx:0,dy:0}],solid:1,big:false,door:false,cost:sheet.kind==='rock'?300:80,src:{sheet:relative,sha256,native:crop.file,nativeSha256:crop.sha256,metres,dimension}});
    }
    const total=report.subjects.reduce((n,s)=>n+s.nonzeroPixels,0);let originalNonzero=0;for(let p=0;p<info.width*info.height;p++)if(data[p*4+3])originalNonzero++;
    if(total!==originalNonzero)throw Error('Native alpha pixel coverage mismatch');
    report.pixelCoverage={originalNonzero,preservedNonzero:total};
    await fs.writeFile(path.join(nativeDir,'native-export.json'),JSON.stringify(report,null,2)+'\n');reports.push(report);
  }
  await fs.writeFile(path.join(out,'items.json'),JSON.stringify({schema:1,note:'T274 accepted native-alpha landscaping; separate tail collection preserves every existing saved library index.',items},null,2)+'\n');
  return {items,reports};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const r=await prepLandscapingKit();console.log(`Prepared ${r.items.length} native-alpha landscaping masters; every visible source pixel retained in native exports.`);}
