"""Source-only modern-house delivery: preserve old32 PNG bytes, add32 raw crops.

No alpha cleanup, resize, trimming, image rotation, painting or runtime import.
Native camera/scale release holds remain separate from source identity approval.
"""
import hashlib
import io
import json
import shutil
import zipfile
from pathlib import Path

from PIL import Image

ART = Path(__file__).resolve().parent.parent
HOUSES = ART / 'generated/era-houses'
OLD = HOUSES / 'lossless-source-bundle-v1'
OUT = HOUSES / 'lossless-source-bundle-v2'
ZIP = HOUSES / 'Modern-houses-1990s-2020s-source-v2.zip'
OLD_ZIP = HOUSES / 'Modern-houses-1990s-2020s-source.zip'
PRECHECK = Path('output/modern-house-v2-package-preflight.json')
READINESS = ART / 'audit/four-source-repairs-and-house-package-readiness.json'
KEYS = {'normal': ['SE', 'SW', 'NW', 'NE'], 'yaw8': ['N', 'E', 'S', 'W']}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def sha(file):
    return digest(file.read_bytes())


def read(file):
    return json.loads(file.read_text(encoding='utf-8-sig'))


def write_new(file, obj):
    with file.open('x', encoding='utf-8', newline='\n') as f:
        json.dump(obj, f, indent=2)
        f.write('\n')


def source_rgba(view):
    raw = Path(view['sourceFile'])
    if sha(raw) != view['sourceFileSHA256']:
        raise RuntimeError('Original source changed: ' + str(raw))
    with Image.open(raw) as image:
        return image.convert('RGBA').crop(tuple(view['sourceFrameRectLTRB'])).tobytes()


def main():
    if OUT.exists() or ZIP.exists() or ZIP.with_suffix('.zip.provenance.json').exists():
        raise RuntimeError('Preserve existing delivery; use a new version')
    old_index, baseline, ready = read(OLD / 'index.json'), read(PRECHECK), read(READINESS)
    if not ready['allFourExpansion02NormalAndYawSourceFamiliesNowPracticalCandidates']:
        raise RuntimeError('House functional identity review not complete')
    if sha(OLD_ZIP) != baseline['v1ZipSHA256']:
        raise RuntimeError('Original ZIP changed')
    selections = ready['housePackagingAuthorizedSelection']
    # Validate every selected raw sheet/provenance before creating the delivery.
    selected_raw = {}
    for key, selection in selections.items():
        for file in selection.values():
            path = HOUSES / 'expansion-02' / key / file
            provenance = read(path.with_suffix('.provenance.json'))
            if sha(path) != provenance['sha256']:
                raise RuntimeError('Raw/provenance mismatch: ' + str(path))
            selected_raw[str(path)] = sha(path)
    for house in old_index['houses']:
        for view in house['sourceViews']:
            file = OLD / view['fileRelativeToBundle']
            if sha(file) != view['pngSHA256']:
                raise RuntimeError('Old crop changed: ' + str(file))

    OUT.mkdir()
    houses, verification = [], []
    for original_house in old_index['houses']:
        house = {'key': original_house['key'], 'name': original_house['name'],
                 'sourceViews': [], 'inheritedFromV1': True}
        folder = OUT / house['key']
        folder.mkdir()
        for original_view in original_house['sourceViews']:
            old_file = OLD / original_view['fileRelativeToBundle']
            file = OUT / original_view['fileRelativeToBundle']
            shutil.copyfile(old_file, file)
            if sha(file) != original_view['pngSHA256']:
                raise RuntimeError('Old PNG bytes changed during copy')
            with Image.open(file) as image:
                pixels = image.convert('RGBA').tobytes()
            if digest(pixels) != original_view['rgbaSHA256'] or pixels != source_rgba(original_view):
                raise RuntimeError('Old PNG no longer equals its exact native source rectangle')
            view = dict(original_view)
            view.update({'file': original_view['fileRelativeToBundle'],
                         'inheritedV1PNGBytesUnchanged': True,
                         'inheritedV1PNG': str(old_file), 'nativeCameraCertified': False, 'runtimeReady': False})
            house['sourceViews'].append(view)
            verification.append({'file': view['file'], 'pngSHA256': sha(file),
                'rgbaSHA256': digest(pixels), 'sourceRGBAEqual': True, 'inheritedV1PNGBytesUnchanged': True})
        write_new(folder / 'source-views.json', house)
        houses.append(house)

    briefs = {m['key']: m for m in read(HOUSES / 'expansion-02/brief-index.json')['models']}
    for key, selection in selections.items():
        house = {'key': key, 'name': briefs[key]['name'], 'sourceViews': [], 'inheritedFromV1': False,
                 'identityReview': str(READINESS), 'identityReviewSHA256': sha(READINESS)}
        folder = OUT / key
        folder.mkdir()
        for family, source_name in selection.items():
            source = HOUSES / 'expansion-02' / key / source_name
            with Image.open(source) as image:
                if image.mode != 'RGBA' or image.width % 2 or image.height % 2:
                    raise RuntimeError('Expected native RGBA even2x2 source')
                cw, ch = image.width // 2, image.height // 2
                for cell, direction in enumerate(KEYS[family]):
                    left, top = cell % 2 * cw, cell // 2 * ch
                    rect = [left, top, left + cw, top + ch]
                    crop = image.crop(tuple(rect))
                    pixels = crop.tobytes()
                    camera_key = family + direction
                    file = folder / (camera_key + '.png')
                    crop.save(file, format='PNG')
                    with Image.open(file) as decoded:
                        if decoded.mode != 'RGBA' or decoded.size != crop.size or decoded.tobytes() != pixels:
                            raise RuntimeError('Native RGBA changed during PNG crop encoding')
                    view = {'sourceCameraKey': camera_key, 'nominalCameraFamily': family,
                        'file': file.relative_to(OUT).as_posix(), 'fileRelativeToBundle': file.relative_to(OUT).as_posix(),
                        'sourceFile': str(source), 'sourceFileSHA256': selected_raw[str(source)],
                        'sourceFrameRectLTRB': rect, 'sourceCell': cell,
                        'operation': 'lossless raw integer half-cell crop; no trim, resize, colour, alpha, flip or paint change',
                        'singleViewOverride': False, 'nativeSize': [cw, ch], 'pngSHA256': sha(file),
                        'rgbaSHA256': digest(pixels), 'sourceRGBAEqual': True,
                        'sourceProvenance': str(source.with_suffix('.provenance.json')),
                        'identityFeaturesReviewed': 'Practical fixed facade openings and special features reviewed; see source identity QA evidence.',
                        'nativeHeadingDegrees': None, 'nativeCameraCertified': False, 'runtimeReady': False}
                    house['sourceViews'].append(view)
                    verification.append({'file': view['file'], 'pngSHA256': view['pngSHA256'],
                        'rgbaSHA256': view['rgbaSHA256'], 'sourceRGBAEqual': True, 'inheritedV1PNGBytesUnchanged': False})
        write_new(folder / 'source-views.json', house)
        houses.append(house)

    if len(houses) != 8 or len(verification) != 64 or any(len(h['sourceViews']) != 8 for h in houses):
        raise RuntimeError('Expected exactly8houses and64views')
    if len(list(OUT.rglob('*.png'))) != 64:
        raise RuntimeError('Unexpected PNG count')
    holds = read(OLD / 'camera-holds.json')
    holds.update({'purpose': 'Separate native camera/scale release holds from practical source identity packaging',
                  'exactNative8DegreeCertified': False, 'runtimeReady': False,
                  'allNativeSourceCameraScalesAndGroundAnchorsRemainUnapproved': True})
    holds['notes'].append('All64 images are source candidates. No numerical native yaw, normal camera, pixels-per-metre, footprint registration or runtime release approval is implied.')
    for key in selections:
        holds['houses'].append({'key': key, 'heldViews': ['yaw8N', 'yaw8E', 'yaw8S', 'yaw8W'],
            'cameraHold': 'Exact numerical native8degree yaw unverified',
            'normalCameraHold': 'Nominal45degree source labels; native camera calibration unapproved',
            'crossViewScaleHold': 'Unmeasured; equal canvas dimensions do not establish physical scale',
            'groundAnchorHold': 'Native ground anchors unmeasured'})
    write_new(OUT / 'camera-holds.json', holds)
    write_new(OUT / 'index.json', {'schema': 2, 'date': '2026-11-07',
        'purpose': 'Eight modern-house designs,64 lossless source-view PNGs', 'sourceOnly': True,
        'ownerApproved': False, 'runtimeIntegrated': False, 'runtimeReady': False,
        'sourceCameraKeysAreNominal': True, 'cameraHoldFile': 'camera-holds.json',
        'pixelsPolicy': 'Old32 PNGs copied byte-for-byte; new32 exact native half-cell crops. No resize, alpha cleanup, trim, flip, bitmap rotation or paint.',
        'inheritedV1Index': str(OLD / 'index.json'), 'inheritedV1IndexSHA256': sha(OLD / 'index.json'),
        'houseReadinessReview': str(READINESS), 'houseReadinessReviewSHA256': sha(READINESS),
        'newHouseSourceSelection': selections, 'rawOriginalSheetsIncluded': False,
        'rawOriginalSheetsPreservedExternally': True, 'houses': houses})
    write_new(OUT / 'verification.json', {'schema': 1, 'pngCount': 64, 'houses': 8,
        'inherited32PNGBytesIdentical': True, 'new32NativeCropRGBAEqual': True,
        'all64PNGDecodedRGBAAndOriginalSourceRectanglesVerified': True, 'files': verification})
    (OUT / 'README.md').write_text(
        '# Modern house source views\n\n'
        'Eight ordinary 1990s–2020s homes, with eight distinct source-view PNGs each. '
        '[index.json](./index.json) records selected native sheets, exact crop rectangles, PNG/RGBA hashes and provenance. '
        '[verification.json](./verification.json) records the 64 source pixel checks.\n\n'
        'The first 32 PNGs are byte-for-byte copies of the original four-house bundle. '
        'The next 32 preserve native RGBA half-cells from the four expansion homes. '
        'Bungalow uses normal-v2/yaw8-v2; compact solar home uses normal-v2/yaw8-v1. '
        'Duplex and six-flat walk-up use normal-v1/yaw8-v1.\n\n'
        'The original 2010s townhouse W correction remains a full 1254px single view; '
        'the other sheet cells remain 627px. It has not been resized. '
        '[camera-holds.json](./camera-holds.json) keeps camera, cross-view scale and ground-anchor release holds separate. '
        'These are source candidates, not certified exact 8-degree artwork or runtime-ready assets. '
        'Original native sheets and the earlier bundle/ZIP remain unchanged.\n', encoding='utf-8')

    # Check every archived PNG hash and CRC, including inherited full-size override.
    with zipfile.ZipFile(ZIP, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for file in sorted(OUT.rglob('*')):
            if file.is_file():
                archive.write(file, file.relative_to(OUT).as_posix())
    with zipfile.ZipFile(ZIP) as archive:
        if archive.testzip() is not None:
            raise RuntimeError('ZIP CRC failure')
        png_names = [name for name in archive.namelist() if name.lower().endswith('.png')]
        if len(png_names) != 64 or len(set(png_names)) != 64:
            raise RuntimeError('ZIP does not contain exactly64unique PNGs')
        for view in verification:
            data = archive.read(view['file'])
            if digest(data) != view['pngSHA256']:
                raise RuntimeError('Archived PNG hash mismatch')
            with Image.open(io.BytesIO(data)) as image:
                if digest(image.convert('RGBA').tobytes()) != view['rgbaSHA256']:
                    raise RuntimeError('Archived RGBA hash mismatch')
        archive_entries = len(archive.namelist())
    for relative, expected in baseline['v1BundleFileHashes'].items():
        if sha(OLD / relative) != expected:
            raise RuntimeError('Original v1 bundle file changed')
    if sha(OLD_ZIP) != baseline['v1ZipSHA256']:
        raise RuntimeError('Original ZIP changed')
    for file, expected in selected_raw.items():
        if sha(Path(file)) != expected:
            raise RuntimeError('New raw source changed')
    receipt = {'schema': 1, 'sourceOnly': True, 'zip': str(ZIP), 'zipSHA256': sha(ZIP),
        'zipBytes': ZIP.stat().st_size, 'zipEntries': archive_entries, 'zipPNGCount': 64,
        'zipAllEntriesCRCPassed': True, 'all64PNGHashesVerifiedInsideZIP': True,
        'all64RGBAHashesVerifiedInsideZIP': True, 'inherited32PNGBytesUnchanged': True,
        'new32PNGNativeCropPixelsExact': True, 'v1BundleAllFilesUnchanged': True,
        'v1ZipUnchanged': True, 'v1ZipSHA256': baseline['v1ZipSHA256'],
        'selectedNewRawSourcesUnchanged': True, 'nativeExact8DegreeCertified': False,
        'nativeCameraScaleAndGroundAnchorsApproved': False, 'runtimeIntegrated': False,
        'nativeSourcePixelsChanged': False, 'runtimeCodeChanged': False}
    write_new(ZIP.with_suffix('.zip.provenance.json'), receipt)
    print(json.dumps(receipt, indent=2), flush=True)


if __name__ == '__main__':
    main()
