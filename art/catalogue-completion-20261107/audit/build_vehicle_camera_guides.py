"""Technical 30-degree-down vehicle references. Never final game sprites.

Uses the existing Model, world transforms and per-pixel depth rasterizer.
All dimensions are generic design references, not claims about accepted artwork.
"""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import build_world_geometry_guides as world


def cylinder_x(m, name, center, radius, width, color, segments=32):
    x, y, z = center
    rings = [[(x + side * width / 2,
               y + radius * math.cos(2 * math.pi * i / segments),
               z + radius * math.sin(2 * math.pi * i / segments))
              for i in range(segments)] for side in (-1, 1)]
    for side, ring in zip((-1, 1), rings):
        m.face(name + '/cap-' + str(side), ring if side == 1 else list(reversed(ring)), color)
    for i in range(segments):
        j = (i + 1) % segments
        m.face(name + '/tread-' + str(i), [rings[0][i], rings[0][j], rings[1][j], rings[1][i]], color)
    m.components.append({'name': name, 'kind': 'cylinder', 'axis': 'x', 'center': center,
                         'radius': radius, 'axial_width': width, 'segments': segments})
    m.anchors[name + '/center'] = center


def cabin(m, front, rear, roof_front, roof_rear, width, roof_width, base, top, paint):
    p = [(-width / 2, front, base), (width / 2, front, base),
         (width / 2, rear, base), (-width / 2, rear, base),
         (-roof_width / 2, roof_front, top), (roof_width / 2, roof_front, top),
         (roof_width / 2, roof_rear, top), (-roof_width / 2, roof_rear, top)]
    for name, indices, color in [('front-windscreen', (0, 1, 5, 4), '#5f8d9a'),
                                  ('rear-glass', (2, 3, 7, 6), '#527889'),
                                  ('right-side-glass', (1, 2, 6, 5), '#668897'),
                                  ('left-side-glass', (3, 0, 4, 7), '#668897'),
                                  ('roof', (4, 5, 6, 7), paint)]:
        m.face(name, [p[i] for i in indices], color)
    for i, point in enumerate(p):
        m.anchors['cabin-corner-' + str(i)] = point


def common(m, length, width, top, wheelbase, radius, paint):
    bottom = max(.30, radius * .9)
    m.box('lower-body', (0, 0, (bottom + top) / 2), (width, length, top - bottom), paint)
    for side in (-1, 1):
        for axle, y in [('front', -wheelbase / 2), ('rear', wheelbase / 2)]:
            center = (side * (width / 2 + .015), y, radius)
            cylinder_x(m, f'{axle}-tyre-{side}', center, radius, .18, '#20282d')
            cylinder_x(m, f'{axle}-hub-{side}', (center[0] + side * .094, y, radius), radius * .48, .016, '#a8b4bc')
    for side in (-1, 1):
        m.box('front-headlamp-' + str(side), (side * width * .31, -length / 2 - .018, top - .15),
              (width * .20, .045, .16), '#f2e5af')
        m.box('rear-red-tail-lamp-' + str(side), (side * width * .34, length / 2 + .018, top - .15),
              (width * .16, .045, .18), '#c44e42')
    m.box('front-grille', (0, -length / 2 - .025, top - .16), (width * .34, .045, .16), '#263b41')
    for side in (-1, 1):
        m.box('bumper-' + str(side), (0, side * (length / 2 + .055), bottom + .12),
              (width * .96, .13, .11), '#acb6b8')
    m.anchors['nose-ground'] = (0, -length / 2, 0)
    m.anchors['rear-ground'] = (0, length / 2, 0)
    m.anchors['body-ground-center'] = (0, 0, 0)
    for x in (-width / 2, width / 2):
        for y in (-length / 2, length / 2):
            m.anchors[f'body-top-{x}-{y}'] = (x, y, top)


def make_vehicle(kind):
    m = world.Model('technical-vehicle-' + kind)
    if kind == 'sedan':
        dims, wheelbase, radius, scale = (4.6, 1.8, 1.45), 2.75, .31, 110
        common(m, *dims[:2], .85, wheelbase, radius, '#6286a0')
        cabin(m, -1.05, 1.42, -.58, .86, 1.65, 1.39, .85, dims[2], '#749bb3')
    elif kind == 'hatch':
        dims, wheelbase, radius, scale = (3.85, 1.73, 1.52), 2.45, .29, 125
        common(m, *dims[:2], .85, wheelbase, radius, '#ba6457')
        cabin(m, -.95, 1.70, -.48, 1.22, 1.59, 1.34, .85, dims[2], '#cd7d69')
    elif kind == 'pickup':
        dims, wheelbase, radius, scale = (5.2, 1.95, 1.72), 3.12, .36, 105
        common(m, *dims[:2], .94, wheelbase, radius, '#a9956b')
        cabin(m, -1.15, .48, -.76, .36, 1.80, 1.55, .94, dims[2], '#bfa67d')
        m.box('open-bed-floor', (0, 1.48, .945), (1.69, 1.91, .035), '#4b524d')
        for side in (-1, 1):
            m.box('bed-side-rail-' + str(side), (side * .91, 1.48, 1.10), (.13, 1.95, .32), '#bfa67d')
        m.box('tailgate', (0, 2.52, 1.10), (1.94, .15, .32), '#bfa67d')
    elif kind == 'van':
        dims, wheelbase, radius, scale = (5.6, 2.08, 2.40), 3.38, .36, 95
        common(m, *dims[:2], .92, wheelbase, radius, '#d1c7aa')
        m.box('panel-van-rear-body', (0, 1.00, 1.62), (2.08, 3.60, 1.56), '#ded6bd')
        cabin(m, -2.64, -.77, -2.20, -.77, 2.01, 1.91, .92, dims[2], '#e8e0ca')
        m.wall_panel('rear-small-window', 'y', 2.811, -.56, .56, 1.66, 2.15, '#63848e')
        m.box('rear-door-seam', (0, 2.822, 1.57), (.035, .015, 1.60), '#a79f88')
    else:
        dims, wheelbase, radius, scale = (8.4, 2.45, 2.92), 5.30, .46, 69
        common(m, *dims[:2], 1.04, wheelbase, radius, '#ba9d59')
        m.box('bus-upper-body', (0, 0, 1.96), (2.45, 8.4, 1.84), '#d5b86a')
        m.wall_panel('bus-front-windscreen', 'y', -4.213, -.99, .99, 1.62, 2.65, '#688b97')
        m.wall_panel('bus-rear-window', 'y', 4.213, -.88, .88, 1.85, 2.58, '#557682')
        for side in (-1, 1):
            for i in range(6):
                y = -2.90 + i * 1.10
                m.wall_panel(f'bus-side-window-{side}-{i}', 'x', side * 1.239, y - .43, y + .43, 1.65, 2.58, '#60828e')
        m.wall_panel('bus-right-front-door', 'x', 1.25, -3.95, -3.17, .58, 2.60, '#4b6570')
        m.box('bus-roof', (0, 0, 2.90), (2.42, 8.37, .04), '#e0c77d')
    settings = {'guide_version': 1, 'scale_px_per_metre': scale, 'technical_labels': False,
                'generic_reference_only': True, 'body_length_width_height_metres': dims,
                'wheelbase_metres': wheelbase, 'tyre_radius_metres': radius,
                'front_world_vector': [0, -1, 0], 'identity_policy': 'Geometry/camera reference only. Preserve actual native vehicle identity during art editing.'}
    return m, settings


def main():
    results = []
    for kind in ('sedan', 'hatch', 'pickup', 'van', 'bus'):
        m, settings = make_vehicle(kind)
        folder = world.ART / 'generated' / m.name / 'guides'
        folder.mkdir(parents=True, exist_ok=True)
        mesh = folder / (m.name + '-world-model-v1.json')
        mesh.write_text(json.dumps({'model': m.name, 'settings': settings, 'faces': m.faces,
            'anchors_world_metres': m.anchors, 'components': m.components,
            'technical_only': True, 'owner_approved': False, 'runtime_integrated': False}, indent=2) + '\n', encoding='utf-8')
        paths = {mode: Path(world.render(m, settings, mode)) for mode in ('normal', 'cardinal')}
        cardinal_path = folder / 'cardinal-world-v1.calibration.json'
        cardinal = json.loads(cardinal_path.read_text())
        for view in cardinal['views']:
            theta = view['object_rotation_degrees_about_Z']
            front = world.rotate([(0, -1, 0)], theta / 90)[0]
            right = np.array(cardinal['basis']['screen_right'])
            down = np.array(cardinal['basis']['screen_down'])
            screen = np.array([front @ right, front @ down])
            screen[np.abs(screen) < 1e-12] = 0
            view['actual_nose_world_vector'] = front.tolist()
            view['actual_nose_screen_vector'] = screen.tolist()
            view['actual_nose_screen_clockwise_degrees_from_right'] = math.degrees(math.atan2(screen[1], screen[0])) % 360
        cardinal['vehicle_camera_checks'] = {'camera_pitch_down_degrees': 30,
            'zero_cardinal_yaw': True, 'roof_ground_depth_foreshortening': math.sin(world.ALPHA),
            'side_wheel_face_height_width_ratio': math.cos(world.ALPHA),
            'wheel_ratio_note': 'Vertical wheel discs compress to0.866height/width at30down in true side views. Eye-level would be1.0. Front/rear wheels are edge-on, not face-on circles.',
            'cardinal_order': [['front nose DOWN', 'right nose RIGHT'], ['rear nose UP', 'left nose LEFT']]}
        cardinal['generator'] = {'path': str(Path(__file__)), 'sha256': world.digest(Path(__file__))}
        cardinal_path.write_text(json.dumps(cardinal, indent=2) + '\n', encoding='utf-8')
        # Exactly the same model, size and camera pitch in the owner's4x2 traffic layout.
        normal, card = (Image.open(paths[k]).convert('RGBA') for k in ('normal', 'cardinal'))
        order = [('normal', 3, 'LOWER LEFT'), ('cardinal', 0, 'DOWN'), ('normal', 0, 'LOWER RIGHT'), ('cardinal', 1, 'RIGHT'),
                 ('normal', 1, 'UPPER RIGHT'), ('cardinal', 2, 'UP'), ('normal', 2, 'UPPER LEFT'), ('cardinal', 3, 'LEFT')]
        sheet = Image.new('RGBA', (4 * world.CELL, 2 * world.CELL))
        for i, (mode, cell, _) in enumerate(order):
            src = normal if mode == 'normal' else card
            x, y = cell % 2 * world.CELL, cell // 2 * world.CELL
            sheet.paste(src.crop((x, y, x + world.CELL, y + world.CELL)), (i % 4 * world.CELL, i // 4 * world.CELL))
        compact = folder / 'traffic8-camera-world-v1.png'
        sheet.resize((1600, 800), Image.Resampling.LANCZOS).save(compact)
        combined = {'purpose': 'Compact TECHNICAL ONLY camera reference, not final sprite art.', 'model': m.name,
            'camera_down_degrees': 30, 'cell_pixels': [400, 400], 'layout': [4, 2],
            'camera_pixels_per_metre': settings['scale_px_per_metre'] / 2,
            'cardinal_horizontal_offset_degrees': 0, 'corner_horizontal_offset_degrees': -45,
            'cell_order': [list(row) for row in (['LOWER LEFT', 'DOWN', 'LOWER RIGHT', 'RIGHT'], ['UPPER RIGHT', 'UP', 'UPPER LEFT', 'LEFT'])],
            'source_cells': [{'cell': i, 'source_family': mode, 'source_cell': cell, 'actual_nose_screen': nose} for i, (mode, cell, nose) in enumerate(order)],
            'sources': {k: {'png': p.name, 'sha256': world.digest(p)} for k, p in paths.items()},
            'output': {'png': compact.name, 'sha256': world.digest(compact)},
            'mesh_file': mesh.name, 'mesh_sha256': world.digest(mesh), 'technical_only': True,
            'final_native_art_approved': False, 'runtime_integrated': False}
        (folder / 'traffic8-camera-world-v1.calibration.json').write_text(json.dumps(combined, indent=2) + '\n', encoding='utf-8')
        results.append({'vehicle': kind, 'cardinal_png': str(paths['cardinal']), 'traffic8_png': str(compact),
                        'cardinal_metadata': str(cardinal_path), 'mesh': str(mesh)})
        print(json.dumps(results[-1]), flush=True)
    (world.ART / 'audit' / 'vehicle-camera-guide-index-v1.json').write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
