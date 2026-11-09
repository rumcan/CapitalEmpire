"""Copy actual identity art or losslessly extract two idle reference frames."""
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image

ART = Path(__file__).resolve().parent.parent
LIVE = Path('E:/Repos/CapitalEmpire/worktrees/theme-consistency')
OUT = ART / 'generated/portraits/references'


def record(path):
    with path.open('rb') as handle:
        sha = hashlib.file_digest(handle, 'sha256').hexdigest()
    return {'path': str(path), 'sha256': sha, 'bytes': path.stat().st_size}


def save_identical(image, path):
    if path.exists():
        with Image.open(path) as old:
            assert old.mode == image.mode and old.size == image.size and old.tobytes() == image.tobytes(), path
    else:
        image.save(path)
    with Image.open(path) as saved:
        assert saved.mode == image.mode and saved.size == image.size and saved.tobytes() == image.tobytes()


def main():
    registry = json.loads((ART / 'audit/runtime-registry.json').read_text(encoding='utf-8'))
    looks = [(look, 'people3d') for look in registry['people']['WALKER_PEOPLE']]
    looks += [(look, 'spectators') for look in registry['people']['SPECTATOR_PEOPLE']]
    looks += [(look, 'golfers') for look in registry['people']['GOLFER_PEOPLE'] if look['id'] == 'golfer:golf_am_m3']
    records = []
    for look, category in looks:
        stem = look['id'].split(':')[-1]
        original = LIVE / 'art' / category
        folder = OUT / stem
        folder.mkdir(parents=True, exist_ok=True)
        picture = original / 'pics' / (stem + '.png')
        entry = {'look_id': look['id'], 'actual_runtime_look': look, 'animation_files_changed': False,
                 'resized': False, 'repainted': False, 'source_style_changed': False}
        if picture.exists():
            target = folder / 'identity-source.png'
            if target.exists():
                assert record(target)['sha256'] == record(picture)['sha256']
            else:
                shutil.copy2(picture, target)
            with Image.open(target) as image:
                size, mode = list(image.size), image.mode
            entry.update({'method': 'original-pics-native-PNG-copy', 'source': record(picture),
                          'primary_reference': record(target), 'dimensions': size, 'mode': mode,
                          'crop_records': []})
        else:
            metadata_path = original / stem / 'sheet.json'
            preview_path = original / stem / 'preview.png'
            metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
            # Four retained spectator templates still have the original people
            # namespace in sheet.json; the exact model stem is unchanged.
            assert metadata['id'].split(':')[-1] == stem
            entry['source_grid_id'] = metadata['id']
            entry['runtime_namespace_differs_from_source_grid'] = metadata['id'] != look['id']
            columns, directions = metadata['frames'], metadata['directions']
            assert len(columns) == 9 and len(directions) == 8
            assert columns[0] == 'idle' and directions[:2] == ['S', 'SW']
            fw, fh = metadata['frameWidth'], metadata['frameHeight']
            cropped = []
            with Image.open(preview_path) as preview:
                preview.load()
                assert preview.size == (9 * fw, 8 * fh)
                for row, direction in [(0, 'S'), (1, 'SW')]:
                    box = (0, row * fh, fw, (row + 1) * fh)
                    image = preview.crop(box)
                    target = folder / ('idle-' + direction + '.native.png')
                    save_identical(image, target)
                    cropped.append({'direction': direction, 'column': 0, 'row': row, 'frame': 'idle',
                                    'source_crop_box': box, 'dimensions': list(image.size),
                                    'native_file': record(target), 'pixel_sha256': hashlib.sha256(image.tobytes()).hexdigest()})
                # A side-by-side source-reference board contains unchanged native pixels,
                # making both existing views available in a single attachment.
                board = Image.new(preview.mode, (fw * 2, fh))
                for column, direction in enumerate(('S', 'SW')):
                    with Image.open(folder / ('idle-' + direction + '.native.png')) as image:
                        board.paste(image, (column * fw, 0))
                pair = folder / 'identity-idle-pair.native.png'
                save_identical(board, pair)
            entry.update({'method': 'lossless-native-preview-idle-crops', 'source': record(preview_path),
                'source_grid_metadata': record(metadata_path), 'source_grid': {'columns': 9, 'rows': 8, 'frame_width': fw, 'frame_height': fh},
                'primary_reference': record(pair), 'dimensions': [fw * 2, fh], 'crop_records': cropped,
                'review_background_and_labels': 'Original preview green background and S/SW idle labels are preserved, not new portrait styling.',
                'resolution_limit': 'Native frame width160 pixels; no artificial enlargement or generated face detail was introduced.'})
        (folder / 'provenance.json').write_text(json.dumps(entry, indent=2) + '\n', encoding='utf-8')
        records.append(entry)
    batches = []
    for start in range(0, len(records), 4):
        batch = records[start:start + 4]
        batches.append({'batch': len(batches) + 1, 'look_ids': [item['look_id'] for item in batch],
            'reference_paths': [item['primary_reference']['path'] for item in batch],
            'attachment_order': 'Use these identity references in listed order, then add the reviewed portrait style reference separately.',
            'count': len(batch)})
    index = {'looks': records, 'batches': batches, 'count': len(records),
             'native_pic_count': sum(item['method'] == 'original-pics-native-PNG-copy' for item in records),
             'preview_crop_pair_count': sum(item['method'] == 'lossless-native-preview-idle-crops' for item in records),
             'all_originals_preserved': True, 'animation_files_changed': False, 'no_resize_or_repaint': True}
    assert len(records) == 31 and len({item['look_id'] for item in records}) == 31
    (OUT / 'reference-index.json').write_text(json.dumps(index, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: value for key, value in index.items() if key not in ('looks', 'batches')}, indent=2))


if __name__ == '__main__':
    main()
