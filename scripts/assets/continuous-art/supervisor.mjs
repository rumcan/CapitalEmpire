/** One cheap scheduled tick, at most one dedicated built-in-imagegen worker batch. UTC usage backoff is five hours. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {snapshotQueue,readJson,writeJson,sha} from './queue.mjs';
export const FIVE_HOURS=5*60*60*1000;
export const FORBIDDEN_THREADS=['01a16c0b-bcad-7e71-a5d0-0281b98562b9'];
export function actualUsageError(event){
  if(!event||!['error','turn.failed','request.failed'].includes(event.type))return false;
  const message=typeof event.error==='string'?event.error:event.error?.message??event.message??'';
  return /usage[_ -]?limit|quota[_ -]?(?:exceeded|exhausted)|insufficient_quota|you.{0,8}ve hit.{0,40}limit/i.test(message);
}
export function actualUsageCheckpoint(checkpoint){
  const failure=checkpoint?.failure;
  return checkpoint?.status==='usage-limit'&&failure?.origin==='tool'&&failure.actualError===true&&
    ['image_gen.imagegen','tools.image_gen__imagegen'].includes(failure.tool)&&actualUsageError({type:'error',error:failure});
}
export async function validCheckpoint(checkpoint,queue,config){
  if(!checkpoint||checkpoint.authoritySha256!==queue.authoritySha256||checkpoint.itemId!==(queue.next.id??queue.next.key))return false;
  const reviewing=queue.next.action==='review-existing';
  if(checkpoint.status!==(reviewing?'review-checkpointed':'batch-complete')||(!reviewing&&checkpoint.builtinImagegenUsed!==true))return false;
  if(!Array.isArray(checkpoint.artifacts)||checkpoint.artifacts.length===0)return false;
  const generated=await fs.realpath(path.join(config.repoRoot,'art/theme-consistency/generated'));
  for(const artifact of checkpoint.artifacts){
    if(typeof artifact.file!=='string'||!path.isAbsolute(artifact.file)||!artifact.file.toLowerCase().endsWith('.png'))return false;
    let resolved,bytes;try{resolved=await fs.realpath(artifact.file);bytes=await fs.readFile(resolved);}catch{return false;}
    const relative=path.relative(generated,resolved);if(!reviewing&&(relative.startsWith('..')||path.isAbsolute(relative)))return false;
    if(bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.subarray(12,16).toString()!=='IHDR'||bytes.readUInt32BE(16)<1||bytes.readUInt32BE(20)<1||sha(bytes)!==artifact.sha256)return false;
    try{await sharp(bytes,{limitInputPixels:100000000}).raw().toBuffer();}catch{return false;}
    if(reviewing&&!queue.next.artifacts.some(prior=>path.resolve(prior.file)===path.resolve(artifact.file)&&prior.sha256===artifact.sha256))return false;
    if(!reviewing){
      const candidates=[resolved.replace(/\.png$/i,'.provenance.json'),resolved.replace(/\.raw\.png$/i,'.provenance.json')];
      let correctId=false;for(const file of [...new Set(candidates)]){try{const provenance=await readJson(file);if(provenance?.id===checkpoint.itemId){correctId=true;break;}}catch{}}
      if(!correctId)return false;
    }
  }
  return true;
}
export function argsForThread(threadId,worktree){
  if(threadId){if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(threadId)||FORBIDDEN_THREADS.includes(threadId))throw Error('Refusing non-dedicated/invalid worker thread');
    return ['exec','resume','--json','-c','approval_policy="never"','-c','sandbox_mode="danger-full-access"',threadId,'-'];}
  return ['exec','--json','-s','danger-full-access','-c','approval_policy="never"','-C',worktree,'-'];
}
function alive(pid){if(!Number.isInteger(pid))return false;try{process.kill(pid,0);return true;}catch{return false;}}
export async function acquireLock(stateDir){
  await fs.mkdir(stateDir,{recursive:true});const file=path.join(stateDir,'worker.lock.json'),token=crypto.randomUUID();
  const claim={pid:process.pid,workerPid:null,hostname:os.hostname(),token,createdAt:new Date().toISOString()};
  let handle;try{handle=await fs.open(file,'wx');}catch(error){
    if(error.code!=='EEXIST')throw error;
    const recovery=file+'.recovery';let recover;
    try{recover=await fs.open(recovery,'wx');await recover.writeFile(JSON.stringify({pid:process.pid,hostname:os.hostname(),token,createdAt:new Date().toISOString()}));}catch(error){if(error.code==='EEXIST'){const held=await readJson(recovery);if(!alive(held?.pid))throw Error('Stale recovery lock needs explicit inspection/removal: '+recovery);return null;}throw error;}
    try{
      const previous=await readJson(file);if(previous?.hostname!==os.hostname()||alive(previous?.pid)||alive(previous?.workerPid))return null;
      await fs.unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});
      try{handle=await fs.open(file,'wx');}catch(error){if(error.code==='EEXIST')return null;throw error;}
    }finally{await recover.close();await fs.unlink(recovery);}
  }
  await handle.writeFile(JSON.stringify(claim));await handle.close();
  return {async setWorker(pid){if((await readJson(file))?.token!==token)throw Error('Worker lock ownership changed');claim.workerPid=pid;await writeJson(file,claim);},async release(){const latest=await readJson(file);if(latest?.token===token)await fs.unlink(file);}};
}
export async function discoverBinary(config){
  const extensionRoot=config.extensionRoot??path.join(os.homedir(),'.vscode/extensions');
  const candidates=config.binaryPath?[config.binaryPath]:(await fs.readdir(extensionRoot)).filter(name=>name.startsWith('openai.chatgpt-')).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})).map(name=>path.join(extensionRoot,name,'bin/windows-x86_64/codex.exe'));
  for(const file of candidates){try{await fs.access(file);}catch{continue;}const result=spawnSync(file,['--version'],{encoding:'utf8',windowsHide:true}),version=/codex-cli\s+(\d+)\.(\d+)\./.exec(result.stdout??'');if(result.status===0&&version&&(Number(version[1])>=1||Number(version[2])>=164))return {file,version:result.stdout.trim()};}
  throw Error('No supported VS Code bundled Codex binary found. No npm, API or image-script fallback is allowed.');
}
export function workerPrompt(config,queue,batch){return `You are the DEDICATED continuous golf artwork worker, not the interactive parent. This turn handles at most ${config.maxImagesPerBatch??1} newly generated images and must checkpoint after every copied image.
Read ${config.repoRoot}/art/theme-consistency/jobs/CONTINUOUS-ART-HANDOVER.md and the current live authority ${config.authorityFile}; expected SHA256 ${queue.authoritySha256}. A frozen batch source is ${batch.sourceFile}. Re-read the live source before claiming/generating: if it changed, checkpoint status authority-changed and return without generating.
CURRENT OWNER OVERRIDE 2026-10-28: built-in imagegen supports true alpha. Use transparent_background:true with no background. DO NOT use magenta for this built-in tool; this overrides older magenta wording in the Markdown. Keep existing good magenta originals and key them rather than regenerate for format.
Ownership: Codex owns current A=2 genuinely different front+right/front+left views. A8 is retired for NEW work. RUN owns B/C/P; do not duplicate RUN or other active work. Existing reviewed four-view art remains useful. No mirrored/copied fake turns. Fixed game edges +/-0.5, verticals vertical; screen-upper-right light.
This batch's claimed item: ${JSON.stringify(queue.next)}. Other active reservations/exclusions: ${JSON.stringify(config.excludeIds??[])}. First validation is golf:range-coffee-kiosk; no dispenser or yardage-board duplication.
Apply imagegen skill C:/Users/RAMPAGE/.codex/skills/.system/imagegen/SKILL.md. Use ONLY the BUILT-IN image_gen.imagegen (tools.image_gen__imagegen). First verify that tool exists. If absent, write status capability-error and stop. NO image API calls, image_gen.py/SDK/other-model fallback or account switching. View all style references ${JSON.stringify(config.styleReferences??[])} and relevant current two-view camera reference before invoking imagegen. Attach main theme first, owner's country-club additional reference second, geometry last. Country-club reference is style only: do not copy UI, roads or scenery into isolated sprites. Retain upper-right fixed light and precise game projection. Do not claim availability alone proves generation.
Save image source immediately under ${config.repoRoot}/art/theme-consistency/generated/ with a versioned filename and exact id/prompt/reference hashes/provenance. Before imagegen, search existing generated files/root+live for this EXACT id; if an output already exists, inspect/checkpoint it and NEVER duplicate. Preserve failed takes, don't overwrite. You may crop/key/check native assets but do not mutate root runtime, index, branch, owner files/servers or merge PRs. Root checkout belongs to another old arena branch. Code work stays only in ${config.worktree}. Scratch/state/logs stay on E:.
Inspect true alpha, full silhouettes, theme/light/real views; label pending visual review and pending integration separately. Queue integration/handoff to parent; don't claim game/main merely from raw files. Finish at this batch boundary; no infinite inner loop.
Write ${batch.checkpointFile} atomically after EVERY image and on failure, as JSON: {schema:1, status:'batch-complete'|'review-checkpointed'|'usage-limit'|'capability-error'|'authority-changed'|'error', authoritySha256:'${queue.authoritySha256}', itemId:'${queue.next?.id??queue.next?.key}', builtinImagegenUsed:true|false, artifacts:[{file:ABSOLUTE_PATH,sha256:ACTUAL_SHA256,review:'pending'|'accepted'|'held',integration:'pending'}], error:null|string}. A new generation requires builtinImagegenUsed:true and at least one genuine copied PNG. If selected action is review-existing, do NOT generate: inspect existing hashed artifacts, checkpoint status review-checkpointed and their original hashes, record disposition/remaining work; this is handled once per source hash so pending parent review doesn't stall the rest forever.
IMPORTANT: imagegen quota errors can arrive as tool results even when the outer CLI turn exits0. On an ACTUAL tool usage error write status:'usage-limit', failure:{origin:'tool',tool:'image_gen.imagegen',actualError:true,message:EXACT_TOOL_ERROR,code:ACTUAL_CODE_IF_PRESENT}, preserving any already-copied artifacts. Do not mark usage-limit because a prompt mentions it. Technical/auth/capability errors use their own status, never usage-limit. Return concise actual paths/status.
`;}
export async function tick(config,{now=()=>Date.now(),dryRun=false,runnerOverride=null}={}){
  if(!path.isAbsolute(config.stateDir)||!path.isAbsolute(config.worktree)||!path.isAbsolute(config.repoRoot))throw Error('Absolute workspace/state paths required');
  const lock=await acquireLock(config.stateDir);if(!lock)return {status:'already-running'};
  const stateFile=path.join(config.stateDir,'state.json');let state=await readJson(stateFile,{schema:1,threadId:null,status:'new',batches:0});let writes=Promise.resolve(),child=null,heartbeat=null,completion=null;
  const persist=()=>{writes=writes.then(()=>writeJson(stateFile,state));return writes;};
  try{
    if(await readJson(path.join(config.stateDir,'STOP.json')))return {status:'stopped'};
    const queue=await snapshotQueue(config,state.reviewedTokens??{});const {markdown,...durableQueue}=queue;await writeJson(path.join(config.stateDir,'queue.json'),durableQueue);
    state.authoritySha256=queue.authoritySha256;state.queueCounts=queue.counts;state.lastTickAt=new Date(now()).toISOString();await persist();
    if(state.notBeforeUtc&&Date.parse(state.notBeforeUtc)>now()){state.status='usage-backoff';await persist();return {status:state.status,notBeforeUtc:state.notBeforeUtc};}
    if(!queue.next){state.status='idle-awaiting-new-art-or-review';state.notBeforeUtc=null;await persist();return {status:state.status,counts:queue.counts};}
    const binary=runnerOverride??await discoverBinary(config),fingerprint=sha(Buffer.from(JSON.stringify({binary,worktree:config.worktree,authoritySha256:queue.authoritySha256,item:queue.next.sourceBlockSha256,styleReferences:config.styleReferences})));
    if(state.needsAttention&&state.failureFingerprint===fingerprint&&!config.retryErrors)return {status:'needs-attention',error:state.lastError};
    const stamp=new Date(now()).toISOString().replace(/[:.]/g,'-'),batchDir=path.join(config.stateDir,'batches',stamp);
    await fs.mkdir(batchDir,{recursive:true});const batch={id:stamp,sourceFile:path.join(batchDir,'authority.md'),checkpointFile:path.join(batchDir,'checkpoint.json')};
    await fs.writeFile(batch.sourceFile,markdown);const prompt=workerPrompt(config,queue,batch);await fs.writeFile(path.join(batchDir,'prompt.md'),prompt);
    const args=runnerOverride?.args??argsForThread(state.threadId,config.worktree);if(dryRun)return {status:'dry-run',binary,args,item:queue.next,checkpointFile:batch.checkpointFile};
    state.status='running';state.notBeforeUtc=null;state.needsAttention=false;state.activeBatch={...batch,itemId:queue.next.id??queue.next.key};state.binary=binary;await persist();
    child=spawn(binary.file,args,{cwd:config.worktree,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,TEMP:config.tempDir??'E:/ClaudeTemp',TMP:config.tempDir??'E:/ClaudeTemp'}});
    completion=new Promise(resolve=>{child.once('error',error=>resolve({code:-1,error:error.message}));child.once('close',code=>resolve({code}));});
    await lock.setWorker(child.pid);state.workerPid=child.pid;await persist();
    heartbeat=setInterval(()=>{state.lastHeartbeatAt=new Date(now()).toISOString();persist().catch(()=>{});},30000);heartbeat.unref();
    const stderr=[];child.stderr.on('data',chunk=>stderr.push(chunk.toString()));
    child.stdin.on('error',()=>{});child.stdin.end(prompt);let usage=false,turnError=null;const eventLog=path.join(batchDir,'events.jsonl');
    for await(const line of createInterface({input:child.stdout})){await fs.appendFile(eventLog,line+'\n');let event;try{event=JSON.parse(line);}catch{continue;}
      if(event.type==='thread.started'){const id=event.thread_id;if(FORBIDDEN_THREADS.includes(id))throw Error('Runner attempted to attach to forbidden interactive thread');if(state.threadId&&state.threadId!==id)throw Error('Runner resumed a different thread');state.threadId=id;await persist();}
      if(actualUsageError(event))usage=true;if(['error','turn.failed','request.failed'].includes(event.type))turnError=event.error?.message??event.message??JSON.stringify(event.error);
    }
    const result=await completion;clearInterval(heartbeat);const errorText=stderr.join('');await fs.writeFile(path.join(batchDir,'stderr.log'),errorText);
    const checkpoint=await readJson(batch.checkpointFile);
    if(actualUsageCheckpoint(checkpoint))usage=true;
    if(result.code!==0&&/usage[_ -]?limit|insufficient_quota|quota[_ -]?(?:exceeded|exhausted)/i.test(errorText))usage=true;
    state.workerPid=null;state.batches++;state.lastBatchId=batch.id;
    if(usage){state.status='usage-backoff';state.notBeforeUtc=new Date(now()+FIVE_HOURS).toISOString();state.lastError=checkpoint?.failure?.message||turnError||errorText;state.lastCheckpoint=checkpoint;}
    else{
      const valid=await validCheckpoint(checkpoint,queue,config);
      if(result.code===0&&valid){state.status=checkpoint.status;state.lastCheckpoint=checkpoint;state.needsAttention=false;state.notBeforeUtc=null;if(queue.next.action==='review-existing'){state.reviewedTokens??={};state.reviewedTokens[queue.next.reviewToken]=new Date(now()).toISOString();}}
      else if(result.code===0&&checkpoint?.status==='authority-changed'){state.status='authority-changed';state.notBeforeUtc=null;}
      else{state.status='needs-attention';state.needsAttention=true;state.failureFingerprint=fingerprint;state.lastError=result.error||turnError||checkpoint?.error||errorText||'Worker did not provide a valid durable checkpoint';state.notBeforeUtc=null;}
    }
    delete state.activeBatch;await persist();return {status:state.status,threadId:state.threadId,batchId:batch.id,notBeforeUtc:state.notBeforeUtc,lastError:state.lastError??null};
  }catch(error){state.status='needs-attention';state.lastError=error.message;state.needsAttention=true;await persist();return {status:state.status,error:error.message};}
  finally{try{
    if(heartbeat)clearInterval(heartbeat);
    if(child&&child.exitCode===null&&child.signalCode===null){child.kill();await completion;}
    state.workerPid=null;await persist();await writes;
  }finally{await lock.release();}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const at=process.argv.indexOf('--config');if(at<0)throw Error('--config <absolute JSON> is required');const config=await readJson(process.argv[at+1]);if(!config)throw Error('Missing config');
  if(process.argv.includes('--retry-errors'))config.retryErrors=true;
  const result=await tick(config,{dryRun:process.argv.includes('--dry-run')});console.log(JSON.stringify(result,null,2));if(result.status==='needs-attention')process.exitCode=1;
}
