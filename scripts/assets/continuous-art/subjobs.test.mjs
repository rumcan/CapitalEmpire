import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {tick,FIVE_HOURS} from './supervisor.mjs';
import {snapshotQueue} from './queue.mjs';
import {planPath,planHash,readPlan} from './planner.mjs';

// Fake Node children and fixtures only. Never load the production config or launch Codex/imagegen.
const home='E:/ClaudeTemp/T258-review';await fs.mkdir(home,{recursive:true});const run=await fs.mkdtemp(path.join(home,'subjobs-'));
const worktree=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const initialNow=Date.parse('2026-10-28T09:00:00Z');
const network='Reconnecting...5/5 stream disconnected before completion (os error 10053)';
const fake=path.join(run,'fake.mjs');
await fs.writeFile(fake,`import fs from 'node:fs/promises';import path from 'node:path';
const s=JSON.parse(await fs.readFile(process.argv[2],'utf8'));let prompt='';for await(const c of process.stdin)prompt+=c;
if(s.startedFile)await fs.writeFile(s.startedFile,'started');
console.log(JSON.stringify({type:'thread.started',thread_id:'11111111-2222-3333-4444-555555555555'}));
for(const f of s.files??[]){await fs.mkdir(path.dirname(f.to),{recursive:true});await fs.copyFile(f.from,f.to);}
for(const f of s.json??[]){await fs.mkdir(path.dirname(f.file),{recursive:true});await fs.writeFile(f.file,JSON.stringify(f.value));}
const cp=/Write (.+?checkpoint\\.json) atomically/.exec(prompt)?.[1];if(!cp)throw Error('Missing checkpoint instruction');
if(s.checkpoint)await fs.writeFile(cp,JSON.stringify(s.checkpoint));
if(s.change)await fs.appendFile(s.change.file,s.change.text);
if(s.error)console.log(JSON.stringify({type:'turn.failed',error:{message:s.error}}));else console.log(JSON.stringify({type:'turn.completed'}));
process.exitCode=s.exitCode??0;
`);
let sequence=0;
async function fixture({kind='sprite',background='transparent',linked=false,sourceText=null}={}){
  const base=path.join(run,String(++sequence)),repoRoot=path.join(base,'repo'),generated=path.join(repoRoot,'art/theme-consistency/generated');await fs.mkdir(generated,{recursive:true});
  const authorityFile=path.join(base,'docs/GOLF-ART-LIST.md');await fs.mkdir(path.dirname(authorityFile),{recursive:true});
  const source=sourceText??'**1. Vehicle** (`golf:vehicle`) · **D** · P1\nEight independently painted facings.\n';
  await fs.writeFile(authorityFile,(linked?'[Queue](art/CHATGPT-IMAGE-QUEUE.md)\n':'')+source);
  const linkedFile=path.join(base,'docs/art/CHATGPT-IMAGE-QUEUE.md');if(linked){await fs.mkdir(path.dirname(linkedFile),{recursive:true});await fs.writeFile(linkedFile,'# Live queue\n');}
  const config={repoRoot,worktree,stateDir:path.join(base,'state'),authorityFile,reservationsFile:path.join(base,'reservations.json'),inventoryRoots:[repoRoot]};
  const alpha=path.join(base,'alpha.png'),opaque=path.join(base,'opaque.png');
  await sharp({create:{width:24,height:24,channels:4,background:{r:40,g:100,b:70,alpha:0.7}}}).png().toFile(alpha);
  await sharp({create:{width:24,height:24,channels:3,background:{r:40,g:100,b:70}}}).png().toFile(opaque);
  const q=await snapshotQueue(config),item=q.next;
  const jobs=['E','NE'].map(d=>({key:d,id:'golf:vehicle',output:path.join(generated,'vehicles','vehicle-'+d+'-v1.png'),kind,background,camera:kind==='scene'?'eye-level cinematic':'parallel 2:1',prompt:'Independently paint this exact required view.',dependsOn:[],references:[{file:opaque,sha256:null}]}));
  for(const j of jobs)j.references[0].sha256=hash(await fs.readFile(opaque));
  const plan={schema:1,itemKey:item.key,sourceFingerprint:item.sourceFingerprint,coverage:'Both independently requested images, preserving existing ones.',jobs};
  return {base,generated,config,alpha,opaque,linkedFile,plan,now:initialNow,step:0};
}
async function invoke(f,settings){
  const settingsFile=path.join(f.base,'settings-'+(++f.step)+'.json');await fs.writeFile(settingsFile,JSON.stringify(settings));
  const at=f.now;f.now+=1000;return tick(f.config,{now:()=>at,runnerOverride:{file:process.execPath,args:[fake,settingsFile]}});
}
async function planStep(f,extra={}){
  const q=await snapshotQueue(f.config);const cp={schema:1,status:'plan-complete',authoritySha256:q.authoritySha256,itemId:q.next.id??q.next.key,sourceFingerprint:q.next.sourceFingerprint,builtinImagegenUsed:false,artifacts:[],plan:f.plan};
  return invoke(f,{checkpoint:cp,...extra});
}
async function imageSettings(f,{image=f.alpha,checkpointPatch={},provenancePatch={}}={}){
  const q=await snapshotQueue(f.config);assert.equal(q.next.action,'generate-subjob');const job=q.next.job,bytes=await fs.readFile(image),sha256=hash(bytes);
  const checkpoint={schema:1,status:'batch-complete',authoritySha256:q.authoritySha256,itemId:job.id,sourceFingerprint:q.next.sourceFingerprint,planSha256:q.next.planSha256,subjobKey:job.key,builtinImagegenUsed:true,artifacts:[{file:job.output,sha256,review:'pending',integration:'pending'}],...checkpointPatch};
  const provenance={id:job.id,subjobKey:job.key,sourceFingerprint:q.next.sourceFingerprint,planSha256:q.next.planSha256,output:job.output,outputSha256:sha256,...provenancePatch};
  return {checkpoint,files:[{from:image,to:job.output}],json:[{file:job.output.replace(/\.png$/,'.provenance.json'),value:provenance}]};
}
const state=f=>fs.readFile(path.join(f.config.stateDir,'state.json'),'utf8').then(JSON.parse);

test('plan persists, one job completes, then a fresh tick resumes the next job',async()=>{
  const f=await fixture();assert.equal((await planStep(f)).status,'plan-complete');const envelope=await readPlan(f.config,(await snapshotQueue(f.config)).items[0]);assert.equal(envelope.planSha256,planHash(f.plan));
  assert.equal((await invoke(f,await imageSettings(f))).status,'batch-complete');const q=await snapshotQueue(f.config);assert.equal(q.next.job.key,'NE');assert.equal(q.items[0].pendingJobs.length,1);
  assert.equal((await invoke(f,await imageSettings(f))).status,'batch-complete');assert.equal((await snapshotQueue(f.config)).next,null);assert.equal((await state(f)).threadId,'11111111-2222-3333-4444-555555555555');
});
test('changed linked authority before plan acceptance discards the old plan',async()=>{
  const f=await fixture({linked:true});const result=await planStep(f,{change:{file:f.linkedFile,text:'\nnew owner instruction\n'}});assert.equal(result.status,'authority-changed');assert.equal(await fs.access(planPath(f.config,{key:f.plan.itemKey})).then(()=>true,()=>false),false);
});
test('changed source before image acceptance preserves PNG but does not accept stale binding',async()=>{
  const f=await fixture({linked:true});await planStep(f);const settings=await imageSettings(f);settings.change={file:f.linkedFile,text:'\nupdated after image\n'};assert.equal((await invoke(f,settings)).status,'authority-changed');assert.ok(await fs.stat(f.plan.jobs[0].output));assert.equal((await snapshotQueue(f.config)).next.action,'plan');
});
test('wrong plan hash or wrong subjob checkpoint is rejected',async()=>{
  for(const checkpointPatch of [{planSha256:'0'.repeat(64)},{subjobKey:'wrong'},{sourceFingerprint:'stale'},{builtinImagegenUsed:false}]){const f=await fixture();await planStep(f);assert.equal((await invoke(f,await imageSettings(f,{checkpointPatch}))).status,'needs-attention');}
});
test('source provenance must bind exact job, id, source, plan and PNG hash',async()=>{
  for(const provenancePatch of [{id:'golf:wrong'},{subjobKey:'wrong'},{sourceFingerprint:'stale'},{planSha256:'0'.repeat(64)},{outputSha256:'0'.repeat(64)}]){const f=await fixture();await planStep(f);assert.equal((await invoke(f,await imageSettings(f,{provenancePatch}))).status,'needs-attention');}
});
test('tampered persisted plan is replanned instead of generating a selected stale subjob',async()=>{
  const f=await fixture();await planStep(f);const file=planPath(f.config,{key:f.plan.itemKey});const envelope=JSON.parse(await fs.readFile(file,'utf8'));envelope.plan.jobs[0].prompt='tampered';await fs.writeFile(file,JSON.stringify(envelope));assert.equal((await snapshotQueue(f.config)).next.action,'plan');
});
test('a valid generated checkpoint survives nonzero10053 and stores a warning',async()=>{
  const f=await fixture();await planStep(f);const result=await invoke(f,{...await imageSettings(f),error:network,exitCode:1});assert.equal(result.status,'batch-complete');const s=await state(f);assert.equal(s.lastError,null);assert.equal(s.lastWarning.exitCode,1);assert.equal(s.notBeforeUtc,null);assert.equal((await snapshotQueue(f.config)).next.job.key,'NE');
});
test('a valid plan checkpoint survives nonzero10053',async()=>{
  const f=await fixture();assert.equal((await planStep(f,{error:network,exitCode:1})).status,'plan-complete');assert.equal((await snapshotQueue(f.config)).next.action,'generate-subjob');
});
test('no checkpoint plus real10053 gets five-minute retry and suppresses early model launch',async()=>{
  const f=await fixture();const at=f.now,result=await invoke(f,{error:network,exitCode:1});assert.equal(result.status,'transient-backoff');assert.equal(Date.parse(result.notBeforeUtc),at+300000);
  const startedFile=path.join(f.base,'must-not-start');assert.equal((await invoke(f,{startedFile})).status,'transient-backoff');assert.equal(await fs.access(startedFile).then(()=>true,()=>false),false);assert.equal((await state(f)).notBeforeUtc,result.notBeforeUtc);
});
test('a transient retry resumes after its deadline without resetting thread identity',async()=>{
  const f=await fixture();const failure=await invoke(f,{error:network,exitCode:1});f.now=Date.parse(failure.notBeforeUtc)+1;assert.equal((await planStep(f)).status,'plan-complete');assert.equal((await state(f)).threadId,'11111111-2222-3333-4444-555555555555');
});
test('actual tool quota persists five-hour delay, including across source refresh and explicit retry flag',async()=>{
  const f=await fixture({linked:true});await planStep(f);const q=await snapshotQueue(f.config),at=f.now;
  const checkpoint={status:'usage-limit',authoritySha256:q.authoritySha256,itemId:q.next.job.id,artifacts:[],failure:{origin:'tool',tool:'image_gen.imagegen',actualError:true,message:'You have hit the usage limit'}};
  const result=await invoke(f,{checkpoint});assert.equal(result.status,'usage-backoff');assert.equal(Date.parse(result.notBeforeUtc),at+FIVE_HOURS);
  await fs.appendFile(f.linkedFile,'\nnew work\n');f.config.retryErrors=true;const startedFile=path.join(f.base,'must-not-start');assert.equal((await invoke(f,{startedFile})).status,'usage-backoff');assert.equal(await fs.access(startedFile).then(()=>true,()=>false),false);assert.equal((await state(f)).notBeforeUtc,result.notBeforeUtc);
});
test('opaque image cannot fulfill a transparent sprite job',async()=>{
  const f=await fixture();await planStep(f);assert.equal((await invoke(f,await imageSettings(f,{image:f.opaque}))).status,'needs-attention');
});
test('opaque scene accepts RGB PNG and rejects a transparent one',async()=>{
  const good=await fixture({kind:'scene',background:'opaque'});await planStep(good);assert.equal((await invoke(good,await imageSettings(good,{image:good.opaque}))).status,'batch-complete');
  const bad=await fixture({kind:'scene',background:'opaque'});await planStep(bad);assert.equal((await invoke(bad,await imageSettings(bad,{image:bad.alpha}))).status,'needs-attention');
});
test('plan-only turn cannot pretend to have used imagegen',async()=>{
  const f=await fixture(),q=await snapshotQueue(f.config);const checkpoint={schema:1,status:'plan-complete',authoritySha256:q.authoritySha256,itemId:q.next.id,sourceFingerprint:q.next.sourceFingerprint,builtinImagegenUsed:true,artifacts:[],plan:f.plan};assert.equal((await invoke(f,{checkpoint})).status,'needs-attention');
});
test('already-covered cannot use a truncated PNG signature as real source evidence',async()=>{
  const f=await fixture(),file=path.join(f.generated,'fake-v1.png'),bytes=Buffer.from('89504e470d0a1a0a','hex');await fs.writeFile(file,bytes);await fs.writeFile(file.replace(/\.png$/,'.provenance.json'),JSON.stringify({id:'golf:vehicle',output:file}));
  const q=await snapshotQueue(f.config),source=q.sources[0];f.plan.jobs=[];f.plan.disposition={kind:'already-covered',reason:'Claimed existing source',evidence:{file:source.file,sha256:source.sha256,quote:'Eight independently painted facings.'},artifacts:[{file,sha256:hash(bytes)}]};
  assert.equal((await planStep(f)).status,'needs-attention');
});
test('already-covered cannot use held source artwork as completion evidence',async()=>{
  const f=await fixture(),file=path.join(f.generated,'held-v1.png'),bytes=await fs.readFile(f.alpha);await fs.copyFile(f.alpha,file);await fs.writeFile(file.replace(/\.png$/,'.provenance.json'),JSON.stringify({id:'golf:vehicle',output:file,visualReviewStatus:'held'}));
  const q=await snapshotQueue(f.config),source=q.sources[0];f.plan.jobs=[];f.plan.disposition={kind:'already-covered',reason:'Claimed existing source',evidence:{file:source.file,sha256:source.sha256,quote:'Eight independently painted facings.'},artifacts:[{file,sha256:hash(bytes)}]};
  assert.equal((await planStep(f)).status,'needs-attention');
});
test('already-covered accepts a decoded non-held source with exact live evidence binding',async()=>{
  const quote='Existing source is already covered and needs no new image.';
  const f=await fixture({sourceText:'**1. Existing boulder** (`golf:vehicle`) · **B** · P1\n'+quote+'\n'}),file=path.join(f.generated,'boulder-v1.png'),bytes=await fs.readFile(f.alpha);await fs.copyFile(f.alpha,file);await fs.writeFile(file.replace(/\.png$/,'.provenance.json'),JSON.stringify({id:'golf:vehicle',output:file}));
  const q=await snapshotQueue(f.config),source=q.sources[0];f.plan.jobs=[];f.plan.coverage='The one requested source already exists; visual review and integration remain separate.';f.plan.disposition={kind:'already-covered',reason:'Existing exact source, without a new image call',evidence:{file:source.file,sha256:source.sha256,quote},artifacts:[{file,sha256:hash(bytes)}]};
  assert.equal((await planStep(f)).status,'plan-complete');assert.equal((await snapshotQueue(f.config)).next,null);
});
