// A base's clip file without its textures, in place: every image becomes a 1x1 grey PNG and the rest (the mesh, the skin, the skeleton, the
// animation) is copied byte for byte. A Meshy clip (meshy-base-clip.mjs) carries its remeshed model's two PNG textures, 9 of its 13 MB, and
// nothing reads them: rig-local-person.mjs takes the clip's skeleton, motion and mesh shape, and every person keeps its own texture.
//
//   node scripts/assets/people3d/strip-glb-images.mjs <file.glb> [...]
import fs from 'node:fs';

const DOT = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
const pad = (n, k = 4) => (k - (n % k)) % k;
for (const file of process.argv.slice(2)) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  const jsonLen = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jsonLen).toString());
  const binStart = 20 + jsonLen + 8, bin = b.subarray(binStart, binStart + b.readUInt32LE(20 + jsonLen));
  if ((j.buffers ?? []).length !== 1) throw new Error(`${file}: ${j.buffers?.length ?? 0} buffers (one expected)`);
  const imageViews = new Set((j.images ?? []).filter(i => i.bufferView != null).map(i => i.bufferView));
  if (!imageViews.size) { console.log(`${file}: no embedded images`); continue; }
  // the views again, each at a 4-byte boundary, the image views now the 1x1 PNG
  const parts = []; let at = 0;
  for (const [k, v] of j.bufferViews.entries()) {
    const bytes = imageViews.has(k) ? DOT : bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
    const gap = pad(at); if (gap) { parts.push(Buffer.alloc(gap)); at += gap; }
    v.byteOffset = at; v.byteLength = bytes.length; parts.push(bytes); at += bytes.length;
  }
  j.buffers[0].byteLength = at;
  const newBin = Buffer.concat([...parts, Buffer.alloc(pad(at))]);
  let json = Buffer.from(JSON.stringify(j)); json = Buffer.concat([json, Buffer.alloc(pad(json.length), 0x20)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + json.length + 8 + newBin.length, 8);
  const chunk = (data, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
  fs.writeFileSync(file, Buffer.concat([head, chunk(json, 0x4e4f534a), chunk(newBin, 0x004e4942)]));
  console.log(`${file}: ${imageViews.size} images stripped, ${(b.length / 1e6).toFixed(1)} -> ${((12 + 16 + json.length + newBin.length) / 1e6).toFixed(1)} MB`);
}
