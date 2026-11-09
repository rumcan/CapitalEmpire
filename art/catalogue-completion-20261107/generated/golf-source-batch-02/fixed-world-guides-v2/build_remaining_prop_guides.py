"""Five fixed-world golf-prop references; technical meshes, never final painted sprites."""
from pathlib import Path
import importlib.util,json,math,hashlib
import numpy as np
OUT=Path(__file__).resolve().parent
ART=OUT.parents[2]
spec=importlib.util.spec_from_file_location('held_prop_helpers',OUT.parent/'fixed-world-guides-v1/build_fixed_prop_guides.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
g=h.g;tube=h.tube;sphere=h.sphere;ring=h.ring
GREEN='#456d55';DARK='#314e40';BRASS='#b5a16f';CREAM='#ddd8bf';METAL='#adb4b3';WOOD='#9e7e59'

def model(slug):return g.Model('golf-source-batch-02/fixed-world-guides-v2/'+slug)
def poly_front(m,name,points,y,color):m.face(name,[(x,y,z) for x,z in points],color)

def hollow_vessel(m,name,centre,radius,height,color,segments=20):
 x,y,z=centre;inner=radius*.88
 for k in range(segments):
  a=k*2*math.pi/segments;b=(k+1)*2*math.pi/segments
  for rr,c in [(radius,color),(inner,'#727d7a')]:
   m.face(name+'/wall-'+str(rr)+'-'+str(k),[(x+rr*math.cos(a),y+rr*math.sin(a),z),(x+rr*math.cos(b),y+rr*math.sin(b),z),(x+rr*math.cos(b),y+rr*math.sin(b),z+height),(x+rr*math.cos(a),y+rr*math.sin(a),z+height)],c)
 ring(m,name+'/rim',(x,y,z+height),radius,inner,'#c2c8bf')
 m.face(name+'/inside-bottom',[(x+inner*math.cos(a),y+inner*math.sin(a),z+.025) for a in np.linspace(0,2*math.pi,segments,endpoint=False)],'#727d7a')


def water():
 slug='water-tank-stall';m=model(slug)
 for x in [-.65,.65]:
  for y in [-.31,.31]:
   m.box('four-stand-legs-'+str(x)+'-'+str(y),(x,y,.455),(.105,.105,.91),WOOD)
   m.box('individual-metal-foot-'+str(x)+'-'+str(y),(x,y,.025),(.23,.21,.05),GREEN)
 for y in [-.35,.35]:m.box('tank-support-crossbar-'+str(y),(0,y,.89),(1.50,.11,.13),GREEN)
 for x in [-.69,.69]:
  m.box('tank-support-side-rail-'+str(x),(x,0,.89),(.10,.80,.13),GREEN)
  tube(m,'side-frame-brace-'+str(x),(x,-.31,.20),(x,.31,.85),.027,GREEN)
 m.box('galvanized-cistern',(0,0,1.325),(1.45,.76,.85),METAL)
 m.box('closed-tank-lid',(0,0,1.762),(1.49,.80,.05),'#c0c3b8')
 for x in [-.38,.38]:m.box('lid-raised-rib-'+str(x),(x,0,1.797),(.018,.62,.012),'#b4b9b0')
 tube(m,'rear-left-fill-neck',(-.46,.20,1.79),(-.46,.20,1.84),.10,BRASS,24)
 tube(m,'rear-left-fill-cap-CLOSED',(-.46,.20,1.84),(-.46,.20,1.87),.115,BRASS,24)
 for x in [-.32,.32]:
  tube(m,'FRONT-tap-shaft-'+str(x),(x,-.39,1.14),(x,-.50,1.14),.030,BRASS)
  tube(m,'FRONT-tap-spout-out-'+str(x),(x,-.50,1.14),(x,-.59,1.09),.032,BRASS)
  tube(m,'FRONT-tap-spout-down-'+str(x),(x,-.59,1.09),(x,-.59,1.01),.028,BRASS)
  tube(m,'FRONT-tap-stem-'+str(x),(x,-.49,1.14),(x,-.49,1.22),.015,BRASS)
  tube(m,'FRONT-cross-handle-X-'+str(x),(x-.07,-.49,1.225),(x+.07,-.49,1.225),.014,BRASS)
  tube(m,'FRONT-cross-handle-Y-'+str(x),(x,-.55,1.225),(x,-.43,1.225),.014,BRASS)
 # A genuine open drip trough, not a slab or an opaque lid over a basin.
 m.box('FRONT-trough-bottom',(0,-.595,.785),(1.22,.33,.035),METAL)
 for x in [-.61,.61]:m.box('FRONT-trough-end-'+str(x),(x,-.595,.865),(.026,.35,.16),METAL)
 for y in [-.76,-.43]:m.box('FRONT-trough-wall-'+str(y),(0,y,.865),(1.22,.026,.16),METAL)
 for x in [-.48,.48]:tube(m,'FRONT-trough-support-'+str(x),(x,-.37,.63),(x,-.67,.77),.02,GREEN)
 # Permanent FRONT-RIGHT bucket, low wooden functional grate under the taps.
 for x in np.linspace(-.58,.58,9):m.box('FRONT-foot-grate-slat-'+str(x),(float(x),-.72,.065),(.11,.57,.055),GREEN)
 for x in [-.54,.54]:m.box('FRONT-foot-grate-crossrail-'+str(x),(x,-.72,.025),(.07,.62,.05),WOOD)
 hollow_vessel(m,'FRONT-RIGHT-open-bucket',(.36,-.83,.10),.16,.32,METAL)
 for side in [-1,1]:tube(m,'bucket-handle-upright-'+str(side),(.36+side*.155,-.83,.36),(.36+side*.155,-.83,.57),.009,'#56645b')
 tube(m,'bucket-handle-top',(.205,-.83,.57),(.515,-.83,.57),.012,WOOD)
 tube(m,'RIGHT-front-towel-hook',(.73,-.31,1.17),(.83,-.38,1.17),.015,BRASS)
 cloth=[(.83,-.53,1.16),(.83,-.28,1.16),(.84,-.28,.70),(.83,-.39,.66),(.84,-.53,.71)]
 m.face('RIGHT-front-white-towel',cloth,CREAM);m.face('RIGHT-towel-green-stripe',[(.845,-.53,.74),(.845,-.28,.74),(.845,-.28,.78),(.845,-.53,.78)],GREEN)
 # One fixed side wire basket at physical+X; it is never a map board.
 for z in [.64,.75,.86]:
  for k in range(12):
   a=k*2*math.pi/12;b=(k+1)*2*math.pi/12
   tube(m,'RIGHT-basket-ring-'+str(z)+'-'+str(k),(.87+.16*math.cos(a),-.02+.17*math.sin(a),z),(.87+.16*math.cos(b),-.02+.17*math.sin(b),z),.009,WOOD,6)
 for k in range(12):
  a=k*2*math.pi/12;tube(m,'RIGHT-basket-vertical-'+str(k),(.87+.16*math.cos(a),-.02+.17*math.sin(a),.64),(.87+.16*math.cos(a),-.02+.17*math.sin(a),.86),.008,WOOD,6)
 for yy in [-.10,.10]:tube(m,'RIGHT-basket-fixed-mount-'+str(yy),(.69,yy,.86),(.87,yy,.86),.016,GREEN)
 for x in [-.65,.65]:tube(m,'REAR-V-frame-brace-'+str(x),(x,.405,.87),(0,.405,.29),.032,GREEN)
 m.anchors.update({'FRONT-taps':(0,-.59,1.10),'REAR-V-braces':(0,.405,.50),'fill-cap-physical-REAR-LEFT':(-.46,.20,1.87),'RIGHT-towel':(.84,-.40,.90),'RIGHT-basket':(.87,-.02,.75),'FRONT-RIGHT-bucket':(.36,-.83,.10)})
 return slug,m,{'ppm':255,'runtimeSubjectId':'newprop:water-tank-stall','proposedOverallMetres':[1.77,1.37,1.87],'fixedIdentity':'Closed galvanized cistern; exactly two FRONT (-Y) taps above an open trough. Fill cap stays REAR-LEFT (-X,+Y); towel and basket stay physical RIGHT (+X); bucket stays FRONT-RIGHT. Four legs, rear V braces. No sign, 12 plaque, map, tarp, plants or floor slab.','nativeSourceVersion':'normal-v2.png','symmetryNote':'Front taps/trough and rear braces distinguish front and rear views.'}


def signpost():
 slug='direction-signpost';m=model(slug)
 for z,w,dz in [(.04,.40,.08),(.19,.30,.22),(.325,.39,.06)]:m.box('square-pedestal-'+str(z),(0,0,z),(w,w,dz),GREEN)
 tube(m,'central-post',(0,0,.34),(0,0,2.02),.070,GREEN,20)
 for z in [.40,1.08,1.48,1.91,2.03]:tube(m,'brass-collar-'+str(z),(0,0,z-.025),(0,0,z+.025),.084,BRASS,20)
 sphere(m,'single-post-cap',(0,0,2.13),.087,BRASS)
 for side in [-1,1]:
  for row,z in enumerate([1.72,1.30]):
   # All four boards share a single XZ plane. Only their fixed front carries icons.
   outline=[(.08*side,z-.13),(.66*side,z-.13),(.81*side,z),(.66*side,z+.13),(.08*side,z+.13)]
   poly_front(m,'arrow-'+str(side)+'-'+str(row)+'-FRONT',outline,-.045,GREEN)
   poly_front(m,'arrow-'+str(side)+'-'+str(row)+'-BACK-PLAIN',outline,.045,GREEN)
   for k in range(len(outline)):
    a=outline[k];b=outline[(k+1)%len(outline)];m.face('arrow-edge-'+str(side)+'-'+str(row)+'-'+str(k),[(a[0],-.045,a[1]),(b[0],-.045,b[1]),(b[0],.045,b[1]),(a[0],.045,a[1])],BRASS)
   # A small intrinsic arrow indicator on FRONT only.
   x=.65*side;poly_front(m,'front-arrow-indicator-'+str(side)+'-'+str(row),[(x-.035*side,z-.052),(x+.035*side,z),(x-.035*side,z+.052),(x-.035*side,z+.021),(x-.105*side,z+.021),(x-.105*side,z-.021),(x-.035*side,z-.021)],-.052,CREAM)
 # Minimal fixed pictogram proxies; final drawing uses the identity reference artwork.
 def line(name,a,b,r=.012):tube(m,name,(a[0],-.060,a[1]),(b[0],-.060,b[1]),r,CREAM,8)
 # physical LEFT upper:golf; RIGHT upper:crossed cutlery; LEFT lower:toilets; RIGHT lower:exit.
 x,z=-.36,1.72
 sphere(m,'FRONT-golf-head',(x,-.06,z+.065),.025,CREAM,5,10)
 for k,(a,b) in enumerate([((x,z+.035),(x+.025,z-.035)),((x+.025,z-.035),(x-.005,z-.10)),((x+.025,z-.035),(x+.065,z-.10)),((x,z+.02),(x-.07,z+.08)),((x-.07,z+.08),(x-.105,z-.06))]):line('FRONT-golf-'+str(k),a,b)
 for k,(a,b) in enumerate([((.28,1.64),(.44,1.80)),((.28,1.80),(.44,1.64))]):line('FRONT-food-cutlery-'+str(k),a,b,.015)
 for x in [-.42,-.30]:
  sphere(m,'FRONT-toilet-head-'+str(x),(x,-.06,1.37),.022,CREAM,5,10)
  poly_front(m,'FRONT-toilet-body-'+str(x),[(x-.025,1.335),(x+.025,1.335),(x+.032,1.26),(x-.032,1.26)],-.062,CREAM)
  for dx in [-.013,.013]:line('FRONT-toilet-leg-'+str(x)+'-'+str(dx),(x+dx,1.26),(x+dx,1.22),.009)
 poly_front(m,'FRONT-exit-door-frame',[(.30,1.20),(.30,1.41),(.43,1.41),(.43,1.20)],-.061,CREAM)
 poly_front(m,'FRONT-exit-door-dark',[(.322,1.217),(.322,1.39),(.409,1.39),(.409,1.217)],-.065,DARK)
 m.anchors.update({'FRONT-icons':(0,-.06,1.5),'BACK-plain':(0,.06,1.5),'upper-left-golf':(-.36,-.06,1.72),'upper-right-food':(.36,-.06,1.72),'lower-left-toilet':(-.36,-.06,1.30),'lower-right-exit':(.36,-.06,1.30)})
 return slug,m,{'ppm':230,'runtimeSubjectId':'newprop:direction-signpost','proposedOverallMetres':[1.62,.40,2.22],'fixedIdentity':'Exactly four arrow boards: two point physical LEFT (-X), two RIGHT (+X), all in one fixed XZ plane. FRONT (-Y) icons: upper-left golf, upper-right food, lower-left toilets, lower-right exit. REAR (+Y) has four plain backs. Never radial or re-aimed arrows.','nativeSourceVersion':'normal-v1.png','symmetryNote':'Board silhouettes are bilaterally symmetric; front-only pictograms and plain backs distinguish front and rear.'}


def course_map():
 slug='course-map-board';m=model(slug)
 for x in [-.91,.91]:
  m.box('structural-post-'+str(x),(x,0,1.05),(.15,.24,2.10),GREEN)
  m.box('individual-post-foot-'+str(x),(x,0,.06),(.29,.34,.12),GREEN)
 m.box('plain-board-body',(0,0,1.205),(1.78,.18,1.59),GREEN)
 m.wall_panel('FRONT-cream-map','y',-.102,-.79,.79,.68,1.91,CREAM)
 poly_front(m,'FRONT-fixed-green-course-schematic',[(-.64,.83),(-.30,.76),(.04,.91),(.49,.90),(.66,1.25),(.41,1.66),(.05,1.76),(-.48,1.58),(-.65,1.17)],-.108,'#7f9a65')
 poly_front(m,'FRONT-fixed-blue-pond',[(-.12,1.44),(.02,1.57),(.24,1.53),(.28,1.37),(.12,1.30),(-.06,1.34)],-.112,'#81a5a3')
 for k,z in enumerate([.90,1.08,1.26,1.44,1.62]):m.wall_panel('FRONT-map-key-'+str(k),'y',-.113,.53,.71,z,z+.018,GREEN)
 for z in [.60,1.96]:m.box('front-frame-rail-'+str(z),(0,-.13,z),(1.91,.10,.12),GREEN)
 # Fixed roof ridge alongY, gabled front and back. Never a hipped/square canopy.
 for y in [-.33,.33]:poly_front(m,'gable-'+str(y),[(-1.0,2.04),(1.0,2.04),(0,2.42)],y,GREEN)
 for side in [-1,1]:
  x=side*1.14
  m.face('green-roof-slope-'+str(side),[(x,-.39,2.055),(x,.39,2.055),(0,.39,2.45),(0,-.39,2.45)],GREEN)
  m.face('roof-underside-'+str(side),[(x,-.39,2.015),(x,.39,2.015),(0,.39,2.41),(0,-.39,2.41)],DARK)
  for y in [-.39,.39]:tube(m,'roof-gable-trim-'+str(side)+'-'+str(y),(x,y,2.055),(0,y,2.45),.025,CREAM)
  tube(m,'roof-eave-'+str(side),(x,-.39,2.055),(x,.39,2.055),.025,CREAM)
 tube(m,'FRONT-information-roundel',(0,-.335,2.205),(0,-.365,2.205),.085,BRASS,24)
 m.wall_panel('FRONT-information-i-stem','y',-.371,-.012,.012,2.17,2.225,CREAM)
 sphere(m,'FRONT-information-i-dot',(0,-.373,2.25),.014,CREAM,5,10)
 # Two front lanterns remain OFF: neutral grey glass, no light cones or orange glow.
 for x in [-1.01,1.01]:
  tube(m,'FRONT-lantern-bracket-'+str(x),(x,-.10,1.87),(x,-.32,1.87),.015,BRASS)
  tube(m,'FRONT-lantern-hanger-'+str(x),(x,-.32,1.87),(x,-.32,1.78),.014,BRASS)
  m.box('FRONT-lantern-OFF-glass-'+str(x),(x,-.32,1.66),(.16,.16,.22),'#89928b')
  for z in [1.54,1.79]:m.box('FRONT-lantern-cap-'+str(x)+'-'+str(z),(x,-.32,z),(.20,.20,.045),BRASS)
  for xx in [x-.08,x+.08]:
   for yy in [-.40,-.24]:tube(m,'FRONT-lantern-frame-'+str(xx)+'-'+str(yy),(xx,yy,1.54),(xx,yy,1.79),.009,BRASS,6)
 # Plain structural rear: broad boarding and two horizontal strengthening battens.
 for x in np.linspace(-.77,.77,9):m.box('REAR-board-joint-'+str(x),(float(x),.095,1.21),(.009,.012,1.49),DARK)
 for z in [.73,1.68]:m.box('REAR-horizontal-brace-'+str(z),(0,.13,z),(1.72,.08,.10),GREEN)
 m.anchors.update({'FRONT-map':(0,-.11,1.30),'BACK-plain-braces':(0,.14,1.20),'FRONT-left-lantern-OFF':(-1.01,-.32,1.66),'FRONT-right-lantern-OFF':(1.01,-.32,1.66),'fixed-ridge':(0,0,2.45)})
 return slug,m,{'ppm':195,'runtimeSubjectId':'newprop:course-map-board','proposedOverallMetres':[2.28,.79,2.45],'fixedIdentity':'Broad cream map only on FRONT (-Y); plain green planked REAR (+Y) with two horizontal battens. Green gable roof ridge runs along Y. Exactly two unlit lanterns attach to FRONT left/right; two structural posts with individual feet. No planters, plants or paving slab.','nativeSourceVersion':'normal-v1.png','symmetryNote':'Map/front lanterns and plain rear braces distinguish opposite cameras; do not move lamps onto rear.'}


def straight_rope():
 slug='rope-barrier';m=model(slug)
 for k,x in enumerate([-1.5,0,1.5]):
  tube(m,'post-'+str(k)+'-round-foot',(x,0,0),(x,0,.065),.14,GREEN,20)
  tube(m,'post-'+str(k)+'-shaft',(x,0,.065),(x,0,.86),.047,GREEN,16)
  tube(m,'post-'+str(k)+'-collar',(x,0,.79),(x,0,.85),.058,BRASS,16)
  sphere(m,'post-'+str(k)+'-round-cap',(x,0,.91),.067,GREEN,6,16)
  # Fixed FRONT attachment plate, not decorative geometry invented perview.
  m.box('post-'+str(k)+'-FRONT-brass-attachment-plate',(x,-.05,.75),(.055,.018,.15),BRASS)
 for k,(a,b) in enumerate([(-1.5,0),(0,1.5)]):
  points=[(a+(b-a)*float(t),0,.83-.20*4*float(t)*(1-float(t))) for t in np.linspace(0,1,13)]
  for i in range(len(points)-1):tube(m,'rope-span-'+str(k)+'-segment-'+str(i),points[i],points[i+1],.027,CREAM,8)
  m.anchors['rope-span-'+str(k)+'-start']=points[0];m.anchors['rope-span-'+str(k)+'-end']=points[-1]
 m.anchors['single-straight-world-line']=(-1.5,0,0);m.anchors['single-straight-world-line-end']=(1.5,0,0)
 return slug,m,{'ppm':195,'runtimeSubjectId':'newprop:rope-barrier','proposedOverallMetres':[3.28,.28,.98],'fixedIdentity':'Exactly three stanchions in one straight X line at (-1.5,0), (0,0), (1.5,0); exactly two cream rope spans with fixed 0.20 m sag. Brass attachment plates stay FRONT (-Y). No L shape, fourth post or third span. Individual round feet only; no floor strip.','nativeSourceVersion':'normal-v1.png','symmetryNote':'Simple barrier is largely symmetric. Opposite views can naturally have similar silhouettes; fixed front brass plates are visible only from appropriate sides. Do not invent new parts merely to force uniqueness.'}


def tee_pair():
 slug='gold-tee-markers';m=model(slug)
 # The only two balls. Compact pair gap follows native visual proportions; proposal only.
 for k,x in enumerate([-.23,.23]):
  tube(m,'marker-'+str(k)+'-individual-round-foot',(x,0,0),(x,0,.035),.085,BRASS,28)
  tube(m,'marker-'+str(k)+'-short-mount',(x,0,.035),(x,0,.105),.041,BRASS,20)
  sphere(m,'marker-'+str(k)+'-GOLD-BALL',(x,0,.202),.108,'#c3a25d',10,20)
  for angle in [-math.pi/2,math.pi/6,5*math.pi/6]:
   bx=x+.066*math.cos(angle);by=.066*math.sin(angle)
   tube(m,'marker-'+str(k)+'-fixed-foot-bolt-'+str(angle),(bx,by,.035),(bx,by,.045),.008,'#7f704e',8)
  m.anchors['marker-'+str(k)+'-ball-centre']=(x,0,.202)
 m.anchors['pair-centre']=(0,0,0);m.anchors['fixed-marker-centre-gap-metres']=(.46,0,0)
 return slug,m,{'ppm':700,'runtimeSubjectId':'newprop:gold-tee-markers','proposedOverallMetres':[.676,.216,.310],'fixedIdentity':'Exactly two gold golf-ball markers at (-0.23,0,0.202) and (+0.23,0,0.202): fixed 0.46 m centre gap on one world X line. Each has a short individual round foot. No third ball, changing gap, grass bed, slab or connecting rail. Final painted balls keep golf dimples; guide faceting is technical only.','nativeSourceVersion':'normal-v1.png','symmetryNote':'Two matching spherical markers are genuinely symmetric; some opposite-camera silhouettes naturally repeat. Do not add asymmetry to make fake unique faces. Fixed bolts, world spacing and lighting remain consistent.','dimensionNote':'Compact 0.46 m centre spacing is a source-geometry proposal matching current painted proportions, superseding the earlier unmeasured 1 m proposal. Runtime tee width is unchanged.'}


def main():
 index={'schema':1,'technicalOnly':True,'sourceOnly':True,'nativeGeneratedHere':False,'runtimeIntegrated':False,'ownerApproved':False,'purpose':'Five remaining batch02 props: fixed front/back and component counts for normal/yaw native source generation.','sourceCoordinates':'Metres: physical RIGHT +X, LEFT -X, FRONT -Y, REAR +Y, height +Z. The whole model rotates; features never reattach.','camera':'Orthographic 30 degrees down; normal 2x2 SE/SW/NW/NE at beta -45; yaw 2x2 N/E/S/W at beta +8. Both rotate the physical model by 0/90/180/270 degrees. Native camera approval is not inferred.','finalStyle':'Existing painterly game style; late-afternoon daylight, upper-right sun and lower-left shadows, transparent background. Guides only.','models':[]}
 for factory in [water,signpost,course_map,straight_rope,tee_pair]:
  slug,m,brief=factory();folder=OUT/slug/'guides'
  folder.mkdir(parents=True,exist_ok=True)
  settings={'guide_version':1,'technical_labels':False,'scale_px_per_metre':brief['ppm'],'technical_only':True,'runtimeSubjectId':brief['runtimeSubjectId'],'fixedIdentity':brief['fixedIdentity'],'proposedOverallMetres':brief['proposedOverallMetres'],'identity_policy':'Fixed world geometry and state; no mirrored or copied corner; no native camera approval inferred.'}
  mesh=folder/(slug+'-world-model-v1.json');mesh.write_text(json.dumps({'model':slug,'settings':settings,'faces':m.faces,'anchors_world_metres':m.anchors,'components':m.components,'technical_only':True,'runtime_integrated':False},indent=2)+'\n',encoding='utf-8',newline='\n');outputs={}
  for kind in ['normal','yaw8']:
   file=g.render(m,settings,kind);stem=kind+'-world-v1';cal=folder/(stem+'.calibration.json');d=json.loads(cal.read_text(encoding='utf-8'));d['model']=slug;d['mesh_file']=mesh.name
   for v in d['views']:v['physical_heading_from_proven_basis']=(d['camera_horizontal_offset_degrees']-v['object_rotation_degrees_about_Z']-45)%360
   d['runtime_local_basis']='(model x, -model y), z unchanged; technical mapping only';cal.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8',newline='\n')
   outputs[kind]={'png':file,'svg':str(folder/(stem+'.svg')),'calibration':str(cal),'sha256':hashlib.sha256(Path(file).read_bytes()).hexdigest()};print(file,flush=True)
  source=OUT.parent/'native'/slug/brief['nativeSourceVersion']
  brief.update({'key':slug,'mesh':str(mesh),'meshSHA256':hashlib.sha256(mesh.read_bytes()).hexdigest(),'guides':outputs,'nativeIdentityReference':{'path':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()},'nativeArtApproval':False,'dimensionsAreDesignProposalsOnly':True});index['models'].append(brief)
 (OUT/'index.json').write_text(json.dumps(index,indent=2)+'\n',encoding='utf-8',newline='\n')
 compact={'technicalOnly':True,'sourceOnly':True,'models':[{'id':x['runtimeSubjectId'],'fixed':x['fixedIdentity'],'normalPNG':x['guides']['normal']['png'],'yaw8PNG':x['guides']['yaw8']['png'],'identityPNG':x['nativeIdentityReference']['path'],'symmetry':x['symmetryNote']} for x in index['models']]}
 (OUT/'compact.json').write_text(json.dumps(compact,separators=(',',':'))+'\n',encoding='utf-8',newline='\n');print('INDEX '+str(OUT/'index.json'),flush=True)
if __name__=='__main__':main()
