"""T309: the production run: every animal repaired, posed, lit and rendered at all 8 headings x 15 frames, then written as art/animals/<id>/sheet.webp + sheet.json
in the repo.  usage: python final.py [ids comma] [--nosheet]"""
import sys, time
from common import *
from model import load_aligned
from repair import repair
import build2
from build2 import run, sheet
from idol_models import JOBS

ids = sys.argv[1].split(',') if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else [j[0] for j in JOBS]
length = {j[0]: j[2] for j in JOBS}
for iid in ids:
    t0 = time.time(); print(iid, flush=True)
    M = repair(load_aligned(iid))
    run(iid, repaired=M)
    if '--nosheet' not in sys.argv: sheet(iid, length[iid])
    del M; torch.cuda.empty_cache()
    print(f'{iid} done {time.time() - t0:.0f}s', flush=True)
