// Writes one importer input manifest per subject/condition from calib.json (art/tournament-kit-20261107/manifests/*.json).
import fs from 'fs'; import path from 'path';
const [calibFile, A] = process.argv.slice(2), calib = JSON.parse(fs.readFileSync(calibFile)), out = path.join(A, 'manifests'); fs.mkdirSync(out, { recursive: true });
const KEY = { 'normal-NE':'normalNE','normal-SE':'normalSE','normal-SW':'normalSW','normal-NW':'normalNW','yaw8-N':'yaw8N','yaw8-E':'yaw8E','yaw8-S':'yaw8S','yaw8-W':'yaw8W' };
const ROLE = { 'food-truck':['foodTruck','Food truck'], 'tv-camera-tower':['tvTower','TV camera tower'], 'broadcast-compound':['broadcast','Broadcast compound'], 'first-aid-tent':['firstAid','First aid tent'], 'info-will-call-booth':['info','Info and will-call booth'], 'four-lane-entrance':['gate','Four-lane entrance gate'], 'media-centre':['media','Media centre'], 'hole-scoreboard':['holeBoard','Hole scoreboard'], 'main-leaderboard':['leaderboard','Main leaderboard'], 'concession-kiosk':['kiosk','Concession kiosk'] };
const RANGE = { 'practice-net':'Practice net', 'bag-trolley':'Bag trolley' };
const evidence = (s, c) => `Silhouette fit, ${new Date().toISOString().slice(0,10)}: physical body ${c.W} x ${c.D} m, height ${c.H} m. Scale per sheet (and per full-size override file) from the alpha bbox height (>128) = ground diamond + 0.866 x height at the view's heading (rotation-invariant); width ratio checked per view. Anchor = projected body centre from the bbox bottom/centre.`;
const SEAT = {
  budget: { review: 'approved', front: { x: 0, y: 1 }, rows: Array.from({ length: 5 }, (_, r) => ({ start: { x: -3.575, y: 1.8 - r * 0.9 }, step: { x: 0.65, y: 0 }, seats: 12, seatHeightMetres: 0.45 + r * 0.35 })), entries: [{ x: 4.4, y: 1.8 }] },
  upgraded: { review: 'approved', front: { x: 0, y: 1 }, rows: Array.from({ length: 6 }, (_, r) => ({ start: { x: -3.375, y: 1.75 - r * 0.7 }, step: { x: 0.75, y: 0 }, seats: 10, seatHeightMetres: 0.45 + r * 0.3 })), entries: [{ x: 4.4, y: 1.75 }] },
};
let n = 0;
for (const [id, c] of Object.entries(calib)) {
  const [subj, cond] = id.split('/'), bleacher = subj === 'bleacher', role = ROLE[subj], batch02 = !role && !RANGE[subj] && !bleacher;
  const dir = bleacher ? `../bleachers/${cond}` : batch02 ? `../batch02/${subj}` : `../batch01/${subj}/${cond}`;
  const views = Object.fromEntries(Object.entries(c.views).map(([k, v]) => [KEY[k], { anchor: v.anchor, headingDegrees: v.headingDegrees, pixelsPerMetre: v.p, calibrationEvidence: evidence(subj, c) }]));
  const m = { schema: 1, projection: 'normal+yaw8', version: 1, review: 'candidate', footprintMetres: { width: c.W, depth: c.D }, pixelsPerMetre: c.views['normal-NE'].p, pixelCalibrationSpace: 'orthographic-camera', baselineScale: 1, views };
  if (bleacher) Object.assign(m, { subject: `golf:event-compact-bleacher-60-${cond}`, name: `Compact bleacher 60 (${cond})`, source: { normal: `${dir}/normal-v1.png`, yaw8: `${dir}/${cond === 'budget' ? 'yaw8-v1' : 'yaw8-v2'}.png` }, kind: 'building', category: 'Golf tournament', capacity: 60, visualTier: cond, eventTypes: ['compactBleacher60'], seating: SEAT[cond] });
  else {
    m.source = { views: Object.fromEntries(Object.keys(KEY).map(k => [KEY[k], `${dir}/${k}.png`])) };
    if (role) Object.assign(m, { subject: `golf:event-${subj}${cond === 'upgraded' ? '-upgraded' : ''}`, name: `${role[1]} (${cond})`, kind: 'building', category: 'Golf tournament', visualTier: cond, eventTypes: [role[0]] });
    else if (RANGE[subj]) Object.assign(m, { subject: `golf:range-${subj}`, name: RANGE[subj], kind: 'decor', category: 'New: Range', solid: 1 });
    else Object.assign(m, { subject: `golf:course-${subj}`, name: subj.replace(/-/g, ' ').replace(/^./, x => x.toUpperCase()), kind: 'decor', category: 'Eight-view props', aliases: [`newprop:${subj}`], solid: 1 });
  }
  fs.writeFileSync(path.join(out, `${m.subject.replace(/[^a-z0-9]+/gi, '-')}.json`), JSON.stringify(m, null, 1) + '\n'); n++;
}
console.log(n, 'manifests');
