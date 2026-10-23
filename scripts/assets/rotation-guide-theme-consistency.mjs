/** Geometry reference only: four exact quarter turns; never used as delivered game art. */
import fs from 'node:fs/promises';
import sharp from 'sharp';
const out = 'art/theme-consistency/references/rotation-guide-v1';
const colors = ['#c84d45', '#438c64', '#447bb3', '#c29b31'];
const labels = ['A FRONT', 'B RIGHT', 'C BACK', 'D LEFT'];
const corners = [[-90,60],[90,60],[90,-60],[-90,-60]];
const faces = [[0,1],[1,2],[2,3],[3,0]];
const normals = [[0,1],[1,0],[0,-1],[-1,0]];
let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#f1f4f7"/><g font-family="Arial" text-anchor="middle">';
const headers = ['0 degrees: FRONT + RIGHT', '90 degrees: RIGHT + BACK', '180 degrees: BACK + LEFT', '270 degrees: LEFT + FRONT'];
for (let k = 0; k < 4; k++) {
  const cx = k % 2 * 512 + 256, cy = Math.floor(k / 2) * 512 + 290, a = k * Math.PI / 2;
  const rotate = ([x,y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const project = (v,z) => { const [x,y] = rotate(v); return [cx + x - y, cy + (x + y) / 2 - z]; };
  const points = vs => vs.map(v => v.join(',')).join(' ');
  svg += `<text x="${cx}" y="${cy-210}" fill="#18212b" font-size="21">${headers[k]}</text>`;
  for (let f = 0; f < 4; f++) {
    const n = rotate(normals[f]); if (n[0] + n[1] < .01) continue;
    const [i,j] = faces[f], p = [project(corners[i],0),project(corners[j],0),project(corners[j],100),project(corners[i],100)];
    const mid = p.reduce((s,v) => [s[0]+v[0]/4,s[1]+v[1]/4],[0,0]);
    svg += `<polygon points="${points(p)}" fill="${colors[f]}" stroke="#18212b" stroke-width="3"/><text x="${mid[0]}" y="${mid[1]+5}" fill="white" font-size="16" font-weight="bold">${labels[f]}</text>`;
  }
  svg += `<polygon points="${points(corners.map(v => project(v,100)))}" fill="#66717d" stroke="#18212b" stroke-width="3"/>`;
  const marker = project([62,36],100);
  svg += `<circle cx="${marker[0]}" cy="${marker[1]}" r="12" fill="white" stroke="#18212b" stroke-width="2"/><text x="${cx}" y="${cy+150}" fill="#18212b" font-size="17">Same white corner marker; rotate geometry only</text>`;
}
svg += '</g></svg>';
await fs.writeFile(out + '.svg', svg);
await sharp(Buffer.from(svg)).png().toFile(out + '.png');
console.log(out + '.png');
