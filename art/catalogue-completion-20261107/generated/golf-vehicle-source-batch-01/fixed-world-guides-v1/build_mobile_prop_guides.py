"""Eight mobile-prop fixed-world geometry reference models, never final native art/runtime.
One physical parked state per model, normal4+yaw4, original source identity refs kept separately.
"""
from pathlib import Path
import sys,importlib.util,json,hashlib,math
import numpy as np
OUT=Path(__file__).resolve().parent
ART=OUT.parents[2]
sys.path.insert(0,str(ART/'audit'))
import build_world_geometry_guides as w
import build_vehicle_camera_guides as vehicle
import build_golf_complex_world_guides as complex_golf
import build_broadcast_dish_world_v2 as dish_helper
spec=importlib.util.spec_from_file_location('prop_parts',ART/'generated/golf-source-batch-02/fixed-world-guides-v1/build_fixed_prop_guides.py');parts=importlib.util.module_from_spec(spec);spec.loader.exec_module(parts)
GREEN='#476e57';CREAM='#d9d3b9';METAL='#70817b';BLACK='#2f3e3b';WOOD='#a88b63'

def base(slug):return w.Model('golf-vehicle-source-batch-01/fixed-world-guides-v1/'+slug)

def cart(slug,length=3.4,width=1.4,wheelbase=2.0,paint=CREAM):
    m=base(slug);vehicle.common(m,length,width,.60,wheelbase,.28,paint)
    # Sloping bonnet makes the forward end distinct without pretending this proxy is a finished vehicle design.
    m.face('FRONT-sloping-bonnet',[(-width*.47,-length/2,.60),(width*.47,-length/2,.60),(width*.44,-length/2+.40,.78),(-width*.44,-length/2+.40,.78)],paint)
    return m

def seat(m,name,y,width=1.12,x=0,color=CREAM,back=True):
    m.box(name+'/seat-base-support',(x,y,.69),(width*.93,.36,.18),CREAM)
    m.box(name+'/seat-cushion',(x,y,.83),(width,.43,.12),color)
    if back:m.box(name+'/backrest',(x,y+.20,1.10),(width,.12,.43),color)
    for side in [-1,1]:parts.tube(m,name+'/side-rail-'+str(side),(x+side*width*.52,y-.23,.86),(x+side*width*.52,y+.23,1.02),.025,BLACK)
    m.anchors[name+'/centre']=(x,y,.89)

def canopy(m,name,front,rear,z=1.82,width=1.45,posts=None,color=CREAM):
    m.box(name+'/roof',(0,(front+rear)/2,z),(width,rear-front,.075),color)
    for y in posts if posts is not None else [front+.08,rear-.08]:
        for side in [-1,1]:parts.tube(m,name+'/support-'+str(side)+'-'+str(y),(side*(width/2-.09),y,.60),(side*(width/2-.09),y,z-.04),.025,BLACK)
    m.anchors[name+'/front-edge']=(0,front,z);m.anchors[name+'/rear-edge']=(0,rear,z)

def windshield(m,y=-.97,z0=.76,z1=1.63,width=1.20):
    m.face('FRONT-windscreen',[(-width/2,y-.10,z0),(width/2,y-.10,z0),(width/2,y,z1),(-width/2,y,z1)],'#7d9d9f')
    for side in [-1,1]:parts.tube(m,'FRONT-windscreen-side-'+str(side),(side*width/2,y-.10,z0),(side*width/2,y,z1),.022,BLACK)

def steering(m,x=-.32,y=-.83,z=1.04):
    parts.tube(m,'FRONT-driver-steering-column',(x,y,.66),(x,y-.03,z),.022,BLACK)
    # Fixed wheel ring as simple technical torus polygon.
    n=14
    for i in range(n):
        a=i*2*math.pi/n;b=(i+1)*2*math.pi/n
        parts.tube(m,'FRONT-steering-rim-'+str(i),(x+.14*math.cos(a),y+.14*math.sin(a),z),(x+.14*math.cos(b),y+.14*math.sin(b),z),.014,BLACK,6)

def cross_y(m,name,y,x,z,size=.22):
    m.wall_panel(name+'-vertical','y',y,x-size*.16,x+size*.16,z-size*.5,z+size*.5,GREEN)
    m.wall_panel(name+'-horizontal','y',y,x-size*.5,x+size*.5,z-size*.16,z+size*.16,GREEN)

def medical():
    slug='cart-ambulance';m=cart(slug,3.4,1.38,2.10);seat(m,'FRONT-two-place-driver-bench',-.38);canopy(m,'FRONT-short-cab-canopy',-1.25,.20,1.82,1.45);windshield(m);steering(m)
    parts.tube(m,'green-roof-beacon',(0,-.52,1.86),(0,-.52,2.04),.075,'#4c9b65',16)
    m.box('REAR-medical-platform',(0,.95,.74),(1.25,1.47,.14),METAL)
    m.box('REAR-ONE-orange-stretcher-mattress',(0,.95,1.08),(.68,1.38,.12),'#d99549')
    for x in [-.40,.40]:
        parts.tube(m,'REAR-stretcher-long-rail-'+str(x),(x,.22,1.03),(x,1.67,1.03),.025,METAL)
        for y in [.35,1.55]:parts.tube(m,'REAR-stretcher-support-'+str(x)+'-'+str(y),(x,y,.81),(x,y,1.03),.025,METAL)
    for y in [.60,1.24]:m.box('REAR-fixed-black-stretcher-strap-'+str(y),(0,y,1.15),(.70,.07,.02),BLACK)
    parts.tube(m,'REAR-platform-end-guard',(-.59,1.64,.95),(.59,1.64,.95),.025,METAL)
    cross_y(m,'FRONT-medical-cross',-1.706,0,.53,.22)
    m.anchors['REAR-stretcher-centre']=(0,.95,1.08)
    return slug,m,{'dimensions':[1.50,3.55,2.05],'ppm':155,'fixed':'One front two-place bench/short canopy/green beacon; exactly ONE orange stretcher with TWO straps at REAR+Y. No patient or operator. Four road wheels, straight steering.'}

def accessible():
    slug='wheelchair-cart';m=cart(slug,3.55,1.52,2.2,CREAM)
    # A sound low-floor accessible cart rather than the reference tarp/log construction.
    m.box('clear-wheelchair-bay-floor',(0,.28,.58),(1.40,1.45,.06),METAL);seat(m,'FRONT-single-driver-seat',-.85,.57,-.36);seat(m,'REAR-passenger-bench',1.30,1.2)
    canopy(m,'full-intact-canopy',-1.45,1.65,1.94,1.63,posts=[-1.35,.95,1.55]);windshield(m,-1.27,.77,1.74,1.3);steering(m,-.36,-1.18,1.08)
    # Permanently deployed ramp on physical LEFT(-X), not screen-left in each view.
    m.face('LEFT-ramp-surface',[(-.78,-.25,.61),(-.78,.80,.61),(-2.03,.80,.04),(-2.03,-.25,.04)],'#9aaba5')
    for y in [-.25,.80]:parts.tube(m,'LEFT-ramp-yellow-edge-'+str(y),(-.78,y,.62),(-2.03,y,.05),.022,'#c5ae61')
    for x in [-.76,.76]:
        for y in [-.33,.94]:parts.tube(m,'bay-grab-post-'+str(x)+'-'+str(y),(x,y,.48),(x,y,1.25),.025,METAL)
    parts.tube(m,'RIGHT-bay-grab-rail',(.76,-.33,1.25),(.76,.94,1.25),.025,METAL)
    m.wall_panel('LEFT-rear-accessibility-symbol-panel','x',-.79,.95,1.55,.72,1.10,'#587f9c')
    m.anchors['LEFT-ramp-hinge']=(-.78,.275,.61);m.anchors['LEFT-ramp-ground-edge']=(-2.03,.275,.04);m.anchors['clear-wheelchair-bay']=(0,.28,.61)
    return slug,m,{'dimensions':[2.95,3.7,2.02],'ppm':130,'fixed':'Ramp ALWAYS deployed on physicalLEFT-X, same angle; one front driver seat, empty central wheelchair bay, one rear bench. Four wheels, intact simple canopy. No wheelchair user; technical dimensions are not accessibility certification.'}

def shuttle():
    slug='shuttle-cart';m=cart(slug,4.55,1.42,3.15,CREAM)
    for i,y in enumerate([-1.35,0,1.35]):seat(m,'bench-row-'+str(i),y,1.17,color=GREEN)
    canopy(m,'ONE-long-passenger-canopy',-2.08,2.08,1.95,1.53,posts=[-1.96,-.65,.65,1.96]);windshield(m,-1.95,.77,1.75,1.25);steering(m,-.34,-1.86,1.08)
    parts.tube(m,'REAR-passenger-end-rail',(-.63,2.10,1.05),(.63,2.10,1.05),.025,METAL)
    return slug,m,{'dimensions':[1.58,4.7,2.0],'ppm':125,'fixed':'EXACTLY3transverse two-place bench rows, all facingFRONT-Y, ONE full-length canopy,4road wheels and long wheelbase. No bus walls/doors or people; displayed seats are source design, not gameplay capacity.'}

def vending():
    slug='ice-cream-cart';m=base(slug)
    m.box('green-enamel-freezer-chest',(0,0,.73),(1.2,1.1,.65),GREEN)
    for side in [-1,1]:
        vehicle.cylinder_x(m,'large-spoked-tyre-'+str(side),(side*.65,-.06,.34),.34,.10,BLACK,24)
        vehicle.cylinder_x(m,'large-wheel-hub-'+str(side),(side*.707,-.06,.34),.075,.025,WOOD,16)
        for i in range(10):
            a=i*2*math.pi/10;parts.tube(m,'large-wheel-spoke-'+str(side)+'-'+str(i),(side*.716,-.06,.34),(side*.716,-.06+.29*math.cos(a),.34+.29*math.sin(a)),.009,WOOD,6)
    vehicle.cylinder_x(m,'ONE-small-caster',(0,.74,.105),.105,.08,BLACK,16)
    parts.tube(m,'caster-fork',(0,.74,.20),(0,.63,.41),.025,METAL)
    for side in [-1,1]:parts.tube(m,'REAR-push-handle-arm-'+str(side),(side*.45,.53,.94),(side*.45,.98,.94),.025,WOOD)
    parts.tube(m,'REAR-push-handle-crossbar',(-.45,.98,.94),(.45,.98,.94),.025,WOOD)
    for x in [-.29,.29]:
        for y,color in [(-.25,'#bf8887'),(.23,'#c8c18c')]:m.box('freezer-tub-'+str(x)+'-'+str(y),(x,y,1.065),(.50,.43,.025),color)
    for x in [-.59,0,.59]:m.box('top-glass-frame-X'+str(x),(x,0,1.085),(.025,1.1,.025),METAL)
    for y in [-.54,0,.54]:m.box('top-glass-frame-Y'+str(y),(0,y,1.085),(1.2,.025,.025),METAL)
    parts.tube(m,'ONE-umbrella-pole',(0,-.02,1.09),(0,-.02,2.38),.025,WOOD)
    for i in range(12):
        a,b=i*2*math.pi/12,(i+1)*2*math.pi/12;edgeA=(math.cos(a),-.02+math.sin(a),2.11);edgeB=(math.cos(b),-.02+math.sin(b),2.11)
        m.face('umbrella-fixed-panel-'+str(i),[(0,-.02,2.40),edgeA,edgeB],GREEN if i%2==0 else CREAM)
        parts.tube(m,'umbrella-fixed-rib-'+str(i),(0,-.02,2.40),edgeA,.008,WOOD,6)
    m.box('REAR-RIGHT-cone-rack',(.37,.45,1.15),(.3,.23,.16),WOOD)
    for x in [.29,.43]:
        for y in [.40,.51]:parts.tube(m,'REAR-RIGHT-cone-stack-'+str(x)+'-'+str(y),(x,y,1.20),(x,y,1.48),.045,'#c4a365',10)
    parts.tube(m,'REAR-LEFT-cup-stack',(-.35,.45,1.10),(-.35,.45,1.42),.055,CREAM,12)
    m.anchors['ONE-small-caster-ground']=(0,.74,0);m.anchors['REAR-cone-rack']=(.37,.45,1.3)
    return slug,m,{'dimensions':[2.0,2.0,2.4],'ppm':210,'fixed':'Manual chest pushcart, TWO large axle wheels+ONE small rear caster; handle/cone rack/cups all atREAR+Y, ONE fixed striped umbrella,4top freezer tubs. No engine or driver.'}

def cargo_load(m):
    # Fixed counts/order: two orange round jugs rear-left/centre, two white-lid coolboxes front, one bottle crate rear-right.
    for i,x in enumerate([-.43,-.02]):
        parts.tube(m,'REAR-load-ORANGE-jug-'+str(i),(x,1.12,.82),(x,1.12,1.29),.16,'#cd8547',16)
        parts.tube(m,'REAR-load-ORANGE-jug-white-lid-'+str(i),(x,1.12,1.29),(x,1.12,1.33),.17,CREAM,16)
    for i,x in enumerate([-.34,.30]):
        m.box('REAR-load-rectangular-coolbox-'+str(i),(x,.40,.97),(.52,.49,.31),GREEN)
        m.box('REAR-load-coolbox-WHITE-lid-'+str(i),(x,.40,1.145),(.55,.52,.05),CREAM)
    m.box('REAR-load-ONE-bottle-crate',(.43,1.09,.94),(.40,.40,.25),GREEN)
    for i,x in enumerate([.31,.43,.55]):
        for j,y in enumerate([.97,1.09,1.21]):parts.tube(m,'REAR-load-bottle-'+str(i)+'-'+str(j),(x,y,1.05),(x,y,1.24),.035,'#83a6b2',10)
    m.anchors['REAR-load-jug0']=(-.43,1.12,1.1);m.anchors['REAR-load-jug1']=(-.02,1.12,1.1);m.anchors['REAR-load-bottle-crate']=(.43,1.09,1.0)

def loaded_cart(slug,old=False):
    m=cart(slug,3.25,1.45,2.05,GREEN if not old else '#a99c7c');seat(m,'FRONT-driver-bench',-.48,1.16);canopy(m,'FRONT-intact-canopy',-1.27,.05,1.83,1.5,color=CREAM if not old else '#b1ab8d');windshield(m,-1.08,.77,1.65,1.25);steering(m,-.34,-.93,1.08)
    m.box('REAR-cargo-floor',(0,.82,.74),(1.38,1.54,.12),METAL)
    color=GREEN if not old else '#9d8c68'
    for side in [-1,1]:m.box('REAR-cargo-sideboard-'+str(side),(side*.67,.82,.95),(.065,1.55,.34),color)
    m.box('REAR-cargo-tailgate',(0,1.57,.95),(1.38,.065,.34),color);cargo_load(m)
    return slug,m,{'dimensions':[1.55,3.40,1.92],'ppm':160,'fixed':'FRONTbench/canopy/controls, REARloadedbed. EXACT load:2orange round jugs,2rectangular white-lid coolboxes,1bottle crate. Fixed cargo positions across8views; no passengers or loose cargo movement. '+('Older plain bolted-board/metal utility, intact canopy; no rope/tarp shack.' if old else 'Green painted utility bed; source later-era nose is identity-only, geometry proxy does not bind an era.')}

def van_base(slug):
    m,unused=vehicle.make_vehicle('van');m.name='golf-vehicle-source-batch-01/fixed-world-guides-v1/'+slug
    # Solid twin rear cargo doors, not an invented rear passenger window.
    m.faces=[f for f in m.faces if f['name']!='rear-small-window']
    for side in [-1,1]:m.wall_panel('green-lower-cargo-band-'+str(side),'x',side*1.056,-.76,2.80,.65,1.18,GREEN)
    m.wall_panel('green-rear-band','y',2.823,-1.03,1.03,.65,1.18,GREEN)
    for y in [-.72,1.55]:m.box('RIGHT-sliding-cargo-door-seam-'+str(y),(1.065,y,1.58),(.018,.025,1.48),METAL)
    m.box('RIGHT-cargo-door-handle',(1.075,-.47,1.38),(.04,.20,.045),BLACK)
    return m

def satellite():
    slug='satellite-van';m=van_base(slug)
    parts.tube(m,'roof-dish-mount-pedestal',(0,1.25,2.4),(0,1.25,2.81),.13,METAL,16)
    child=w.Model('translated-curved-dish-subassembly');axis=dish_helper.revised_dish(child)
    offset=[-4.5,1.25-5.15,3.12-3.15];complex_golf.transformed_copy(m,child,'ONE-fixed-curved-roof-dish',offset)
    m.box('roof-HVAC-forward-of-dish',(0,-.05,2.56),(.72,.70,.30),'#b1b5a5')
    for x in [-.72,.72]:parts.tube(m,'roof-front-aerial-'+str(x),(x,-.63,2.4),(x,-.63,3.15),.012,BLACK)
    m.anchors['dish-world-centre']=(0,1.25,3.12);m.anchors['dish-world-aim-point']=tuple(np.array([0,1.25,3.12])+axis*2)
    return slug,m,{'dimensions':[2.2,5.75,3.95],'ppm':94,'fixed':'ONE genuinely curved parabolic roof dish, fixed axis rotates ONLYwithvan. Show convex ribbed back in cameras where dish faces away, never turn dish toward viewer. HVAC lies forward of dish, two aerials at front roof, one right sliding door/twin rear doors.','dishFixedAimUnitVector':axis.tolist(),'dishHelperSource':str(ART/'audit/build_broadcast_dish_world_v2.py'),'dishHelperOffsetMetres':offset}

def broadcast():
    slug='shanty-broadcast-van';m=van_base(slug)
    # Sound steel mounting frame replaces the fantasy pallet/tarp source additions.
    for x in [-.72,.72]:parts.tube(m,'roof-steel-rack-long-'+str(x),(x,-.85,2.47),(x,1.85,2.47),.035,METAL)
    for y in [-.85,.5,1.85]:parts.tube(m,'roof-steel-rack-cross-'+str(y),(-.72,y,2.47),(.72,y,2.47),.035,METAL)
    vehicle.cylinder_x(m,'ONE-roof-cable-reel-drum',(0,.90,2.98),.31,.62,BLACK,32)
    for side in [-1,1]:vehicle.cylinder_x(m,'ONE-reel-flange-'+str(side),(side*.34,.90,2.98),.43,.045,METAL,32)
    for x in [-.34,.34]:parts.tube(m,'reel-fixed-bearing-support-'+str(x),(x,.90,2.48),(x,.90,2.98),.035,METAL)
    m.box('roof-HVAC-beside-front-of-reel',(.36,-.19,2.68),(.64,.65,.40),'#aab09e')
    parts.tube(m,'ONE-front-roof-aerial',(-.73,-.73,2.40),(-.73,-.73,3.23),.012,BLACK)
    m.wall_panel('RIGHT-plain-side-equipment-panel','x',1.083,.10,1.45,1.20,2.08,'#87957e')
    for y in [.23,.47,.71,.95,1.19]:m.box('RIGHT-equipment-panel-vent-'+str(y),(1.093,y,1.65),(.012,.14,.035),BLACK)
    m.anchors['ONE-roof-reel-centre']=(0,.90,2.98);m.anchors['roof-HVAC-centre']=(.36,-.19,2.68)
    return slug,m,{'dimensions':[2.2,5.75,3.43],'ppm':98,'fixed':'ONEroof cable reel on transverseXaxle, ONEHVAC box front/right of reel, ONEfront aerial. Closed cargo body/twinrear doors. Ordinary bolted steel roof rack; no satellite dish, log pallets, ropes, tarp or corrugated roof patch.'}

def main():
    jobIndex=json.loads((OUT.parent/'job-index.json').read_text(encoding='utf-8'));jobs={j['runtimeSubjectId']:j for j in jobIndex['jobs']}
    index={'schema':1,'technicalOnly':True,'nativeArtGenerated':False,'runtimeIntegrated':False,'ownerApproved':False,'geometryDimensionsAreDesignProposals':True,'commonWorld':'Modelright+X,left-X,front-Y,rear+Y,up+Z. Each parked/fixed-state object rotates0/90/180/270degrees, camera fixed.','camera':'Normal2x2SE/SW/NW/NE at30down/beta-45. Yaw8N/E/S/W at30down/beta+8. Source camera labels are not runtime or native-camera approval.','nativePaintInstruction':'Reference1guide controls exact geometry/camera/fixedstate; reference2original PNG controls recognizable identity/materials only, with explicitly required ordinary-budget redesign. Match painterly game style, late-afternoon upper-right sun/lower-left shadows, zero-alpha background, no scenery/people/text/logos/haze.','models':[]}
    factories=[medical,accessible,shuttle,vending,lambda:loaded_cart('drinks-cart-green'),lambda:loaded_cart('supply-cart',True),satellite,broadcast]
    for factory in factories:
        slug,m,brief=factory();ident='newprop:'+slug;folder=OUT/slug/'guides'
        folder.mkdir(parents=True,exist_ok=True);settings={'guide_version':1,'scale_px_per_metre':brief['ppm'],'technical_labels':False,'technical_only':True,'runtimeSubjectId':ident,'fixedIdentity':brief['fixed'],'dimensions_design_proposal_metres':brief['dimensions'],'identity_policy':'ONEvehicle/fixedstate/componentarrangement across8views. No repeated or mirrored corners; not finished native art.'}
        mesh=folder/(slug+'-world-model-v1.json');mesh.write_text(json.dumps({'model':slug,'settings':settings,'faces':m.faces,'anchors_world_metres':m.anchors,'components':m.components,'technical_only':True,'runtime_integrated':False},indent=2)+'\n',encoding='utf-8');outputs={}
        for kind in ['normal','yaw8']:
            file=w.render(m,settings,kind);stem=kind+'-world-v1';cp=folder/(stem+'.calibration.json');d=json.loads(cp.read_text(encoding='utf-8'));d['model']=slug;d['mesh_file']=mesh.name;d['runtime_local_basis']='(modelx,-modely), unchangedz; technical proof only'
            for v in d['views']:
                v['physical_heading_from_proven_basis']=(d['camera_horizontal_offset_degrees']-v['object_rotation_degrees_about_Z']-45)%360
                front=w.rotate([(0,-1,0)],v['object_rotation_degrees_about_Z']/90)[0];v['actual_projected_nose_vector']=[float(front@np.array(d['basis']['screen_right'])),float(front@np.array(d['basis']['screen_down']))]
                if 'dishFixedAimUnitVector' in brief:
                    axis=w.rotate([brief['dishFixedAimUnitVector']],v['object_rotation_degrees_about_Z']/90)[0];dot=float(axis@np.array(d['basis']['toward_camera']));v['fixed_dish_surface']={'frontNormalDotTowardCamera':dot,'dominantSurface':'concave front' if dot>0 else 'convex ribbed back','aimNeverChangesWithinModel':True}
            cp.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8');outputs[kind]={'png':file,'svg':str(folder/(stem+'.svg')),'calibration':str(cp),'sha256':hashlib.sha256(Path(file).read_bytes()).hexdigest()};print(file,flush=True)
        brief.update({'key':slug,'runtimeSubjectId':ident,'sourceIdentityPNG':jobs[ident]['sourceReferencePNG'],'sourceConditionAndEraBrief':jobs[ident]['conditionAndEraBrief'],'mesh':str(mesh),'meshSHA256':hashlib.sha256(mesh.read_bytes()).hexdigest(),'guides':outputs,'finalArtApproval':False});index['models'].append(brief)
    index['generatorSource']={'path':str(Path(__file__)),'sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    for path in [ART/'audit/build_world_geometry_guides.py',ART/'audit/build_vehicle_camera_guides.py',ART/'audit/build_broadcast_dish_world_v2.py']:index.setdefault('helperProvenance',[]).append({'file':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    (OUT/'index.json').write_text(json.dumps(index,indent=2)+'\n',encoding='utf-8');compact={'technicalOnly':True,'nativeGenerationByRoot':True,'models':[{'id':m['runtimeSubjectId'],'fixed':m['fixed'],'normal':m['guides']['normal']['png'],'yaw8':m['guides']['yaw8']['png'],'identity':m['sourceIdentityPNG']} for m in index['models']]};text=json.dumps(compact,separators=(',',':'))+'\n';assert len(text)<12000;(OUT/'compact.json').write_text(text,encoding='utf-8');print('INDEX '+str(OUT/'index.json'),flush=True)

if __name__=='__main__':main()
