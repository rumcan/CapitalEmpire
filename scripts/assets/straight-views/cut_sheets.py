"""T398 step 1: key, clean and repack every axisturn sheet of the runner's batch (prep_sheet.py), then cut it with the lead's importer
(D:/AI/chatgpt-bridge/import-native.py --kind axisturn --all-generated-views): the archived raw sheet, exact prompt, provenance and the crops land in
<proj>/art/theme-consistency/native-resume-20261106/<id>/turned/{N,E,S,W}.native.png (the cells of the sheet in the guide's order).
  python cut_sheets.py [--src F:/Art/newArt/animations/buildings] [--work DIR] [--proj DIR] [disk-id ...]
A sheet with no alpha (an RGB sheet with a checkerboard baked in) is not cut: it is a re-queue. The importer's own compatible outputs go to D:/AI/repaint/out/<id>/turned
(it backs the old crops up under <proj>/<id>/backups)."""
import sys, json, subprocess, hashlib, time
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parent))
from prep_sheet import prep
a = sys.argv[1:]
def opt(k, d): return a[a.index(k) + 1] if k in a else d
SRC = Path(opt('--src', 'F:/Art/newArt/animations/buildings')); WORK = Path(opt('--work', 'F:/ClaudeTemp/T398/sheets2')); PROJ = opt('--proj', 'F:/ClaudeTemp/T398/proj')
only = [x for i, x in enumerate(a) if not x.startswith('--') and (i == 0 or not a[i - 1].startswith('--'))]
PY = 'D:/AI/idol-venv/Scripts/python.exe'; IMP = 'D:/AI/chatgpt-bridge/import-native.py'; PROMPT = 'D:/AI/chatgpt-bridge/prompt-axisturn.txt'
ids = [r[0] for r in json.load(open('D:/AI/chatgpt-bridge/queue-axisturn.json', encoding='utf-8-sig'))]
WORK.mkdir(parents=True, exist_ok=True)
status = json.load(open(WORK / 'status.json')) if (WORK / 'status.json').exists() else {}
for i in ids:
    if only and i not in only: continue
    raw = SRC / i / 'axisturn.png'; im = Image.open(raw)
    st = {'raw': str(raw), 'raw_sha256': hashlib.sha256(raw.read_bytes()).hexdigest(), 'mode': im.mode, 'size': im.size}
    alpha = np.array(im.convert('RGBA'))[..., 3]
    if im.mode != 'RGBA' or alpha.min() == 255:
        st['result'] = 'no-alpha: baked background (RGB sheet)'; status[i] = st; print(i, st['result']); continue
    t0 = time.time(); cl, rep = prep(im)
    if cl is None: st['result'] = 'prep-failed: ' + '; '.join(rep['flags']); st['prep_report'] = rep; status[i] = st; print(i, st['result']); continue
    out = WORK / f'{i}.prep.png'; cl.save(out); st['prep'] = str(out); st['prep_report'] = rep
    r = subprocess.run([PY, IMP, '--kind', 'axisturn', '--all-generated-views', '--id', i, '--source', str(out), '--prompt-file', PROMPT, '--project-root', PROJ], capture_output=True, text=True)
    st['import_exit'] = r.returncode
    if r.returncode: st['import_out'] = (r.stdout + r.stderr)[-1500:]
    st['result'] = 'imported' if r.returncode == 0 else 'import-failed'; status[i] = st
    print(i[:58].ljust(60), st['result'], f'{time.time()-t0:.1f}s', flush=True); (WORK / 'status.json').write_text(json.dumps(status, indent=1))
(WORK / 'status.json').write_text(json.dumps(status, indent=1))
