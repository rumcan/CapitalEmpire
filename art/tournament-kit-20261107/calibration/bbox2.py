import os, json, sys
from PIL import Image
A=sys.argv[1]; out={}
def bb(im): return im.split()[3].point(lambda v:255 if v>128 else 0).getbbox()
for s in sorted(os.listdir(A+'/batch02')):
    p=os.path.join(A,'batch02',s)
    if not os.path.isdir(p): continue
    for f in sorted(os.listdir(p)):
        if f.endswith('.png'):
            im=Image.open(os.path.join(p,f)).convert('RGBA'); out[f"{s}/upgraded/{f[:-4]}"]={"size":im.size,"bbox":bb(im)}
LAY={'normal':['normal-SE','normal-SW','normal-NW','normal-NE'],'yaw8':['yaw8-N','yaw8-E','yaw8-S','yaw8-W']}
for cond,files in [('budget',{'normal':'normal-v1.png','yaw8':'yaw8-v1.png'}),('upgraded',{'normal':'normal-v1.png','yaw8':'yaw8-v2.png'})]:
    for fam,f in files.items():
        im=Image.open(f"{A}/bleachers/{cond}/{f}").convert('RGBA'); w,h=im.width//2,im.height//2
        for i,k in enumerate(LAY[fam]):
            c=im.crop((i%2*w,i//2*h,i%2*w+w,i//2*h+h)); out[f"bleacher/{cond}/{k}"]={"size":c.size,"bbox":bb(c),"cell":[i%2*w,i//2*h,w,h]}
json.dump(out,open(sys.argv[2],'w'),indent=0); print(len(out))
