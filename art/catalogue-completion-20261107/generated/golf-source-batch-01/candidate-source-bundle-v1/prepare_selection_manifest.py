"""Plan 176 lossless source candidate PNGs. Does not export, zip or import them."""
from pathlib import Path
from datetime import datetime,timezone
import json,hashlib
import numpy as np
from PIL import Image
OUT=Path(__file__).resolve().parent;BATCH=OUT.parent;ART=BATCH.parents[1];REPO=ART.parents[1]
# ART is art/catalogue-completion-20261107; REPO is repository root.
assert (REPO/'src').exists()
assert not list(OUT.rglob('*.png')), 'Frozen exported source bundle: initial planning helper must not overwrite final selection.'
jobs=json.loads((BATCH/'job-index.json').read_text(encoding='utf-8'))['jobs'];rows=[];sets=[]
normal_names=['SE','SW','NW','NE'];yaw_names=['N','E','S','W']
compound=json.loads((BATCH/'native/golf-source-01-03-broadcast-compound/source-candidate-selection-v1.json').read_text(encoding='utf-8'))
tower=json.loads((BATCH/'native/golf-source-01-02-tv-camera-tower/upgraded-normal-source-selection-v1.json').read_text(encoding='utf-8'))
normal_budget_versions={1:2,2:2,3:4,4:1,5:1,6:2,7:1,8:1,9:2,10:1}

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rel(p):return p.relative_to(REPO).as_posix()
def rect_half(n):return[(n%2)*627,(n//2)*627,(n%2+1)*627,(n//2+1)*627]
for job in jobs:
 jid=job['jobId'];num=int(jid.split('-')[3]);key=jid.split('-',4)[4];target=job['runtimeTarget'];event=num<=10
 identity=target.get('newArtSubjectProposal') if event else target['runtimeSubjectId']
 for condition in (['budget','upgraded'] if event else ['upgraded']):
  setrows=[]
  for kind,names in [('normal',normal_names),('yaw8',yaw_names)]:
   version=(normal_budget_versions[num] if condition=='budget' and kind=='normal' else 2 if num==8 and condition=='budget' and kind=='yaw8' else 2 if num in [2,3] and condition=='upgraded' and kind=='normal' else 1)
   name=f'{condition}-{kind}-v{version}.png';folder=BATCH/'native'/jid;source=folder/name
   # Explicit mixed-version/isolated selections override any ordinary sheet default.
   for n,camera in enumerate(names):
    nominal=kind+camera;rect=rect_half(n);selected=source;selection_record=None;expected=None;expected_pixels=None;cut_evidence=[]
    if num==3 and condition=='budget':
     selection_record=compound['sourceViews'][nominal];selected=REPO/selection_record['sourceFile'];rect=selection_record['sourceFrameRectLTRB'];expected=selection_record['sourceFileSHA256'];expected_pixels=selection_record['rgbaSHA256'];cut_evidence.append(rel(folder/'source-candidate-selection-v1.json'))
    elif num==2 and condition=='upgraded' and kind=='normal':
     selection_record=tower['views'][nominal];selected=REPO/selection_record['sourceFile'];rect=selection_record['sourceFrameRectLTRB'];expected=selection_record['sourceFileSHA256'];expected_pixels=selection_record['rgbaSHA256'];cut_evidence.append(rel(folder/'upgraded-normal-source-selection-v1.json'))
    elif num==9 and condition=='budget' and kind=='normal':
     rect=[(n%2)*627,0 if n<2 else 610,(n%2+1)*627,610 if n<2 else 1254];cut_evidence.append(rel(ART/'audit/golf-guided-normal-v2-and-era-house-package-review.json')+'#recommendedSourcePackagingCut')
    # Read authored independent QA crop rectangles only when its source hash matches this exact selected original.
    iq=selected.with_suffix('.independent-qa.json')
    if selection_record is None and iq.exists():
     q=json.loads(iq.read_text(encoding='utf-8'));qsrc=q.get('source',{});qsha=qsrc.get('sha256')
     if qsha==digest(selected):
      cells=q.get('cells',[])
      if len(cells)==4 and 'reference_rect_ltrb' in cells[n]:
       rect=cells[n]['reference_rect_ltrb'];expected_pixels=cells[n].get('native_rgba_rectangle_sha256');cut_evidence.append(rel(iq));expected=qsha
    pending_yaw=num==3 and condition=='upgraded' and kind=='yaw8'
    held_se=False  # Upgraded compound v2 all four corners passed; old v1 SE stair hold resolved.
    row={'slotId':f'{jid}:{condition}:{nominal}','jobId':jid,'name':target.get('eventName',target.get('name')),'eventTypeId':target.get('eventTypeId'),'artSubjectId':identity,'artSubjectIsUnregisteredProposal':event,'condition':condition,'practicePropHasSingleConditionSource':not event,'nominalCameraKey':nominal,'nativeHeadingDegrees':None,'nativeCameraCertified':False,'nativeScaleAndAnchorsApproved':False,'runtimeReady':False,'runtimeIntegrated':False,'futurePNG':f'{key}/{condition}/{kind}-{camera}.png','sourceOnly':True,'practicalSelectionStatus':'pending-native-yaw-generation-and-review' if pending_yaw else 'hold-SE-extra-service-stair' if held_se else 'practical-source-candidate','sourceFrameRectLTRB':None if pending_yaw else rect,'source':None if pending_yaw else rel(selected),'requestedSourceWhilePending':rel(selected) if pending_yaw else None,'authoredCropEvidence':cut_evidence,'pixelOperationWhenExportAuthorized':'Native RGBA rectangle crop only; full-frame isolated source may be copied byte-for-byte. No resize, trim, flip, recolour, key, alpha cleanup or paint.','nativeGenerationCountForExport':0}
    if num==3 and condition=='upgraded' and kind=='normal':row['practicalReviewEvidence']=rel(ART/'audit/broadcast-compound-upgraded-normal-v2-practical-review.json')
    if event:row['existingWrongStandInNotAnAlias']=target.get('currentSpriteSubjectId')
    if held_se:row['holdEvidence']=rel(ART/'audit/broadcast-compound-upgraded-normal-v1-practical-review.json')
    if not pending_yaw:
     assert selected.exists(),selected
     sha=digest(selected);prov=selected.with_suffix('.provenance.json');pv=json.loads(prov.read_text(encoding='utf-8'))
     assert sha==pv['sha256'],selected
     if expected:assert sha==expected,selected
     im=Image.open(selected);assert im.mode=='RGBA'
     l,t,r,b=rect;assert 0<=l<r<=im.width and 0<=t<b<=im.height
     tile=im.crop(rect);rgba=hashlib.sha256(tile.tobytes()).hexdigest()
     if expected_pixels:assert rgba==expected_pixels,(selected,nominal,'RGBA hash mismatch')
     alpha=np.array(tile.getchannel('A'));core=alpha>128;ys,xs=np.nonzero(core);assert xs.size
     core_bbox=[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)];border=int(core[0,:].sum()+core[-1,:].sum()+core[:,0].sum()+core[:,-1].sum())
     row.update({'sourceFileSHA256':sha,'sourceSize':list(im.size),'sourceMode':'RGBA','sourceProvenance':rel(prov),'sourceProvenanceSHA256':digest(prov),'sourceNativeHashMatchesProvenance':True,'tileSize':list(tile.size),'tileRGBA_SHA256':rgba,'coreBBoxAlphaGT128':core_bbox,'coreBoundaryPixelsAlphaGT128':border,'selectedCropCoreNotClipped':border==0,'singleViewFullNativeOverride':rect==[0,0,im.width,im.height]})
     assert border==0,(selected,nominal,rect,'Missing authored crop; opaque core hits boundary')
    rows.append(row);setrows.append(row)
  sets.append({'jobId':jid,'artSubjectId':identity,'condition':condition,'slotIds':[x['slotId'] for x in setrows],'requiredViews':8,'slotsWithExistingSelection':sum(x['source'] is not None for x in setrows),'pendingOrHeldSlots':sum(x['practicalSelectionStatus']!='practical-source-candidate' for x in setrows),'cameraCertification':False,'runtimeReady':False})
assert len(rows)==176 and len(sets)==22
manifest={'schema':1,'asOfUTC':datetime.now(timezone.utc).isoformat(),'state':'plan-only; awaiting upgraded compound yaw native QA before export or ZIP','sourceOnly':True,'expectedPNGCount':176,'actualExportedPNGCount':0,'zipCreated':False,'nativeGenerationCountForExports':0,'runtimeIntegrated':False,'nativeCameraCertified':False,'nativeScaleAndAnchorsApproved':False,'ownerApproved':False,'structure':'10 event roles x 2 conditions x 8 nominal views + 2 actual practice props x 8 = 176 PNG slots. Practice props have one existing source condition, not fabricated budget/upgraded variants.','existingSelectedSlots':sum(x['source'] is not None for x in rows),'practicalCandidateSlots':sum(x['practicalSelectionStatus']=='practical-source-candidate' for x in rows),'pendingOrHeldSlots':sum(x['practicalSelectionStatus']!='practical-source-candidate' for x in rows),'selectionAuthority':'Explicit root instruction: other batch01 sources passed practical source QA; specific independent authored crop metadata and exact source hashes preserved. No numerical angle, physical scale, mask, origin or release approval inferred.','sets':sets,'slots':rows,'holds':['Upgraded compound four yaw source views not selected until generated and reviewed.','Nominal camera names are source labels, not certified headings.','TV upgraded SW isolated original is 1254x1254 while sheet crops are around627px; preserve native resolution, no unapproved scale normalization.','Authored unequal crop widths/heights preserve complete native source cores; do not blindly quarter the food/media/kiosk yaw sheets or leaderboard normal.','Faint original alpha residue is retained; source candidates do not establish final mask readiness.']}
(OUT/'selection-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
summary={k:manifest[k] for k in ['state','expectedPNGCount','actualExportedPNGCount','zipCreated','existingSelectedSlots','practicalCandidateSlots','pendingOrHeldSlots']};(OUT/'selection-summary.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(summary))
