"""Export only a fully reviewed source selection; never normalizes or edits native pixels."""
from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,shutil,zipfile,io
from PIL import Image
OUT=Path(__file__).resolve().parent
REPO=OUT.parents[4]
assert (REPO/'src').exists()
PLAN=OUT/'selection-manifest.json'
ARCHIVE=OUT.parent/'Golf-event-facilities-and-practice-176-source-candidates.zip'

def sha(data):return hashlib.sha256(data).hexdigest()
def write_json(p,v):p.write_text(json.dumps(v,indent=2)+'\n',encoding='utf-8',newline='\n')
def main():
 plan=json.loads(PLAN.read_text(encoding='utf-8'))
 assert plan['expectedPNGCount']==176 and len(plan['slots'])==176
 assert plan['pendingOrHeldSlots']==0 and all(x['practicalSelectionStatus']=='practical-source-candidate' for x in plan['slots']),'Native source review holds remain; no export authorized'
 assert not ARCHIVE.exists(),'Archive version already exists; never overwrite'
 assert not list(OUT.rglob('*.png')),'Existing exported PNGs: do not overwrite'
 records=[]
 for row in plan['slots']:
  source=REPO/row['source'];blob=source.read_bytes();assert sha(blob)==row['sourceFileSHA256']
  im=Image.open(io.BytesIO(blob));assert im.mode=='RGBA';rect=row['sourceFrameRectLTRB'];tile=im.crop(rect);assert sha(tile.tobytes())==row['tileRGBA_SHA256']
  dest=OUT/row['futurePNG'];dest.parent.mkdir(parents=True,exist_ok=True);assert not dest.exists()
  full=rect==[0,0,im.width,im.height]
  if full:shutil.copyfile(source,dest)
  else:tile.save(dest)
  decoded=Image.open(dest);assert decoded.mode=='RGBA' and decoded.size==tile.size and decoded.tobytes()==tile.tobytes()
  records.append({**row,'file':row['futurePNG'],'outputPNG_SHA256':sha(dest.read_bytes()),'outputBytes':dest.stat().st_size,'outputSize':list(decoded.size),'outputRGBA_SHA256':sha(decoded.tobytes()),'decodedPixelEqualityWithSourceCrop':True,'fullSourceByteCopy':full,'rawByteEqualityWhenFullCopy':dest.read_bytes()==blob if full else None})
 assert len(list(OUT.rglob('*.png')))==176
 index={'schema':1,'asOfUTC':datetime.now(timezone.utc).isoformat(),'subjectCount':12,'conditionSetCount':22,'PNGCount':176,'sourceOnly':True,'nativeGenerationCountFromThisExport':0,'runtimeIntegrated':False,'cameraAndScaleCertified':False,'files':records,'selectionPlanSHA256':sha(PLAN.read_bytes()),'scope':'Ten golf-event roles in budget/upgraded condition, plus one existing source condition for each of two actual practice props. Eight nominal source view labels per condition set. No stand-in alias assignment or final release approval.'}
 write_json(OUT/'index.json',index)
 holds={'schema':1,'sourceOnly':True,'cameraCertification':'NOT CERTIFIED','physicalScaleAndAnchorCalibration':'NOT APPROVED','runtimeReady':False,'ownerApprovalInferred':False,'holds':['View labels name requested source cameras; numerical 30-degree pitch/8-degree yaw conformity is not certified by these source crops.','Native per-view scale and ground anchors need calibration; no scaling, trimming or anchor guesses were applied.','The TV upgraded normal SW isolated original remains1254x1254; all four compound upgraded yaw isolated originals remain1536x1024. Most sheet cells are around627px and some authored unequal crops differ. Native sizes intentionally remain unequal.','Original faint alpha residue and hidden RGB are preserved. Source practical review is not final alpha-mask release approval.','Event art subject IDs are proposals distinct from old incorrect stand-in subjects; no runtime aliases, imports, capacity or economy changes are included.','No claim that the whole baseline building/prop catalogue is complete or that this bundle is deployed.'],'sets':plan['sets']}
 write_json(OUT/'camera-holds.json',holds)
 package_plan={**plan,'state':'176 source candidate PNGs exported after practical native source review; camera/scale/runtime holds retained','actualExportedPNGCount':176,'zipCreated':True,'zipCreatedBySeparateVerifiedArchiveStep':True,'exportPixelChanges':False}
 write_json(OUT/'source-plan.json',package_plan)
 verification={'schema':1,'PNGCount':176,'sourceHashesMatch':True,'perOutputDecodedPixelsExactlyMatchSourceRectangles':True,'allModesRGBA':True,'noResizeRepaintKeyFlipAlphaCleanup':True,'nativeOriginalsChanged':False,'runtimeChanged':False,'archiveCRCVerifiedInSeparateReceipt':True}
 write_json(OUT/'verification.json',verification)
 (OUT/'README.md').write_text('''# Golf event and practice source candidates

176 lossless PNG views: ten event roles in budget and upgraded condition (160 PNGs), plus the practice net and bag trolley in their one existing source condition (16 PNGs). Each condition set has four normal and four nominal turned-cardinal source camera labels.

These are source art candidates. Exact native camera angles, consistent world scale, ground anchors and final masks remain unapproved; this bundle does not claim runtime readiness, deployment, owner approval or whole-catalogue completion. See [camera holds](./camera-holds.json).

[Source plan](./source-plan.json) retains exact source files, source hashes, authored crop rectangles, camera labels and review evidence. [Index](./index.json) records every exported PNG hash and decoded RGBA hash. Every output exactly matches its selected original source rectangle; isolated full-source overrides are byte-for-byte copies. No resizing, mirroring, trimming, recolouring, painting, background keying or alpha cleanup was applied.

Source sizes intentionally differ. TV upgraded SW retains its full 1254x1254 native image; all four compound upgraded yaw singles retain full1536x1024 originals. Authored food/media/kiosk yaw gutters and leaderboard normal cuts preserve complete source silhouettes. Do not normalize these by stretching or silently crop equal quarters.

The proposed event art IDs are separate from existing incorrect stand-in IDs. No runtime mapping, gameplay, seating capacity, prices or economy changes are included. Historical native versions remain in their original folders.
''',encoding='utf-8',newline='\n')
 docs=['index.json','source-plan.json','camera-holds.json','verification.json','README.md']
 with zipfile.ZipFile(ARCHIVE,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for record in records:z.write(OUT/record['file'],record['file'])
  for name in docs:z.write(OUT/name,name)
 with zipfile.ZipFile(ARCHIVE) as z:
  assert z.testzip() is None
  pngs=[n for n in z.namelist() if n.lower().endswith('.png')];assert len(pngs)==176 and len(set(z.namelist()))==181
  byfile={r['file']:r for r in records}
  for name in pngs:
   data=z.read(name);r=byfile[name];assert sha(data)==r['outputPNG_SHA256'];im=Image.open(io.BytesIO(data));assert im.mode=='RGBA' and sha(im.tobytes())==r['tileRGBA_SHA256']
 # Original sources still match after export and archive creation.
 for record in records:assert sha((REPO/record['source']).read_bytes())==record['sourceFileSHA256']
 receipt={'schema':1,'asOfUTC':datetime.now(timezone.utc).isoformat(),'archive':ARCHIVE.as_posix(),'bytes':ARCHIVE.stat().st_size,'sha256':sha(ARCHIVE.read_bytes()),'archiveEntryCount':181,'PNGCount':176,'CRCAllEntriesValid':True,'allArchivedPNGHashesMatchIndex':True,'allArchivedDecodedRGBAHashesMatchNativeSourceCrops':True,'allOriginalNativeSourceHashesUnchangedAfterExport':True,'sourceOnly':True,'nativeGenerationCount':0,'runtimeIntegrated':False,'cameraAndScaleApproved':False}
 write_json(OUT.parent/'Golf-event-facilities-and-practice-176-source-candidates.receipt.json',receipt)
 print(json.dumps(receipt))
if __name__=='__main__':main()
