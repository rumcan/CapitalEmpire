"""Ordinary 1950s replacement design proxies. Technical references, never final art."""
import json
from pathlib import Path
from build_world_geometry_guides import Model, ART, render


DESIGNS = [
    ('shanty-hut', 3.6, 3.0, 2.5, .65,
     'Small ordinary1950s cream-painted clapboard caretaker cabin. One green front door at left and one small front window at right; one right-side window and one high rear vent. Straight manufactured lumber, grey corrugated gable roof, modest peeling paint and age.'),
    ('shanty-shed', 4.4, 3.2, 2.6, .7,
     'Cheap old1950s garden maintenance shed, faded brown horizontal timber siding, paired green front tool doors, one small right-side window and one high rear vent, grey corrugated gable roof, restrained rust and weathering.'),
    ('shanty-ticket-hut', 2.8, 2.2, 2.5, .5,
     'Ordinary1950s ticket office cabin, faded cream clapboard and blue-green trim, a wide front ticket hatch with small projecting sill, one service door on the right wall, a high rear vent and grey corrugated gable roof. Cheap and old but structurally sound.'),
    ('shanty-toilet', 3.6, 2.4, 2.5, .5,
     'Plain1950s budget golf-course toilet block, faded pale-grey painted timber, exactly two separate front cubicle doors in muted green, two high rear ventilation grilles, plain grey corrugated gable roof. Ordinary municipal construction with scuffed paint; no fantasy outhouse.')
]


def make(key, w, d, h, rise):
    m = Model('budget-1950-' + key)
    m.box('body', (0, 0, h/2), (w, d, h), '#d3c9af')
    for x in (-w/2, w/2):
        m.face('gable'+str(x), [(x,-d/2,h),(x,d/2,h),(x,0,h+rise)], '#d3c9af')
    if key == 'shanty-shed':
        for i in (-1,1):
            m.wall_panel('front-tool-door'+str(i),'y',-d/2-.025,i*.56-.53,i*.56+.53,.08,2.13,'#487361')
    elif key == 'shanty-ticket-hut':
        m.window('ticket-hatch','y',-d/2-.025,0,1.9,.95,1.9)
        m.box('ticket-sill',(0,-d/2-.17,.95),(2.05,.34,.09),'#a3936a')
        m.wall_panel('right-service-door','x',w/2+.025,-.48,.48,.06,2.15,'#487361')
    elif key == 'shanty-toilet':
        for x in (-.85,.85):
            m.wall_panel('front-cubicle-door'+str(x),'y',-d/2-.025,x-.45,x+.45,.06,2.15,'#487361')
    else:
        m.wall_panel('front-door','y',-d/2-.025,-1.35,-.4,.06,2.15,'#487361')
        m.window('front-window','y',-d/2-.025,.8,1.0,1.0,1.95)
    if key in ('shanty-hut','shanty-shed'):
        m.window('right-window','x',w/2+.025,0,.9,1.1,1.95)
    vents = (-.85,.85) if key=='shanty-toilet' else (0,)
    for x in vents:
        m.wall_panel('rear-vent'+str(x),'y',d/2+.025,x-.32,x+.32,1.95,2.22,'#425e53')
    m.gable_roof(w,d,h,rise,.18)
    return m, {'guide_version':1,'scale_px_per_metre':90,'body_dimensions_metres':[w,d,h],
        'ridge_height_metres':h+rise,'runtime_integrated':False,'owner_approved':False,
        'replacement_target':'newprop:'+key,'purpose':'ordinary1950s design replacement; exact final native correspondence requires review'}


def main():
    index=[]
    for key,w,d,h,rise,brief in DESIGNS:
        m,s=make(key,w,d,h,rise)
        out=ART/'generated'/m.name/'guides'
        out.mkdir(parents=True,exist_ok=True)
        world={'model':m.name,'settings':s,'faces':m.faces,'anchors':m.anchors,'components':m.components,'technical_only':True}
        (out/(m.name+'-world-model-v1.json')).write_text(json.dumps(world,indent=2)+'\n',encoding='utf-8')
        guides={kind:render(m,s,kind) for kind in ('normal','yaw8')}
        index.append({'key':m.name,'replacement_target':'newprop:'+key,'brief':brief,'guides':guides,'runtime_integrated':False})
    path=ART/'generated/budget-cabin-guide-index-v1.json'
    path.write_text(json.dumps(index,indent=2)+'\n',encoding='utf-8')
    print(path)


if __name__=='__main__':
    main()
