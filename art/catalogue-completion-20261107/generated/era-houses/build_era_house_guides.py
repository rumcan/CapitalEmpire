"""Technical house geometry references only. Reuses existing 30-degree shared-world z-buffer renderer.
Never final painted art, never a runtime import. All feature coordinates are model metres.
"""
from pathlib import Path
import importlib.util,json,math,hashlib
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'audit/build_world_geometry_guides.py'
spec=importlib.util.spec_from_file_location('world_guides',SOURCE);g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
OUT=ROOT/'generated/era-houses'


def surface(m,name,axis,constant,u,width,bottom,top,color):
    m.wall_panel(name,axis,constant,u-width/2,u+width/2,bottom,top,color)


def window(m,name,axis,constant,u,width=1.5,bottom=.9,top=2.1,frame='#e4dfd2'):
    sign=1 if constant>0 else -1
    surface(m,name+'/frame',axis,constant,u,width,bottom,top,frame)
    surface(m,name+'/glass',axis,constant+sign*.012,u,width-.14,bottom+.08,top-.08,'#789fa5')
    surface(m,name+'/mullion',axis,constant+sign*.016,u,.045,bottom+.08,top-.08,frame)
    m.anchors[name+'/centre']=(u,constant,(bottom+top)/2) if axis=='y' else (constant,u,(bottom+top)/2)


def door(m,name,axis,constant,u,width=1,bottom=.05,top=2.2,color='#5d716b',glass=False):
    sign=1 if constant>0 else -1
    surface(m,name+'/frame',axis,constant,u,width+.15,bottom,top+.10,'#e7e0d2')
    surface(m,name+'/leaf',axis,constant+sign*.012,u,width,bottom+.03,top,color)
    if glass:surface(m,name+'/upper-glass',axis,constant+sign*.025,u,width-.22,1.15,top-.15,'#759ba3')
    m.anchors[name+'/threshold']=(u,constant,bottom) if axis=='y' else (constant,u,bottom)


def garage(m,name,front,x,width=2.7):
    door(m,name,'y',front,x,width,0,2.15,'#d5d0c4')
    for z in [.45,.9,1.35,1.8]:surface(m,name+'/panel-joint-'+str(z),'y',front-.03,x,width-.1,z,z+.025,'#a9a79e')


def body(m,name,cx,cy,w,d,h,color):
    m.box(name,(cx,cy,h/2),(w,d,h),color)
    m.box(name+'/foundation',(cx,cy,.08),(w+.10,d+.10,.16),'#a9a59a')


def roof(m,name,cx,cy,w,d,eaves,rise):
    t=g.Model(name);t.gable_roof(w,d,eaves,rise,.22)
    for side in [-1,1]:
        t.face('gable-wall-'+str(side),[(side*w/2,-d/2,eaves),(side*w/2,d/2,eaves),(side*w/2,0,eaves+rise)],'#b8b7aa')
    for f in t.faces:m.face(name+'/'+f['name'],[(x+cx,y+cy,z) for x,y,z in f['vertices']],f['color'])
    for key,p in t.anchors.items():m.anchors[name+'/'+key]=(p[0]+cx,p[1]+cy,p[2])
    m.components.append({'name':name,'kind':'gable-roof','centre_xy':[cx,cy],'width':w,'depth':d,'eaves':eaves,'rise':rise})


def hip_roof(m,name,cx,cy,w,d,eaves,rise):
    x,y=w/2+.25,d/2+.25;ridge=w*.20;z=eaves+rise
    for suffix,points in [('front',[(-x,-y,eaves),(x,-y,eaves),(ridge,0,z),(-ridge,0,z)]),('rear',[(-x,y,eaves),(x,y,eaves),(ridge,0,z),(-ridge,0,z)]),('left',[(-x,-y,eaves),(-x,y,eaves),(-ridge,0,z)]),('right',[(x,-y,eaves),(x,y,eaves),(ridge,0,z)])]:
        m.face(name+'/'+suffix,[(a+cx,b+cy,c) for a,b,c in points],'#8c8173')
    m.anchors[name+'/ridge-left']=(cx-ridge,cy,z);m.anchors[name+'/ridge-right']=(cx+ridge,cy,z)


def chimney(m,name,x,y,bottom,top):
    m.box(name,(x,y,(bottom+top)/2),(.55,.6,top-bottom),'#906b57');m.box(name+'/cap',(x,y,top+.04),(.68,.73,.08),'#b3aaa0')


def step(m,name,x,y,width=1.4):m.box(name,(x,y,.075),(width,.65,.15),'#afa79a')


def family1990():
    key='1990s-redbrick-family-single-garage';m=g.Model('era-houses/'+key)
    body(m,'main-redbrick',-2,0,10,8,2.9,'#ac7660');body(m,'attached-single-garage',5,-.75,4,6.5,2.5,'#ac7660')
    roof(m,'main-dark-tile-roof',-2,0,10,8,2.92,1.45);roof(m,'garage-lower-roof',5,-.75,4,6.5,2.52,.9)
    door(m,'front-main-door','y',-4.025,-1.8,color='#586e72',glass=True);step(m,'front-door-step',-1.8,-4.35)
    for x in [-4.8,.8]:window(m,'front-living-window-'+str(x),'y',-4.025,x,2.2,.85,2.18)
    garage(m,'single-garage-door',-4.03,5,2.9)
    for y in [-1.7,1.8]:window(m,'left-bedroom-window-'+str(y),'x',-7.025,y,1.55)
    for x in [-5,-1.3,1.2]:window(m,'rear-window-'+str(x),'y',4.025,x,1.5)
    door(m,'rear-kitchen-door','y',4.025,-3,width=.9,color='#d1d0c2',glass=True)
    window(m,'garage-right-high-window','x',7.025,-.2,1.1,1.55,2.15)
    door(m,'garage-rear-service-door','y',2.525,5.5,.85,color='#d1d0c2')
    chimney(m,'one-brick-chimney',-5.4,1.2,3.25,4.95)
    m.box('front-downpipe',(-6.65,-4.10,1.4),(.08,.08,2.8),'#cec8b6')
    return key,m,{'era':'1990s','name':'Redbrick single-storey family home with one attached garage','physical_dimensions_metres':[14,8],'storeys':1,'brief':'Ordinary modest redbrick family house, cream frames, charcoal pitched tile roof, one lower attached single garage on model right. Main front door at x=-1.8,y=-4. One brick chimney on rear-left main roof. No luxury entrance, no extra wings.'}


def family2000():
    key='2000s-cream-stucco-two-storey-garage';m=g.Model('era-houses/'+key)
    body(m,'main-cream-stucco',-1.75,0,8,8,5.6,'#ded7bf');body(m,'attached-garage',4,-1,3.5,6,2.65,'#ded7bf')
    hip_roof(m,'main-brown-tile-hip-roof',-1.75,0,8,8,5.65,1.5);roof(m,'garage-lower-tile-roof',4,-1,3.5,6,2.68,.75)
    door(m,'front-main-door','y',-4.025,-.6,1.0,color='#52685f',glass=True);step(m,'front-door-step',-.6,-4.35)
    m.box('small-door-canopy',(-.6,-4.42,2.52),(1.7,.9,.12),'#a99b86')
    for x in [-4,-1.75,.5]:window(m,'upper-front-window-'+str(x),'y',-4.025,x,1.25,3.85,5.05)
    window(m,'ground-front-living-window','y',-4.025,-3.6,2.25,.85,2.2)
    for x in [-4,-1.7,.6]:window(m,'upper-rear-window-'+str(x),'y',4.025,x,1.3,3.85,5.05)
    window(m,'rear-kitchen-window','y',4.025,-3.8,1.65,1.0,2.2);door(m,'rear-family-door','y',4.025,.1,1.5,color='#8a9990',glass=True)
    for y in [-1.8,1.8]:
        window(m,'left-ground-window-'+str(y),'x',-5.775,y,1.35,.95,2.15)
        window(m,'left-upper-window-'+str(y),'x',-5.775,y,1.35,3.85,5.05)
    window(m,'right-upper-window','x',2.275,1.5,1.35,3.85,5.05)
    garage(m,'single-garage-door',-4.03,4,2.7);door(m,'garage-rear-service','y',2.025,4.6,.8,color='#c3c4b7')
    chimney(m,'rear-left-small-chimney',-4,2.4,5.65,7.3)
    m.box('front-left-downpipe',(-5.5,-4.10,2.7),(.08,.08,5.4),'#c9c2ae')
    return key,m,{'era':'2000s','name':'Cream stucco two-storey family home with one attached garage','physical_dimensions_metres':[11.5,8],'storeys':2,'brief':'Ordinary compact two-storey cream stucco family house with modest brown tile hip roof, one single garage attached at right and a small door canopy. Three upper front windows, one broad ground living window. No mansion columns or double-height glazing.'}


def town2010():
    key='2010s-brick-white-clad-townhouse-pair';m=g.Model('era-houses/'+key)
    body(m,'attached-pair-brick-base',0,0,12,7,5.6,'#a87f6c')
    for side in [-1,1]:surface(m,'upper-white-cladding-'+str(side),'y',side*3.525,0,11.9,3.0,5.6,'#e3e3d8')
    roof(m,'shared-charcoal-gable-roof',0,0,12,7,5.62,1.3)
    for u,x in [('left',-1.25),('right',1.25)]:
        door(m,u+'-front-door','y',-3.55,x,.95,color='#5a6768',glass=True);step(m,u+'-front-step',x,-3.88,1.3)
        m.box(u+'-small-flat-canopy',(x,-3.91,2.48),(1.55,.82,.10),'#899090')
    for x in [-4.35,4.35]:window(m,'ground-front-window-'+str(x),'y',-3.55,x,2.05,.85,2.2)
    for x in [-4.35,-1.25,1.25,4.35]:window(m,'upper-front-window-'+str(x),'y',-3.55,x,1.35,3.85,5.1,'#6c7877')
    for x in [-3,3]:
        door(m,'rear-patio-door-'+str(x),'y',3.55,x,2.1,color='#81928f',glass=True)
        window(m,'upper-rear-bedroom-'+str(x),'y',3.55,x,1.8,3.85,5.1,'#6c7877')
    for x in [-.85,.85]:window(m,'upper-rear-bathroom-'+str(x),'y',3.55,x,.65,4.45,5.05,'#6c7877')
    for side in [-1,1]:
        window(m,'outer-side-ground-'+str(side),'x',side*6.025,.8,1.2,1.1,2.1)
        window(m,'outer-side-upper-'+str(side),'x',side*6.025,.8,1.2,3.85,5.05)
    m.box('party-wall-front-seam',(0,-3.565,2.8),(.16,.035,5.6),'#b8b7ac')
    for x in [-3,3]:m.box('roof-vent-'+str(x),(x,1.2,6.65),(.16,.16,.5),'#717b7b')
    return key,m,{'era':'2010s','name':'Two attached brick and white-clad townhouses','physical_dimensions_metres':[12,7],'storeys':2,'dwelling_units_proposed':2,'brief':'A modest attached pair, two equal 6m-wide units and exactly two distinct front doors near the central party wall. Brick ground floor, white upper cladding, simple charcoal pitched roof; four upper front windows and separate rear patio doors. No detached gap, no garage doors mistaken for front doors.'}


def compact2020():
    key='2020s-white-charcoal-asymmetric-solar-home';m=g.Model('era-houses/'+key)
    body(m,'higher-white-left-volume',-2,0,5,7,3.45,'#e5e5dd');body(m,'lower-charcoal-right-volume',2.5,0,4,7,3.05,'#616c71')
    for name,cx,w,z in [('higher-left',-2,5,3.48),('lower-right',2.5,4,3.08)]:
        m.box(name+'-flat-roof-slab',(cx,0,z),(w+.12,7.12,.14),'#8a9493')
        for side in [-1,1]:m.box(name+'-parapet-y'+str(side),(cx,side*3.5,z+.15),(w+.12,.12,.24),'#d7dcd7' if name=='higher-left' else '#6f797d')
        for side in [-1,1]:m.box(name+'-parapet-x'+str(side),(cx+side*w/2,0,z+.15),(.12,7,.24),'#d7dcd7' if name=='higher-left' else '#6f797d')
    door(m,'front-timber-door','y',-3.525,2.3,1.05,top=2.3,color='#997e5e');step(m,'front-entry-step',2.3,-3.86,1.5)
    m.box('simple-entry-canopy',(2.3,-3.9,2.65),(1.7,.85,.10),'#6b777a')
    window(m,'front-broad-living-window','y',-3.525,-2.0,2.8,.7,2.55,'#526065');window(m,'front-narrow-side-window','y',-3.525,3.9,.55,.85,2.5,'#526065')
    door(m,'rear-sliding-door','y',3.525,-2,2.5,top=2.45,color='#6f8586',glass=True);window(m,'rear-utility-window','y',3.525,2.6,1.3,1.05,2.2,'#526065')
    for y in [-1.5,1.5]:window(m,'left-bedroom-window-'+str(y),'x',-4.525,y,1.3,.95,2.3,'#526065')
    window(m,'right-side-window','x',4.525,.6,1.4,1.0,2.3,'#526065')
    for row,y in enumerate([-1.8,.2]):
        for col,x in enumerate([-3.5,-2,-.5]):
            lo,hi=3.74,4.0;points=[(x-.6,y-.75,lo),(x+.6,y-.75,lo),(x+.6,y+.75,hi),(x-.6,y+.75,hi)]
            m.face(f'solar-panel-{row}-{col}/frame',points,'#526778');inset=.055
            m.face(f'solar-panel-{row}-{col}/glass',[(x-.6+inset,y-.75+inset,lo+.018),(x+.6-inset,y-.75+inset,lo+.018),(x+.6-inset,y+.75-inset,hi+.004),(x-.6+inset,y+.75-inset,hi+.004)],'#304c61')
            m.anchors[f'solar-panel-{row}-{col}/centre']=(x,y,(lo+hi)/2)
    m.box('lower-roof-service-vent',(3,2,3.43),(.35,.35,.5),'#6b7474');m.box('rear-downpipe',(4.38,3.62,1.5),(.08,.08,3),'#617178')
    return key,m,{'era':'2020s','name':'Compact white and charcoal contemporary solar home','physical_dimensions_metres':[9,7],'storeys':1,'solar_panels':6,'brief':'An ordinary compact single-storey home, higher white left volume and lower charcoal right entry volume. Asymmetrical stepped flat parapet roofs, timber front door and six rectangular solar modules in two rows of three on the higher roof. No science-fiction canopy, no huge glazing walls, no mansion scale.'}


def main():
    index={'technical_only':True,'final_sprite_art':False,'runtime_integrated':False,'owner_approved':False,'renewal_sequence':['1980s existing town','1990s','2000s','2010s','2020s'],'camera':'orthographic30degrees down; normal camera beta=-45degrees; cardinal camera beta=+8degrees; one fixed world model rotated0/90/180/270degrees','lighting':'technical diffuse proxy only; final painted art late afternoon daylight, sun upper-right, shadows lower-left','style_for_final':'Use the established CapitalEmpire painterly town/building style; modest ordinary houses, no modern mansions or futuristic forms. Technical colors are geometry proxies, not final materials.','renderer_source':str(SOURCE),'renderer_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'houses':[]}
    for factory in [family1990,family2000,town2010,compact2020]:
        key,m,brief=factory();folder=OUT/key/'guides'
        if folder.exists():raise FileExistsError('Refusing to overwrite existing guide folder: '+str(folder))
        settings={'guide_version':1,'scale_px_per_metre':38,'technical_only':True,'era':brief['era'],'physical_dimensions_metres':brief['physical_dimensions_metres'],'front':'model y negative; rear y positive; x positive is model right','identity_policy':'Fixed feature locations in all eight views; never duplicate a front facade on a rear view. Labels are source camera names, not inferred runtime headings.','brief':brief['brief']}
        folder.mkdir(parents=True)
        mesh=folder/(key+'-world-model-v1.json');mesh.write_text(json.dumps({'model':key,'settings':settings,'faces':m.faces,'components':m.components,'anchors_world_metres':m.anchors,'technical_only':True,'owner_approved':False,'runtime_integrated':False},indent=2)+'\n',encoding='utf-8')
        outputs={}
        for kind in ['normal','yaw8']:
            path=g.render(m,settings,kind);stem=('normal' if kind=='normal' else 'yaw8')+'-world-v1';cal=folder/(stem+'.calibration.json');d=json.loads(cal.read_text(encoding='utf-8'));d['model']=key;d['mesh_file']=mesh.name
            for v in d['views']:v['physical_runtime_heading_from_proven_basis']=(d['camera_horizontal_offset_degrees']-v['object_rotation_degrees_about_Z']-45)%360
            d['runtime_local_basis']='(model x,-model y); z unchanged; technical correspondence only, no runtime integration';cal.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8');outputs[kind]={'png':path,'svg':str(folder/(stem+'.svg')),'calibration':str(cal)};print(path,flush=True)
        brief.update({'key':key,'technical_only':True,'mesh':str(mesh),'guides':outputs,'front_door_anchors':{n:p for n,p in m.anchors.items() if 'front' in n and 'threshold' in n},'all_feature_anchors':str(mesh),'face_count':len(m.faces),'feature_anchor_count':len(m.anchors),'normal_cells':[['SE','SW'],['NW','NE']],'yaw8_cells':[['N','E'],['S','W']],'final_art_requirements':['Native painted material treatment consistent with existing1980s town style.','Keep architecture, doors, windows, chimneys, garage positions and solar-panel count fixed across both sheets.','Late-afternoon daylight; one sun upper-right; cast shadows lower-left.','Transparent background, no ground plate, no labels/text, no people or cars baked into final sprite.','Orthographic30degrees down, four true45degreecorner views plus four true8degreeturnedcardinal views.']});index['houses'].append(brief)
    (OUT/'brief-index.json').write_text(json.dumps(index,indent=2)+'\n',encoding='utf-8')
    (OUT/'README.md').write_text('# Later-era modest house geometry references\n\nTechnical only: four fixed world models, eight views each. These are geometry references for native painted sprite generation, never final game art or runtime registrations.\n\nRead [brief-index.json](./brief-index.json) for every design, dimensions, exact doors/features, source mesh and paired normal/yaw8 calibration files. Normal cells are SE/SW then NW/NE; yaw8 cells are N/E then S/W. Features live at fixed metre coordinates and rotate with one model; their rear sides do not acquire front doors.\n\nFinal art keeps the established painterly town style with late-afternoon daylight from the upper right, transparent background and no ground plate, labels, people or cars. Houses represent gradual ordinary renewal from the existing1980s town through1990s,2000s,2010s and2020s. No mansions or futuristic forms.\n',encoding='utf-8')
    print('INDEX '+str(OUT/'brief-index.json'),flush=True)

if __name__=='__main__':main()
