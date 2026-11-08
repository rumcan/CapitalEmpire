"""ART ONLY: adopt coherent native left cargo door, preserve all v1 masters."""
import copy
import json
from pathlib import Path

from PIL import Image

import build_world_geometry_guides as world

ROOT = world.ART / 'generated/golf-vehicle-source-batch-01'
OLD = ROOT / 'fixed-world-guides-v1'
OUT = ROOT / 'fixed-world-guides-v2/satellite-van/guides'


def read(file):
    return json.loads(file.read_text(encoding='utf-8-sig'))


def write_new(file, obj):
    with file.open('x', encoding='utf-8', newline='\n') as f:
        json.dump(obj, f, indent=2)
        f.write('\n')


def door_name(name):
    return name.startswith(('RIGHT-sliding-cargo-door-seam-', 'RIGHT-cargo-door-handle'))


def main():
    if OUT.exists():
        raise RuntimeError('Preserve existing v2 guide directory')
    old_mesh = OLD / 'satellite-van/guides/satellite-van-world-model-v1.json'
    original = read(old_mesh)
    model = world.Model('golf-vehicle-source-batch-01/fixed-world-guides-v2/satellite-van')
    model.faces = copy.deepcopy(original['faces'])
    model.anchors = copy.deepcopy(original['anchors_world_metres'])
    model.components = copy.deepcopy(original['components'])
    changed = []
    for face in model.faces:
        if door_name(face['name']):
            changed.append(face['name'])
            face['name'] = face['name'].replace('RIGHT-', 'LEFT-', 1)
            face['vertices'] = [[-x, y, z] for x, y, z in reversed(face['vertices'])]
    anchors = {}
    for name, point in model.anchors.items():
        if door_name(name):
            name = name.replace('RIGHT-', 'LEFT-', 1)
            point = [-point[0], point[1], point[2]]
        anchors[name] = point
    model.anchors = anchors
    for component in model.components:
        if door_name(component['name']):
            component['name'] = component['name'].replace('RIGHT-', 'LEFT-', 1)
            if 'center' in component:
                component['center'][0] *= -1
    old_non_door = [f for f in original['faces'] if not door_name(f['name'])]
    new_non_door = [f for f in model.faces if not f['name'].startswith(('LEFT-sliding-cargo-door-seam-', 'LEFT-cargo-door-handle'))]
    if old_non_door != new_non_door or not changed:
        raise RuntimeError('Only cargo-door geometry may change')
    settings = copy.deepcopy(original['settings'])
    settings.update({'guide_version': 2, 'technical_labels': False, 'adopted_cargo_door_side': 'LEFT -X',
        'adoption_authority': 'Lead explicitly accepts coherent native LEFT door across all four normal views; no native image edit.',
        'fixed': 'One curved dish, unchanged fixed aim; HVAC and two aerials unchanged. ONE LEFT -X sliding cargo door, twin rear doors. Right +X body plain.'})
    settings['fixedIdentity'] = settings['fixed']
    OUT.mkdir(parents=True)
    mesh = OUT / 'satellite-van-world-model-v2.json'
    write_new(mesh, {'model': 'satellite-van', 'settings': settings, 'faces': model.faces,
        'anchors_world_metres': model.anchors, 'components': model.components, 'technical_only': True,
        'adoptedDoorSide': 'LEFT -X', 'nativeSourcePixelsChanged': False, 'runtimeIntegrated': False,
        'nonDoorFacesIdenticalToV1': True, 'v1MeshSHA256': world.digest(old_mesh), 'changedV1DoorFaces': changed})
    outputs = {}
    for family in ('normal', 'yaw8'):
        png = Path(world.render(model, settings, family))
        cal_file = OUT / (family + '-world-v2.calibration.json')
        cal, old_cal = read(cal_file), read(OLD / 'satellite-van/guides' / (family + '-world-v1.calibration.json'))
        for view, old_view in zip(cal['views'], old_cal['views']):
            for name, value in old_view.items():
                if name not in view:
                    view[name] = value
        cal.update({'model': 'satellite-van', 'mesh_file': mesh.name, 'mesh_sha256': world.digest(mesh),
                    'adoptedDoorSide': 'LEFT -X', 'nonDoorFacesIdenticalToV1': True,
                    'generator': {'path': str(Path(__file__)), 'sha256': world.digest(Path(__file__))},
                    'nativeCameraCertified': False, 'runtimeIntegrated': False})
        cal_file.write_text(json.dumps(cal, indent=2) + '\n', encoding='utf-8')
        with Image.open(png) as image:
            cell_hashes = [world.hashlib.sha256(image.crop((i % 2 * 800, i // 2 * 800,
                i % 2 * 800 + 800, i // 2 * 800 + 800)).tobytes()).hexdigest() for i in range(4)]
        outputs[family] = {'png': str(png), 'svg': str(png.with_suffix('.svg')), 'calibration': str(cal_file),
            'sha256': world.digest(png), 'objectBoundsPerCell': [v['object_bbox_local_px'] for v in cal['views']],
            'geometryClipped': False, 'sourceCellRGBAHashes': cell_hashes}
    # Update the current camera/identity maps for this one subject only. Old PNGs,
    # meshes and calibration JSON stay preserved beside the new v2 references.
    index_file, compact_file = OLD / 'index.json', OLD / 'compact.json'
    index, compact = read(index_file), read(compact_file)
    write_new(OUT / 'identity-map-before-adoption.json', {'index': index, 'compact': compact})
    untouched_before = [m for m in index['models'] if m['key'] != 'satellite-van']
    entry = next(m for m in index['models'] if m['key'] == 'satellite-van')
    entry.update({'fixed': settings['fixed'], 'mesh': str(mesh), 'meshSHA256': world.digest(mesh),
                  'guides': outputs, 'adoptedDoorSide': 'LEFT -X', 'guideVersion': 2})
    for entry in compact['models']:
        if entry['id'] == 'newprop:satellite-van':
            entry.update({'fixed': settings['fixed'], 'normal': outputs['normal']['png'],
                          'yaw8': outputs['yaw8']['png'], 'adoptedDoorSide': 'LEFT -X', 'guideVersion': 2})
    if untouched_before != [m for m in index['models'] if m['key'] != 'satellite-van']:
        raise RuntimeError('Unrelated identity metadata changed')
    index_file.write_text(json.dumps(index, indent=2) + '\n', encoding='utf-8')
    compact_file.write_text(json.dumps(compact, separators=(',', ':')) + '\n', encoding='utf-8')
    write_new(OUT / 'adopted-left-door-identity-v2.json', {'sourceOnly': True, 'subject': 'newprop:satellite-van',
        'adoptedDoorSide': 'LEFT -X', 'nativeSourcePixelsChanged': False, 'nonDoorFacesIdenticalToV1': True,
        'dishNWNativeFaceHoldRemains': True, 'outputs': outputs, 'runtimeIntegrated': False})
    print(json.dumps(outputs, indent=2), flush=True)


if __name__ == '__main__':
    main()
