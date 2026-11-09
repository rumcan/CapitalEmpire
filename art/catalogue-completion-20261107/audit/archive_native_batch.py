"""Archive generated PNG originals and exact prompt/reference provenance. No pixel edits."""
import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
plan = ROOT / sys.argv[1]
entries = json.loads(plan.read_text(encoding='utf-8'))
for item in entries:
    source = Path(item['source'])
    target = ROOT / item['target']
    target.resolve().relative_to(ROOT.resolve())
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        shutil.copy2(source, target)
    assert source.read_bytes() == target.read_bytes(), 'Existing target differs: ' + str(target)
    item['sha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
    item['native_bytes_preserved'] = True
    for ref in item.get('references', []):
        assert Path(ref).exists(), ref
    (target.parent / (target.stem + '.prompt.txt')).write_text(item['prompt'] + '\n', encoding='utf-8')
    (target.parent / (target.stem + '.provenance.json')).write_text(json.dumps(item, indent=2) + '\n', encoding='utf-8')
plan.write_text(json.dumps(entries, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'archived_native_sheets': len(entries), 'plan': str(plan)}))
