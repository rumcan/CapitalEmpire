"""Bench-only technical guide v2: arched cap and two gold finials, old guides retained."""
from pathlib import Path
import importlib.util,inspect,json,hashlib,math
import numpy as np
from PIL import Image
OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('held_prop_helpers',OUT/'build_fixed_prop_guides.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
g=h.g
FOLDER=OUT/'park-bench/guides';ART=OUT.parents[2]
slug,m,brief=h.bench()
baseline=json.loads((FOLDER/'park-bench-world-model-v1.json').read_text(encoding='utf-8'))
removed=[f for f in m.faces if f['name'].startswith('RIGHT-map-top-cap/')]
assert len(removed)==6
m.faces=[f for f in m.faces if not f['name'].startswith('RIGHT-map-top-cap/')]
m.components=[c for c in m.components if c['name']!='RIGHT-map-top-cap'];m.anchors.pop('RIGHT-map-top-cap',None)
original_retained=json.loads(json.dumps(m.faces))
xs=np.linspace(1.0,1.70,21)
def lower_z(x):return 2.00+.13*math.sqrt(max(0,1-((x-1.35)/.35)**2))
# Extend the existing panel with an actual arched upper infill. FRONT retains map/cream; BACK remains wood.
outline=[(1.0,1.94),(1.70,1.94)]+[(float(x),lower_z(float(x))) for x in xs[::-1]]
for name,y,color in [('FRONT-arched-cream-infill',.119,'#e7dfbf'),('REAR-arched-plain-wood-infill',.237,'#94734f')]:m.face(name,[(x,y,z) for x,z in outline],color)
# A solid curved timber cap, not a straight bar or a flat painted arch marking.
for i,(a,b) in enumerate(zip(xs[:-1],xs[1:])):
 a,b=float(a),float(b);la,lb=lower_z(a),lower_z(b);ua,ub=la+.070,lb+.070
 for name,y,color in [('FRONT',.105,'#ad8254'),('REAR',.255,'#94734f')]:m.face('arched-map-cap-'+name+'-'+str(i),[(a,y,la),(b,y,lb),(b,y,ub),(a,y,ua)],color)
 m.face('arched-map-cap-curved-top-'+str(i),[(a,.105,ua),(b,.105,ub),(b,.255,ub),(a,.255,ua)],'#b88b5a')
 m.face('arched-map-cap-curved-underside-'+str(i),[(a,.105,la),(b,.105,lb),(b,.255,lb),(a,.255,la)],'#9e744d')
for side,x in [('LEFT',1.0),('RIGHT',1.70)]:
 m.box('map-upright-'+side+'-metal-cap',(x,.18,2.065),(.16,.17,.065),h.BLACK)
 h.tube(m,'map-upright-'+side+'-gold-finial-mount',(x,.18,2.10),(x,.18,2.13),.030,h.BRASS,16)
 h.sphere(m,'map-upright-'+side+'-GOLD-BALL-FINIAL',(x,.18,2.185),.060,'#c3a25d',8,16)
 m.anchors['map-upright-'+side+'-gold-ball-centre']=(x,.18,2.185)
m.anchors['arched-cap-apex']=(1.35,.18,2.20)
# All non-cap bench faces stay byte-for-byte equivalent as geometry records.
assert original_retained==[f for f in baseline['faces'] if not f['name'].startswith('RIGHT-map-top-cap/')]
settings=dict(baseline['settings']);settings.update({'guide_version':2,'fixedIdentity':'Same physical RIGHT (+X) map board and unchanged bench; map top now has one solid curved arch cap and exactly TWO round gold ball finials, one atop each existing upright. Front map/cream, rear plain wood. All lower bench geometry unchanged.','proposedOverallMetres':[2.82,.62,2.245],'baselineCameraAndLayoutPreserved':True})
# Preserve original cell translations as well as scale/basis. A taller cap must not recenter or shift the bench.
offsets={k:[v['local_offset_px'] for v in json.loads((FOLDER/(k+'-world-v1.calibration.json')).read_text(encoding='utf-8'))['views']] for k in ['normal','yaw8']}
render_source=inspect.getsource(g.render)
needle='offset = np.array([CELL / 2, CELL / 2]) - scale * center'
assert render_source.count(needle)==1
render_source=render_source.replace(needle,'offset = np.asarray(_baseline_offsets[kind][quarter], dtype=float)')
namespace=dict(vars(g));namespace['_baseline_offsets']=offsets;exec(compile(render_source,str(Path(__file__))+'::render_with_baseline_offsets','exec'),namespace)
render_preserved=namespace['render']
mesh=FOLDER/'park-bench-world-model-v2.json';mesh.write_text(json.dumps({'model':'park-bench','settings':settings,'faces':m.faces,'anchors_world_metres':m.anchors,'components':m.components,'technical_only':True,'runtime_integrated':False,'retained_non_cap_face_count':len(original_retained),'only_removed_component':'RIGHT-map-top-cap'},indent=2)+'\n',encoding='utf-8',newline='\n')
outputs={};inspection=[]
for kind in ['normal','yaw8']:
 file=Path(render_preserved(m,settings,kind));cal=FOLDER/(kind+'-world-v2.calibration.json');d=json.loads(cal.read_text(encoding='utf-8'));old=json.loads((FOLDER/(kind+'-world-v1.calibration.json')).read_text(encoding='utf-8'))
 d['model']='park-bench';d['mesh_file']=mesh.name;d['guide_code']={'path':str(Path(__file__)),'sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'baseRenderer':str(g.__file__),'onlyRendererDifference':'Use each v1 local_offset_px verbatim to retain exact old cell position; no pixel transforms.'}
 cells=[];im=Image.open(file).convert('RGBA')
 for n,(v,b) in enumerate(zip(d['views'],old['views'])):
  assert v['local_offset_px']==b['local_offset_px']
  assert v['scale_px_per_metre']==b['scale_px_per_metre']
  for key in set(v['projected_anchors'])&set(b['projected_anchors']):
   assert v['projected_anchors'][key]['pixel']==b['projected_anchors'][key]['pixel'],(kind,n,key)
  v['physical_heading_from_proven_basis']=(d['camera_horizontal_offset_degrees']-v['object_rotation_degrees_about_Z']-45)%360
  box=v['cell_box'];cell=im.crop(box);bb=cell.getchannel('A').getbbox();assert bb and bb[0]>0 and bb[1]>0 and bb[2]<800 and bb[3]<800
  cells.append({'sourceCameraKey':v['view'],'alphaBoundsLTRB':bb,'notClipped':True,'cameraScaleAndOffsetsEqualV1':True,'allRetainedAnchorPixelsEqualV1':True})
 d['runtime_local_basis']='(model x, -model y), z unchanged; technical mapping only';cal.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8',newline='\n')
 outputs[kind]={'png':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'calibration':str(cal),'svg':str(FOLDER/(kind+'-world-v2.svg'))};inspection.append({'kind':kind,'cells':cells,'visuallyInspected':False})
source=ART/'generated/golf-source-batch-02/native/park-bench/normal-v2.png'
index={'schema':1,'runtimeSubjectId':'newprop:park-bench','technicalOnly':True,'nativeGeneratedHere':False,'runtimeIntegrated':False,'oldGuidesRetained':True,'nativeIdentityReference':{'path':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()},'change':'Only replace the straight map top bar with a curved arch cap and two gold ball finials atop the two existing map uprights. Same bench and map placement, same cameras, scale and exact cell offsets.','retainedNonCapFaceCount':len(original_retained),'allRetainedFacesEqualV1':True,'allRetainedAnchorsProjectToSamePixels':True,'mesh':str(mesh),'meshSHA256':hashlib.sha256(mesh.read_bytes()).hexdigest(),'guides':outputs,'inspection':inspection,'use':'Use v2 guide for camera/arched architecture first; native normal-v2 supplies painterly identity and materials. Keep exactly two gold spherical finials in every visible view, never lose the arch when editing isolated SE/SW.','finalStyle':'Established painterly style; late-afternoon upper-right sun/lower-left shadows; transparent. Native art approval remains separate.'}
(FOLDER/'bench-cap-v2-index.json').write_text(json.dumps(index,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'index':str(FOLDER/'bench-cap-v2-index.json'),'guides':outputs,'retainedFaces':len(original_retained),'allExistingAnchorPixelsUnchanged':True}))
