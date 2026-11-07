# alpha bboxes of every bundle view -> bbox.json
import os, json, sys
from PIL import Image
root=sys.argv[1]; out={}
for s in sorted(os.listdir(root)):
    p=os.path.join(root,s)
    if not os.path.isdir(p): continue
    for c in sorted(os.listdir(p)):
        for f in sorted(os.listdir(os.path.join(p,c))):
            if not f.endswith('.png'): continue
            im=Image.open(os.path.join(p,c,f)).convert('RGBA'); a=im.split()[3].point(lambda v:255 if v>128 else 0)
            out[f"{s}/{c}/{f[:-4]}"]={"size":im.size,"bbox":a.getbbox()}
json.dump(out,open(sys.argv[2],'w'),indent=0)
print(len(out))
