import json, os, sys, math
from PIL import Image, ImageDraw
cut=sys.argv[1]; out=sys.argv[2]; names=sys.argv[3].split(',')
KEYS=['normalNE','yaw8N','normalSE','yaw8E','normalSW','yaw8S','normalNW','yaw8W']; C=170
sheet=Image.new('RGB',(C*8+150,C*len(names)),(88,118,78)); d=ImageDraw.Draw(sheet)
for r,n in enumerate(names):
    m=json.load(open(os.path.join(cut,n,'manifest.json'))); W=m['footprintMetres']['width']; D=m['footprintMetres']['depth']
    d.text((4,r*C+4),n.replace('golf-',''),fill=(255,255,255))
    for c,k in enumerate(KEYS):
        v=m['views'][k]; im=Image.open(os.path.join(cut,n,v['file'])).convert('RGBA'); p=v.get('pixelsPerMetre',m['pixelsPerMetre'])
        a=math.radians(v['headingDegrees']); ax,ay=v['anchor']['x'],v['anchor']['y']
        pts=[]
        for x,y in [(W/2,D/2),(-W/2,D/2),(-W/2,-D/2),(W/2,-D/2)]:
            wx,wy=x*math.cos(a)-y*math.sin(a),x*math.sin(a)+y*math.cos(a); pts.append((ax+(wx-wy)*p/math.sqrt(2),ay+(wx+wy)*p/(2*math.sqrt(2))))
        # front edge (local +y side) in a second colour
        canvas=Image.new('RGBA',im.size,(0,0,0,0)); canvas.alpha_composite(im); dd=ImageDraw.Draw(canvas)
        dd.polygon(pts,outline=(255,255,0,255),width=max(2,im.width//150)); dd.line([pts[0],pts[1]],fill=(255,60,60,255),width=max(3,im.width//100))
        dd.ellipse([ax-6,ay-6,ax+6,ay+6],fill=(0,255,255,255))
        canvas.thumbnail((C-6,C-6)); sheet.paste(canvas,(150+c*C,r*C+3),canvas)
sheet.save(out)
