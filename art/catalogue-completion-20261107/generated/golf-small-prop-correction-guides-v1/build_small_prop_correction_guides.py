"""Technical fixed-world guides for small scoreboard, hole12map board and gated ramp.
No final image generation, native source changes, runtime code or integration.
"""
from pathlib import Path
import sys,importlib.util,json,math,hashlib
import numpy as np
OUT=Path(__file__).resolve().parent
ART=OUT.parents[1]
sys.path.insert(0,str(ART/'audit'))
import build_world_geometry_guides as w
import build_golf_complex_world_guides as golf
spec=importlib.util.spec_from_file_location('fixed_parts',ART/'generated/golf-source-batch-02/fixed-world-guides-v1/build_fixed_prop_guides.py');p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
GREEN='#496e54';WOOD='#b19b76';CREAM='#e3dfc5';METAL='#73877e'

def model(slug):return w.Model('golf-small-prop-correction-guides-v1/'+slug)

def scoreboard():
    slug='hole-scoreboard';m=model(slug)
    for x in [-.73,.73]:
        m.box('two-upright-'+str(x),(x,0,.94),(.12,.14,1.88),WOOD)
        m.box('plain-post-cap-'+str(x),(x,0,1.9),(.17,.18,.07),WOOD)
        golf.beam(m,'REAR-diagonal-brace-'+str(x),(x,.84,.055),(x,.08,1.29),.075,WOOD)
        m.box('REAR-support-foot-rail-'+str(x),(x,.40,.045),(.10,.95,.09),WOOD)
    m.box('green-scoreboard-body',(0,-.02,1.12),(1.34,.14,1.34),GREEN)
    for row in range(7):
        z=.64+row*.16
        m.box('FRONT-blank-name-slat-'+str(row),(-.15,-.101,z),(.87,.025,.10),CREAM)
        for x in [.39,.56]:m.box('FRONT-blank-score-cell-'+str(row)+'-'+str(x),(x,-.101,z),(.13,.025,.10),CREAM)
        m.box('REAR-horizontal-backing-slat-'+str(row),(0,.066,z),(1.30,.025,.13),'#a89c83')
    m.box('REAR-central-vertical-spine',(0,.095,1.12),(.06,.045,1.32),WOOD)
    m.anchors['FRONT-score-planks']=(0,-.12,1.12);m.anchors['REAR-plain-backing']=(0,.10,1.12)
    return slug,m,{'eventTypeId':'holeBoard','newArtSubjectProposal':'golf:event-hole-scoreboard','ppm':245,'dimensions':[1.65,1.10,1.94],'fixed':'Exactly2uprights,7blank cream name rows+2small score cells per row on FRONT-Ygreen face. REAR+Yhas plain backing slats/centralspine and2diagonal braces reaching rear feet. No clock, map, hole12, roof, copied front edge or floor plate.','nativeIdentity':str(ART/'generated/golf-source-batch-01/native/golf-source-01-08-hole-scoreboard/budget-normal-v1.png')}

def front_rect(m,name,x,z,width,height,color,y=-.088):m.wall_panel(name,'y',y,x-width/2,x+width/2,z-height/2,z+height/2,color)

def digit12(m):
    # Intrinsic front number as fixed simple strokes; never printed on the back.
    col=GREEN;y=-.098;z=1.60;h=.17;th=.022
    front_rect(m,'FRONT-digit1-main',-.085,z,th,h,col,y);front_rect(m,'FRONT-digit1-foot',-.085,z-h/2,.075,th,col,y)
    xx=.075
    for suffix,x,zz,ww,hh in [('top',xx,z+h/2,.10,th),('upper-right',xx+.04,z+h/4,th,h/2),('middle',xx,z,.10,th),('lower-left',xx-.04,z-h/4,th,h/2),('bottom',xx,z-h/2,.10,th)]:front_rect(m,'FRONT-digit2-'+suffix,x,zz,ww,hh,col,y)

def hole12():
    slug='hole-12-sign';m=model(slug)
    for x in [-.47,.47]:
        m.box('two-green-post-'+str(x),(x,0,.85),(.12,.15,1.70),GREEN);m.box('individual-mounting-foot-'+str(x),(x,0,.045),(.22,.24,.09),WOOD);m.box('post-cap-'+str(x),(x,0,1.73),(.18,.20,.06),GREEN);p.sphere(m,'fixed-small-gold-finial-'+str(x),(x,0,1.815),.049,'#b29e6a')
    arch=[(-.40,.30),(.40,.30),(.40,1.53)]+[(float(x),1.53+.25*math.sqrt(max(0,1-(x/.4)**2))) for x in np.linspace(.40,-.40,17)][1:]
    for side,color in [(-1,GREEN),(1,'#57745a')]:m.face(('FRONT' if side<0 else 'REAR')+'-arched-board',[(x,side*.075,z) for x,z in arch],color)
    for i,(a,b) in enumerate(zip(arch,arch[1:]+arch[:1])):m.face('arched-board-thickness-'+str(i),[(a[0],-.075,a[1]),(b[0],-.075,b[1]),(b[0],.075,b[1]),(a[0],.075,a[1])],GREEN)
    front_rect(m,'FRONT-map-cream-panel',0,.92,.69,1.08,CREAM)
    front_rect(m,'FRONT-number-cream-panel',0,1.60,.55,.25,CREAM);digit12(m)
    m.face('FRONT-fixed-green-hole-map',[(-.04,-.093,.48),(.19,-.093,.55),(.28,-.093,.94),(.14,-.093,1.30),(-.06,-.093,1.34),(.04,-.093,.99)],'#7e9b62')
    m.face('FRONT-fixed-blue-pond',[(.15+.05*math.cos(a),-.098,.96+.12*math.sin(a)) for a in np.linspace(0,2*math.pi,18,endpoint=False)],'#78a7b5')
    for row,color in enumerate(['#2c3331','#5b94ac','#eae7d6','#c9b45d','#ad5a4d']):
        z=1.15-row*.14;p.tube(m,'FRONT-yardage-dot-'+str(row),(-.25,-.094,z),(-.25,-.104,z),.025,color,16);front_rect(m,'FRONT-blank-yardage-row-'+str(row),-.145,z,.10,.012,GREEN,-.103)
    for z in [.49,1.36]:m.box('REAR-horizontal-brace-'+str(z),(0,.106,z),(.82,.055,.065),WOOD)
    for x in [-.13,.13]:m.box('REAR-bare-plank-seam-'+str(x),(x,.080,.94),(.009,.01,1.25),'#3f5b49')
    m.anchors['FRONT-intrinsic-number12']=(0,-.10,1.60);m.anchors['FRONT-five-dots'] =(-.25,-.10,.87);m.anchors['REAR-bare-board']=(0,.10,1.0)
    return slug,m,{'runtimeSubjectId':'newprop:hole-12-sign','ppm':270,'dimensions':[1.16,.25,1.87],'fixed':'Exactly2green uprights, arched board, intrinsic12on FRONT-Yabove ONEhole map and5coloured dots in fixed left column (black,blue,white,yellow,red). REAR+Yplain planks/braces, no copied12/map. No soil/grass apron.','nativeIdentity':str(ART/'generated/golf-source-batch-02/references/hole-12-sign.source.png')}

def walkway():
    slug='rope-walkway';m=model(slug)
    for x in [-.8,.8]:
        for y in [-.45,.45]:
            tag=str(x)+'-'+str(y);p.tube(m,'four-post-foot-'+tag,(x,y,0),(x,y,.065),.14,GREEN,16);p.tube(m,'four-post-shaft-'+tag,(x,y,.065),(x,y,.91),.055,GREEN,12);p.sphere(m,'four-post-cap-'+tag,(x,y,.96),.062,GREEN,5,12)
    # Two leaves fixed90degreesOPEN along passage sides; hinges are the physical rear(+Y)posts.
    for side in [-1,1]:
        x=side*.8;yhinge=.45;ytip=-.27
        for z in [.29,.82]:p.tube(m,'OPEN-gate-rope-rail-'+str(side)+'-'+str(z),(x,yhinge,z),(x,ytip,z),.035,CREAM,10)
        p.tube(m,'OPEN-gate-leading-upright-'+str(side),(x,ytip,.25),(x,ytip,.88),.025,GREEN)
        p.tube(m,'OPEN-gate-diagonal-'+str(side),(x,yhinge,.29),(x,ytip,.82),.023,GREEN)
        for z in [.30,.79]:p.tube(m,'REAR-fixed-hinge-'+str(side)+'-'+str(z),(x,yhinge,z-.04),(x,yhinge,z+.04),.07,'#a69566',12)
    # Only the functional metal threshold/ramp is a physical plate. Actual holes, not an opaque background rectangle.
    x0,x1=-.70,.70;y0,y1=-1.05,.15
    def at(x,y):return(x,y,.015+(y-y0)/(y1-y0)*.05)
    nx,ny=12,10
    for ix in range(nx):
        for iy in range(ny):
            xa,xb=x0+(x1-x0)*ix/nx,x0+(x1-x0)*(ix+1)/nx;ya,yb=y0+(y1-y0)*iy/ny,y0+(y1-y0)*(iy+1)/ny;cx,cy=(xa+xb)/2,(ya+yb)/2;hx,hy=.021,.023
            outer=[(xa,ya),(xb,ya),(xb,yb),(xa,yb)];inner=[(cx-hx,cy-hy),(cx+hx,cy-hy),(cx+hx,cy+hy),(cx-hx,cy+hy)]
            for k in range(4):j=(k+1)%4;m.face('perforated-ramp-cell-'+str(ix)+'-'+str(iy)+'-'+str(k),[at(*outer[k]),at(*outer[j]),at(*inner[j]),at(*inner[k])],METAL)
    for side in [-1,1]:
        xx=side*.725;m.face('functional-ramp-YELLOW-edge-'+str(side),[at(xx-.025,y0),at(xx+.025,y0),at(xx+.025,y1),at(xx-.025,y1)],'#ccb362')
    m.anchors['functional-ramp-front-centre']=(0,y0,.015);m.anchors['left-open-leaf-hinge']=(-.8,.45,.82);m.anchors['right-open-leaf-hinge']=(.8,.45,.82);m.anchors['left-open-leaf-tip']=(-.8,-.27,.82);m.anchors['right-open-leaf-tip']=(.8,-.27,.82)
    return slug,m,{'runtimeSubjectId':'newprop:rope-walkway','ppm':260,'dimensions':[1.9,1.65,1.03],'fixed':'Exactly4green posts,2gate leaves fixed90degreesOPEN, rear+Yhinges and leaves extendingtowardFRONT-Y; ONEperforated metal ramp/threshold with yellow long-side edges. Two leaves never change angle, swap hinge ends or become closed. No generic ground plate outside functional ramp.','nativeIdentity':str(ART/'generated/golf-source-batch-02/references/rope-walkway.source.png')}

def main():
    index={'schema':1,'technicalOnly':True,'nativeGenerated':False,'runtimeIntegrated':False,'ownerApproved':False,'purpose':'Correct duplicate/opposite-edge and inconsistent-camera small props with one fixed world model.','geometryDimensionsAreProposals':True,'worldBasis':'physicalRIGHT+X,LEFT-X,FRONT-Y,REAR+Y,UP+Z','normalCells':[['SE','SW'],['NW','NE']],'yaw8Cells':[['N','E'],['S','W']],'finalStyle':'Detailed painterly game style; late-afternoon upper-right sunlight/lower-left shadows. Geometry/camera from guide, material identity from exact source reference. Genuine zero-alpha background, no haze/grid/captions, no people, no floor except functional ramp.','models':[]}
    for factory in [scoreboard,hole12,walkway]:
        slug,m,brief=factory();folder=OUT/slug/'guides'
        if folder.exists():raise FileExistsError(folder)
        folder.mkdir(parents=True);settings={'guide_version':1,'scale_px_per_metre':brief['ppm'],'technical_labels':False,'technical_only':True,'fixedIdentity':brief['fixed'],'dimensionsAreSourceDesignProposals':brief['dimensions']}
        mesh=folder/(slug+'-world-model-v1.json');mesh.write_text(json.dumps({'model':slug,'settings':settings,'faces':m.faces,'anchors_world_metres':m.anchors,'components':m.components,'technical_only':True,'runtime_integrated':False},indent=2)+'\n',encoding='utf-8');outputs={}
        for kind in ['normal','yaw8']:
            file=w.render(m,settings,kind);stem=kind+'-world-v1';cp=folder/(stem+'.calibration.json');d=json.loads(cp.read_text(encoding='utf-8'));d['model']=slug;d['mesh_file']=mesh.name
            for v in d['views']:
                theta=v['object_rotation_degrees_about_Z'];v['physical_heading_if_reflected_Y_basis']=(d['camera_horizontal_offset_degrees']-theta-45)%360;front=w.rotate([(0,-1,0)],theta/90)[0];dot=float(front@np.array(d['basis']['toward_camera']));v['front_face_visibility_dot']=dot;v['dominant_panel_face']='front' if dot>0 else 'rear';v['opposite_edge_not_reused']=True
            cp.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8');outputs[kind]={'png':file,'svg':str(folder/(stem+'.svg')),'calibration':str(cp),'sha256':hashlib.sha256(Path(file).read_bytes()).hexdigest()};print(file,flush=True)
        brief.update({'key':slug,'mesh':str(mesh),'meshSHA256':hashlib.sha256(mesh.read_bytes()).hexdigest(),'guides':outputs,'nativeArtApproval':False});index['models'].append(brief)
    index['generatorProvenance']={'file':str(Path(__file__)),'sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()};(OUT/'index.json').write_text(json.dumps(index,indent=2)+'\n',encoding='utf-8');compact={'technicalOnly':True,'models':[{'key':m['key'],'fixed':m['fixed'],'normal':m['guides']['normal']['png'],'yaw8':m['guides']['yaw8']['png'],'identity':m['nativeIdentity']} for m in index['models']]};(OUT/'compact.json').write_text(json.dumps(compact,separators=(',',':'))+'\n',encoding='utf-8')

if __name__=='__main__':main()
