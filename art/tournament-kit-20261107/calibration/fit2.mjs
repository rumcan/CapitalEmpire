// Scale from physical height per sheet (rotation invariant); width ratio is a check. Writes calib.json.
import fs from 'fs';
const bb = Object.assign({}, ...process.argv[2].split(',').map(f => JSON.parse(fs.readFileSync(f))));
const DIMS = JSON.parse(fs.readFileSync(process.argv[3]));
export const HEAD = { 'normal-NE':0,'normal-SE':270,'normal-SW':180,'normal-NW':90,'yaw8-N':323,'yaw8-E':233,'yaw8-S':143,'yaw8-W':53 };
const corners=(w,d,deg)=>{const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return [[w/2,d/2],[-w/2,d/2],[-w/2,-d/2],[w/2,-d/2]].map(([x,y])=>[x*c-y*s,x*s+y*c]);};
const proj=pts=>{const X=pts.map(([x,y])=>(x-y)/Math.SQRT2),Y=pts.map(([x,y])=>(x+y)/(2*Math.SQRT2));return{minX:Math.min(...X),maxX:Math.max(...X),minY:Math.min(...Y),maxY:Math.max(...Y)};};
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[s.length>>1]:(s[s.length/2-1]+s[s.length/2])/2;};
const out={};
for (const [subj,[W,D,H]] of Object.entries(DIMS)) for (const cond of ['budget','upgraded']) {
  if (!bb[`${subj}/${cond}/normal-NE`]) continue;
  const rows = Object.keys(HEAD).map(k => { const r=bb[`${subj}/${cond}/${k}`], b=r.bbox, pr=proj(corners(W,D,HEAD[k]));
    return { k, fam:k.split('-')[0], size:r.size.join('x'), b, pr, ph:(b[3]-b[1])/(pr.maxY-pr.minY+0.866*H) }; });
  // scale group = sheet family + native size (full-size override singles get their own)
  const groups={}; for (const r of rows) (groups[r.fam+r.size] ??= []).push(r);
  for (const g of Object.values(groups)) { const p=med(g.map(r=>r.ph)); for (const r of g) r.p=p; }
  const views={};
  for (const r of rows) { const {b,pr,p}=r; views[r.k]={ p:+r.p.toFixed(2), headingDegrees:HEAD[r.k],
    anchor:{ x:+(((b[0]+b[2])/2) - ((pr.minX+pr.maxX)/2)*p).toFixed(1), y:+(b[3]-pr.maxY*p).toFixed(1) },
    widthRatio:+((b[2]-b[0])/((pr.maxX-pr.minX)*p)).toFixed(2), ...(bb[`${subj}/${cond}/${r.k}`].cell?{cell:bb[`${subj}/${cond}/${r.k}`].cell}:{}) }; }
  out[`${subj}/${cond}`]={W,D,H,views};
  console.log(`${subj}/${cond} ${W}x${D}x${H}`, Object.entries(views).map(([k,v])=>`${k.replace('normal-','').replace('yaw8-','y')}:${v.p.toFixed(0)}/w${v.widthRatio}`).join(' '));
}
fs.writeFileSync(process.argv[4], JSON.stringify(out,null,1));
