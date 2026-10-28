/** Durable catalogue snapshot: file presence, saved-art review and live integration stay distinct. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
export const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const readJson=async(file,fallback=null)=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}};
export async function writeJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+process.pid+'.tmp';await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n');await fs.rename(temp,file);}
export function parseCatalogue(markdown){
  const starts=[...markdown.matchAll(/^\*\*(\d+)\.\s+(.+?)\*\*(.*)$/gm)],items=[];
  for(let i=0;i<starts.length;i++){
    const match=starts[i],end=starts[i+1]?.index??markdown.length,block=markdown.slice(match.index,end);
    const heading=match[0],id=/`([a-zA-Z][\w-]*:[^`\s]+)`/.exec(heading)?.[1]??null;
    const angle=/·\s*\*\*([A-Z]\d?)\*\*/.exec(heading)?.[1]??null;
    items.push({key:id??`list:${match[1]}`,id,itemNumber:Number(match[1]),name:match[2].replace(/[✅🎨⏳]/gu,'').trim(),angle,
      owner:angle==='A'?'Codex':['B','C','P'].includes(angle)?'RUN':'unassigned',
      priority:/\b(P[123])\b/.exec(heading)?.[1]??'P3',
      authorityClaim:/✅|\((?:already\s+)?in\s+(?:the\s+)?game\)/i.test(heading)?'in-game-claimed':/🎨/.test(heading)?'made-claimed':/⏳/.test(heading)?'active-claimed':'unmarked',
      sourceBlockSha256:sha(Buffer.from(block)),line:markdown.slice(0,match.index).split('\n').length});
  }
  return items;
}
async function filesUnder(folder){const out=[];async function walk(dir){let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}for(const entry of entries){const file=path.join(dir,entry.name);if(entry.isDirectory()){if(!['node_modules','.git','ground'].includes(entry.name))await walk(file);}else if(entry.name.endsWith('.provenance.json'))out.push(file);}}await walk(folder);return out;}
async function artInventory(roots){
  const byId=new Map(),byNumber=new Map();
  for(const root of roots)for(const file of await filesUnder(path.join(root,'art/theme-consistency/generated'))){
    let prov;try{prov=await readJson(file);}catch{continue;}if(!prov?.id)continue;
    const sibling=file.replace(/\.provenance\.json$/,'.png'),candidates=[prov.output,prov.rawFile,sibling].filter(value=>typeof value==='string');
    let image=null;for(const candidate of candidates){const resolved=path.isAbsolute(candidate)?candidate:path.resolve(root,candidate);try{const bytes=await fs.readFile(resolved);image={file:resolved,sha256:sha(bytes),bytes:bytes.length};break;}catch{}}
    if(!image)continue;
    const blocked=prov.integrationStatus==='blocked'||/hold|blocked|reject/i.test(prov.visualReviewStatus??'');
    const record={...image,provenance:file,provenanceSha256:sha(await fs.readFile(file)),review:blocked?'held':'pending',registration:'not-verified',main:'not-verified',directions:prov.viewsOrder??[prov.view??prov.facing].filter(Boolean),viewSet:prov.viewSet??null};
    const decision=prov.appearanceDecision??prov.visualDecision;
    // Supplemental primary decisions preserve exact generator provenance unchanged.
    const decisionPaths=decision?.file?[{file:path.isAbsolute(decision.file)?decision.file:path.resolve(root,decision.file),sha256:decision.sha256}]:[{file:image.file.replace(/\.png$/i,'.appearance.json'),sha256:null}];
    if(!blocked)for(const candidate of decisionPaths){try{const bytes=await fs.readFile(candidate.file);const parsed=JSON.parse(bytes),bindings=parsed.files??parsed.artifacts??[];const imageBound=bindings.some(binding=>binding.sha256===image.sha256&&(binding.file===image.file||path.basename(binding.file??'')===path.basename(image.file)));if((!candidate.sha256||sha(bytes)===candidate.sha256)&&(!parsed.id||parsed.id===prov.id)&&parsed.decision==='accepted-for-art-appearance'&&imageBound){record.review='accepted-hash-bound';record.appearanceDecision={file:candidate.file,sha256:sha(bytes)};}}catch{}}
    if(!byId.has(prov.id))byId.set(prov.id,[]);byId.get(prov.id).push(record);
    const number=prov.brief?.item??prov.catalogueItem;if(number){if(!byNumber.has(Number(number)))byNumber.set(Number(number),[]);byNumber.get(Number(number)).push(record);}
  }
  return {byId,byNumber};
}
export async function snapshotQueue(config,reviewedTokens={}){
  const markdown=await fs.readFile(config.authorityFile,'utf8'),authoritySha256=sha(Buffer.from(markdown));
  const inventory=await artInventory(config.inventoryRoots??[config.repoRoot]);
  const reservations=await readJson(config.reservationsFile,{items:[]});
  const excluded=new Set([...(config.excludeIds??[]),...(reservations.items??[]).filter(item=>item.owner!=='continuous-worker'&&!item.released).map(item=>item.id)]);
  const items=parseCatalogue(markdown).map(item=>{
    const artifacts=inventory.byId.get(item.id)??inventory.byNumber.get(item.itemNumber)??[];
    const reviewToken=item.key+':'+sha(Buffer.from([...new Set(artifacts.map(art=>art.sha256))].sort().join('|')));
    const artReview=artifacts.some(art=>art.review==='accepted-hash-bound')?'accepted-hash-bound':artifacts.some(art=>art.review==='held')?'held':artifacts.length?'pending':'not-generated';
    return {...item,artifacts,generation:artifacts.length?'existing-raw':'missing',artReview,integration:'not-verified',mergedOnMain:'not-verified',reviewToken,
      eligible:item.owner==='Codex'&&item.angle==='A'&&item.authorityClaim==='unmarked'&&!artifacts.length&&!excluded.has(item.id),
      reviewEligible:item.owner==='Codex'&&item.authorityClaim!=='in-game-claimed'&&artifacts.length>0&&artReview!=='accepted-hash-bound'&&!reviewedTokens[reviewToken]&&!excluded.has(item.id),reserved:excluded.has(item.id)};
  });
  const candidates=items.filter(item=>item.eligible).sort((a,b)=>a.priority.localeCompare(b.priority)||a.itemNumber-b.itemNumber);
  const preferred=candidates.find(item=>item.id===config.firstItemId),reviews=items.filter(item=>item.reviewEligible).sort((a,b)=>a.priority.localeCompare(b.priority)||a.itemNumber-b.itemNumber);
  const selected=preferred??candidates[0]??reviews[0]??null;
  const next=selected?{...selected,action:selected.reviewEligible?'review-existing':'generate'}:null;
  const byOwnerAngle={};for(const item of items){const key=item.owner+':'+(item.angle??'unspecified');byOwnerAngle[key]=(byOwnerAngle[key]??0)+1;}
  return {schema:1,refreshedAt:new Date().toISOString(),authorityFile:config.authorityFile,authoritySha256,markdown,items,next,
    pendingPlanning:items.filter(item=>['D','R'].includes(item.angle)&&!item.reserved).map(item=>({key:item.key,itemNumber:item.itemNumber,name:item.name,angle:item.angle,owner:item.owner,status:'pending-direction-subjob-planning',existingArtifacts:item.artifacts.length,expectedDirections:item.angle==='D'?['E','NE','N','NW','W','SW','S','SE']:['x-run','y-run','end-or-corner']})),
    counts:{catalogue:items.length,ownedCodex:items.filter(item=>item.owner==='Codex').length,existingRaw:items.filter(item=>item.artifacts.length).length,pendingReview:items.filter(item=>item.artReview==='pending'||item.artReview==='held').length,eligible:candidates.length,byOwnerAngle},
    completion:'Not a global completion claim: review, integration, RUN-owned items and D/R direction subjobs remain separately visible.'};
}
