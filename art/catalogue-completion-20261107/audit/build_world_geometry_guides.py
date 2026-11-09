"""Single-world-coordinate technical proxies, never final game sprites.

All opaque polygons share an orthographic per-pixel depth buffer. Geometry,
feature/seat/entry anchors and all eight projections are recorded for inspection.
"""
import argparse
import base64
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ART = Path(__file__).resolve().parent.parent
CELL = 800
ALPHA = math.radians(30)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class Model:
    def __init__(self, name):
        self.name, self.faces, self.anchors, self.components = name, [], {}, []

    def face(self, name, vertices, color):
        self.faces.append({'name': name, 'vertices': vertices, 'color': color})

    def box(self, name, center, size, color):
        x, y, z = center
        dx, dy, dz = (v / 2 for v in size)
        p = [(x - dx, y - dy, z - dz), (x + dx, y - dy, z - dz),
             (x + dx, y + dy, z - dz), (x - dx, y + dy, z - dz),
             (x - dx, y - dy, z + dz), (x + dx, y - dy, z + dz),
             (x + dx, y + dy, z + dz), (x - dx, y + dy, z + dz)]
        for suffix, indices in [('bottom', (3, 2, 1, 0)), ('front', (0, 1, 5, 4)),
                                ('right', (1, 2, 6, 5)), ('back', (2, 3, 7, 6)),
                                ('left', (3, 0, 4, 7)), ('top', (4, 5, 6, 7))]:
            self.face(name + '/' + suffix, [p[k] for k in indices], color)
        self.components.append({'name': name, 'kind': 'box', 'center': center, 'size': size})
        self.anchors[name] = center

    def wall_panel(self, name, axis, constant, low, high, bottom, top, color):
        vertices = [(low, constant, bottom), (high, constant, bottom),
                    (high, constant, top), (low, constant, top)] if axis == 'y' else [
                    (constant, low, bottom), (constant, high, bottom),
                    (constant, high, top), (constant, low, top)]
        self.face(name, vertices, color)
        self.anchors[name] = ((low + high) / 2, constant, (bottom + top) / 2) if axis == 'y' else (constant, (low + high) / 2, (bottom + top) / 2)

    def window(self, name, axis, constant, center_u, width=1.25, bottom=1.05, top=2.15):
        sign = 1 if constant > 0 else -1
        self.wall_panel(name + '/frame', axis, constant, center_u - width / 2, center_u + width / 2, bottom, top, '#386b5b')
        self.wall_panel(name + '/glass', axis, constant + sign * .008, center_u - width / 2 + .09, center_u + width / 2 - .09, bottom + .09, top - .09, '#709aa5')
        self.wall_panel(name + '/mullion', axis, constant + sign * .012, center_u - .025, center_u + .025, bottom + .09, top - .09, '#ece4cd')

    def gable_roof(self, width, depth, eaves, rise, overhang=.25):
        x, y = width / 2 + overhang, depth / 2 + overhang
        edge_z = eaves - rise * overhang / (depth / 2)
        ridge = eaves + rise
        for side in (-1, 1):
            vertices = [(-x, side * y, edge_z), (x, side * y, edge_z), (x, 0, ridge), (-x, 0, ridge)]
            self.face('roof-' + str(side), vertices, '#9da8ad')
            self.face('roof-underside-' + str(side), [(a, b, c - .09) for a, b, c in vertices], '#70858a')
            self.box('eave-fascia-' + str(side), (0, side * y, edge_z - .03), (width + 2 * overhang, .075, .13), '#386b5b')
        for side in (-1, 1):
            for near in (-1, 1):
                self.face(f'gable-fascia-{side}-{near}', [(side * x, near * y, edge_z), (side * x, 0, ridge),
                    (side * x, 0, ridge - .12), (side * x, near * y, edge_z - .12)], '#386b5b')
        self.anchors['ridge-center'] = (0, 0, ridge)


def clubhouse():
    m = Model('old-clubhouse-1950')
    m.box('enclosed-body', (0, 0, 1.5), (12, 8, 3), '#d9cfb3')
    for x in (-6, 6):
        m.face('gable-wall-' + str(x), [(x, -4, 3), (x, 4, 3), (x, 0, 4.2)], '#d9cfb3')
        for y in (-1.9, 1.9):
            m.window(f'gable-window-x{x}-y{y}', 'x', x + math.copysign(.015, x), y)
    m.window('front-main-window', 'y', -4.015, -3.1, 3.2, 1.0, 2.2)
    m.wall_panel('front-door', 'y', -4.018, -.45, .65, .15, 2.25, '#386b5b')
    m.window('front-door-glass', 'y', -4.03, .1, .65, 1.25, 2.05)
    m.wall_panel('front-serving-hatch', 'y', -4.02, 2.0, 4.65, 1.0, 2.05, '#3a5554')
    m.box('hatch-sill', (3.325, -4.25, 1.0), (2.85, .55, .10), '#a88759')
    m.face('front-awning', [(1.8, -4.01, 2.35), (4.85, -4.01, 2.35),
                          (4.85, -4.90, 2.05), (1.8, -4.90, 2.05)], '#386b5b')
    for x in (-3.4, 3.4):
        m.wall_panel('rear-high-vent-' + str(x), 'y', 4.02, x - .42, x + .42, 2.25, 2.60, '#386b5b')
        for z in (2.31, 2.40, 2.49):
            m.wall_panel(f'vent-grille-{x}-{z}', 'y', 4.03, x - .35, x + .35, z, z + .025, '#a9c4b7')
    m.box('front-bench-seat', (-3.0, -4.72, .5), (3.5, .55, .09), '#537b58')
    m.box('front-bench-back', (-3.0, -4.42, .86), (3.5, .08, .55), '#537b58')
    for x in (-4.4, -1.6):
        m.box('bench-leg-' + str(x), (x, -4.72, .23), (.13, .40, .46), '#6f705c')
    m.box('front-step-lower', (.1, -5.05, .075), (1.9, 1.2, .15), '#a6a090')
    m.box('front-step-upper', (.1, -4.60, .175), (1.7, .7, .35), '#bcb5a3')
    m.box('ball-crate', (1.55, -4.76, .28), (.65, .58, .56), '#386b5b')
    m.box('crate-open-top', (1.55, -4.76, .565), (.54, .47, .025), '#233d31')
    for ix in range(3):
        for iy in range(2):
            m.box(f'range-ball-{ix}-{iy}', (1.39 + ix * .16, -4.87 + iy * .19, .62), (.105, .105, .105), '#f4f0dd')
    m.gable_roof(12, 8, 3, 1.2)
    # One actual world component, never a separate left-side guess per view.
    m.box('ONE-brick-chimney', (-4, 0, 4.58), (.62, .62, 1.04), '#ad7154')
    m.box('chimney-cap', (-4, 0, 5.12), (.80, .80, .13), '#d7c9ad')
    m.box('chimney-opening', (-4, 0, 5.193), (.42, .42, .018), '#253338')
    m.anchors['chimney-ridge-location'] = (-4, 0, 4.2)
    m.anchors['front-door-entry'] = (.1, -4.1, .35)
    m.anchors['front-focus'] = (0, -7.5, 0)
    return m, {'body_dimensions_metres': [12, 8, 3], 'ridge_height_metres': 4.2,
        'chimney_world_location': [-4, 0, 4.2], 'brick_chimney_count': 1,
        'gable_end_windows': 'two fixed windows on each x=-6 and x=+6 gable end',
        'rear_vents': 'exactly two high vents on y=+4', 'front': 'y=-4; door/window/hatch/awning/bench/steps/crate',
        'guide_version': 2, 'scale_px_per_metre': 44,
        'identity_policy': 'Explicit parent single-world-coordinate brief; do not move chimney or substitute front details onto rear slivers.'}


def pavilion():
    m = Model('seated-pavilion-24-budget')
    m.box('raised-deck', (0, 0, .125), (8, 6, .25), '#ac9471')
    for ix, x in enumerate((-3.75, 0, 3.75)):
        for iy, y in enumerate((-2.75, 2.75)):
            m.box(f'post-{ix}-{iy}', (x, y, 1.435), (.18, .18, 2.37), '#c6b994')
    for y in (-2.75, 2.75):
        m.box('roof-support-beam-' + str(y), (0, y, 2.70), (8, .18, .16), '#b5a47c')
    for row, y in enumerate((-1.4, 0, 1.4)):
        m.box(f'bench-row-{row}-seat', (0, y, .66), (5.6, .45, .08), '#8e9d74')
        m.box(f'bench-row-{row}-back', (0, y + .26, .98), (5.6, .075, .53), '#7a8b61')
        for x in (-2.35, 0, 2.35):
            m.box(f'bench-row-{row}-leg-{x}', (x, y, .435), (.12, .33, .37), '#7a8064')
        for seat in range(8):
            x = (seat - 3.5) * .65
            m.anchors[f'seat-{row}-{seat}'] = (x, y, .70)
            m.anchors[f'seat-head-{row}-{seat}'] = (x, y, 1.52)
    for x in (-3.1, 3.1):
        m.box('rear-step-lower-' + str(x), (x, 3.60, .0625), (1.1, .8, .125), '#b5a17e')
        m.box('rear-step-upper-' + str(x), (x, 3.22, .125), (1.1, .55, .25), '#b5a17e')
        m.anchors['rear-entry-' + str(x)] = (x, 3.0, .25)
    m.gable_roof(8, 6, 2.8, .8, .3)
    m.anchors['audience-focus'] = (0, -6, 0)
    return m, {'deck_dimensions_metres': [8, 6], 'deck_top_metres': .25, 'post_count': 6,
        'eaves_height_metres_proxy': 2.8, 'ridge_height_metres_proxy': 3.6,
        'post_top_metres_proxy': 2.62, 'support_beam_center_metres_proxy': 2.70,
        'bench_rows': 3, 'seats_per_row_proposed': 8, 'seat_anchor_pitch_metres': .65,
        'bench_width_metres': 5.6, 'seat_anchor_height_metres': .70,
        'capacity_proposed': 24, 'capacity_validated': False,
        'seat_height_and_roof_height_are_design_hypotheses': True,
        'audience_facing_world_vector': [0, -1, 0], 'entries': 'two rear entries at x=±3.1,y=+3; rear steps; side aisles outside bench ends',
        'guide_version': 1, 'scale_px_per_metre': 56,
        'identity_policy': 'Technical proposed seating geometry only; capacity requires matching accepted native art and authored runtime seat/access metadata.'}


def rotate(points, quarter):
    angle = math.radians(quarter * 90)
    rotation = np.array([[math.cos(angle), -math.sin(angle), 0], [math.sin(angle), math.cos(angle), 0], [0, 0, 1]])
    return np.asarray(points, dtype=np.float64) @ rotation.T


def raster_triangle(canvas, depth_buffer, points, depths, color):
    xmin, ymin = np.maximum(np.floor(points.min(axis=0)).astype(int), 0)
    xmax, ymax = np.minimum(np.ceil(points.max(axis=0)).astype(int), CELL - 1)
    if xmax < xmin or ymax < ymin:
        return
    x, y = np.meshgrid(np.arange(xmin, xmax + 1) + .5, np.arange(ymin, ymax + 1) + .5)
    x0, y0 = points[0];x1, y1 = points[1];x2, y2 = points[2]
    denominator = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
    if abs(denominator) < 1e-10:
        return
    a = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / denominator
    b = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / denominator
    c = 1 - a - b
    z = a * depths[0] + b * depths[1] + c * depths[2]
    view = depth_buffer[ymin:ymax + 1, xmin:xmax + 1]
    visible = (a >= -1e-8) & (b >= -1e-8) & (c >= -1e-8) & (z > view)
    view[visible] = z[visible]
    canvas[ymin:ymax + 1, xmin:xmax + 1][visible] = color


def render(model, settings, kind):
    corner = kind == 'normal'
    cardinal = kind == 'cardinal'
    yaw = math.radians(-45 if corner else 0 if cardinal else 8)
    names = ('SE', 'SW', 'NW', 'NE') if corner else ('front-nose-DOWN', 'right-nose-RIGHT', 'rear-nose-UP', 'left-nose-LEFT') if cardinal else ('N', 'E', 'S', 'W')
    right = np.array([math.cos(yaw), math.sin(yaw), 0.0])
    down = np.array([math.sin(ALPHA) * math.sin(yaw), -math.sin(ALPHA) * math.cos(yaw), -math.cos(ALPHA)])
    toward = np.array([math.cos(ALPHA) * math.sin(yaw), -math.cos(ALPHA) * math.cos(yaw), math.sin(ALPHA)])
    sun = .8 * right - .7 * down + .9 * toward
    sun /= np.linalg.norm(sun)
    scale = settings['scale_px_per_metre']
    sheet = Image.new('RGBA', (2 * CELL, 2 * CELL))
    views = []
    for quarter, name in enumerate(names):
        transformed = [(face, rotate(face['vertices'], quarter)) for face in model.faces]
        all_points = np.vstack([points for _, points in transformed])
        projected = np.column_stack((all_points @ right, all_points @ down))
        center = (projected.min(axis=0) + projected.max(axis=0)) / 2
        offset = np.array([CELL / 2, CELL / 2]) - scale * center
        canvas = np.zeros((CELL, CELL, 4), dtype=np.uint8)
        zbuffer = np.full((CELL, CELL), -np.inf, dtype=np.float64)
        for face, points in transformed:
            projected = scale * np.column_stack((points @ right, points @ down)) + offset
            depth = points @ toward
            normal = np.cross(points[1] - points[0], points[2] - points[0])
            length = np.linalg.norm(normal)
            normal = normal / length if length else normal
            light = .67 + .33 * abs(float(normal @ sun))
            rgb = tuple(min(255, round(int(face['color'][i:i + 2], 16) * light)) for i in (1, 3, 5))
            for k in range(1, len(points) - 1):
                indices = [0, k, k + 1]
                raster_triangle(canvas, zbuffer, projected[indices], depth[indices], rgb + (255,))
        tile = Image.fromarray(canvas)
        sheet.paste(tile, ((quarter % 2) * CELL, (quarter // 2) * CELL))
        anchors = {}
        for key, point in model.anchors.items():
            rotated = rotate([point], quarter)[0]
            screen_m = [float(rotated @ right), float(rotated @ down)]
            local_px = scale * np.asarray(screen_m) + offset
            pixel = local_px + [(quarter % 2) * CELL, (quarter // 2) * CELL]
            anchors[key] = {'world_metres': point, 'rotated_world_metres': rotated.tolist(),
                'screen_projection_metres': screen_m, 'pixel': pixel.tolist(), 'depth_toward_camera': float(rotated @ toward),
                'visible_in_final_image': 'not asserted; complete coordinates include anchors occluded by roof/walls'}
        if not cardinal and settings.get('technical_labels', True):
            labels = ImageDraw.Draw(sheet)
            labels.text(((quarter % 2) * CELL + 20, (quarter // 2) * CELL + 20), f'{name}  TECHNICAL WORLD MODEL  {"45deg corner" if corner else "8deg yaw"} / 30deg down', fill=(40, 65, 55, 255))
        bbox = tile.getchannel('A').getbbox()
        walls = [('front', (0, -1, 0)), ('back', (0, 1, 0)),
                 ('left-gable-end', (-1, 0, 0)), ('right-gable-end', (1, 0, 0))]
        facing = sorted([(wall, float(rotate([normal], quarter)[0] @ toward)) for wall, normal in walls], key=lambda pair: -pair[1])
        facing = [wall for wall, dot in facing if dot > 1e-8]
        focus = rotate([(0, -1, 0)], quarter)[0]
        views.append({'view': name, 'object_rotation_degrees_about_Z': quarter * 90,
            'cell_box': [(quarter % 2) * CELL, (quarter // 2) * CELL, (quarter % 2 + 1) * CELL, (quarter // 2 + 1) * CELL],
            'scale_px_per_metre': scale, 'local_offset_px': offset.tolist(), 'object_bbox_local_px': bbox,
            'projected_anchors': anchors, 'main_wall_bottom_slope': math.sin(ALPHA) * math.tan(yaw),
            'main_wall_bottom_angle_screen_degrees': math.degrees(math.atan(math.sin(ALPHA) * math.tan(yaw))),
            'visible_body_walls': facing, 'dominant_wall': facing[0], 'secondary_wall': facing[1] if len(facing) > 1 else None,
            'front_details_belong_on_visible_secondary_wall': not corner and not cardinal and quarter == 1,
            'rear_vents_belong_on_visible_secondary_wall': not corner and not cardinal and quarter == 3,
            'projected_front_focus_direction': [float(focus @ right), float(focus @ down)]})
    folder = ART / 'generated' / model.name / 'guides'
    folder.mkdir(parents=True, exist_ok=True)
    stem = ('normal-world-v' if corner else 'cardinal-world-v' if cardinal else 'yaw8-world-v') + str(settings['guide_version'])
    png = folder / (stem + '.png');sheet.save(png)
    # SVG embeds the exact z-buffer output, avoiding approximate painter ordering.
    svg = folder / (stem + '.svg')
    svg.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600"><title>Technical world geometry only, never final art</title><image width="1600" height="1600" href="data:image/png;base64,' + base64.b64encode(png.read_bytes()).decode() + '"/></svg>\n', encoding='utf-8')
    calibration = {'purpose': 'technical single-world geometry only, never final sprites', 'model': model.name,
        'settings': settings, 'kind': kind, 'cell_order': [list(names[:2]), list(names[2:])],
        'camera_down_degrees': 30, 'camera_horizontal_offset_degrees': -45 if corner else 0 if cardinal else 8,
        'runtime_cardinal_yaw_metadata': None if corner else 0 if cardinal else -8,
        'basis': {'screen_right': right.tolist(), 'screen_down': down.tolist(), 'toward_camera': toward.tolist()},
        'coordinate_system': 'metres; front y=-depth/2; right x=+width/2; z up; ONE model rotated0/90/180/270 about z',
        'depth_handling': 'orthographic triangle rasterization, barycentric per-pixel depth, keep nearest; no average-depth painter guess',
        'svg_form': 'self-contained exact technical z-buffer raster; editable full world mesh is stored separately',
        'views': views, 'mesh_file': model.name + '-world-model-v' + str(settings['guide_version']) + '.json',
        'guide_code': {'path': str(Path(__file__)), 'sha256': digest(Path(__file__))},
        'outputs': [{'path': str(path), 'sha256': digest(path)} for path in (png, svg)],
        'capacity_validated': False if model.name.startswith('seated-') else None,
        'owner_approved': False, 'runtime_integrated': False}
    (folder / (stem + '.calibration.json')).write_text(json.dumps(calibration, indent=2) + '\n', encoding='utf-8')
    return str(png)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--asset', choices=('clubhouse', 'pavilion', 'both'), default='both')
    args = parser.parse_args()
    choices = [clubhouse, pavilion] if args.asset == 'both' else [clubhouse if args.asset == 'clubhouse' else pavilion]
    for factory in choices:
        model, settings = factory()
        folder = ART / 'generated' / model.name / 'guides';folder.mkdir(parents=True, exist_ok=True)
        world = {'model': model.name, 'settings': settings, 'faces': model.faces, 'anchors_world_metres': model.anchors,
            'components': model.components, 'technical_only': True, 'owner_approved': False, 'runtime_integrated': False}
        path = folder / (model.name + '-world-model-v' + str(settings['guide_version']) + '.json')
        path.write_text(json.dumps(world, indent=2) + '\n', encoding='utf-8')
        for kind in ('normal', 'yaw8'):
            print(render(model, settings, kind), flush=True)


if __name__ == '__main__':
    main()
