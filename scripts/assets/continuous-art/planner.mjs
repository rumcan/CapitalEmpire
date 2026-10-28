/** Strict persisted subjobs. A raw PNG satisfies only its exact deliverable, never its whole catalogue item. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
export const planPath=(config,item)=>path.join(config.stateDir,'plans',hash(item.key)+'.json');
export const planHash=plan=>hash(JSON.stringify(plan));
const inside=(root,file)=>{const r=path.relative(root,file);return r!==''&&!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r);};
const fileKey=file=>process.platform==='win32'?path.resolve(file).toLowerCase():path.resolve(file);
const positiveAlphaConflict=prompt=>/\bmagenta\b|#ff00ff|\brgb\s*255\s*,\s*0\s*,\s*255/i.test(prompt.replace(/\b(?:no|without|never)\s+(?:(?:a|any|flat|pure|solid|generated)\s+){0,4}(?:magenta(?:\s+background)?|#ff00ff|rgb\s*255\s*,\s*0\s*,\s*255)/gi,''));
async function physical(file){let at=path.resolve(file),suffix=[];for(;;){try{return path.resolve(await fs.realpath(at),...suffix);}catch(error){if(error.code!=='ENOENT')throw error;const parent=path.dirname(at);if(parent===at)throw error;suffix.unshift(path.basename(at));at=parent;}}}
export async function validatePlan(plan,item,config){
  if(plan?.schema!==1||plan.itemKey!==item.key||plan.sourceFingerprint!==item.sourceFingerprint)return false;
  if(!Array.isArray(plan.jobs)||typeof plan.coverage!=='string'||!plan.coverage.trim())return false;
  if(!plan.jobs.length){
    const d=plan.disposition,e=d?.evidence;if((item.linkedOutputs??[]).length||!['deferred','already-covered','needs-clarification'].includes(d?.kind)||typeof d.reason!=='string'||!d.reason.trim()||typeof e?.quote!=='string'||e.quote.length<12)return false;
    if(!(item.sourceRecords??[]).some(s=>s.file===e.file&&s.sha256===e.sha256))return false;
    try{
      const bytes=await fs.readFile(e.file);if(hash(bytes)!==e.sha256||!bytes.toString('utf8').includes(e.quote))return false;
      if(d.kind==='already-covered'){
        if(!Array.isArray(d.artifacts)||!d.artifacts.length)return false;
        for(const a of d.artifacts){if(!item.artifacts.some(p=>path.resolve(p.file)===path.resolve(a.file??'')&&p.sha256===a.sha256&&p.review!=='held'))return false;const picture=await fs.readFile(a.file);if(hash(picture)!==a.sha256||picture.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return false;await sharp(picture,{limitInputPixels:100000000}).raw().toBuffer();}
      }
      return true;
    }catch{return false;}
  }
  const base=path.resolve(config.repoRoot,'art/theme-consistency/generated'),keys=new Set(),outputs=new Set(),referenceHashes=new Map();
  const actualRoot=await physical(config.repoRoot),actualBase=await physical(base);if(!inside(actualRoot,actualBase))return false;
  for(const job of plan.jobs){
    if(!job||typeof job.key!=='string'||!/^[a-zA-Z0-9][\w:./-]*$/.test(job.key)||keys.has(job.key))return false;
    if(typeof job.id!=='string'||! /^[a-zA-Z][\w-]*:[\w:./-]+$/.test(job.id))return false;
    if(typeof job.output!=='string'||!path.isAbsolute(job.output)||!inside(base,path.resolve(job.output))||!/-v\d+(?:[/.\w-]*)\.png$/i.test(job.output.replace(/\\/g,'/')))return false;
    if(outputs.has(fileKey(job.output))||!inside(actualBase,await physical(job.output)))return false;
    if(!['sprite','scene','portrait','person-source','ground','ground-stage','decal'].includes(job.kind)||!['transparent','opaque'].includes(job.background))return false;
    if(['scene','portrait','ground','ground-stage'].includes(job.kind)&&job.background!=='opaque')return false;
    if(['sprite','person-source','decal'].includes(job.kind)&&job.background!=='transparent')return false;
    if(typeof job.camera!=='string'||!job.camera.trim()||typeof job.prompt!=='string'||!job.prompt.trim())return false;
    if(job.background==='transparent'&&positiveAlphaConflict(job.prompt))return false;
    if(['ground','ground-stage'].includes(job.kind)&&/\b(?:textures?|tiles?|tileable|seamless)\b/i.test(job.prompt))return false;
    if(!Array.isArray(job.dependsOn)||!Array.isArray(job.references))return false;
    if(job.replaces){const old=job.replaces;if(typeof old.reason!=='string'||!old.reason.trim()||path.resolve(old.file??'')===path.resolve(job.output)||!item.artifacts.some(a=>path.resolve(a.file)===path.resolve(old.file??'')&&a.sha256===old.sha256))return false;}
    for(const ref of job.references){
      if(ref?.job){if(typeof ref.job!=='string'||!job.dependsOn.includes(ref.job))return false;continue;}
      if(typeof ref?.file!=='string'||!path.isAbsolute(ref.file)||!/^[a-f0-9]{64}$/.test(ref.sha256??''))return false;
      try{if(!referenceHashes.has(ref.file))referenceHashes.set(ref.file,hash(await fs.readFile(ref.file)));if(referenceHashes.get(ref.file)!==ref.sha256)return false;}catch{return false;}
    }
    keys.add(job.key);outputs.add(fileKey(job.output));
  }
  const visiting=new Set(),done=new Set(),jobs=new Map(plan.jobs.map(j=>[j.key,j]));
  function visit(key){if(visiting.has(key))return false;if(done.has(key))return true;visiting.add(key);for(const d of jobs.get(key).dependsOn)if(!jobs.has(d)||!visit(d))return false;visiting.delete(key);done.add(key);return true;}
  if(!plan.jobs.every(j=>visit(j.key)))return false;
  // The live paste-ready queue is explicit about these paths. A made marker may refer to only one of them.
  if((item.linkedOutputs??[]).some(o=>!outputs.has(fileKey(o.output))||!keys.has(o.key)))return false;
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
  return `Plan independent image jobs only. DO NOT generate an image in this turn. Read the imagegen skill and all current live sources listed below; the newer linked queue/owner instructions override historical RUN/magenta/projection prose. All 2D uses built-in ChatGPT; RUN/Meshy is 3D only. Preserve the existing dedicated thread and existing art.\n${JSON.stringify(queue.sources)}\nExpected source fingerprint ${item.sourceFingerprint}. Frozen source bundle ${batch.sourceFile}. Re-read/hash every listed source before writing a checkpoint; if changed return authority-changed.\nCatalogue item and inventory: ${JSON.stringify(item)}\nConfigured supporting style references: ${JSON.stringify(config.styleReferences??[])}; include actual file/hash bindings in job.references.
Read the whole item's live block/section, shared angle block, and linked paste-ready queue. Use its exact filenames, IDs, camera, references and prompts; do not invent A2 projection for scenes, portraits, top-down work or people. Scenes are cinematic eye-level/slightly raised; paired upgraded/tier scenes depend on the preceding picture and use it as an edit reference. P means a single front A-pose source per distinct person, not 3D clips. D means eight independent facings per colour/vehicle. R and kits require all named runs/corners/pieces. B means every requested shape/size variant. Preserve exact existing views and colours, held/rejected originals and good magenta art: never redo for alpha format. Correct only explicitly requested faults in a new version with replaces:{file,sha256,reason}. Grouped tables and unclassified items need a real plan, not a blanket skip. Resolve multiplicity from the full brief; record genuine unresolved ambiguity in coverage rather than claiming completion.\nGround follows the live GROUND-TEXTURE-METHOD: separately authored NEAR/MID/FAR, scene-first repaint preserving scale, then remove anchors, then four large compatible outputs/proofs. Split these into dependency stages; generator prompts for painting must describe the scene/ground, not tell it to make textures/tiles/seamless patterns. Use real screenshot/identity references, never enlarge one band as another. Keep original old prompts in the frozen source, but REWRITE any positive magenta/#FF00FF/RGB255,0,255 background instructions in each new transparent job.prompt to native true alpha. Do not pass contradictory source text as the generation prompt. Ground/ground-stage job.prompt must not contain the scale-trigger words texture, tile, tileable or seamless, even if an older shared C block does. Opaque ground/scenes/portraits stay opaque. Isolated sprites/person source/decal use native true alpha, overriding old magenta guidance.\nWrite ${batch.checkpointFile} atomically as {schema:1,status:'plan-complete',authoritySha256:'${queue.authoritySha256}',sourceFingerprint:'${item.sourceFingerprint}',itemId:'${item.id??item.key}',builtinImagegenUsed:false,artifacts:[],plan:{schema:1,itemKey:'${item.key}',sourceFingerprint:'${item.sourceFingerprint}',coverage:'explain all requested variants, stages and existing art',jobs:[{key:'stable independent subjob key',id:'exact:library-or-source-id',output:'ABSOLUTE path under ${config.repoRoot}/art/theme-consistency/generated/ with a versioned filename/folder ending .png',kind:'sprite|scene|portrait|person-source|ground|ground-stage|decal',background:'transparent|opaque',camera:'brief-specific camera',prompt:'exact requested painting/edit',dependsOn:[],references:[{file:'ABSOLUTE existing reference',sha256:'actual hash'} or {job:'dependency-key'}]}]}}. Use each linkedOutputs.key exactly for its given path (including180a-run), not a new invented key. An explicitly deferred/already-covered/ambiguous item with NO linked outputs may instead use jobs:[] and disposition:{kind:deferred|already-covered|needs-clarification,reason,evidence:{file,sha256,quote:EXACT_LIVE_SOURCE_TEXT},artifacts:[{file,sha256}]}. already-covered additionally requires real non-held inventory PNG/hash evidence, never a made marker alone. These are visible dispositions, not global completion.
Include EVERY explicit linkedOutputs path, even if present/reserved; the supervisor decides what remains. Reuse current exact paths for existing deliverables; do not invent v2 to avoid the no-regeneration rule. Each independent file is one job (a specified multi-piece sheet is one file/job); all variant colours/facings/states must be represented. Can build large structured plans programmatically from the live tables; do not hand-repeat prompts unnecessarily. Only write this checkpoint, no state/config/runtime/branch edits. No API/SDK/model fallback. Return at the planning boundary.`;
}

export function subjobPrompt(config,queue,batch){
  const item=queue.next,job=item.job,refs=job.references.map(r=>r.job?item.jobs.find(j=>j.key===r.job)?.existing:r);
  return `Execute exactly ONE independent image job in the existing dedicated thread. Do not plan/generate other jobs in this turn. Use ONLY the BUILT-IN image_gen.imagegen (tools.image_gen__imagegen), after reading C:/Users/RAMPAGE/.codex/skills/.system/imagegen/SKILL.md and verifying that tool exists. No image API/SDK/script/other-model fallback or account switching. All 2D is ChatGPT; RUN/Meshy is 3D only.\nLive sources and hashes: ${JSON.stringify(queue.sources)}. Re-read/hash all before generating and before checkpointing. Expected sourceFingerprint ${item.sourceFingerprint}. Frozen bundle ${batch.sourceFile}. On any source change write authority-changed and return without another image.\nItem ${item.key}, catalogue number ${item.itemNumber}, source block: ${item.block}\nStrict selected job: ${JSON.stringify(job)}\nResolved edit/style references: ${JSON.stringify(refs)}. Configured style references: ${JSON.stringify(config.styleReferences??[])}. View existing local reference images before using them. Main theme first, supporting owner/concept style next, item geometry last where relevant. Match the job camera exactly: no isometric guide for eye-level scenes/portraits or screenshot-derived ground. Keep previous matching scene/tier as an edit reference, preserving camera/composition. Follow the live ground method stage rather than prompting a microscopic repeating swatch. Upper-right light unless this actual brief explicitly requires neutral lighting.\nCURRENT OWNER alpha override: isolated sprite/person-source/decal uses transparent_background:true, native true alpha, no generated floor/background; old magenta wording is superseded for NEW pictures. Opaque scene/portrait/ground uses transparent_background:false. Never redo good existing art for alpha formatting. No flips/mirrors/duplicated fake facings.\nBefore imagegen inspect exact output ${job.output}, inventory roots ${JSON.stringify(config.inventoryRoots??[config.repoRoot])} and this exact subjob/variant/facing. If that exact deliverable now exists, preserve it, write authority-changed with explanation and return for inventory refresh; do not invent another version. Held files remain held. A correction is allowed only when the selected job has explicit replaces evidence/reason and a distinct new-version output. Preserve all other views/colours and failed takes.\nAfter the actual tool succeeds copy the native PNG immediately to EXACTLY ${job.output}. Write its sibling .provenance.json with {id:'${job.id}',catalogueItem:${JSON.stringify(item.itemNumber)},itemKey:'${item.key}',subjobKey:'${job.key}',sourceFingerprint:'${item.sourceFingerprint}',planSha256:'${item.planSha256}',output:'${job.output}',outputSha256:ACTUAL_PNG_SHA256,prompt:EXACT_GENERATION_PROMPT,references:ACTUAL_REFERENCE_HASH_BINDINGS}. Inspect true alpha/opaque background, silhouette/camera/light, and record review pending or held separately from integration pending. Do not change runtime, index, branch, owner files/servers, worker config/state or merge.\nWrite ${batch.checkpointFile} atomically after copying and on failure: {schema:1,status:'batch-complete'|'usage-limit'|'capability-error'|'authority-changed'|'error',authoritySha256:'${queue.authoritySha256}',sourceFingerprint:'${item.sourceFingerprint}',planSha256:'${item.planSha256}',itemId:'${job.id}',subjobKey:'${job.key}',builtinImagegenUsed:true|false,artifacts:[{file:'${job.output}',sha256:ACTUAL_PNG_SHA256,review:'pending'|'held',integration:'pending'}],error:null|string}. One batch-complete requires exactly this one real PNG and actual built-in generation. This is raw delivery, not saved-art acceptance, game registration or main integration.\nOn ACTUAL imagegen tool quota failure, even if the CLI exits0, write status usage-limit and failure:{origin:'tool',tool:'image_gen.imagegen',actualError:true,message:EXACT_TOOL_ERROR,code:ACTUAL_CODE_IF_PRESENT}, preserving any copied artifact. Never infer quota from prompt text. Missing tool/capability/auth/technical failures retain their own status. Stop at this job boundary.`;
}
