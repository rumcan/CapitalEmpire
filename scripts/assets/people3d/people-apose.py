# Makes one A-pose picture per person on RUN (docs/3D-START-HERE.md section 5). Usage: python scripts/assets/people3d/people-apose.py id [id ...]
import json, subprocess, sys, re
cast = json.load(open('art/people-cast.json')); ppl = {p['id']: p for p in cast['people']}
for pid in sys.argv[1:]:
    p = ppl[pid]; look = re.split(r'\s*Full-body figure', p['look'])[0].strip()
    out = f"{p['root']}/{pid}/apose.png"
    prompt = (f"3D-modelling A-pose reference of ONE person: {look} Front view, facing the viewer straight on, BOTH ARMS RAISED OUT TO THE SIDES "
              "at about 40 degrees from the body, straight elbows, hands open and empty with fingers together, a wide clear gap of background between "
              "each arm and the torso and between the hands and the hips, legs slightly apart with a clear gap between them. The whole figure from head "
              "to shoes in frame with a margin. Even soft studio light, plain flat light grey background, standing on nothing: no floor, no ground, no "
              "shadow under the shoes. Realistic proportions for the age, clean painterly game-art finish.")
    neg = "arms touching the body, hands on hips, hands touching thighs, arms hanging down, crossed arms, floor, ground, grass, shadow, base, plinth, multiple figures, side view, back view, cropped feet, logos, text, lettering, props, golf club, bag, anything in the hands"
    subprocess.run(['mkdir', '-p', f"{p['root']}/{pid}"])
    r = subprocess.run(['rundot', 'generate', 'image', '--game-id', '4G0mrT5UcCtD5KY8luXQ', '--model', 'gemini-3.1-flash-image-preview', '--aspect-ratio', '3:4',
                        '--max-credits', '300', '--json', '--out', out, '--prompt', prompt, '--negative-prompt', neg], capture_output=True, text=True)
    print(pid, (r.stdout.strip().splitlines() or [r.stderr[-300:]])[-1][-160:])
