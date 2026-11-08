"""Technical camera proxy only; this is deliberately not final game art."""
import hashlib
import argparse
import json
import math
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'generated/old-clubhouse-1950/guides'
W, D, H, RISE, OVERHANG = 12.0, 8.0, 3.0, 1.2, .25
YAW = math.radians(8)
DOWN = math.radians(30)
SCALE, CELL = 44.0, 800
VIEW_NAMES = ('N', 'E', 'S', 'W')
RIGHT = (math.cos(YAW), math.sin(YAW), 0.0)
DOWN_VECTOR = (math.sin(DOWN) * math.sin(YAW), -math.sin(DOWN) * math.cos(YAW), -math.cos(DOWN))
CAMERA = (math.cos(DOWN) * math.sin(YAW), -math.cos(DOWN) * math.cos(YAW), math.sin(DOWN))


def rotate(p, quarter):
    a = math.radians(90 * quarter)
    return (math.cos(a) * p[0] - math.sin(a) * p[1], math.sin(a) * p[0] + math.cos(a) * p[1], p[2])


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def project(p):
    return (dot(p, RIGHT), dot(p, DOWN_VECTOR))


def main():
    global YAW, RIGHT, DOWN_VECTOR, CAMERA, VIEW_NAMES
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kind', choices=('yaw8', 'corners'), default='yaw8')
    args = parser.parse_args()
    corner = args.kind == 'corners'
    if corner:
        # Native normal-v2 cell order starts front+left (SE), then back+left,
        # back+right, front+right. Source identity governs this correspondence.
        YAW = math.radians(-45)
        VIEW_NAMES = ('SE', 'SW', 'NW', 'NE')
        RIGHT = (math.cos(YAW), math.sin(YAW), 0.0)
        DOWN_VECTOR = (math.sin(DOWN) * math.sin(YAW), -math.sin(DOWN) * math.cos(YAW), -math.cos(DOWN))
        CAMERA = (math.cos(DOWN) * math.sin(YAW), -math.cos(DOWN) * math.cos(YAW), math.sin(DOWN))
    prefix = 'normal-corners-camera-v1' if corner else 'yaw8-camera-v1'
    OUT.mkdir(parents=True, exist_ok=True)
    x, y = W / 2, D / 2
    faces = [
        ('front', [(-x, -y, 0), (x, -y, 0), (x, -y, H), (-x, -y, H)], (0, -1, 0), '#b4d7ca'),
        ('right-gable', [(x, -y, 0), (x, y, 0), (x, y, H), (x, 0, H + RISE), (x, -y, H)], (1, 0, 0), '#d4c1a6'),
        ('back', [(x, y, 0), (-x, y, 0), (-x, y, H), (x, y, H)], (0, 1, 0), '#d9b8a8'),
        ('left-gable', [(-x, y, 0), (-x, -y, 0), (-x, -y, H), (-x, 0, H + RISE), (-x, y, H)], (-1, 0, 0), '#afc5df'),
    ]
    eave = H - RISE * OVERHANG / y
    rx, ry = x + OVERHANG, y + OVERHANG
    faces += [
        ('front-roof', [(-rx, -ry, eave), (rx, -ry, eave), (rx, 0, H + RISE), (-rx, 0, H + RISE)], (0, -RISE / y, 1), '#a8b3be'),
        ('back-roof', [(-rx, 0, H + RISE), (rx, 0, H + RISE), (rx, ry, eave), (-rx, ry, eave)], (0, RISE / y, 1), '#c2c9cf'),
    ]
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600" viewBox="0 0 1600 1600">',
           '<title>Technical orthographic yaw8 camera proxy; not final artwork</title>']
    calibration = []
    for quarter, view in enumerate(VIEW_NAMES):
        transformed = []
        for name, points, normal, color in faces:
            pts = [rotate(p, quarter) for p in points]
            if dot(rotate(normal, quarter), CAMERA) <= 1e-9:
                continue
            depth = sum(dot(p, CAMERA) for p in pts) / len(pts)
            transformed.append((depth, name, pts, color))
        projections = [project(p) for _, _, pts, _ in transformed for p in pts]
        lo_x, hi_x = min(p[0] for p in projections), max(p[0] for p in projections)
        lo_y, hi_y = min(p[1] for p in projections), max(p[1] for p in projections)
        offset = ((quarter % 2) * CELL + CELL / 2 - SCALE * (lo_x + hi_x) / 2,
                  (quarter // 2) * CELL + CELL / 2 - SCALE * (lo_y + hi_y) / 2)

        def coords(points):
            return ' '.join(f'{offset[0] + SCALE * project(p)[0]:.6f},{offset[1] + SCALE * project(p)[1]:.6f}' for p in points)

        for _, name, points, color in sorted(transformed):
            svg.append(f'<polygon data-face="{view}-{name}" points="{coords(points)}" fill="{color}" stroke="#304252" stroke-width="2" stroke-linejoin="round"/>')
            if name == 'front':
                # Pure semantic identity markers; source reference supplies final architecture.
                for left, right, bottom, top in [(-4.4, -2.0, .9, 2.1), (-.55, .55, 0, 2.2), (2.0, 4.4, .9, 2.0)]:
                    rect = [(left, -y - .002, bottom), (right, -y - .002, bottom), (right, -y - .002, top), (left, -y - .002, top)]
                    svg.append(f'<polygon points="{coords([rotate(p, quarter) for p in rect])}" fill="#4a6f61" stroke="#263d35" stroke-width="1"/>')
        label_x, label_y = (quarter % 2) * CELL + 40, (quarter // 2) * CELL + 42
        camera_label = '45° corner' if corner else '8° offset'
        svg.append(f'<text x="{label_x}" y="{label_y}" fill="#263d35" font-family="Arial" font-size="22">{view}: {camera_label}, 30° down — TECHNICAL GUIDE</text>')
        main = (W if quarter % 2 == 0 else D) * math.cos(YAW)
        side = (D if quarter % 2 == 0 else W) * abs(math.sin(YAW))
        calibration.append({'view': view, 'quarter_rotation_degrees_about_Z': quarter * 90,
            'cell_box': [(quarter % 2) * CELL, (quarter // 2) * CELL, (quarter % 2 + 1) * CELL, (quarter // 2 + 1) * CELL],
            'screen_offset_px': offset, 'scale_px_per_metre': SCALE,
            'projected_main_wall_width_m': main, 'projected_narrow_wall_width_m': side,
            'narrow_to_main_width_ratio': side / main, 'narrow_fraction_of_total_body_width': side / (main + side),
            'main_bottom_edge_slope': math.sin(DOWN) * math.tan(YAW),
            'main_bottom_edge_screen_degrees': math.degrees(math.atan(math.sin(DOWN) * math.tan(YAW))),
            'visible_faces': [name for _, name, _, _ in transformed],
            'projected_vertices_m': {name: [project(p) for p in points] for _, name, points, _ in transformed}})
    svg.append('</svg>')
    svg_path = OUT / (prefix + '.svg')
    png_path = OUT / (prefix + '.png')
    svg_path.write_text('\n'.join(svg) + '\n', encoding='utf-8')
    js = "const sharp=require('E:/Repos/CapitalEmpire/worktrees/theme-consistency/node_modules/sharp');sharp(process.argv[1]).png().toFile(process.argv[2]).then(()=>{}).catch(e=>{process.stderr.write(String(e));process.exit(1)});"
    subprocess.run(['node', '-e', js, str(svg_path), str(png_path)], check=True)
    meta = {'purpose': 'technical camera proxy only; never final art or automatic runtime input',
        'native_identity_reference': str(ROOT / 'generated/old-clubhouse-1950/normal-v2.png'),
        'identity_roof': 'GABLED with ridge along 12m front width, not hipped. Native normal-v2 identity overrides obsolete prose.',
        'body_dimensions_metres': [W, D, H], 'roof_rise_metres_proxy': RISE, 'roof_overhang_metres_proxy': OVERHANG,
        'height_dimensions_are_proxy_only': True, 'camera': 'orthographic; fixed 30 degrees down; ' + ('45 degree corner-facing' if corner else '8 degree yaw offset from facing wall'),
        'view_order': [['SE', 'SW'], ['NW', 'NE']] if corner else [['N', 'E'], ['S', 'W']], 'rotation_steps_degrees': [0, 90, 180, 270],
        'runtime_yaw_metadata': None if corner else -8, 'camera_horizontal_offset_degrees': -45 if corner else 8,
        'basis': {'screen_right': RIGHT, 'screen_down': DOWN_VECTOR, 'toward_camera': CAMERA},
        'projection': 'screen_x=dot(world,screen_right); screen_y=dot(world,screen_down); shared44px/m; center each complete projected proxy in its cell',
        'source_geometry_policy': 'Use source for door/window/hatch/chimney/roof identity, this guide only for exact near-cardinal projection and body proportions; do not inherit proxy colors or labels.',
        'cells': calibration,
        'outputs': [{'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in (svg_path, png_path)],
        'owner_approved': False, 'runtime_integrated': False}
    (OUT / (prefix + '.calibration.json')).write_text(json.dumps(meta, indent=2) + '\n', encoding='utf-8')
    print(str(png_path))
    print('main bottom slope degrees', calibration[0]['main_bottom_edge_screen_degrees'])
    print('narrow/main ratios', [(item['view'], item['narrow_to_main_width_ratio']) for item in calibration])


if __name__ == '__main__':
    main()
