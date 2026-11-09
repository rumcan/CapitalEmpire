from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
NOTE = '''## Source-art continuation checkpoint — modern town renewal and golf rotations

Branch/worktree: `lead/eight-facing-runtime-20261107`, owned F worktree. Owner prioritizes native image generation over implementation. No owner-live changes, runtime imports, tests, builds, services or commits in this continuation; preserve background LLM.

- Modern houses: 8 designs (2 per decade 1990s/2000s/2010s/2020s), 64 lossless source views in `generated/era-houses/Modern-houses-1990s-2020s-source-v2.zip` (SHA256 9dd48f893bb228d85fbd70a64002e00f8c9e4da088d5aa75f515331006ca330e). Registered. Four new expansion houses corrected rear openings/one missing gable window; old ZIP/32 originals preserved. Camera/scale/anchor release holds separate.
- Road cars: 10 models/80 source views in registered Town-vehicles ZIP; existing private/live road traffic still has old stand-ins. Era artwork is source-only, no gameplay timeline wiring claimed.
- Golf batch01: all12 primary normal/yaw source families generated; holeboard opposite-edge yaw held and now being repaired. Seven upgraded normal/yaw event condition pairs passed limited visual/alpha checks. Upgraded tower SW camera still points toward viewer; isolated guide-first single repair now active. Budget compound has explicit per-cell source selection (normalv4 SE/SW/NW plusv3NE, yawv3) resolving dish front/back; upgraded compound still needed.
- Golf batch02:12 primary normal sheets, five guided corrections. Washer/hopper/ropeL now source candidates; bench lacksSE/SW, dispenser lacksSW. Three isolated repairs plus hole12/walkway guide corrections and water-station invented-sign removal are active in root exec127, 9nativejobs total (also towerSW and budget/upgraded holeboardyaw). Exact guide/identity refs and prompts retained.
- Specialist golf vehicles:8new primary normal sheets generated, all32cores clear. Wheelchair/shuttle/drinks/supply source candidates. Ambulance missingSE, icecream caster/poses drift, satelliteNW dishback wrong, broadcastSE extra hatch. Isolated repair refs/queue prepared under `generated/golf-vehicle-source-batch-01/isolated-repairs-v1/`; satellite technicalguidev2 adopts consistent native LEFT cargo door. Native remaining4yawfaces for these8stillneeded.

**Next action:** collect/inspect exec127; QA concrete poses/attachments/alpha, select native repairs, finish batch02 remaining4views and specialist mobile8 remaining4views; complete upgraded tower/compound/holeboard condition art. Continue remaining206golfpriority then baseline1,208eligible subjects. File presence/raw version counts never equal accepted/selectable8-view coverage. No mirroring, synthetic facings, alpha keying or creative pixel edits; native imagegen originals preserved on C and exact copies/provenance on F. Optional owner clarification (8 compass vs specifically8degreeyaw) remains unanswered.

'''
for relative in ('docs/NOW.md', 'art/catalogue-completion-20261107/NOW.md'):
    path = ROOT / relative
    previous = path.read_text(encoding='utf-8')
    path.write_text(NOTE + previous, encoding='utf-8')
print('Updated both source handoffs; older evidence preserved.')
