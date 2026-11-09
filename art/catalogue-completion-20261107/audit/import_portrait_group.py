"""Archive a reviewed native 2x2 portrait group and optionally append its manifest.

Example: python import_portrait_group.py --group golf-group-2 --source <native.png>
 --prompt-file <exact.txt> --look-ids <TL> <TR> <BL> <BR> --import-reviewed
Use '-' for an explicitly unused cell. No pixels are resized, repainted or dropped.
"""
import argparse
import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

ART = Path(__file__).resolve().parent.parent
PROJECT = ART.parents[1]
RUNTIME = PROJECT / 'src/assets/portraits'


def digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def record(path):
    return {'path': str(path), 'sha256': digest(path), 'bytes': path.stat().st_size}


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, value):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    temporary.replace(path)


def copy_identical(source, target):
    if target.exists():
        if digest(source) != digest(target):
            raise RuntimeError('Refusing to overwrite historical file: ' + str(target))
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def central_transitions(image):
    rgb = image.convert('RGB')
    w, h = image.size
    result = {}
    for axis, length in [('x', w), ('y', h)]:
        values = []
        for k in range(max(1, length // 2 - 4), min(length, length // 2 + 5)):
            before = rgb.crop((k - 1, 0, k, h)) if axis == 'x' else rgb.crop((0, k - 1, w, k))
            after = rgb.crop((k, 0, k + 1, h)) if axis == 'x' else rgb.crop((0, k, w, k + 1))
            score = sum(ImageStat.Stat(ImageChops.difference(before, after)).mean) / 3
            values.append({'split_before_coordinate': k, 'mean_absolute_RGB_difference': score})
        result[axis] = values
    return result


def sync_worklist():
    path = ART / 'generation-worklist.json'
    worklist = read(path)
    manifest_path = RUNTIME / 'manifest.json'
    manifest = read(manifest_path)
    imported = {item['lookId']: item for item in manifest['pictures']}
    for look in worklist['actual_cast_portraits']:
        item = imported.get(look['look_id'])
        if item:
            native = RUNTIME / item['file']
            with Image.open(native) as image:
                assert image.size == (item['w'], item['h'])
            assert native.stat().st_size == item['bytes']
            look.update({'status': 'imported-reviewed-native-portrait', 'registered_manifest_record': item,
                         'registered_file': record(native), 'runtime_integrated': True, 'runtime_ready': True,
                         'runtime_readiness_scope': 'actual look-matched native file and manifest entry; not a claim about animation or all other portrait tasks'})
        else:
            look['runtime_integrated'] = False
            look['runtime_ready'] = False
    count = sum(look['runtime_ready'] for look in worklist['actual_cast_portraits'])
    worklist['counts']['portrait_candidates_imported'] = count
    worklist['counts']['portrait_tasks_remaining'] = len(worklist['actual_cast_portraits']) - count
    worklist['portrait_manifest_evidence'] = record(manifest_path)
    write(path, worklist)
    return count


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--group', required=True)
    ap.add_argument('--source', required=True)
    ap.add_argument('--prompt-file', required=True)
    ap.add_argument('--look-ids', nargs=4, required=True, metavar=('TL', 'TR', 'BL', 'BR'))
    ap.add_argument('--reference', action='append', default=[])
    ap.add_argument('--split-x', type=int)
    ap.add_argument('--split-y', type=int)
    ap.add_argument('--import-reviewed', action='store_true', help='Parent reviewed identities/style and authorized these runtime records.')
    args = ap.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_.-]+', args.group) or args.group in ('.', '..'):
        ap.error('group must be a plain folder name')
    registry = read(ART / 'audit/runtime-registry.json')
    actual_ids = {look['id'] for looks in registry['people'].values() for look in looks}
    assigned = [look for look in args.look_ids if look != '-']
    if not assigned or len(set(assigned)) != len(assigned) or any(look not in actual_ids for look in assigned):
        ap.error('Every assigned look must be a unique actual cast ID; use - for unused cells')
    source = Path(args.source).resolve(strict=True)
    prompt = Path(args.prompt_file).resolve(strict=True)
    if not prompt.read_text(encoding='utf-8-sig').strip():
        ap.error('exact actual prompt is empty')
    references = [record(Path(path).resolve(strict=True)) for path in args.reference]
    folder = ART / 'generated/portraits' / args.group
    folder.mkdir(parents=True, exist_ok=True)
    full_sheet = folder / 'source.png'
    exact_prompt = folder / 'prompt.txt'
    copy_identical(source, full_sheet)
    copy_identical(prompt, exact_prompt)
    records = []
    with Image.open(full_sheet) as sheet:
        if sheet.format != 'PNG' or sheet.mode not in ('RGB', 'RGBA'):
            raise RuntimeError('Expected actual native RGB/RGBA PNG')
        sheet.load()
        w, h = sheet.size
        split_x = args.split_x if args.split_x is not None else w // 2
        split_y = args.split_y if args.split_y is not None else h // 2
        if not (0 < split_x < w and 0 < split_y < h):
            raise RuntimeError('Split must leave four nonempty native rectangles')
        transitions = central_transitions(sheet)
        boxes = [(0, 0, split_x, split_y), (split_x, 0, w, split_y),
                 (0, split_y, split_x, h), (split_x, split_y, w, h)]
        rebuilt = Image.new(sheet.mode, sheet.size)
        pixel_hashes = []
        for k, (look, box) in enumerate(zip(args.look_ids, boxes)):
            crop = sheet.crop(box)
            if look != '-' and (min(crop.size) < 128 or sum(ImageStat.Stat(crop.convert('RGB')).stddev) < 3):
                raise RuntimeError('Assigned portrait crop is tiny or blank: ' + look)
            name = look.replace(':', '-').replace('_', '-') if look != '-' else 'unused-cell-' + str(k)
            native = folder / (name + '.native.png')
            if native.exists():
                with Image.open(native) as old:
                    assert old.mode == crop.mode and old.size == crop.size and old.tobytes() == crop.tobytes(), native
            else:
                crop.save(native)
            with Image.open(native) as saved:
                assert saved.mode == crop.mode and saved.size == crop.size and saved.tobytes() == crop.tobytes()
            rebuilt.paste(crop, box[:2])
            pixel_hash = hashlib.sha256(crop.tobytes()).hexdigest()
            if look != '-':
                pixel_hashes.append(pixel_hash)
            records.append({'look_id': None if look == '-' else look, 'cell_index': k,
                'cell_position': ['top-left', 'top-right', 'bottom-left', 'bottom-right'][k],
                'source_crop_box': box, 'dimensions': list(crop.size), 'mode': crop.mode,
                'source_file': record(native), 'pixel_sha256': pixel_hash,
                'operation': 'exact native rectangle; no resize/repaint/alpha reconstruction',
                'parent_reviewed': args.import_reviewed, 'owner_approved': False,
                'runtime_ready': False, 'runtime_integrated': False})
        assert rebuilt.tobytes() == sheet.tobytes(), 'Crops lost or duplicated native pixels'
        if len(set(pixel_hashes)) != len(pixel_hashes):
            raise RuntimeError('Assigned cells contain duplicated pixel payloads')
    manifest_path = RUNTIME / 'manifest.json'
    if args.import_reviewed:
        before_bytes = manifest_path.read_bytes()
        manifest = json.loads(before_bytes.decode('utf-8-sig'))
        previous = list(manifest['pictures'])
        previous_hashes = {item['file']: digest(RUNTIME / item['file']) for item in previous}
        # Validate every collision before writing any new runtime files.
        for entry in records:
            if not entry['look_id']:
                continue
            filename = entry['look_id'].split(':')[-1].replace('_', '-') + '.png'
            destination = RUNTIME / filename
            item = {'lookId': entry['look_id'], 'file': filename, 'w': entry['dimensions'][0],
                    'h': entry['dimensions'][1], 'bytes': entry['source_file']['bytes'], 'state': 'one'}
            existing = [old for old in previous if old['lookId'] == entry['look_id']]
            if existing and existing != [item]:
                raise RuntimeError('Refusing to replace a different existing portrait: ' + entry['look_id'])
            if destination.exists() and digest(destination) != entry['source_file']['sha256']:
                raise RuntimeError('Refusing to overwrite different native runtime pixels: ' + filename)
            entry['manifest_record'] = item
        for entry in records:
            if not entry['look_id']:
                continue
            item = entry['manifest_record']
            copy_identical(Path(entry['source_file']['path']), RUNTIME / item['file'])
            if not any(old['lookId'] == item['lookId'] for old in manifest['pictures']):
                manifest['pictures'].append(item)
            entry.update({'runtime_file': record(RUNTIME / item['file']), 'runtime_ready': True, 'runtime_integrated': True})
        assert manifest['pictures'][:len(previous)] == previous
        if manifest_path.read_bytes() != before_bytes:
            raise RuntimeError('Manifest changed concurrently; archived art remains safe; rerun after review')
        write(manifest_path, manifest)
        assert all(digest(RUNTIME / file) == value for file, value in previous_hashes.items())
    provenance = {'generator': 'native imagegen', 'imported_utc': datetime.now(timezone.utc).isoformat(),
        'full_original_source': record(source), 'archived_full_sheet': record(full_sheet), 'exact_prompt': record(exact_prompt),
        'actual_reference_files': references, 'actual_references_complete': bool(references),
        'references_note': 'Omitted reference paths are unknown, never inferred from expected identity files.',
        'dimensions': [w, h], 'mode': sheet.mode, 'split_x': split_x, 'split_y': split_y,
        'split_rule': 'explicit reviewed coordinate if provided, otherwise floor half; right/bottom preserve remainder',
        'central_RGB_transition_measurements': transitions, 'cell_order': [args.look_ids[:2], args.look_ids[2:]],
        'exact_reconstruction_verified': True, 'records': records,
        'parent_reviewed': args.import_reviewed, 'owner_approved': False,
        'runtime_integrated': args.import_reviewed, 'status': 'imported-parent-reviewed-native-candidates' if args.import_reviewed else 'archived-awaiting-parent-review'}
    write(folder / 'provenance.json', provenance)
    write(folder / 'import-records.json', {'sheet': record(full_sheet), 'records': records,
        'runtime_writes_performed': args.import_reviewed, 'manifest': record(manifest_path) if args.import_reviewed else None})
    imported_count = sync_worklist() if args.import_reviewed else None
    print(json.dumps({'group': args.group, 'dimensions': [w, h], 'split_x': split_x, 'split_y': split_y,
        'assigned_portraits': len(assigned), 'runtime_imported': args.import_reviewed,
        'actual_cast_imported_total': imported_count, 'import_records': str(folder / 'import-records.json')}, indent=2))


if __name__ == '__main__':
    main()
