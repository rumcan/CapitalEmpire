"""Technical fixed-state models for four held golf props. Not native painted sprites or runtime code."""
from pathlib import Path
import importlib.util,json,math,hashlib
import numpy as np
OUT=Path(__file__).resolve().parent
ART=OUT.parents[2]
spec=importlib.util.spec_from_file_location('fixed_world_builder',ART/'audit/build_world_geometry_guides.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
GREEN='#456d55';BLACK='#46534c';BRASS='#b5a16f';CREAM='#ddd8bf'

def tube(m,name,a,b,r,color=BLACK,sides=10):
    a,b=np.array(a,dtype=float),np.array(b,dtype=float);axis=b-a;axis/=np.linalg.norm(axis);n=np.cross(axis,[0,0,1])
    if np.linalg.norm(n)<1e-8:n=np.cross(axis,[0,1,0])
    n/=np.linalg.norm(n);v=np.cross(axis,n);rings=[]
    for centre in [a,b]:rings.append([tuple(centre+r*(math.cos(t)*n+math.sin(t)*v)) for t in np.linspace(0,2*math.pi,sides,endpoint=False)])
    m.face(name+'/end-a',list(reversed(rings[0])),color);m.face(name+'/end-b',rings[1],color)
    for i in range(sides):j=(i+1)%sides;m.face(name+'/side-'+str(i),[rings[0][i],rings[0][j],rings[1][j],rings[1][i]],color)
    m.anchors[name+'/a']=tuple(a);m.anchors[name+'/b']=tuple(b)

def sphere(m,name,centre,r,color,lat=6,lon=12):
    cx,cy,cz=centre
    for i in range(lat):
        a0=-math.pi/2+i*math.pi/lat;a1=-math.pi/2+(i+1)*math.pi/lat
        for j in range(lon):
            t0=j*2*math.pi/lon;t1=(j+1)*2*math.pi/lon
            def p(a,t):return(cx+r*math.cos(a)*math.cos(t),cy+r*math.cos(a)*math.sin(t),cz+r*math.sin(a))
            points=[p(a0,t0),p(a0,t1),p(a1,t1),p(a1,t0)]
            # Polar triangles avoid a degenerate first triangle in the shared flat-shading renderer.
            if i==0:points=[p(a0,t0),p(a1,t1),p(a1,t0)]
            elif i==lat-1:points=[p(a0,t0),p(a0,t1),p(a1,t0)]
            m.face(name+'/'+str(i)+'-'+str(j),points,color)
    m.anchors[name]=centre

def ring(m,name,centre,outer,inner,color,z=None,n=24):
    x,y,zz=centre
    if z is not None:zz=z
    for i in range(n):
        a=i*2*math.pi/n;b=(i+1)*2*math.pi/n
        m.face(name+'/'+str(i),[(x+outer*math.cos(a),y+outer*math.sin(a),zz),(x+outer*math.cos(b),y+outer*math.sin(b),zz),(x+inner*math.cos(b),y+inner*math.sin(b),zz),(x+inner*math.cos(a),y+inner*math.sin(a),zz)],color)

def model(slug):return g.Model('golf-source-batch-02/fixed-world-guides-v1/'+slug)

def washer():
    slug='ball-washer';m=model(slug)
    tube(m,'round-mounting-base',(0,0,0),(0,0,.055),.19,GREEN,24);tube(m,'pedestal-stem',(0,0,.055),(0,0,.75),.06,GREEN,20)
    # Open brush cup: outside shell, internal dark wall and low floor; never a lid over the opening.
    n=28
    for i in range(n):
        a=i*2*math.pi/n;b=(i+1)*2*math.pi/n
        for radius,color in [(.16,GREEN),(.13,'#263d30')]:
            m.face('cup-wall-'+str(radius)+'-'+str(i),[(radius*math.cos(a),radius*math.sin(a),.77),(radius*math.cos(b),radius*math.sin(b),.77),(radius*math.cos(b),radius*math.sin(b),1.05),(radius*math.cos(a),radius*math.sin(a),1.05)],color)
    ring(m,'open-cup-rim',(0,0,1.055),.17,.128,BRASS)
    m.face('brush-cup-floor',[(.13*math.cos(t),.13*math.sin(t),.79) for t in np.linspace(0,2*math.pi,n,endpoint=False)],'#273c30')
    sphere(m,'one-ball-visible-in-open-cup',(0,-.015,1.015),.035,'#f2efe2')
    angle=math.radians(-70);centre=np.array([0,.15,1.065]);normal=np.array([0,-math.sin(angle),math.cos(angle)])
    def tilt(x,y,z=0):return tuple(centre+np.array([x,y*math.cos(angle)-z*math.sin(angle),y*math.sin(angle)+z*math.cos(angle)]))
    lid=[tilt(.165*math.cos(t),-.15+.165*math.sin(t)) for t in np.linspace(0,2*math.pi,28,endpoint=False)]
    m.face('lid-OPEN70degrees-outer',lid,GREEN);m.face('lid-OPEN70degrees-inner',[tuple(np.array(p)-normal*.008) for p in reversed(lid)],'#b8b79c')
    lidcentre=np.array(tilt(0,-.15));sphere(m,'lid-knob',tuple(lidcentre+normal*.025),.024,BRASS)
    tube(m,'hinge',( -.055,.15,1.065),(.055,.15,1.065),.015,BRASS)
    tube(m,'crank-RIGHT-shaft',(.15,0,.95),(.29,0,.95),.015,BRASS);tube(m,'crank-RIGHT-arm',(.29,0,.95),(.29,0,.78),.018,BRASS);tube(m,'crank-RIGHT-wooden-grip',(.29,0,.78),(.43,0,.78),.026,'#8e6d4f')
    tube(m,'towel-LEFT-hook',(-.15,0,.95),(-.27,0,.95),.012,BRASS)
    cloth=[(-.27,-.12,.94),(-.27,.12,.94),(-.275,.12,.48),(-.27,.025,.43),(-.275,-.12,.49)]
    m.face('towel-LEFT-white-cloth',cloth,'#ece9d6');m.face('towel-LEFT-green-stripe',[(-.279,-.12,.53),(-.279,.12,.53),(-.279,.12,.57),(-.279,-.12,.57)],GREEN)
    m.anchors['lid-state-fixed-OPEN'] = tuple(lidcentre);m.anchors['model-front']=(0,-.3,0)
    return slug,m,{'runtimeSubjectId':'newprop:ball-washer','ppm':410,'fixedIdentity':'Lid OPEN70degrees in every view; one ball in opening; crank on physical+XRIGHT; towel on physical-XLEFT. No state changes or mirroring.','proposedOverallMetres':[.72,.42,1.26],'components':'Round foot, green pedestal/cup, fixed open lid and hinge, one right-hand crank and left white towel. Technical surfaces only; final painterly enamel/metal/cloth from native source.'}

def bench():
    slug='park-bench';m=model(slug)
    for i,y in enumerate([-.205,-.068,.068,.205]):m.box('seat-slat-'+str(i),(0,y,.46),(2.0,.118,.055),'#b88b5a')
    for i,z in enumerate([.67,.83,.99]):m.box('backrest-slat-'+str(i),(0,.26,z),(2.0,.07,.125),'#ac7f50')
    for side in [-1,1]:
        x=side*.90
        tube(m,'front-leg-'+str(side),(x,-.20,.03),(x,-.20,.46),.035,BLACK);tube(m,'rear-leg-'+str(side),(x,.24,.03),(x,.28,1.05),.035,BLACK)
        for k,(a,c) in enumerate([((x,-.28,.46),(x,-.30,.66)),((x,-.30,.66),(x,-.12,.72)),((x,-.12,.72),(x,.26,.72))]):tube(m,'armrest-'+str(side)+'-'+str(k),a,c,.028,BLACK)
    # Map panel belongs permanently at the bench's physical right (+X), facing the same -Y front.
    for x in [1.0,1.70]:m.box('RIGHT-map-post-'+str(x),(x,.18,1.03),(.085,.11,2.06),BLACK)
    m.box('RIGHT-map-backing',(1.35,.18,1.34),(.70,.10,1.36),'#94734f')
    m.wall_panel('RIGHT-map-front-cream','y',.121,1.06,1.64,.76,1.94,'#e7dfbf')
    # A simple fixed course schematic indicates the FRONT face; the back remains bare board.
    m.face('RIGHT-map-front-green-course',[(1.16,.117,.85),(1.49,.117,.96),(1.58,.117,1.35),(1.45,.117,1.80),(1.20,.117,1.82),(1.28,.117,1.42)],'#7e9b66')
    m.face('RIGHT-map-front-blue-pond',[(1.39,.113,1.15),(1.52,.113,1.2),(1.51,.113,1.4),(1.43,.113,1.45)],'#82aeb0')
    m.box('RIGHT-map-top-cap',(1.35,.18,2.055),(.82,.16,.085),BLACK)
    tube(m,'RIGHT-map-attachment-to-bench',(.87,.23,.38),(1.70,.23,.38),.03,BLACK)
    m.anchors['map-physical-RIGHT']=(1.35,.18,1.35);m.anchors['bench-front']=(0,-.5,.46)
    return slug,m,{'runtimeSubjectId':'newprop:park-bench','ppm':180,'fixedIdentity':'Three-place slatted bench, BACK on+Y, sitting FRONT on-Y. Tall attached course-map panel ALWAYS at physicalRIGHT+X. Panel FRONT has map, BACK bare wood; do not duplicate a front corner.','proposedOverallMetres':[2.82,.62,2.10],'components':'Four seat slats, three backrest slats, black legs/arms, exactly one attached right-hand map board. No people; proposed size is not runtime seating capacity.'}

def dispenser():
    slug='ball-dispenser';m=model(slug)
    w,d=.65,.60;x=w/2;y=d/2
    m.box('small-functional-mounting-foot',(0,0,.035),(.72,.68,.07),'#aaa999')
    m.face('front-case',[(-x,-y,.07),(x,-y,.07),(x,-y,1.26),(-x,-y,1.26)],GREEN)
    m.face('rear-case',[(-x,y,.07),(x,y,.07),(x,y,1.50),(-x,y,1.50)],GREEN)
    for side in [-1,1]:m.face('plain-side-'+str(side),[(side*x,-y,.07),(side*x,y,.07),(side*x,y,1.50),(side*x,-y,1.26)],GREEN)
    m.face('sloping-top-hood',[(-x,-y,1.26),(x,-y,1.26),(x,y,1.50),(-x,y,1.50)],'#527a60')
    m.wall_panel('FRONT-ball-window','y',-.31,-.245,.245,.88,1.17,'#253a30')
    for row,z in enumerate([.94,1.04]):
        for col,xx in enumerate([-.17,-.055,.055,.17]):sphere(m,'FRONT-visible-ball-'+str(row)+'-'+str(col),(xx,-.335,z),.046,'#e8e7db',5,10)
    m.wall_panel('FRONT-coin-panel','y',-.32,-.23,.23,.56,.84,BRASS)
    m.wall_panel('FRONT-coin-slot','y',-.329,-.117,-.102,.64,.76,'#38453b')
    tube(m,'FRONT-round-button',(.105,-.329,.70),(.105,-.355,.70),.037,BRASS,16)
    m.wall_panel('FRONT-ball-chute','y',-.33,-.12,.12,.41,.52,'#243b2f')
    # One fixed wire basket in front(-Y), never moved behind the machine.
    centre=(0,-.62);z0,z1=.10,.46;r0,r1=.16,.23
    for z in [z0,.23,.35,z1]:
        rr=r0+(r1-r0)*(z-z0)/(z1-z0)
        for k in range(16):
            a=k*2*math.pi/16;c=(k+1)*2*math.pi/16
            tube(m,'FRONT-basket-ring-'+str(z)+'-'+str(k),(rr*math.cos(a),centre[1]+rr*math.sin(a),z),(rr*math.cos(c),centre[1]+rr*math.sin(c),z),.009,GREEN,6)
    for k in range(12):
        a=k*2*math.pi/12;tube(m,'FRONT-basket-bar-'+str(k),(r0*math.cos(a),centre[1]+r0*math.sin(a),z0),(r1*math.cos(a),centre[1]+r1*math.sin(a),z1),.009,GREEN,6)
    for xx,yy,zz in [(-.08,-.61,.27),(.03,-.67,.29),(.09,-.56,.30),(-.03,-.55,.34)]:sphere(m,'FRONT-basket-ball-'+str(xx),(xx,yy,zz),.047,'#efeee2',5,10)
    m.wall_panel('REAR-plain-service-panel','y',.311,-.25,.25,.24,1.28,'#3d604a')
    for z in [.42,1.12]:m.box('REAR-left-hinge-'+str(z),(-.24,.325,z),(.035,.025,.07),BRASS)
    m.box('REAR-right-latch',(.20,.33,.75),(.025,.025,.12),BRASS)
    m.anchors['FRONT-basket-centre']=(0,-.62,.28);m.anchors['REAR-plain-panel']=(0,.31,.75)
    return slug,m,{'runtimeSubjectId':'newprop:ball-dispenser','ppm':300,'fixedIdentity':'Only physicalFRONT-Yhas ball window/coin controls/chute and the single wire basket. PhysicalREAR+Yis plain latched service panel. Sloping hood is lower at front, higher at rear. Fronts must not be repeated for rear views.','proposedOverallMetres':[.72,1.19,1.50],'components':'Green casing, front ball window8balls, coin slot/button, chute, one wire basket, plain rear panel. No touchscreen, no mirror reuse.'}

def rope_corner():
    slug='rope-barrier-corner';m=model(slug)
    positions=[(-1.5,-1.5),(0,-1.5),(1.5,-1.5),(-1.5,0),(-1.5,1.5)]
    for k,(x,y) in enumerate(positions):
        tube(m,'post-'+str(k)+'-round-foot',(x,y,0),(x,y,.065),.14,GREEN,16);tube(m,'post-'+str(k)+'-shaft',(x,y,.065),(x,y,.86),.047,GREEN,12)
        tube(m,'post-'+str(k)+'-brass-collar',(x,y,.79),(x,y,.85),.058,BRASS,12);sphere(m,'post-'+str(k)+'-round-cap',(x,y,.91),.067,GREEN,5,12)
    links=[(0,1),(1,2),(0,3),(3,4)]
    for span,(a,b) in enumerate(links):
        x0,y0=positions[a];x1,y1=positions[b];points=[]
        for t in np.linspace(0,1,9):points.append((x0+(x1-x0)*t,y0+(y1-y0)*t,.83-.20*4*t*(1-t)))
        for k in range(len(points)-1):tube(m,'rope-span-'+str(span)+'-segment-'+str(k),points[k],points[k+1],.025,CREAM,8)
        m.anchors['rope-span-'+str(span)+'-start']=points[0];m.anchors['rope-span-'+str(span)+'-end']=points[-1]
    m.anchors['shared-corner-post']=(*positions[0],0);m.anchors['X-arm-end']=(*positions[2],0);m.anchors['Y-arm-end']=(*positions[4],0)
    return slug,m,{'runtimeSubjectId':'newprop:rope-barrier-corner','ppm':145,'fixedIdentity':'EXACTLY5posts and4rope spans, rigid90degreeL in ground plane. Corner shared post0=(-1.5,-1.5); armXposts1/2=(0,-1.5)/(1.5,-1.5); armYposts3/4=(-1.5,0)/(-1.5,1.5). Do not flatten, mirror or duplicate corners.','proposedOverallMetres':[3.28,3.28,.98],'components':'Five same green stanchions with round feet/caps; four cream ropes, each with fixed sag. No ground plate or opaque/grey alpha haze.'}

def main():
    index={'schema':1,'technicalOnly':True,'sourceOnly':True,'nativeGeneratedHere':False,'runtimeIntegrated':False,'ownerApproved':False,'purpose':'Fixed-world correction guides for four native-held batch02course props','sourceCoordinates':'metres; modelRIGHT+X, LEFT-X, FRONT-Y, BACK+Y, height+Z. Each source sheet shows one fixed model rotated0/90/180/270degrees.','camera':'30degree down, normal beta=-45degrees withSE/SW/NW/NEcells; yaw8beta+8degrees withN/E/S/Wcells. Labels do not certify native camera yaw.','finalStyle':'Same painterly game style, late-afternoon upper-right sun/lower-left shadows; transparent background with no haze. Technical meshes are not finished game art.','models':[]}
    for factory in [washer,bench,dispenser,rope_corner]:
        slug,m,brief=factory();folder=OUT/slug/'guides'
        if folder.exists():raise FileExistsError(folder)
        folder.mkdir(parents=True);settings={'guide_version':1,'scale_px_per_metre':brief['ppm'],'technical_only':True,'runtimeSubjectId':brief['runtimeSubjectId'],'fixedIdentity':brief['fixedIdentity'],'proposedOverallMetres':brief['proposedOverallMetres'],'identity_policy':'One unchanging object state; fixed source-side details; no copied corner or mirrored source. Native generation/review remains separate.'}
        mesh=folder/(slug+'-world-model-v1.json');mesh.write_text(json.dumps({'model':slug,'settings':settings,'faces':m.faces,'anchors_world_metres':m.anchors,'components':m.components,'technical_only':True,'runtime_integrated':False},indent=2)+'\n',encoding='utf-8');outputs={}
        for kind in ['normal','yaw8']:
            file=g.render(m,settings,kind);stem=kind+'-world-v1';cal=folder/(stem+'.calibration.json');d=json.loads(cal.read_text(encoding='utf-8'));d['model']=slug;d['mesh_file']=mesh.name
            for v in d['views']:v['physical_heading_from_proven_basis']=(d['camera_horizontal_offset_degrees']-v['object_rotation_degrees_about_Z']-45)%360
            d['runtime_local_basis']='(modelx,-modely), z unchanged, technical mapping only';cal.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8');outputs[kind]={'png':file,'svg':str(folder/(stem+'.svg')),'calibration':str(cal),'sha256':hashlib.sha256(Path(file).read_bytes()).hexdigest()};print(file,flush=True)
        brief.update({'key':slug,'mesh':str(mesh),'meshSHA256':hashlib.sha256(mesh.read_bytes()).hexdigest(),'guides':outputs,'originalReferencePNG':str(OUT.parent/'references'/(slug+'.source.png')),'nativeHeldSource':str(OUT.parent/'native'/slug/'normal-v1.png'),'nativeArtApproval':False});index['models'].append(brief)
    (OUT/'index.json').write_text(json.dumps(index,indent=2)+'\n',encoding='utf-8');compact={'technicalOnly':True,'models':[{'id':m['runtimeSubjectId'],'fixed':m['fixedIdentity'],'normalPNG':m['guides']['normal']['png'],'yaw8PNG':m['guides']['yaw8']['png']} for m in index['models']]};(OUT/'compact.json').write_text(json.dumps(compact,separators=(',',':'))+'\n',encoding='utf-8')
    print('INDEX '+str(OUT/'index.json'),flush=True)

if __name__=='__main__':main()
