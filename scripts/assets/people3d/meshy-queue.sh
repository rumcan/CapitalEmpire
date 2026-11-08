#!/usr/bin/env bash
# Step B on its own, no model needed (docs/3D-START-HERE.md section 4): every 30 min, rig each person with a sheet and no Meshy rig, then
# make the p1 clips, both in the owner's most-used-first role order; the p2 clips only once every person in the cast has a sheet and its
# p1 clips. Stops below 40 Meshy credits. One queue only: it quits if another is running.
#   bash scripts/assets/people3d/meshy-queue.sh > output/meshy-queue.log 2>&1   (in the background)
cd "$(dirname "$0")/../../.." || exit 1
lock=output/meshy-queue.lock
if [ -f "$lock" ] && kill -0 "$(cat "$lock")" 2>/dev/null; then echo "another queue is running ($(cat $lock))"; exit 1; fi
echo $$ > "$lock"; trap 'rm -f "$lock"' EXIT
S=scripts/assets/people3d/meshy-person.sh
# the next person for a tier (rig | p1 | p2), or nothing; output/stepb-done.txt lists "<tier>:<id>" already done
next() { node -e "
const fs=require('fs'),tier='$1',done=new Set(fs.existsSync('output/stepb-done.txt')?fs.readFileSync('output/stepb-done.txt','utf8').split(/\s+/):[]);
const ORDER='spectator marshal caddie tourpro coach security golfer range greenkeeper janitor vendor server staff camera photographer starter scorer official family town'.split(' ');
const L=require('./art/people-cast.json').people.filter(p=>!p.id.startsWith('base_')),has=(p,f)=>fs.existsSync(p.root+'/'+p.id+'/'+f);
const rank=p=>{const i=ORDER.indexOf(p.meshyRole??(typeof p.clips==='string'?p.clips:''));return i<0?99:i};
if(tier==='p2'&&!L.every(p=>has(p,'sheet.webp')&&done.has('p1:'+p.id)))process.exit();
const c=L.filter(p=>has(p,'sheet.webp')&&(tier==='rig'?!has(p,'meshy_rigged.glb'):has(p,'meshy_rigged.glb')&&!done.has(tier+':'+p.id))).sort((a,b)=>rank(a)-rank(b));
if(c.length)console.log(c[0].id)"; }
while true; do
  for tier in rig p1 p2; do
    while id=$(next $tier) && [ -n "$id" ]; do
      bal=$(node scripts/assets/people3d/meshy.mjs balance | grep -oE '[0-9]+' | head -1)
      if [ -n "$bal" ] && [ "$bal" -lt 40 ]; then echo "$(date -u +%FT%TZ) STOP: Meshy balance $bal"; exit 0; fi
      case $tier in rig) arg=rig;; p1) arg=clips;; p2) arg="clips p2";; esac
      timeout 1800 bash $S $id $arg 2>&1 | grep -E 'FAILED|Error|rigged|frames' | tail -n 4
      if [ $tier = rig ] && [ ! -f "$(node -p "const p=require('./art/people-cast.json').people.find(p=>p.id==='$id');p.root+'/'+p.id")/meshy_rigged.glb" ]; then
        echo "$(date -u +%FT%TZ) $id: rig failed, skipped"; echo "rig:$id" >> output/stepb-done.txt; continue; fi
      [ $tier != rig ] && echo "$tier:$id" >> output/stepb-done.txt
      echo "$(date -u +%FT%TZ) $tier $id done (balance before $bal)"
    done
  done
  sleep 1800
done
