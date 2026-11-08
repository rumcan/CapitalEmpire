"""Archive/import parent-reviewed exact-subject 2x2 scenes without pixel edits.

Prepared batch references remain historical. Supply the ACTUAL style reference
or a complete repeated --reference list; prepared style is never silently assumed.
"""
import argparse
import hashlib
import importlib.util
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageStat

ART = Path(__file__).resolve().parent.parent
PROJECT = ART.parents[1]
RUNTIME = PROJECT / 'src/assets/scenes'
spec = importlib.util.spec_from_file_location('native_portrait_io', Path(__file__).with_name('import_portrait_group.py'))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


def exact_key(item):
    return (item.get('subject'), item.get('view'), item['state'], item.get('instanceKey'))


def update_progress():
    manifest_path = RUNTIME / 'manifest.json'
    manifest = native.read(manifest_path)
    exact = [item for item in manifest['pictures'] if item.get('subject') and (RUNTIME / item['file']).exists()]
    progress = {'updated_utc': datetime.now(timezone.utc).isoformat(), 'manifest': native.record(manifest_path),
        'total_runtime_scene_files': len(manifest['pictures']), 'exact_subject_scene_files': len(exact),
        'exact_subjects': sorted({item['subject'] for item in exact}),
        'legacy_unscoped_scene_files': sum(not item.get('subject') for item in manifest['pictures']),
        'records': exact, 'overall_catalogue_complete': False, 'owner_approval_inferred': False}
    native.write(ART / 'generated/scenes/scene-import-progress.json', progress)
    return progress


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--batch', required=True)
    ap.add_argument('--source', required=True)
    ap.add_argument('--prompt-file', required=True)
    ap.add_argument('--version', type=int, default=1)
    ap.add_argument('--style-reference')
    ap.add_argument('--reference', action='append', default=[])
    ap.add_argument('--extra-reference', action='append', default=[])
    ap.add_argument('--use-prepared-references', action='store_true')
    ap.add_argument('--split-x', type=int)
    ap.add_argument('--split-y', type=int)
    ap.add_argument('--import-reviewed', action='store_true')
    ap.add_argument('--replace-reviewed', action='store_true')
    args = ap.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_.-]+', args.batch) or args.batch in ('.', '..') or args.version < 1:
        ap.error('batch must be a plain folder name and version positive')
    if args.replace_reviewed and not args.import_reviewed:
        ap.error('replacement requires explicit parent-reviewed import')
    folder = ART / 'generated/scenes/batches' / args.batch
    batch_path = folder / 'batch.json'
    batch = native.read(batch_path)
    cells = {cell['cellIndex']: cell for cell in batch['cells']}
    if set(cells) != {0, 1, 2, 3}:
        ap.error('batch must explicitly map all four native cells')
    prepared_refs = [Path(path).resolve(strict=True) for path in batch['referenceImages']]
    if args.reference:
        actual_paths = [Path(path).resolve(strict=True) for path in args.reference]
    elif args.style_reference:
        actual_paths = [Path(args.style_reference).resolve(strict=True), *prepared_refs[1:]]
    elif args.use_prepared_references:
        actual_paths = prepared_refs[:]
    else:
        ap.error('Specify actual --style-reference/--reference, or explicitly attest --use-prepared-references')
    actual_paths += [Path(path).resolve(strict=True) for path in args.extra_reference]
    source = Path(args.source).resolve(strict=True)
    prompt = Path(args.prompt_file).resolve(strict=True)
    if not prompt.read_text(encoding='utf-8-sig').strip():
        ap.error('exact actual prompt is empty')
    archived = folder / f'source-v{args.version}.png'
    actual_prompt = folder / f'actual-prompt-v{args.version}.txt'
    native.copy_identical(source, archived)
    native.copy_identical(prompt, actual_prompt)
    # Exact prompts are hash-bound evidence; preserve even their original CRLF.
    # Scope this rule to the batch, rather than changing repository-wide policy.
    attributes = folder / '.gitattributes'
    rule = 'actual-prompt-v*.txt -text'
    current_attributes = attributes.read_text(encoding='utf-8') if attributes.exists() else ''
    if rule not in current_attributes.splitlines():
        attributes.write_text(current_attributes.rstrip('\n') + ('\n' if current_attributes else '') + rule + '\n', encoding='utf-8')
    crop_folder = folder / f'native-v{args.version}'
    crop_folder.mkdir(exist_ok=True)
    records = []
    with Image.open(archived) as image:
        if image.format != 'PNG' or image.mode not in ('RGB', 'RGBA'):
            raise RuntimeError('Expected actual native RGB/RGBA PNG')
        image.load();w, h = image.size
        split_x = args.split_x if args.split_x is not None else w // 2
        split_y = args.split_y if args.split_y is not None else h // 2
        if not (0 < split_x < w and 0 < split_y < h):
            raise RuntimeError('Split must partition four nonempty source rectangles')
        transitions = native.central_transitions(image)
        boxes = [(0, 0, split_x, split_y), (split_x, 0, w, split_y),
                 (0, split_y, split_x, h), (split_x, split_y, w, h)]
        reconstructed = Image.new(image.mode, image.size)
        for index, box in enumerate(boxes):
            cell = cells[index]
            item = dict(cell['manifestEntryAfterReview'])
            if item.get('subject') != cell['runtimeId'] or item.get('view') not in ('outside', 'inside'):
                raise RuntimeError('Exact cell identity/view mapping is invalid')
            crop = image.crop(box)
            if min(crop.size) < 128 or sum(ImageStat.Stat(crop.convert('RGB')).stddev) < 3:
                raise RuntimeError('Scene crop is tiny or blank')
            slug = re.sub(r'[^a-z0-9]+', '-', item['subject'].lower()).strip('-')
            identifier = hashlib.sha256(item['subject'].encode()).hexdigest()[:8]
            filename = f'scene-{slug}-{identifier}-{item["view"]}-{item["state"]}-v{args.version}.png'
            crop_path = crop_folder / filename
            if crop_path.exists():
                with Image.open(crop_path) as existing:
                    assert existing.mode == crop.mode and existing.size == crop.size and existing.tobytes() == crop.tobytes()
            else:
                crop.save(crop_path)
            with Image.open(crop_path) as saved:
                assert saved.mode == crop.mode and saved.size == crop.size and saved.tobytes() == crop.tobytes()
            reconstructed.paste(crop, box[:2])
            item.update({'file': filename, 'w': crop.width, 'h': crop.height, 'bytes': crop_path.stat().st_size})
            records.append({'cell_index': index, 'subject': item['subject'], 'view': item['view'], 'state': item['state'],
                'source_crop_box': box, 'dimensions': list(crop.size), 'mode': crop.mode,
                'native_source_file': native.record(crop_path), 'pixel_sha256': hashlib.sha256(crop.tobytes()).hexdigest(),
                'manifest_record': item, 'operation': 'lossless native rectangle; no resize/repaint/alpha reconstruction',
                'parent_reviewed': args.import_reviewed, 'owner_approval_inferred': False, 'runtime_integrated': False})
        assert reconstructed.tobytes() == image.tobytes(), 'Lost/duplicated source row or column'
    manifest_path = RUNTIME / 'manifest.json'
    replacements = []
    if args.import_reviewed:
        manifest_bytes = manifest_path.read_bytes()
        manifest = json.loads(manifest_bytes.decode('utf-8-sig'))
        previous = list(manifest['pictures'])
        previous_hashes = {item['file']: native.digest(RUNTIME / item['file']) for item in previous}
        for entry in records:
            item = entry['manifest_record'];destination = RUNTIME / item['file']
            existing = [old for old in previous if exact_key(old) == exact_key(item)]
            if existing and existing != [item] and not args.replace_reviewed:
                raise RuntimeError('Exact subject/view/state already has different art; preserve it or explicitly --replace-reviewed')
            if destination.exists() and native.digest(destination) != entry['native_source_file']['sha256']:
                raise RuntimeError('Refusing to overwrite different runtime PNG bytes')
        for entry in records:
            item = entry['manifest_record'];destination = RUNTIME / item['file']
            native.copy_identical(Path(entry['native_source_file']['path']), destination)
            index = next((i for i, old in enumerate(manifest['pictures']) if exact_key(old) == exact_key(item)), None)
            if index is None:
                manifest['pictures'].append(item)
            elif manifest['pictures'][index] != item:
                replacements.append(manifest['pictures'][index]);manifest['pictures'][index] = item
            entry.update({'runtime_file': native.record(destination), 'runtime_integrated': True})
        assert all(old in manifest['pictures'] for old in previous if not old.get('subject')), 'Legacy generic record changed'
        if manifest_path.read_bytes() != manifest_bytes:
            raise RuntimeError('Concurrent scene manifest change: source art is safe; rerun import')
        native.write(manifest_path, manifest)
        assert all(native.digest(RUNTIME / file) == sha for file, sha in previous_hashes.items())
    prepared = [native.record(path) for path in prepared_refs]
    actual = [native.record(path) for path in actual_paths]
    provenance = {'schema': 1, 'generator': 'native imagegen', 'imported_utc': datetime.now(timezone.utc).isoformat(),
        'batch_id': args.batch, 'version': args.version, 'prepared_batch_record': native.record(batch_path),
        'full_original_source': native.record(source), 'archived_full_sheet': native.record(archived),
        'exact_actual_prompt': native.record(actual_prompt), 'prepared_references_historical_only': prepared,
        'actual_generation_references_in_order': actual,
        'prepared_style_reference_replaced': prepared[0]['sha256'] != actual[0]['sha256'],
        'identity_reference_files_unchanged_from_prepared': len(actual) >= len(prepared) and [r['sha256'] for r in actual[1:len(prepared)]] == [r['sha256'] for r in prepared[1:]],
        'dimensions': [w, h], 'mode': image.mode, 'split_x': split_x, 'split_y': split_y,
        'split_rule': 'explicit native coordinate if supplied; otherwise floor half with right/bottom remainder retained',
        'central_RGB_transition_measurements': transitions, 'exact_native_reconstruction_verified': True,
        'records': records, 'parent_reviewed': args.import_reviewed, 'owner_approval_inferred': False,
        'runtime_integrated': args.import_reviewed, 'replaced_reviewed_records_files_preserved': replacements,
        'overall_property_or_catalogue_completion_claimed': False}
    native.write(folder / f'import-v{args.version}.provenance.json', provenance)
    native.write(folder / f'import-v{args.version}.records.json', {'records': records,
        'runtime_writes_performed': args.import_reviewed, 'scene_manifest': native.record(manifest_path) if args.import_reviewed else None})
    progress = update_progress() if args.import_reviewed else None
    print(json.dumps({'batch': args.batch, 'native_dimensions': [w, h], 'split': [split_x, split_y],
        'exact_subjects': [entry['subject'] for entry in records], 'runtime_imported': args.import_reviewed,
        'current_exact_subject_scene_files': progress['exact_subject_scene_files'] if progress else None,
        'runtime_scene_files_total': progress['total_runtime_scene_files'] if progress else None,
        'import_records': str(folder / f'import-v{args.version}.records.json')}, indent=2))


if __name__ == '__main__':
    main()
