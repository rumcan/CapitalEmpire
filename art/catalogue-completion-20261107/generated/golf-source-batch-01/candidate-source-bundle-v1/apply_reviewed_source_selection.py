"""Apply explicit reviewed batch01 source selections; metadata only, no PNG export."""
from pathlib import Path
from datetime import datetime,timezone
import json,hashlib
import numpy as np
from PIL import Image
OUT=Path(__file__).resolve().parent;REPO=OUT.parents[4];ART=REPO/'art/catalogue-completion-20261107';BASE=ART/'generated/golf-source-batch-01/native'
p=OUT/'selection-manifest.json';m=json.loads(p.read_text(encoding='utf-8'))
inputs=[('tv-camera-tower','upgraded-yaw8-source-selection-v2.json'),('broadcast-compound','upgraded-isolated-yaw-source-selection-v4.json')]
for suffix,selectionname in inputs:
 folder=next(x for x in BASE.iterdir() if x.is_dir() and x.name.endswith(suffix));sp=folder/selectionname;s=json.loads(sp.read_text(encoding='utf-8'))
 for row in m['slots']:
  if not(row['jobId'].endswith(suffix) and row['condition']=='upgraded' and row['nominalCameraKey'].startswith('yaw8')):continue
  v=s['views'][row['nominalCameraKey']]
  accepted=v.get('completeFixedComponentPass',True) and not v.get('status','PASS').startswith('HOLD')
  if not accepted:
   row['source']=None;row['practicalSelectionStatus']=v.get('status','held');row['heldNativeSource']=v['sourceFile'];row['holdEvidence']=s.get('reviewEvidence');continue
  source=REPO/v['sourceFile'];blob=source.read_bytes();sha=hashlib.sha256(blob).hexdigest();assert sha==v['sourceFileSHA256'];prov=source.with_suffix('.provenance.json');assert json.loads(prov.read_text(encoding='utf-8'))['sha256']==sha
  im=Image.open(source);assert im.mode=='RGBA';rect=v['sourceFrameRectLTRB'];l,t,r,b=rect;assert 0<=l<r<=im.width and 0<=t<b<=im.height;tile=im.crop(rect);rgba=hashlib.sha256(tile.tobytes()).hexdigest();assert rgba==v['rgbaSHA256']
  a=np.array(tile.getchannel('A'));core=a>128;ys,xs=np.nonzero(core);border=int(core[0,:].sum()+core[-1,:].sum()+core[:,0].sum()+core[:,-1].sum());assert border==0
  row.update({'source':v['sourceFile'],'sourceFileSHA256':sha,'sourceSize':list(im.size),'sourceMode':'RGBA','sourceFrameRectLTRB':rect,'tileSize':list(tile.size),'tileRGBA_SHA256':rgba,'sourceProvenance':prov.relative_to(REPO).as_posix(),'sourceProvenanceSHA256':hashlib.sha256(prov.read_bytes()).hexdigest(),'sourceNativeHashMatchesProvenance':True,'coreBBoxAlphaGT128':[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)],'coreBoundaryPixelsAlphaGT128':0,'selectedCropCoreNotClipped':True,'singleViewFullNativeOverride':rect==[0,0,im.width,im.height],'authoredCropEvidence':[sp.relative_to(REPO).as_posix()],'practicalReviewEvidence':s.get('reviewEvidence'),'practicalSelectionStatus':'practical-source-candidate','nativeHeadingDegrees':None,'nativeCameraCertified':False,'nativeScaleAndAnchorsApproved':False,'runtimeReady':False,'runtimeIntegrated':False})
  for key in ['requestedSourceWhilePending','supersededYawV1Selection','holdEvidence','repairQueue','heldNativeSource']:row.pop(key,None)
m['asOfUTC']=datetime.now(timezone.utc).isoformat();m['existingSelectedSlots']=sum(x['source'] is not None for x in m['slots']);m['practicalCandidateSlots']=sum(x['practicalSelectionStatus']=='practical-source-candidate' for x in m['slots']);m['pendingOrHeldSlots']=176-m['practicalCandidateSlots']
m['state']='176 practical source candidates selected; export not yet run; camera/scale/runtime holds retained' if not m['pendingOrHeldSlots'] else 'plan-only; isolated compound N/W van-HVAC identity correction pending; other174 reviewed selections ready'
for s in m['sets']:
 rr=[r for r in m['slots'] if r['slotId'] in s['slotIds']];s['slotsWithExistingSelection']=sum(r['source'] is not None for r in rr);s['pendingOrHeldSlots']=sum(r['practicalSelectionStatus']!='practical-source-candidate' for r in rr)
m['holds']=[x for x in m['holds'] if not x.startswith(('TV upgraded yaw-v1','All four upgraded compound','Compound N/W'))]
if m['pendingOrHeldSlots']:m['holds'].insert(0,'Compound N/W isolated main faces/stairs/dish now correct, but small-van HVAC component counts need one targeted native edit each. Both slots remain held; E/S selected unchanged.')
m['sourceSelectionNotes']=['TV upgraded yaw selects material-only v2 standard627 cells; old broad-camera upgraded yaw-v1 excluded.','Compound yaw selects approved full1536x1024 isolated originals, never resized to627.','Native camera and world-scale certification remain independent holds even after practical source selection passes.']
p.write_text(json.dumps(m,indent=2)+'\n',encoding='utf-8',newline='\n');summary={k:m[k] for k in ['state','expectedPNGCount','actualExportedPNGCount','zipCreated','existingSelectedSlots','practicalCandidateSlots','pendingOrHeldSlots']};(OUT/'selection-summary.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(summary))
