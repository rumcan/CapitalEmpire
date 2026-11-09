import sys
from PIL import Image
sys.path.insert(0,'.')
REPO='F:/Repos/ce-wt/t356'; PROJ='F:/ClaudeTemp/T398/proj/art/theme-consistency/native-resume-20261106'
def pair(disk, corner_names, cell_names, out, W=1500, bg=(112,118,124,255)):
    slug=disk.replace('~','-').replace(':','-')
    ims=[Image.open(f'{REPO}/art/building-views/{slug}/{n}.png').convert('RGBA') for n in corner_names]+[Image.open(f'{PROJ}/{disk}/turned/{c}.native.png').convert('RGBA') for c in cell_names]
    h=max(i.height for i in ims); sc=min(1.0, (W/len(ims))/max(i.width for i in ims))
    cw=int(max(i.width for i in ims)*sc)
    sheet=Image.new('RGBA',(cw*len(ims),int(h*sc)),bg)
    for k,i in enumerate(ims):
        r=i.resize((max(1,int(i.width*sc)),max(1,int(i.height*sc))),Image.LANCZOS); sheet.alpha_composite(r,(k*cw+(cw-r.width)//2,int(h*sc)-r.height))
    sheet.convert('RGB').save(out); return sheet.size
if __name__=='__main__':
    disk=sys.argv[1]; print(pair(disk, sys.argv[2].split(','), sys.argv[3].split(','), sys.argv[4]))
