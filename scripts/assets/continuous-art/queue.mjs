/** Durable catalogue snapshot: file presence, saved-art review and live integration stay distinct. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
export const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const readJson=async(file,fallback=null)=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}};
export async function writeJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+process.pid+'.tmp';await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n');await fs.rename(temp,file);}
export {parseCatalogue} from './catalogue.mjs';
import {parseCatalogue,readSources,linkedDeliverables} from './catalogue.mjs';
import {readPlan,jobStates} from './planner.mjs';
async function filesUnder(folder){const out=[];async function walk(dir){let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}for(const entry of entries){const file=path.join(dir,entry.name);if(entry.isDirectory()){if(!['node_modules','.git'].includes(entry.name))await walk(file);}else if(entry.name.endsWith('.provenance.json'))out.push(file);}}await walk(folder);return out;}
async function artInventory(roots,catalogue){
  const byId=new Map(),byNumber=new Map();
  const relevantIds=new Set(catalogue.map(item=>item.id).filter(Boolean)),relevantNumbers=new Set(catalogue.map(item=>item.itemNumber));
  for(const root of roots)for(const file of await filesUnder(path.join(root,'art/theme-consistency/generated'))){
    let prov;try{prov=await readJson(file);}catch{continue;}if(!prov?.id)continue;
    if(!relevantIds.has(prov.id)&&!relevantNumbers.has(Number(prov.brief?.item??prov.catalogueItem??prov.itemNumber)))continue;
    const sibling=file.replace(/\.provenance\.json$/,'.png'),candidates=[prov.output,prov.rawFile,sibling].filter(value=>typeof value==='string');
    const generated=path.resolve(root,'art/theme-consistency/generated'),resolvedCandidates=candidates.map(c=>path.isAbsolute(c)?c:path.resolve(root,c));
    const local=file=>{const r=path.relative(generated,file);return r!==''&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
    resolvedCandidates.sort((a,b)=>Number(local(b))-Number(local(a)));
    let image=null;for(const resolved of resolvedCandidates){try{const bytes=await fs.readFile(resolved);image={file:resolved,sha256:sha(bytes),bytes:bytes.length};break;}catch{}}
    if(!image)continue;
    const blocked=prov.integrationStatus==='blocked'||/hold|held|blocked|reject/i.test(prov.visualReviewStatus??'')||/^(?:held|blocked|rejected)(?:$|[- :])/i.test(prov.review??'')||/[\\/](?:rejected|held)(?:[\\/]|-)/i.test(image.file);
    const record={...image,id:prov.id,inventoryRoot:root,provenance:file,provenanceSha256:sha(await fs.readFile(file)),review:blocked?'held':'pending',registration:'not-verified',main:'not-verified',directions:prov.viewsOrder??[prov.view??prov.facing].filter(Boolean),viewSet:prov.viewSet??null,subjobKey:prov.subjobKey??null};
    if(blocked&&prov.reviewReason)record.holdReason=prov.reviewReason;
    const decision=prov.appearanceDecision??prov.visualDecision;
    // Supplemental primary decisions preserve exact generator provenance unchanged.
    const decisionPaths=[...(decision?.file?[{file:path.isAbsolute(decision.file)?decision.file:path.resolve(root,decision.file),sha256:decision.sha256}]:[]),{file:image.file.replace(/\.png$/i,'.appearance.json'),sha256:null}];
    const reviewDir=path.join(image.file.replace(/(?:\.raw)?\.png$/i,''),'review');
    try{for(const name of (await fs.readdir(reviewDir)).filter(n=>n.endsWith('.json')).sort())decisionPaths.push({file:path.join(reviewDir,name),sha256:null});}catch(error){if(error.code!=='ENOENT')throw error;}
    for(const candidate of decisionPaths){try{
      const bytes=await fs.readFile(candidate.file),parsed=JSON.parse(bytes),bindings=parsed.files??parsed.artifacts??[];
      const imageBound=bindings.some(binding=>binding.sha256===image.sha256&&(binding.file===image.file||path.basename(binding.file??'')===path.basename(image.file)));
      if((candidate.sha256&&sha(bytes)!==candidate.sha256)||(parsed.id&&parsed.id!==prov.id)||!imageBound)continue;
      const held=parsed.visualAccepted===false||/^(?:held|blocked|rejected)(?:$|[- :])/i.test(parsed.decision??'');
      if(held){record.review='held';record.holdReason=parsed.reason??parsed.geometry?.reason??parsed.reasons??parsed.notes??parsed.summary??parsed.decision;if(parsed.correction)record.correction=parsed.correction;record.appearanceDecision={file:candidate.file,sha256:sha(bytes)};}
      else if(!blocked&&record.review!=='held'&&parsed.decision==='accepted-for-art-appearance'){record.review='accepted-hash-bound';record.appearanceDecision={file:candidate.file,sha256:sha(bytes)};}
    }catch{}}
    if(!byId.has(prov.id))byId.set(prov.id,[]);byId.get(prov.id).push(record);
    const number=prov.brief?.item??prov.catalogueItem??prov.itemNumber;if(number){if(!byNumber.has(Number(number)))byNumber.set(Number(number),[]);byNumber.get(Number(number)).push(record);}
  }
  return {byId,byNumber};
}
export async function snapshotQueue(config,reviewedTokens={}){
  const live=await readSources(config),catalogue=parseCatalogue(live.markdown),linked=linkedDeliverables(live.texts['paste-ready-queue']??'',config),inventory=await artInventory(config.inventoryRoots??[config.repoRoot],catalogue);
  for(const output of linked){
    const overrides=live.correctionJobs.filter(j=>j.catalogueItem===output.itemNumber&&j.subjobKey===output.key);
    if(overrides.length>1)throw Error('Conflicting explicit continuous-art correction briefs for '+output.key);
    if(overrides.length){const j=overrides[0];Object.assign(output,{output:path.resolve(config.repoRoot,j.output),id:j.id,prompt:j.prompt,correctionBrief:j,source:j.source,replaces:j.replaces?{...j.replaces,file:path.resolve(config.repoRoot,j.replaces.file)}:null});}
  }
  const reservations=(await readJson(config.reservationsFile,{items:[]})).items??[],excluded=new Set(config.excludeIds??[]),items=[];
  for(const item of catalogue){
    const artifacts=[...new Map([...(inventory.byId.get(item.id)??[]),...(inventory.byNumber.get(item.itemNumber)??[])].map(a=>[path.resolve(a.file),a])).values()];
    const reviewToken=item.key+':'+sha(Buffer.from([...new Set(artifacts.map(a=>a.sha256))].sort().join('|'))),artReview=artifacts.some(a=>a.review==='accepted-hash-bound')?'accepted-hash-bound':artifacts.some(a=>a.review==='held')?'held':artifacts.length?'pending':'not-generated';
    const linkedOutputs=linked.filter(x=>x.itemNumber===item.itemNumber),reserved=excluded.has(item.id)||reservations.some(r=>!r.subjobKey&&!r.released&&r.owner!=='continuous-worker'&&(r.id&&r.id===item.id||Number(r.catalogueItem??r.itemNumber)===item.itemNumber));
    const value={...item,artifacts,linkedOutputs,sourceRecords:live.sources,sourceFingerprint:sha(Buffer.from(live.sourceFingerprint+':'+item.sourceBlockSha256)),generation:artifacts.length?'existing-raw':'missing',artReview,integration:'not-verified',mergedOnMain:'not-verified',reviewToken,reserved};
    if(config.planning===false){value.eligible=item.angle==='A'&&item.authorityClaim==='unmarked'&&!artifacts.length&&!reserved;value.reviewEligible=!item.pipelineOnly&&item.authorityClaim!=='in-game-claimed'&&artifacts.length>0&&artReview!=='accepted-hash-bound'&&!reviewedTokens[reviewToken]&&!reserved;}
    else{
      value.plan=await readPlan(config,value);value.jobs=value.plan?await jobStates(value.plan.plan,value,config,reservations):[];
      const claimBlocks=item.authorityClaim==='in-game-claimed'&&!linkedOutputs.length||item.authorityClaim==='active-claimed'&&!linkedOutputs.length;
      value.eligible=!reserved&&!item.pipelineOnly&&!claimBlocks;value.planNeeded=value.eligible&&!value.plan;value.pendingJobs=value.jobs.filter(j=>j.status==='pending');value.reusableJobs=value.jobs.filter(j=>j.status==='copy-existing');value.reviewEligible=false;
    }
    items.push(value);
  }
  const rank=x=>x.linkedOutputs.some(o=>o.first)?0:x.linkedOutputs.length?1:2;
  const order=x=>x.linkedOutputs.length?Math.min(...x.linkedOutputs.map(o=>o.sourceLine)):x.id===config.firstItemId?-1:0;
  const ordered=items.slice().sort((a,b)=>rank(a)-rank(b)||order(a)-order(b)||a.priority.localeCompare(b.priority)||(a.itemNumber??9999)-(b.itemNumber??9999));let next=null;
  if(config.planning===false){const x=ordered.find(x=>x.eligible)??ordered.find(x=>x.reviewEligible);if(x)next={...x,action:x.reviewEligible?'review-existing':'generate'};}
  else for(const x of ordered){if(!x.eligible)continue;if(x.planNeeded){next={...x,action:'plan'};break;}if(x.reusableJobs.length){next={...x,action:'copy-existing-subjob',job:x.reusableJobs[0],planSha256:x.plan.planSha256};break;}if(x.pendingJobs.length){next={...x,action:'generate-subjob',job:x.pendingJobs[0],planSha256:x.plan.planSha256};break;}}
  const byOwnerAngle={};for(const x of items){const key=x.owner+':'+(x.angle??'unclassified');byOwnerAngle[key]=(byOwnerAngle[key]??0)+1;}
  return {schema:2,...live,items,next,pendingPlanning:items.filter(x=>x.planNeeded).map(x=>({key:x.key,itemNumber:x.itemNumber,angle:x.angle,status:'pending-ai-plan'})),
    counts:{catalogue:items.length,existingRaw:items.filter(x=>x.artifacts.length).length,pendingReview:items.filter(x=>['pending','held'].includes(x.artReview)).length,eligible:items.filter(x=>x.eligible).length,pendingDispositions:items.filter(x=>x.plan?.plan.disposition&&x.plan.plan.disposition.kind!=='already-covered').length,pendingSubjobs:items.reduce((n,x)=>n+(x.pendingJobs?.length??0),0),waitingSubjobs:items.reduce((n,x)=>n+(x.jobs?.filter(j=>['reserved','waiting-dependency','existing-held','existing-needs-review'].includes(j.status)).length??0),0),byOwnerAngle},
    completion:'Inventory/plans only. Raw, held, reserved, dependency-blocked, review, integration and 3D-pipeline work remain separate; no global completion claim.'};
}
