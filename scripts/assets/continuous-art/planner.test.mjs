import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseCatalogue,linkedDeliverables,readSources,sourcesUnchanged} from './catalogue.mjs';
import {validatePlan,planHash,planPath,jobStates,readPlan} from './planner.mjs';
import {snapshotQueue} from './queue.mjs';

// Independent review fixtures only: never the real worker state, root artwork or model tools.
const home='E:/ClaudeTemp/T258-review';
await fs.mkdir(home,{recursive:true});
const run=await fs.mkdtemp(path.join(home,'planner-'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0l8AAAAASUVORK5CYII=','base64');
let sequence=0;
const heading=(n,id='golf:test',angle='D')=>`**${n}. Test asset** (\`${id}\`) · **${angle}** · P1\nSubject: eight independent facings.\n`;
async function fixture(source=heading(1),linked=null){
  const base=path.join(run,String(++sequence)),repo=path.join(base,'repo'),generated=path.join(repo,'art/theme-consistency/generated');
  await fs.mkdir(generated,{recursive:true});
  const authorityFile=path.join(base,'docs/GOLF-ART-LIST.md');await fs.mkdir(path.dirname(authorityFile),{recursive:true});
  if(linked!==null){const file=path.join(base,'docs/art/CHATGPT-IMAGE-QUEUE.md');await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,linked);source='[Ready queue](art/CHATGPT-IMAGE-QUEUE.md)\n'+source;}
  await fs.writeFile(authorityFile,source);
  const config={repoRoot:repo,stateDir:path.join(base,'state'),authorityFile,inventoryRoots:[repo],reservationsFile:path.join(base,'reservations.json')};
  const style=path.join(base,'style.png');await fs.writeFile(style,png);
  const queue=await snapshotQueue(config);
  return {base,generated,config,style,item:queue.items[0],queue};
}
function job(f,key,extra={}){return {key,id:f.item.id??'golf:test',output:path.join(f.generated,'fixtures',key.replaceAll(':','-')+'-v1.png'),kind:'sprite',camera:'parallel 2:1, fixed upper-right light',prompt:'One independently painted requested subject, native alpha.',background:'transparent',dependsOn:[],references:[{file:f.style,sha256:hash(png)}],...extra};}
function plan(f,jobs){return {schema:1,itemKey:f.item.key,sourceFingerprint:f.item.sourceFingerprint,coverage:'All independently required images and stages are represented.',jobs};}
async function savePlan(f,p){await fs.mkdir(path.dirname(planPath(f.config,f.item)),{recursive:true});await fs.writeFile(planPath(f.config,f.item),JSON.stringify({planSha256:planHash(p),plan:p}));}
async function saveArt(j,review='pending'){await fs.mkdir(path.dirname(j.output),{recursive:true});await fs.writeFile(j.output,png);await fs.writeFile(j.output.replace(/\.png$/,'.provenance.json'),JSON.stringify({id:j.id,output:j.output,subjobKey:j.key,visualReviewStatus:review}));return {file:j.output,sha256:hash(png),review};}
const directions=['E','NE','N','NW','W','SW','S','SE'];
const stoneQueue=`# Ready prompts\nRUN is 3D ONLY; all 2D uses ChatGPT.\n## First: grey stone border (item 180; owner request)\nSave each picture to \`art/theme-consistency/generated/landscaping/\`.\n**180a, the run pieces**: save as \`golf-stone-border-run-v1.png\`\n\`\`\`text\nTwo real axis runs; native alpha.\n\`\`\`\n**180b, the corners**: save as \`golf-stone-border-corners-v1.png\`\n\`\`\`text\nFour independently painted corners.\n\`\`\`\n**180c, single boulders**: save as \`golf-stone-boulders-grey-v1.png\`\n\`\`\`text\nSix grey boulders.\n\`\`\`\n**180d, planting tufts**: save as \`golf-water-edge-plants-v1.png\`\n\`\`\`text\nSix varied planting tufts.\n\`\`\`\n`;

test('parser retains status prefixes and excludes inline prose mentions',()=>{
  const items=parseCatalogue('🎨 '+heading(200,'scene:made','A')+'✅ '+heading(201,'scene:live','A')+'prose mentions **148. Flag pole** inline\n'+heading(202,'scene:new','A'));
  assert.deepEqual(items.map(x=>x.itemNumber),[200,201,202]);assert.equal(items[0].authorityClaim,'made-claimed');assert.equal(items[1].authorityClaim,'in-game-claimed');
});
test('numeric tables retain mixed angles, priorities and status',()=>{
  const items=parseCatalogue('## 7. Tournament\n| # | Item | Angle | Size | Prompt | P |\n| 99 | TV towers, three heights | A | 6/10/15m | A tower. | P1 |\n| 127 | Helipad and helicopter | C + D | 20m | Both subjects. | P3 |\n## 8. Ground pictures (top-down, C)\n| 131 | ✅ Pond bank | wet mud | P1 |\n');
  assert.deepEqual(items.map(x=>x.itemNumber),[99,127,131]);assert.equal(items[1].angle,'C + D');assert.equal(items[2].angle,'C');assert.equal(items[2].authorityClaim,'in-game-claimed');assert.equal(items[0].priority,'P1');
});
test('S/Q/P context and 3D-only clips are classified separately',()=>{
  const items=parseCatalogue('## 13. Scene\n### Places (S, outside)\n**200. Range** · P1\n### People (Q, portraits)\n**230. Town people** · P1\n### You (P, source pictures)\n**233. Player looks** · P1\n**234. The player\'s clips** · P1\n');
  assert.deepEqual(items.map(x=>x.angle),['S','Q','P','P']);assert.deepEqual(items.map(x=>x.owner),['ChatGPT','ChatGPT','ChatGPT','3D-pipeline']);
});
test('all 2D angles remain owned by ChatGPT after the RUN 3D-only switch',async()=>{
  const f=await fixture(['A','B','C','D','R','P'].map((a,i)=>heading(i+1,'golf:type-'+a,a)).join('\n'));
  assert.equal(f.queue.items.length,6);assert.ok(f.queue.items.every(x=>x.owner==='ChatGPT'&&x.eligible));
});
test('linked grey kit has four distinct output subjobs and takes first priority',async()=>{
  const f=await fixture(heading(3,'golf:coffee','A')+heading(180,'golf:stone-kit','R'),stoneQueue);
  const outputs=linkedDeliverables(stoneQueue,f.config);assert.equal(outputs.length,4);assert.equal(new Set(outputs.map(x=>x.key)).size,4);assert.ok(outputs.every(x=>x.first&&x.output.startsWith(f.generated)));
  assert.equal(f.queue.next.itemNumber,180);assert.equal(f.queue.next.action,'plan');
});
test('changing only the linked queue invalidates the prior plan and source hash',async()=>{
  const f=await fixture(heading(1),'# Queue\n');const p=plan(f,[job(f,'E')]);await savePlan(f,p);assert.ok(await readPlan(f.config,f.item));
  const prior=await readSources(f.config);await fs.appendFile(path.join(f.base,'docs/art/CHATGPT-IMAGE-QUEUE.md'),'\nNew direct owner instruction.\n');
  assert.equal(await sourcesUnchanged(prior),false);const current=await snapshotQueue(f.config);assert.notEqual(current.items[0].sourceFingerprint,f.item.sourceFingerprint);assert.equal(current.items[0].plan,null);assert.equal(current.next.action,'plan');
});
test('one existing D facing leaves exactly seven independent pending facings',async()=>{
  const f=await fixture();const jobs=directions.map(d=>job(f,'cart-'+d));await saveArt(jobs[0],'held');const p=plan(f,jobs);await savePlan(f,p);
  const q=await snapshotQueue(f.config);assert.equal(q.items[0].pendingJobs.length,7);assert.equal(q.items[0].jobs[0].status,'existing-held');assert.equal(q.next.action,'generate-subjob');assert.equal(q.next.job.key,'cart-NE');
});
test('three colours retain all 24 facing jobs even when one colour-facing exists',async()=>{
  const f=await fixture();const jobs=['white','red','green'].flatMap(colour=>directions.map(d=>job(f,colour+'-'+d)));await saveArt(jobs[0]);const states=await jobStates(plan(f,jobs),f.item,f.config);
  assert.equal(states.length,24);assert.equal(states.filter(x=>x.status==='pending').length,23);assert.equal(states.filter(x=>x.existing).length,1);
});
test('held or unreviewed exact output files are never selected for regeneration',async()=>{
  const f=await fixture();const j=job(f,'held');const artifact=await saveArt(j,'held');const states=await jobStates(plan(f,[j]),{...f.item,artifacts:[artifact]},f.config);
  assert.equal(states[0].status,'existing-held');assert.ok(states[0].existing);
});
test('a rejected alternate take does not fulfill the missing canonical output',async()=>{
  const f=await fixture();const j=job(f,'canonical'),rejected=job(f,'rejected',{output:path.join(f.generated,'rejected','old-v1.png')});const artifact=await saveArt(rejected,'held');
  const states=await jobStates(plan(f,[j]),{...f.item,artifacts:[artifact]},f.config);assert.equal(states[0].status,'pending');
});
test('dependent scene edit waits for the exact prior image and retains its reference',async()=>{
  const f=await fixture();const first=job(f,'rundown',{kind:'scene',background:'opaque'}),edit=job(f,'upgraded',{kind:'scene',background:'opaque',dependsOn:['rundown'],references:[{job:'rundown'}]});const p=plan(f,[first,edit]);assert.equal(await validatePlan(p,f.item,f.config),true);
  assert.equal((await jobStates(p,f.item,f.config))[1].status,'waiting-dependency');await saveArt(first);assert.equal((await jobStates(p,f.item,f.config))[1].status,'pending');
});
test('held prior image does not unlock a dependent edit',async()=>{
  const f=await fixture();const first=job(f,'base'),edit=job(f,'edit',{dependsOn:['base'],references:[{job:'base'}]});const artifact=await saveArt(first,'held');
  const states=await jobStates(plan(f,[first,edit]),{...f.item,artifacts:[artifact]},f.config);assert.equal(states[1].status,'waiting-dependency');
});
test('dependency cycles, unknown dependencies and undeclared job references are rejected',async()=>{
  const f=await fixture();for(const jobs of [[job(f,'a',{dependsOn:['b']}),job(f,'b',{dependsOn:['a']})],[job(f,'a',{dependsOn:['missing']})],[job(f,'a'),job(f,'b',{references:[{job:'a'}]})]])assert.equal(await validatePlan(plan(f,jobs),f.item,f.config),false);
});
test('persisted envelope tampering and stale source fingerprints are rejected',async()=>{
  const f=await fixture();const p=plan(f,[job(f,'E')]);await savePlan(f,p);assert.ok(await readPlan(f.config,f.item));p.jobs[0].prompt='Changed after hash';await fs.writeFile(planPath(f.config,f.item),JSON.stringify({planSha256:'0'.repeat(64),plan:p}));assert.equal(await readPlan(f.config,f.item),null);p.sourceFingerprint='stale';assert.equal(await validatePlan(p,f.item,f.config),false);
});
test('external reference hash changes invalidate the plan',async()=>{
  const f=await fixture();const p=plan(f,[job(f,'E')]);assert.equal(await validatePlan(p,f.item,f.config),true);await fs.writeFile(f.style,'changed reference');assert.equal(await validatePlan(p,f.item,f.config),false);
});
test('duplicate job keys and duplicate output paths are rejected',async()=>{
  const f=await fixture();const a=job(f,'a');assert.equal(await validatePlan(plan(f,[a,job(f,'a')]),f.item,f.config),false);assert.equal(await validatePlan(plan(f,[a,job(f,'b',{output:a.output})]),f.item,f.config),false);
});
test('Windows case aliases cannot schedule two writes to the same output',async()=>{
  const f=await fixture();const a=job(f,'tile');assert.equal(await validatePlan(plan(f,[a,job(f,'other',{output:a.output.replace('tile-v1.png','TILE-v1.png')})]),f.item,f.config),false);
});
test('out-of-root, traversal, relative, unversioned and non-PNG outputs are rejected',async()=>{
  const f=await fixture();for(const output of [path.join(f.base,'outside-v1.png'),path.join(f.generated,'../escape-v1.png'),'relative-v1.png',path.join(f.generated,'missing-version.png'),path.join(f.generated,'wrong-v1.jpg')])assert.equal(await validatePlan(plan(f,[job(f,'bad',{output})]),f.item,f.config),false,output);
});
test('an existing junction cannot redirect output outside generated root',async()=>{
  const f=await fixture();const outside=path.join(f.base,'outside');await fs.mkdir(outside);const link=path.join(f.generated,'linked');await fs.symlink(outside,link,process.platform==='win32'?'junction':'dir');assert.equal(await validatePlan(plan(f,[job(f,'escape',{output:path.join(link,'escape-v1.png')})]),f.item,f.config),false);
});
test('every explicit linked kit output must be represented',async()=>{
  const f=await fixture(heading(180,'golf:kit','R'),stoneQueue);const jobs=f.item.linkedOutputs.map(o=>job(f,o.key,{output:o.output}));assert.equal(await validatePlan(plan(f,jobs),f.item,f.config),true);assert.equal(await validatePlan(plan(f,jobs.slice(1)),f.item,f.config),false);
});
test('one narrow 180a reservation leaves 180b/c/d available',async()=>{
  const f=await fixture(heading(180,'golf:kit','R'),stoneQueue);const jobs=f.item.linkedOutputs.map(o=>job(f,o.key,{output:o.output}));await savePlan(f,plan(f,jobs));await fs.writeFile(f.config.reservationsFile,JSON.stringify({items:[{catalogueItem:180,subjobKey:'180a-run',output:jobs[0].output,owner:'primary-art'}]}));
  const q=await snapshotQueue(f.config);assert.equal(q.items[0].reserved,false);assert.equal(q.items[0].jobs[0].status,'reserved');assert.equal(q.items[0].pendingJobs.length,3);assert.equal(q.next.job.key,jobs[1].key);
});
test('sprite/person/decal plans require true transparency; painted scenes/ground remain opaque',async()=>{
  const f=await fixture();for(const kind of ['sprite','person-source','decal'])assert.equal(await validatePlan(plan(f,[job(f,kind,{kind,background:'opaque'})]),f.item,f.config),false,kind);
  for(const kind of ['scene','portrait','ground','ground-stage'])assert.equal(await validatePlan(plan(f,[job(f,kind,{kind,background:'transparent'})]),f.item,f.config),false,kind);
});
test('replacement correction binds exact old artifact hash and uses a new output',async()=>{
  const f=await fixture();const old=job(f,'old'),artifact=await saveArt(old,'held'),item={...f.item,artifacts:[artifact]};const corrected=job(f,'corrected',{replaces:{file:old.output,sha256:artifact.sha256,reason:'Correct the measured angle only'}});const p=plan(f,[corrected]);assert.equal(await validatePlan(p,item,f.config),true);corrected.replaces.sha256='0'.repeat(64);assert.equal(await validatePlan(p,item,f.config),false);
});
