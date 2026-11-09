"""Lossless specialist-mobile SOURCE delivery; never imports or alters native art."""
import hashlib
import io
import json
import shutil
import zipfile
from pathlib import Path

from PIL import Image

ART = Path(__file__).resolve().parent.parent
REPO = ART.parents[1]
BASE = ART / 'generated/golf-vehicle-source-batch-01'
OUT = BASE / 'lossless-source-bundle-v1'
ZIP = BASE / 'Specialist-golf-vehicles-source-v1.zip'
NORMAL = BASE / 'normal-source-candidates-v2.json'
REVIEW = ART / 'audit/specialist-mobile-yaw-repairs-v2-review.json'
OVERRIDES = {'shuttle-cart': 'NESW', 'satellite-van': 'EW', 'shanty-broadcast-van': 'ESW'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    return sha(path.read_bytes())


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, value):
    with path.open('x', encoding='utf-8', newline='\n') as handle:
        json.dump(value, handle, indent=2)
        handle.write('\n')


def main():
    if OUT.exists() or ZIP.exists():
        raise RuntimeError('Preserve existing bundle; choose a new version')
    readiness, normals = read(REVIEW), read(NORMAL)
    if not readiness['allNineRepairsPracticalCandidates']:
        raise RuntimeError('Complete functional source review first')
    normal_hash = file_sha(NORMAL)
    source_hashes, selections = {}, []
    for item in normals['sets']:
        key = item['key']
        views = dict(item['views'])
        sheet = BASE / 'native' / key / 'yaw8-v1.png'
        with Image.open(sheet) as image:
            assert image.mode == 'RGBA' and image.width % 2 == 0 and image.height % 2 == 0
            cw, ch = image.width // 2, image.height // 2
        for i, direction in enumerate('NESW'):
            single = direction in OVERRIDES.get(key, '')
            source = sheet.parent / ('yaw8-' + direction + '-v2.png') if single else sheet
            with Image.open(source) as image:
                rect = [0, 0, image.width, image.height] if single else [i % 2 * cw, i // 2 * ch, (i % 2 + 1) * cw, (i // 2 + 1) * ch]
                pixels = image.convert('RGBA').crop(rect).tobytes()
            views['yaw8' + direction] = {'nominalCameraKey': 'yaw8' + direction,
                'sourceFile': source.relative_to(REPO).as_posix(), 'sourceFileSHA256': file_sha(source),
                'sourceFrameRectLTRB': rect, 'singleViewOverride': single, 'rgbaSHA256': sha(pixels)}
        # Verify all originals/provenance/selected native rectangles before writing files.
        for camera, view in views.items():
            source = REPO / view['sourceFile']
            expected = view['sourceFileSHA256']
            if file_sha(source) != expected or read(source.with_suffix('.provenance.json'))['sha256'] != expected:
                raise RuntimeError('Source/provenance hash mismatch: ' + str(source))
            with Image.open(source) as image:
                if image.mode != 'RGBA' or sha(image.crop(view['sourceFrameRectLTRB']).tobytes()) != view['rgbaSHA256']:
                    raise RuntimeError('Source RGBA mismatch: ' + str(source))
            source_hashes[str(source)] = expected
        selections.append({'subject': item['subject'], 'key': key, 'views': views})
    assert len(selections) == 8 and all(len(item['views']) == 8 for item in selections)
    OUT.mkdir()
    verification = []
    for item in selections:
        folder = OUT / item['key']
        folder.mkdir()
        for camera, view in item['views'].items():
            source, target = REPO / view['sourceFile'], folder / (camera + '.png')
            with Image.open(source) as image:
                crop = image.crop(view['sourceFrameRectLTRB'])
                pixels = crop.tobytes()
                whole = view['sourceFrameRectLTRB'] == [0, 0, image.width, image.height]
            if whole:
                shutil.copyfile(source, target)
            else:
                crop.save(target, format='PNG')
            with Image.open(target) as decoded:
                assert decoded.mode == 'RGBA' and decoded.tobytes() == pixels and decoded.size == crop.size
            view.update({'file': target.relative_to(OUT).as_posix(), 'nativeSize': list(crop.size),
                'pngSHA256': file_sha(target), 'sourceRGBAEqual': True,
                'singleSourcePNGBytesUnchanged': whole, 'nativeHeadingDegrees': None,
                'nativeCameraCertified': False, 'runtimeReady': False,
                'operation': 'Whole source PNG byte copy' if whole else 'Exact raw integer half-cell crop; native RGBA unchanged'})
            verification.append({'file': view['file'], 'pngSHA256': view['pngSHA256'],
                'rgbaSHA256': view['rgbaSHA256'], 'sourceRGBAEqual': True, 'nativeSize': view['nativeSize']})
        write(folder / 'source-views.json', item)
    assert len(verification) == 64 and len(list(OUT.rglob('*.png'))) == 64
    shutil.copyfile(NORMAL, OUT / 'accepted-normal-source-selection-v2.json')
    holds = read(BASE / 'normal-source-camera-scale-holds-v2.json')
    holds.update({'all64SourceViewsAreCandidatesOnly': True, 'exactNative8DegreeCertified': False,
        'normalAndYawGroundAnchorsAndPixelsPerMetreUnapproved': True,
        'sourceDimensions': sorted({tuple(v['nativeSize']) for v in verification})})
    holds['notes'].append('Yaw repair singles have their original variable native canvas dimensions. They are not resized to627px cells or calibrated to a shared physical scale.')
    write(OUT / 'camera-scale-holds.json', holds)
    write(OUT / 'index.json', {'schema': 1, 'sourceOnly': True, 'subjects': 8, 'sourceViews': 64,
        'sourceReview': str(REVIEW), 'sourceReviewSHA256': file_sha(REVIEW),
        'normalSelectionsUnchanged': True, 'normalSelectionSHA256': normal_hash,
        'cameraKeysAreNominal': True, 'cameraAndScaleHolds': 'camera-scale-holds.json',
        'runtimeReady': False, 'runtimeIntegrated': False, 'nativeCameraCertified': False,
        'pixelPolicy': 'Native PNG byte copies for singles; raw RGBA integer half-cell crops for sheets. No resize, trim, alpha cleanup, colour change, flip, bitmap rotation or paint.',
        'sets': selections})
    write(OUT / 'verification.json', {'pngCount': 64, 'subjects': 8,
        'allNativeSourceRGBAEqual': True, 'files': verification})
    (OUT / 'README.md').write_text(
        '# Specialist golf mobile source views\n\n'
        'Eight designs, eight selected native source views each. [index.json](./index.json) records exact source hashes, rectangles and PNG/RGBA hashes. '
        'The accepted32 normal selections are preserved exactly. Nine yaw repair singles replace only the held views; other23 yaw views remain raw sheet halves.\n\n'
        'Full native singles are copied byte-for-byte; sheets are cropped at exact integer half-cell boundaries. No resizing, trimming, alpha cleanup, flipping, colour change or painting. '
        'Variable canvas sizes remain unchanged. [camera-scale-holds.json](./camera-scale-holds.json) separates practical functional identity approval from unverified exact camera angles, scale and anchors. '
        'Source candidates only; no runtime integration or exact8degree certification.\n', encoding='utf-8')
    with zipfile.ZipFile(ZIP, 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for file in sorted(OUT.rglob('*')):
            if file.is_file():
                archive.write(file, file.relative_to(OUT).as_posix())
    with zipfile.ZipFile(ZIP) as archive:
        assert archive.testzip() is None
        pngs = [n for n in archive.namelist() if n.endswith('.png')]
        assert len(pngs) == len(set(pngs)) == 64
        for view in verification:
            data = archive.read(view['file'])
            assert sha(data) == view['pngSHA256']
            with Image.open(io.BytesIO(data)) as image:
                assert sha(image.convert('RGBA').tobytes()) == view['rgbaSHA256']
        entries = len(archive.namelist())
    assert file_sha(NORMAL) == normal_hash
    assert all(file_sha(Path(file)) == expected for file, expected in source_hashes.items())
    receipt = {'schema': 1, 'sourceOnly': True, 'zip': str(ZIP), 'zipSHA256': file_sha(ZIP),
        'zipBytes': ZIP.stat().st_size, 'zipPNGCount': 64, 'zipEntries': entries,
        'zipAllEntriesCRCPassed': True, 'all64PNGAndRGBAHashesVerifiedInsideZIP': True,
        'allOriginalNativeSourcesUnchanged': True, 'normal32SelectionsUnchanged': True,
        'normalSelectionSHA256': normal_hash, 'runtimeIntegrated': False,
        'nativeCameraScaleAndAnchorsApproved': False}
    write(ZIP.with_suffix('.zip.provenance.json'), receipt)
    print(json.dumps(receipt, indent=2))


if __name__ == '__main__':
    main()
