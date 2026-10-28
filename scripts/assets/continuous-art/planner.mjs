/** Strict persisted subjobs. A raw PNG satisfies only its exact deliverable, never its whole catalogue item. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
export const planPath=(config,item)=>path.join(config.stateDir,'plans',hash(item.key)+'.json');
export const planHash=plan=>hash(JSON.stringify(plan));
const inside=(root,file)=>{const r=path.relative(root,file);return r!==''&&!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r);};
export async function validatePlan(plan,item,config){
  if(plan?.schema!==1||plan.itemKey!==item.key||plan.sourceFingerprint!==item.sourceFingerprint)return false;
  if(!Array.isArray(plan.jobs)||!plan.jobs.length||typeof plan.coverage!=='string'||!plan.coverage.trim())return false;
  const base=path.resolve(config.repoRoot,'art/theme-consistency/generated'),keys=new Set(),outputs=new Set();
  for(const job of plan.jobs){
    if(!job||typeof job.key!=='string'||!/^[a-zA-Z0-9][\w:./-]*$/.test(job.key)||keys.has(job.key))return false;
    if(typeof job.id!=='string'||! /^[a-zA-Z][\w-]*:[\w:./-]+$/.test(job.id))return false;
    if(typeof job.output!=='string'||!path.isAbsolute(job.output)||!inside(base,path.resolve(job.output))||!/-v\d+(?:[/.\w-]*)\.png$/i.test(job.output.replace(/\\/g,'/')))return false;
    if(outputs.has(path.resolve(job.output)))return false;
    if(!['sprite','scene','portrait','person-source','ground','ground-stage','decal'].includes(job.kind)||!['transparent','opaque'].includes(job.background))return false;
    if(['scene','portrait','ground','ground-stage'].includes(job.kind)&&job.background!=='opaque')return false;
    if(typeof job.camera!=='string'||!job.camera.trim()||typeof job.prompt!=='string'||!job.prompt.trim())return false;
    if(!Array.isArray(job.dependsOn)||!Array.isArray(job.references))return false;
    if(job.replaces){const old=job.replaces;if(typeof old.reason!=='string'||!old.reason.trim()||path.resolve(old.file??'')===path.resolve(job.output)||!item.artifacts.some(a=>path.resolve(a.file)===path.resolve(old.file??'')&&a.sha256===old.sha256))return false;}
    for(const ref of job.references){
      if(ref?.job){if(typeof ref.job!=='string'||!job.dependsOn.includes(ref.job))return false;continue;}
      if(typeof ref?.file!=='string'||!path.isAbsolute(ref.file)||!/^[a-f0-9]{64}$/.test(ref.sha256??''))return false;
      try{if(hash(await fs.readFile(ref.file))!==ref.sha256)return false;}catch{return false;}
    }
    keys.add(job.key);outputs.add(path.resolve(job.output));
  }
  const visiting=new Set(),done=new Set(),jobs=new Map(plan.jobs.map(j=>[j.key,j]));
  function visit(key){if(visiting.has(key))return false;if(done.has(key))return true;visiting.add(key);for(const d of jobs.get(key).dependsOn)if(!jobs.has(d)||!visit(d))return false;visiting.delete(key);done.add(key);return true;}
  if(!plan.jobs.every(j=>visit(j.key)))return false;
  // The live paste-ready queue is explicit about these paths. A made marker may refer to only one of them.
  if((item.linkedOutputs??[]).some(o=>!outputs.has(path.resolve(o.output))))return false;
  return true;
}
export async function readPlan(config,item){
  try{const envelope=JSON.parse(await fs.readFile(planPath(config,item),'utf8'));return envelope.planSha256===planHash(envelope.plan)&&await validatePlan(envelope.plan,item,config)?envelope:null;}catch{return null;}
}
export function reservedJob(reservations,item,job){return reservations.some(r=>!r.released&&r.owner!=='continuous-worker'&&
  (r.subjobKey?(r.subjobKey===job.key||r.output&&path.resolve(r.output)===path.resolve(job.output)||r.outputPath&&path.resolve(r.outputPath)===path.resolve(job.output)):
    (r.id&&r.id===item.id||Number(r.catalogueItem??r.itemNumber)===item.itemNumber)));}
export async function jobStates(plan,item,config,reservations=[]){
  const states=[];
  for(const job of plan.jobs){
    let existing=null;try{const bytes=await fs.readFile(job.output);existing={file:job.output,sha256:hash(bytes),bytes:bytes.length};}catch(error){if(error.code!=='ENOENT')throw error;}
    const prior=item.artifacts.find(a=>path.resolve(a.file)===path.resolve(job.output));
    // Never repaint a present file, including an unreviewed or held one. It remains a review/integration obligation.
    const status=existing?(prior?.sha256===existing.sha256&&prior.review==='held'?'existing-held':prior?.sha256===existing.sha256&&prior.review==='accepted-hash-bound'?'existing-reviewed':'existing-needs-review'):
      reservedJob(reservations,item,job)?'reserved':'pending';
    states.push({...job,status,existing,prior:prior??null});
  }
  for(const job of states)if(job.status==='pending'&&job.dependsOn.some(key=>!states.some(d=>d.key===key&&d.existing&&d.status!=='existing-held')))job.status='waiting-dependency';
  return states;
}
export function planningPrompt(config,queue,batch){
  const item=queue.next;
  return `Plan independent image jobs only. DO NOT generate an image in this turn. Read the imagegen skill and all current live sources listed below; the newer linked queue/owner instructions override historical RUN/magenta/projection prose. All 2D uses built-in ChatGPT; RUN/Meshy is 3D only. Preserve the existing dedicated thread and existing art.\n${JSON.stringify(queue.sources)}\nExpected source fingerprint ${item.sourceFingerprint}. Frozen source bundle ${batch.sourceFile}. Re-read/hash every listed source before writing a checkpoint; if changed return authority-changed.\nCatalogue item and inventory: ${JSON.stringify(item)}\nRead the whole item's live block/section, shared angle block, and linked paste-ready queue. Use its exact filenames, IDs, camera, references and prompts; do not invent A2 projection for scenes, portraits, top-down work or people. Scenes are cinematic eye-level/slightly raised; paired upgraded/tier scenes depend on the preceding picture and use it as an edit reference. P means a single front A-pose source per distinct person, not 3D clips. D means eight independent facings per colour/vehicle. R and kits require all named runs/corners/pieces. B means every requested shape/size variant. Preserve exact existing views and colours, held/rejected originals and good magenta art: never redo for alpha format. Correct only explicitly requested faults in a new version with replaces:{file,sha256,reason}. Grouped tables and unclassified items need a real plan, not a blanket skip. Resolve multiplicity from the full brief; record genuine unresolved ambiguity in coverage rather than claiming completion.\nGround follows the live GROUND-TEXTURE-METHOD: separately authored NEAR/MID/FAR, scene-first repaint preserving scale, then remove anchors, then four large compatible outputs/proofs. Split these into dependency stages; generator prompts for painting must describe the scene/ground, not tell it to make textures/tiles/seamless patterns. Use real screenshot/identity references, never enlarge one band as another. Opaque ground/scenes/portraits stay opaque. Isolated sprites/person source/decal use native true alpha, overriding old magenta guidance.\nWrite ${batch.checkpointFile} atomically as {schema:1,status:'plan-complete',authoritySha256:'${queue.authoritySha256}',sourceFingerprint:'${item.sourceFingerprint}',itemId:'${item.id??item.key}',builtinImagegenUsed:false,artifacts:[],plan:{schema:1,itemKey:'${item.key}',sourceFingerprint:'${item.sourceFingerprint}',coverage:'explain all requested variants, stages and existing art',jobs:[{key:'stable independent subjob key',id:'exact:library-or-source-id',output:'ABSOLUTE path under ${config.repoRoot}/art/theme-consistency/generated/ with a versioned filename/folder ending .png',kind:'sprite|scene|portrait|person-source|ground|ground-stage|decal',background:'transparent|opaque',camera:'brief-specific camera',prompt:'exact requested painting/edit',dependsOn:[],references:[{file:'ABSOLUTE existing reference',sha256:'actual hash'} or {job:'dependency-key'}]}]}}. Include EVERY explicit linkedOutputs path, even if present/reserved; the supervisor decides what remains. Reuse current exact paths for existing deliverables; do not invent v2 to avoid the no-regeneration rule. Each independent file is one job (a specified multi-piece sheet is one file/job); all variant colours/facings/states must be represented. Can build large structured plans programmatically from the live tables; do not hand-repeat prompts unnecessarily. Only write this checkpoint, no state/config/runtime/branch edits. No API/SDK/model fallback. Return at the planning boundary.`;
}
