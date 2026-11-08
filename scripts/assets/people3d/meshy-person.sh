#!/usr/bin/env bash
# One person's Meshy work. The root, height and role come from art/people-cast.json, the clips per role from art/meshy-clips.json.
#   bash scripts/assets/people3d/meshy-person.sh <id> rig     plain.glb (free) + Meshy remesh and rig (10 credits)
#   bash scripts/assets/people3d/meshy-person.sh <id> clips [p2]   its role's p1 clips (p2: and its p2 clips; 3 credits each),
#     then a sheet per clip (free)
# Reruns skip what is done (meshy.json, anim_<clip>.glb, a <clip>.webp newer than its clip).
cd "$(dirname "$0")/../../.." || exit 1
id=$1 step=$2
read -r root h < <(node -e "const p=require('./art/people-cast.json').people.find(p=>p.id==='$id');p?console.log(p.root,p.height):process.exit(1)") \
  || { echo "usage: meshy-person.sh <id in art/people-cast.json> rig|clips"; exit 1; }
d=$root/$id
if [ "$step" = rig ]; then
  [ -f "$d/meshy_rigged.glb" ] && exit 0
  [ -f "$d/plain.glb" ] || node scripts/assets/people3d/meshy-plain-glb.mjs "$id" --root "$root" || exit 1
  node scripts/assets/people3d/meshy.mjs rig "$id"; exit
fi
[ "$step" = clips ] || { echo "usage: meshy-person.sh <id> rig|clips"; exit 1; }
node scripts/assets/people3d/meshy.mjs clips "$id" ${3:+--tier "$3"}
node scripts/assets/people3d/meshy.mjs renders "$id" | while read -r clip n mode; do
  [ -f "$d/$clip.webp" ] && [ "$d/$clip.webp" -nt "$d/anim_$clip.glb" ] && continue
  node scripts/assets/people3d/render-person-3d.mjs "$id" --root "$root" --height "$h" --hand-twist 70,-70 --arms-in 12 \
    --clip "$clip" --frames "$n" $mode 2>&1 | tail -n 1
done
