"""Technical extension: fixed manual ball hopper, never native final art or runtime."""
from pathlib import Path
import importlib.util,json,math,hashlib
import numpy as np
OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('fixed_props',OUT/'build_fixed_prop_guides.py');p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
g=p.g
slug='ball-bucket-stand';m=p.model(slug);WOOD='#94764e';METAL='#8c9385'
for x in [-.37,.37]:
 for y in [-.29,.29]:m.box('sawn-timber-leg-'+str(x)+'-'+str(y),(x,y,.44),(.085,.085,.84),WOOD)
for x in [-.37,.37]:m.box('side-foot-rail-'+str(x),(x,0,.075),(.12,.85,.12),WOOD)
for y in [-.29,.29]:m.box('cross-rail-'+str(y),(0,y,.73),(.88,.10,.10),WOOD)
p.tube(m,'rear-diagonal-timber-brace',(-.37,.32,.14),(.37,.32,.74),.035,WOOD,6)
# Wedge top closes against sloping cap; no floating rain roof gap.
m.face('hopper-front-case',[(-.4,-.325,.745),(.4,-.325,.745),(.4,-.325,1.484),(-.4,-.325,1.484)],METAL)
m.face('hopper-rear-case',[(-.4,.325,.745),(.4,.325,.745),(.4,.325,1.626),(-.4,.325,1.626)],METAL)
for side in [-1,1]:m.face('hopper-side-case-'+str(side),[(side*.4,-.325,.745),(side*.4,.325,.745),(side*.4,.325,1.626),(side*.4,-.325,1.484)],METAL)
m.face('sloping-cap',[(-.46,-.39,1.47),(.46,-.39,1.47),(.46,.39,1.64),(-.46,.39,1.64)],'#a6a99c')
m.face('rear-cap-fascia',[(-.46,.39,1.64),(.46,.39,1.64),(.46,.39,1.59),(-.46,.39,1.59)],'#8a8c7e')
m.wall_panel('FRONT-ball-window','y',-.334,-.32,.32,.93,1.30,'#344135')
for row,z in enumerate([.99,1.10,1.21]):
 for col,x in enumerate([-.23,-.115,0,.115,.23]):p.sphere(m,'FRONT-hopper-ball-'+str(row)+'-'+str(col),(x,-.345,z),.049,'#e9e6d5',5,10)
m.wall_panel('FRONT-outlet','y',-.337,-.12,.12,.72,.86,'#374536')
# A wooden chute slopes down from the fixed front outlet into the front bucket.
m.face('FRONT-sloping-chute-bottom',[(-.12,-.34,.77),(.12,-.34,.77),(.12,-.61,.59),(-.12,-.61,.59)],WOOD)
for side in [-1,1]:m.face('FRONT-chute-side-'+str(side),[(side*.12,-.34,.77),(side*.12,-.61,.59),(side*.12,-.61,.68),(side*.12,-.34,.87)],'#a58b5e')
p.tube(m,'FRONT-crank-spindle',(.17,-.33,.85),(.17,-.43,.85),.024,'#a18c61');p.tube(m,'FRONT-crank-arm',(.17,-.43,.85),(.28,-.43,.73),.022,WOOD);p.tube(m,'FRONT-crank-grip',(.28,-.43,.73),(.28,-.52,.73),.026,WOOD)
# Exactly one open metal bucket at front(-Y).
cy=-.73;n=24
for i in range(n):
 a=i*2*math.pi/n;b=(i+1)*2*math.pi/n
 m.face('FRONT-bucket-wall-'+str(i),[(.21*math.cos(a),cy+.21*math.sin(a),.04),(.21*math.cos(b),cy+.21*math.sin(b),.04),(.27*math.cos(b),cy+.27*math.sin(b),.44),(.27*math.cos(a),cy+.27*math.sin(a),.44)],'#9aa294')
p.ring(m,'FRONT-bucket-open-rim',(0,cy,.445),.285,.25,'#7f8f84')
m.face('FRONT-bucket-bottom',[(.21*math.cos(a),cy+.21*math.sin(a),.045) for a in np.linspace(0,2*math.pi,n,endpoint=False)],'#617367')
for i,(x,y) in enumerate([(-.12,-.78),(0,-.81),(.12,-.77),(-.08,-.66),(.06,-.64)]):p.sphere(m,'FRONT-bucket-ball-'+str(i),(x,y,.42),.052,'#efeddb',5,10)
m.wall_panel('REAR-plain-riveted-panel','y',.335,-.34,.34,.82,1.34,'#838c7d')
for x in [-.30,.30]:
 for z in [.88,1.28]:p.sphere(m,'REAR-rivet-'+str(x)+'-'+str(z),(x,.346,z),.012,'#a9b19d',4,8)
m.anchors['FRONT-bucket-centre']=(0,cy,.22);m.anchors['FRONT-outlet']=(0,-.34,.79);m.anchors['REAR-plain-panel']=(0,.335,1.10)
folder=OUT/slug/'guides'
folder.mkdir(parents=True,exist_ok=True)
settings={'guide_version':1,'scale_px_per_metre':300,'technical_only':True,'runtimeSubjectId':'newprop:ball-bucket-stand','fixedIdentity':'Manual ball hopper with sloping rain cap, four sawn-timber legs, front-Yball window/outlet/chute/manual crank and exactly one front-Ymetal bucket. Rear+Yplain riveted metal and rear diagonal timber brace. No duplicated front corners.','proposedOverallMetres':[.92,1.41,1.64],'identity_policy':'One fixed world and equipment state; no mirrored or pasted front/back, no moving bucket/crank to camera side.'}
mesh=folder/(slug+'-world-model-v1.json');mesh.write_text(json.dumps({'model':slug,'settings':settings,'faces':m.faces,'anchors_world_metres':m.anchors,'components':m.components,'technical_only':True,'runtime_integrated':False},indent=2)+'\n',encoding='utf-8');outputs={}
for kind in ['normal','yaw8']:
 file=g.render(m,settings,kind);stem=kind+'-world-v1';cp=folder/(stem+'.calibration.json');d=json.loads(cp.read_text(encoding='utf-8'));d['model']=slug;d['mesh_file']=mesh.name
 for v in d['views']:v['physical_heading_from_proven_basis']=(d['camera_horizontal_offset_degrees']-v['object_rotation_degrees_about_Z']-45)%360
 d['runtime_local_basis']='(modelx,-modely), height unchanged; technical correspondence only';cp.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8');outputs[kind]={'png':file,'svg':str(folder/(stem+'.svg')),'calibration':str(cp),'sha256':hashlib.sha256(Path(file).read_bytes()).hexdigest()};print(file,flush=True)
brief={'runtimeSubjectId':'newprop:ball-bucket-stand','key':slug,'ppm':300,'fixedIdentity':settings['fixedIdentity'],'proposedOverallMetres':settings['proposedOverallMetres'],'components':'Metal bulk hopper, four plain bolted timber legs, front chute/crank/bucket, rear plain panel and fixed brace.','mesh':str(mesh),'meshSHA256':hashlib.sha256(mesh.read_bytes()).hexdigest(),'guides':outputs,'originalReferencePNG':str(OUT.parent/'references'/(slug+'.source.png')),'nativeHeldSource':str(OUT.parent/'native'/slug/'normal-v1.png'),'nativeArtApproval':False}
indexPath=OUT/'index.json';index=json.loads(indexPath.read_text(encoding='utf-8'));index['models']=[x for x in index['models'] if x['key']!=slug];index['models'].append(brief);index['extensionGenerator']={'path':str(Path(__file__)),'sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()};indexPath.write_text(json.dumps(index,indent=2)+'\n',encoding='utf-8')
compact={'technicalOnly':True,'models':[{'id':m['runtimeSubjectId'],'fixed':m['fixedIdentity'],'normalPNG':m['guides']['normal']['png'],'yaw8PNG':m['guides']['yaw8']['png']} for m in index['models']]};(OUT/'compact.json').write_text(json.dumps(compact,separators=(',',':'))+'\n',encoding='utf-8')
