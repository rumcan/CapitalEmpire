"""T398: a rough lighting reading of each building's existing corner views against its new straight views (late-afternoon daylight):
 glow = share of opaque pixels that are bright saturated warm (lit windows, neon: the old dusk look); contrast = std of luminance; warm = mean R-B of the brightest 15%."""
import sys, json, glob
import numpy as np
from PIL import Image
REPO='F:/Repos/ce-wt/t356'; PROJ='F:/ClaudeTemp/T398/proj/art/theme-consistency/native-resume-20261106'
def metrics(path):
    a=np.array(Image.open(path).convert('RGBA')).astype(np.float32); m=a[...,3]>200
    rgb=a[...,:3][m]; L=0.299*rgb[:,0]+0.587*rgb[:,1]+0.114*rgb[:,2]
    mx=rgb.max(1); mn=rgb.min(1); sat=(mx-mn)/np.maximum(mx,1)
    glow=((rgb[:,0]>200)&(rgb[:,1]>120)&(rgb[:,2]<120)&(sat>0.55)).mean()
    top=L>=np.quantile(L,0.85)
    return dict(lum=float(L.mean()),contrast=float(L.std()),glow=float(glow),warm=float((rgb[top,0]-rgb[top,2]).mean()),sat=float(sat.mean()))
out={}
for disk in sys.argv[1:]:
    slug=disk.replace('~','-').replace(':','-')
    c=[metrics(f'{REPO}/art/building-views/{slug}/{n}.png') for n in ('NE','SE','SW','NW')]
    s=[metrics(f'{PROJ}/{disk}/turned/{n}.native.png') for n in 'NESW']
    agg=lambda L,k: float(np.mean([x[k] for x in L]))
    r={k:(agg(c,k),agg(s,k)) for k in ('lum','contrast','glow','warm','sat')}
    out[disk]=r
    print(disk[:56].ljust(58),' '.join(f'{k} {r[k][0]:.2f}/{r[k][1]:.2f}' for k in ('lum','contrast','glow','warm','sat')))
json.dump(out,open('E:/ClaudeTemp/T398/work/light.json','w'),indent=1)
