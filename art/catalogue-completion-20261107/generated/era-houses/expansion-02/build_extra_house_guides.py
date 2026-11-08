"""Four affordable dwelling variation world guides: technical references only, never final art/runtime."""
from pathlib import Path
import importlib.util,json,hashlib
ROOT=Path(__file__).resolve().parent
PARENT=ROOT.parent
spec=importlib.util.spec_from_file_location('era_house_helpers',PARENT/'build_era_house_guides.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
g=b.g

def make(key):return g.Model('era-houses/expansion-02/'+key)

def glazed(m,name,y,x,width,bottom=.10,top=2.35):
    b.window(m,name,'y',y,x,width,bottom,top,'#657371')
    m.anchors[name+'/door-threshold']=(x,y,bottom)

def bungalow():
    key='1990s-buff-brick-bay-bungalow';m=make(key)
    b.body(m,'buff-brick-main',0,.5,10,7,2.85,'#cbb99a');b.hip_roof(m,'low-hip-tile-roof',0,.5,10,7,2.90,1.25)
    b.body(m,'small-projecting-front-bay',-3.2,-3.4,2.8,1.0,2.6,'#cbb99a');b.roof(m,'small-bay-rain-roof',-3.2,-3.4,2.8,1.05,2.62,.55)
    b.door(m,'front-door','y',-3.025,.9,.95,color='#748179',glass=True);b.step(m,'front-entry-step',.9,-3.36,1.35)
    b.window(m,'front-bay-window','y',-3.925,-3.2,2.05,.80,2.05)
    b.window(m,'front-right-bedroom-window','y',-3.025,3.35,1.5,.9,2.10)
    for x in [-3,0,3]:b.window(m,'rear-window-'+str(x),'y',4.025,x,1.4,.9,2.1)
    b.door(m,'rear-kitchen-door','y',4.025,1.5,.85,color='#acb2a6',glass=True)
    for side in [-1,1]:
        for y in [-1.25,1.8]:b.window(m,'side-window-'+str(side)+'-'+str(y),'x',side*5.025,y,1.3,.95,2.1)
    b.chimney(m,'one-rear-left-chimney',-3.7,1.5,3.0,4.6)
    return key,m,{'era':'1990s','name':'Affordable buff-brick bay-window bungalow','bodyFootprintMetres':[10,7],'overallApproxMetres':[10,8],'storeys':1,'proposedDwellingUnits':1,'ppm':38,'brief':'A modest low buff-brick bungalow with one small projecting front bay window, one front door to its right, a shallow grey-brown tiled hip roof and one rear-left chimney. No garage, no extra wings, no columns. Different low compact silhouette from the first1990sredbrick garage house.'}

def duplex():
    key='2000s-redbrick-single-storey-duplex';m=make(key)
    b.body(m,'two-unit-brick-body',0,0,12,8,2.9,'#b98770');b.roof(m,'shared-charcoal-pitched-roof',0,0,12,8,2.95,1.35)
    for x in [-1.25,1.25]:
        b.door(m,'front-unit-door-'+str(x),'y',-4.025,x,.95,color='#6a7976',glass=True);b.step(m,'front-step-'+str(x),x,-4.36,1.25)
        m.box('small-entry-canopy-'+str(x),(x,-4.40,2.45),(1.45,.8,.10),'#a2a7a0')
    for x in [-4.2,4.2]:b.window(m,'front-living-window-'+str(x),'y',-4.025,x,2.1,.8,2.15)
    for x in [-3.6,3.6]:glazed(m,'rear-sliding-patio-'+str(x),4.025,x,2.0,.1,2.3)
    for x in [-.85,.85]:b.window(m,'rear-kitchen-window-'+str(x),'y',4.025,x,.85,1.1,2.1)
    for side in [-1,1]:
        for y in [-1.6,1.7]:b.window(m,'outer-side-bedroom-'+str(side)+'-'+str(y),'x',side*6.025,y,1.3,.95,2.1)
    m.box('front-party-wall-seam',(0,-4.04,1.45),(.14,.04,2.9),'#b3a38e')
    for x in [-3,3]:m.box('roof-vent-'+str(x),(x,1,4.0),(.16,.16,.42),'#7c8582')
    return key,m,{'era':'2000s','name':'Affordable single-storey redbrick duplex','bodyFootprintMetres':[12,8],'overallApproxMetres':[12,8.8],'storeys':1,'proposedDwellingUnits':2,'ppm':38,'brief':'Two compact side-by-side one-storey redbrick homes under one shared charcoal pitched roof. Exactly two front doors near the middle, two broad outer front living windows, separate rear GLASS patio sliders, two roof vents. No upstairs floor or garage. An ordinary affordable duplex, distinct from the two-storey2010stownhouse pair.'}

def apartment():
    key='2010s-small-six-flat-walkup';m=make(key)
    b.body(m,'three-storey-brick-and-render-body',0,0,18,10,8.7,'#b6907a')
    for side in [-1,1]:b.surface(m,'upper-cream-render-'+str(side),'y',side*5.025,0,17.9,2.9,8.7,'#deded0')
    m.box('flat-roof-slab',(0,0,8.74),(18.15,10.15,.15),'#919b98')
    for side in [-1,1]:
        m.box('roof-parapet-y'+str(side),(0,side*5,8.95),(18.15,.14,.35),'#bcbfb3')
        m.box('roof-parapet-x'+str(side),(side*9,0,8.95),(.14,10,.35),'#bcbfb3')
    b.door(m,'single-shared-front-entrance','y',-5.05,0,1.35,top=2.45,color='#657772',glass=True);b.step(m,'shared-entry-step',0,-5.38,1.8)
    for bottom,top in [(2.8,5.05),(5.65,7.95)]:b.window(m,'central-stair-window-'+str(bottom),'y',-5.05,0,1.2,bottom,top,'#6a7976')
    for floor in range(3):
        z=.30+floor*2.85
        for x in [-5.2,5.2]:
            glazed(m,'balcony-patio-'+str(floor)+'-'+str(x),-5.05,x,2.25,z+.05,z+2.2)
            m.box('balcony-slab-'+str(floor)+'-'+str(x),(x,-5.6,z),(3.2,1.2,.14),'#afa99d')
            for end in [-1,1]:
                m.box('balcony-front-post-'+str(floor)+'-'+str(x)+'-'+str(end),(x+end*1.5,-6.12,z+.52),(.055,.055,1.0),'#687a78')
                m.box('balcony-side-toprail-'+str(floor)+'-'+str(x)+'-'+str(end),(x+end*1.5,-5.6,z+1.02),(.055,1.1,.055),'#687a78')
            for h in [.52,1.02]:m.box('balcony-front-rail-'+str(floor)+'-'+str(x)+'-'+str(h),(x,-6.12,z+h),(3.05,.055,.055),'#687a78')
        for x in [-2.45,2.45]:b.window(m,'front-side-window-'+str(floor)+'-'+str(x),'y',-5.05,x,1.2,z+.70,z+1.95,'#6a7976')
        for x in [-6,-2,2,6]:b.window(m,'rear-window-'+str(floor)+'-'+str(x),'y',5.05,x,1.5,z+.65,z+1.95,'#6a7976')
        for side in [-1,1]:
            for y in [-2.1,2.1]:b.window(m,'end-window-'+str(floor)+'-'+str(side)+'-'+str(y),'x',side*9.025,y,1.45,z+.65,z+1.95,'#6a7976')
    b.door(m,'rear-service-door','y',5.05,0,1.0,top=2.3,color='#657772',glass=True)
    for x in [-5,5]:m.box('roof-small-vent-'+str(x),(x,1.4,9.12),(.65,.65,.55),'#7d8c88')
    return key,m,{'era':'2010s','name':'Small affordable six-flat walk-up','bodyFootprintMetres':[18,10],'overallApproxMetres':[18.2,11.2],'storeys':3,'proposedDwellingUnits':6,'ppm':28,'brief':'A modest rectangular three-storey six-flat walk-up: brick lower storey, cream upper render, shallow flat parapet roof, ONE shared central front entrance, two small balconies per floor (six total) with plain metal rails, fixed rear/end window grids, one rear service door. No tower, lifts in glass shafts, luxury roof terraces or giant glazing. Dwelling count is an art/design proposal, never game population balance.'}

def family2020():
    key='2020s-compact-gabled-solar-family-home';m=make(key)
    b.body(m,'compact-white-family-body',0,0,7.5,8.5,5.6,'#e0e1d6')
    for side in [-1,1]:b.surface(m,'upper-charcoal-cladding-'+str(side),'y',side*4.275,0,7.45,3.0,5.6,'#727d80')
    b.roof(m,'simple-charcoal-gable-roof',0,0,7.5,8.5,5.65,1.4)
    b.door(m,'front-timber-door','y',-4.30,2.1,.95,color='#a18763');b.step(m,'front-entry-step',2.1,-4.62,1.35)
    b.window(m,'front-wide-living-window','y',-4.30,-1.45,2.65,.75,2.35,'#5d6f72')
    b.window(m,'front-door-sidelight','y',-4.30,3.05,.45,.75,2.35,'#5d6f72')
    for x in [-1.8,1.8]:b.window(m,'front-upper-bedroom-'+str(x),'y',-4.30,x,1.35,3.85,5.1,'#5d6f72')
    glazed(m,'rear-GLASS-sliding-patio',4.30,-1.45,2.5,.1,2.35);b.window(m,'rear-kitchen-window','y',4.30,2.1,1.25,1.0,2.2,'#5d6f72')
    for x in [-1.65,1.65]:b.window(m,'rear-upper-bedroom-'+str(x),'y',4.30,x,1.35,3.85,5.1,'#5d6f72')
    for y in [-1.9,1.9]:
        b.window(m,'left-ground-window-'+str(y),'x',-3.775,y,1.25,1.0,2.2,'#5d6f72')
        b.window(m,'left-upper-window-'+str(y),'x',-3.775,y,1.25,3.85,5.05,'#5d6f72')
    b.window(m,'right-upper-window','x',3.775,.5,1.25,3.85,5.05,'#5d6f72');b.window(m,'right-bathroom-window','x',3.775,-1.9,.65,1.45,2.1,'#5d6f72')
    def roofz(y):return 5.65+1.4*(1+y/4.25)+.04
    for row,y in enumerate([-2.95,-1.4]):
        for col,x in enumerate([-1.65,1.65]):
            pts=[(x-.65,y-.52,roofz(y-.52)),(x+.65,y-.52,roofz(y-.52)),(x+.65,y+.52,roofz(y+.52)),(x-.65,y+.52,roofz(y+.52))]
            m.face('front-roof-solar-'+str(row)+'-'+str(col),pts,'#335166');m.anchors['front-roof-solar-'+str(row)+'-'+str(col)]=(x,y,roofz(y))
    m.box('rear-roof-vent',(.9,1.0,6.88),(.17,.17,.6),'#657774')
    return key,m,{'era':'2020s','name':'Compact two-storey gabled solar family home','bodyFootprintMetres':[7.5,8.5],'overallApproxMetres':[7.5,9.0],'storeys':2,'proposedDwellingUnits':1,'ppm':38,'solarPanels':4,'brief':'Affordable compact two-storey family infill home: white lower walls, charcoal upper front/rear cladding, one ordinary pitched gable roof, timber front door with a narrow side-light, broad front living window, rear GLASS patio slider and FOUR solar modules in two rows of two ONLY on the fixed front roof slope. Rear roof does not acquire the solar panels when turned. No garage, flat-roof sci-fi shapes or mansion scale.'}

def main():
    index={'schema':1,'technicalOnly':True,'nativeArtGenerated':False,'runtimeIntegrated':False,'ownerApproved':False,'scope':'Four additional ordinary affordable later-era dwelling model proposals','commonFinalStyle':'Match existing painted miniature game style. Late-afternoon daylight, upper-right sun/lower-left shadows, no window glow; transparent background and no ground plates, cars, people, plants, captions or technical labels in final art.','geometryBasis':'One fixed world model; front y negative, right x positive, height z positive. Technical30degree-down camera; normal beta=-45 and yaw beta=+8, object rotated0/90/180/270. Runtime local basis would reflectY, but no runtime integration or native yaw certification is implied.','models':[]}
    for factory in [bungalow,duplex,apartment,family2020]:
        key,m,brief=factory();folder=ROOT/key/'guides'
        if folder.exists():raise FileExistsError(folder)
        folder.mkdir(parents=True);settings={'guide_version':1,'scale_px_per_metre':brief['ppm'],'era':brief['era'],'technical_only':True,'front':'negativeY','dimensions_design_proposal':brief['overallApproxMetres'],'brief':brief['brief'],'identity_policy':'All doors/windows/balconies/roof panels belong to one fixed world; never substitute front geometry on rear or move panels to the camera-facing roof.'}
        mesh=folder/(key+'-world-model-v1.json');mesh.write_text(json.dumps({'model':key,'settings':settings,'faces':m.faces,'components':m.components,'anchors_world_metres':m.anchors,'technical_only':True,'owner_approved':False,'runtime_integrated':False},indent=2)+'\n',encoding='utf-8');outputs={}
        for kind in ['normal','yaw8']:
            file=g.render(m,settings,kind);stem=kind+'-world-v1';cp=folder/(stem+'.calibration.json');d=json.loads(cp.read_text(encoding='utf-8'));d['model']=key;d['mesh_file']=mesh.name;d['runtime_local_basis']='guide(x,-y), unchangedz; technical only';
            for v in d['views']:v['physical_heading_from_proven_basis']=(d['camera_horizontal_offset_degrees']-v['object_rotation_degrees_about_Z']-45)%360
            cp.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8');outputs[kind]={'png':file,'svg':str(folder/(stem+'.svg')),'calibration':str(cp),'sha256':hashlib.sha256(Path(file).read_bytes()).hexdigest(),'normalOrYawCameraApproval':False};print(file,flush=True)
        brief.update({'key':key,'status':'proposed-source-geometry-only','mesh':str(mesh),'meshSHA256':hashlib.sha256(mesh.read_bytes()).hexdigest(),'guides':outputs,'frontDoorAnchors':{n:v for n,v in m.anchors.items() if 'front' in n and 'threshold' in n},'featureAnchorCount':len(m.anchors),'normalCells':[['SE','SW'],['NW','NE']],'yaw8Cells':[['N','E'],['S','W']]});index['models'].append(brief)
    (ROOT/'brief-index.json').write_text(json.dumps(index,indent=2)+'\n',encoding='utf-8')
    (ROOT/'README.md').write_text('# Additional affordable later-era dwellings\n\nFour proposed technical reference models: a1990sbuff-brick bay bungalow, a2000ssingle-storey duplex, a2010ssmall six-flat walk-up and a2020scompact two-storey gabled solar home. See [brief-index.json](./brief-index.json) for dimensions, fixed openings, source meshes and paired normal/yaw8guides.\n\nThese are source geometry and design proposals, not accepted runtime occupancy values or final native painted sprites. No runtime changes, imagegen calls, imports, services, tests, build or commits.\n',encoding='utf-8')
    print('INDEX '+str(ROOT/'brief-index.json'),flush=True)

if __name__=='__main__':main()
