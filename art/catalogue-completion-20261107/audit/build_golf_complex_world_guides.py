"""Four complex golf SOURCE ART geometry references, never final sprites.

Exact existing placement plots bound proposed internal geometry. One fixed world
is rotated for all normal/yaw8 views. No source artwork/runtime is modified.
"""
import json
import math
from pathlib import Path

import numpy as np

import build_world_geometry_guides as world
from build_vehicle_camera_guides import common, cabin, cylinder_x

ROOT = world.ART
BATCH = ROOT / 'generated/golf-source-batch-01'
JOB_FILE = BATCH / 'job-index.json'
STEEL, WOOD, GREEN = '#8b9893', '#ad9671', '#476b57'


def beam(m, name, a, b, width=.08, color=STEEL):
    a, b = np.array(a, dtype=float), np.array(b, dtype=float)
    v = b - a
    v /= np.linalg.norm(v)
    other = np.array([0., 0., 1.]) if abs(v[2]) < .9 else np.array([0., 1., 0.])
    u = np.cross(v, other)
    u *= width / (2 * np.linalg.norm(u))
    t = np.cross(v, u)
    p = [tuple(c + s * u + r * t) for c in (a, b) for s, r in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for suffix, ids in [('cap-a', (0, 3, 2, 1)), ('cap-b', (4, 5, 6, 7)),
                        ('side-0', (0, 1, 5, 4)), ('side-1', (1, 2, 6, 5)),
                        ('side-2', (2, 3, 7, 6)), ('side-3', (3, 0, 4, 7))]:
        m.face(name + '/' + suffix, [p[i] for i in ids], color)
    m.anchors[name + '/a'], m.anchors[name + '/b'] = tuple(a), tuple(b)


def base(job):
    return world.Model('golf-source-batch-01/native/' + job)


def tv_tower():
    m = base('golf-source-01-02-tv-camera-tower')
    for x in (-.82, .82):
        for y in (-.82, .82):
            m.box(f'scaffold-leg-{x}-{y}', (x, y, 2.0), (.10, .10, 4.0), STEEL)
            m.box(f'individual-foot-{x}-{y}', (x, y, .045), (.23, .23, .09), STEEL)
    for side in (-1, 1):
        m.wall_panel('windscreen-y-' + str(side), 'y', side * .80, -.80, .80, .35, 3.77, GREEN)
        m.wall_panel('windscreen-x-' + str(side), 'x', side * .80, -.80, .80, .35, 3.77, GREEN)
        for a, b in [((-.82, side * .87, .35), (.82, side * .87, 3.75)),
                     ((.82, side * .87, .35), (-.82, side * .87, 3.75)),
                     ((side * .87, -.82, .35), (side * .87, .82, 3.75)),
                     ((side * .87, .82, .35), (side * .87, -.82, 3.75))]:
            beam(m, 'outer-cross-brace-' + str(a), a, b, .065)
    m.box('actual-platform-deck-not-ground', (0, 0, 3.94), (1.90, 1.90, .12), WOOD)
    for x in (-.88, .88):
        for y in (-.88, .88):
            beam(m, f'guard-post-{x}-{y}', (x, y, 4), (x, y, 4.90), .07)
    for z in (4.45, 4.88):
        for x in (-.88, .88):
            beam(m, f'side-guard-{x}-{z}', (x, -.88, z), (x, .88, z), .06)
        beam(m, 'rear-guard-' + str(z), (-.88, .88, z), (.88, .88, z), .06)
        beam(m, 'front-guard-left-' + str(z), (-.88, -.88, z), (.30, -.88, z), .06)
    # One fixed front/right ladder, never moved to a convenient visible face.
    for x in (.39, .81):
        beam(m, 'front-ladder-rail-' + str(x), (x, -.96, .06), (x, -.96, 4.86), .055)
    for i in range(14):
        beam(m, 'front-ladder-rung-' + str(i), (.39, -.96, .20 + i * .29), (.81, -.96, .20 + i * .29), .045)
    for i, foot in enumerate([(-.48, -.40, 4), (.30, -.38, 4), (-.12, .35, 4)]):
        beam(m, 'camera-tripod-leg-' + str(i), foot, (-.12, -.08, 4.75), .065, '#303d3d')
    m.box('camera-body', (-.12, -.10, 5.02), (.45, .77, .36), '#566361')
    m.box('camera-front-lens-housing', (-.12, -.62, 5.02), (.32, .30, .29), '#293c3d')
    m.wall_panel('camera-front-lens-dark-face', 'y', -.781, -.235, -.005, 4.92, 5.12, '#102a30')
    m.box('camera-top-viewfinder', (-.12, .04, 5.30), (.20, .29, .19), '#61716a')
    m.box('fixed-equipment-case', (.49, .46, 4.26), (.56, .53, .52), '#647761')
    m.anchors.update({'camera-lens': (-.12, -.781, 5.02), 'camera-aim-point': (-.12, -2.0, 5.02),
        'ladder-foot': (.60, -.96, 0), 'ladder-platform-entry': (.60, -.88, 4),
        'case-centre': (.49, .46, 4.26), 'ground-origin': (0, 0, 0)})
    return m, {'scale_px_per_metre': 107, 'fixedIdentity': 'One2x2m tower, platform z4m; front/right ladder, rear/right case, lens points front-Y.',
               'feature_vectors': {'camera_aim': [0, -1, 0]}}


def rain_cap(m, name, cx, width, eaves, rise):
    x0, x1, depth = cx - width / 2, cx + width / 2, .48
    for sign in (-1, 1):
        m.face(name + '-' + str(sign), [(x0, sign * depth, eaves), (x1, sign * depth, eaves),
                                       (x1, 0, eaves + rise), (x0, 0, eaves + rise)], '#8d958e')
    m.anchors[name + '/ridge'] = (cx, 0, eaves + rise)


def leaderboard():
    m = base('golf-source-01-09-main-leaderboard')
    for x in (-3.25, 0, 3.25):
        m.box('board-support-' + str(x), (x, .02, 2.36), (.16, .20, 4.72), WOOD)
        beam(m, 'fixed-rear-brace-' + str(x), (x, 1.60, .06), (x, .20, 3.76), .17, WOOD)
    m.box('blank-board-body', (0, 0, 3.15), (6.65, .30, 2.65), GREEN)
    for z in np.arange(1.90, 4.43, .22):
        m.box('rear-slat-backing-' + str(z), (0, .17, float(z)), (6.60, .065, .12), '#607057')
    for x in np.linspace(-3.12, 3.12, 15):
        m.box('front-white-grid-v-' + str(x), (float(x), -.169, 3.15), (.025, .022, 2.37), '#e4e1c7')
    for z in np.linspace(1.97, 4.33, 9):
        m.box('front-white-grid-h-' + str(z), (0, -.170, float(z)), (6.24, .023, .025), '#e4e1c7')
    m.box('actual-service-platform', (0, -.73, 1.16), (7.65, 1.02, .16), WOOD)
    for x in (-3.68, -1.20, 1.20, 3.68):
        m.box('deck-leg-' + str(x), (x, -.94, .55), (.15, .16, 1.10), WOOD)
    for x in np.arange(-3.68, 2.71, .50):
        beam(m, 'front-rail-post-' + str(x), (float(x), -1.22, 1.24), (float(x), -1.22, 2.10), .07, WOOD)
    beam(m, 'front-service-rail', (-3.72, -1.22, 2.10), (2.73, -1.22, 2.10), .08, WOOD)
    # Staircase ONLY at +X. It must change apparent screen end in rear views.
    for i in range(6):
        z = (i + 1) * .20
        y = -1.82 + i * .235
        m.box('right-stair-tread-' + str(i), (3.28, y, z - .045), (1.05, .27, .09), WOOD)
    for x in (2.73, 3.83):
        beam(m, 'right-stair-stringer-' + str(x), (x, -1.96, .04), (x, -.46, 1.20), .11, WOOD)
        beam(m, 'right-stair-handrail-' + str(x), (x, -1.96, .84), (x, -.46, 2.04), .075, WOOD)
        for y, z in [(-1.90, .10), (-.52, 1.20)]:
            beam(m, f'right-stair-post-{x}-{y}', (x, y, z), (x, y, z + .82), .07, WOOD)
    for name, cx, width, eaves in [('cap-left', -2.25, 2.50, 4.62), ('cap-centre', 0, 2.75, 4.92), ('cap-right', 2.25, 2.50, 4.62)]:
        rain_cap(m, name, cx, width, eaves, .28)
    for x in (-2.85, 2.85):
        beam(m, 'fixed-flag-pole-' + str(x), (x, 0, 4.85), (x, 0, 5.72), .05, WOOD)
        m.face('fixed-green-flag-' + str(x), [(x, 0, 5.67), (x + .60, 0, 5.50), (x, 0, 5.31)], GREEN)
    m.anchors.update({'right-stair-foot': (3.28, -1.96, 0), 'right-stair-landing': (3.28, -.46, 1.20),
        'front-score-grid-centre': (0, -.17, 3.15), 'rear-brace-centre': (0, 1.60, .06),
        'left-flag-root': (-2.85, 0, 4.85), 'right-flag-root': (2.85, 0, 4.85), 'ground-origin': (0, 0, 0)})
    return m, {'scale_px_per_metre': 65, 'fixedIdentity': 'Front grid-Y; rear slats/braces+Y; one staircase permanently+X; front deck-Y; three rain caps and exactly2flags.',
               'feature_vectors': {'scoreboard_front': [0, -1, 0], 'stairs_up': [0, 1, 0]}}


def entrance():
    m = base('golf-source-01-06-four-lane-entrance')
    bounds = [-5.60, -3.00, -.40, 2.20, 5.60]
    for i, x in enumerate(bounds):
        for y in (-1.85, 1.85):
            m.box(f'divider-post-{i}-{y}', (x, y, .58), (.12, .12, 1.16), GREEN)
            m.box(f'individual-post-foot-{i}-{y}', (x, y, .025), (.22, .22, .05), STEEL)
        for z in (.45, 1.10):
            beam(m, f'lane-divider-{i}-{z}', (x, -1.85, z), (x, 1.85, z), .065, GREEN)
    lane_ids = []
    for i, x in enumerate([-4.30, -1.70, .90]):
        m.box('manual-turnstile-pedestal-' + str(i + 1), (x, 0, .55), (.40, .46, 1.10), GREEN)
        for arm in range(3):
            a = math.radians(-90 + arm * 120)
            beam(m, f'manual-turnstile-{i + 1}-arm-{arm}', (x, 0, 1.08),
                 (x + .78 * math.cos(a), .78 * math.sin(a), 1.08), .065)
        m.anchors['manual-lane-' + str(i + 1)] = (x, -.95, 0)
        lane_ids.append({'lane': i + 1, 'type': 'manual-turnstile', 'x_bounds_metres': bounds[i:i + 2]})
    for z in (.25, 1.08):
        beam(m, 'wide-access-gate-rail-' + str(z), (2.30, -.14, z), (5.46, -.14, z), .065, GREEN)
    for x in np.linspace(2.30, 5.46, 8):
        beam(m, 'wide-access-gate-bar-' + str(x), (float(x), -.14, .25), (float(x), -.14, 1.08), .045, GREEN)
    m.anchors.update({'accessible-lane': (3.88, -.95, 0), 'accessible-gate-hinge': (2.30, -.14, .65),
                      'accessible-gate-latch': (5.46, -.14, .65), 'ground-origin': (0, 0, 0)})
    lane_ids.append({'lane': 4, 'type': 'wider-accessible-swing-gate', 'x_bounds_metres': bounds[3:5],
                     'hinge_fixed_on': 'left divider x2.30, never moves to opposite end'})
    for x in (-5.60, 5.60):
        m.box('overhead-sign-post-' + str(x), (x, .35, 1.85), (.19, .19, 3.70), WOOD)
    m.box('overhead-blank-sign-frame', (0, .35, 3.30), (11.35, .22, .83), GREEN)
    m.wall_panel('front-blank-sign-face', 'y', .225, -5.43, 5.43, 3.03, 3.57, '#ddd4ba')
    for z in (3.05, 3.50):
        m.box('rear-sign-backing-slat-' + str(z), (0, .485, z), (11.10, .055, .09), WOOD)
    return m, {'scale_px_per_metre': 67, 'fixedIdentity': 'Exactly4lanes acrossX:3manual turnstiles then1wider swing gate at+X. No ground slab. Sign frame only, no added roof required by brief.',
               'lane_layout': lane_ids, 'ground_slab_present': False,
               'feature_vectors': {'admission_front': [0, -1, 0], 'accessible_gate_hinge_to_latch': [1, 0, 0]}}


def transformed_copy(target, child, name, offset):
    o = np.array(offset, dtype=float)
    for face in child.faces:
        target.face(name + '/' + face['name'], [(np.array(p) + o).tolist() for p in face['vertices']], face['color'])
    for key, p in child.anchors.items():
        target.anchors[name + '/' + key] = tuple(np.array(p) + o)
    target.components.append({'name': name, 'kind': 'fixed-subassembly', 'origin_metres': offset,
                              'source_components': child.components})


def dish(m, centre, radius=.90):
    centre = np.array(centre, dtype=float)
    aim = np.array([.25, -.55, .797], dtype=float)
    aim /= np.linalg.norm(aim)
    u = np.cross(aim, [0, 0, 1])
    u /= np.linalg.norm(u)
    v = np.cross(aim, u)
    # Concave single dish; rim lies toward aim, not a new guessed shape per cell.
    for ring in range(4):
        r0, r1 = radius * ring / 4, radius * (ring + 1) / 4
        for i in range(24):
            a0, a1 = 2 * math.pi * i / 24, 2 * math.pi * (i + 1) / 24
            pts = [centre + r * (math.cos(a) * u + math.sin(a) * v) + aim * .22 * (r / radius) ** 2
                   for r, a in [(r0, a0), (r1, a0), (r1, a1), (r0, a1)]]
            if ring == 0:
                pts = pts[1:] + [centre]
            m.face(f'ONE-fixed-roof-dish-{ring}-{i}', [p.tolist() for p in pts], '#c7c8b5')
    beam(m, 'dish-feed-arm', centre - radius * v, centre + aim * .58, .045, STEEL)
    m.anchors['dish-centre'] = tuple(centre)
    m.anchors['dish-aim-point'] = tuple(centre + aim * 2)
    return aim.tolist()


def compound():
    m = base('golf-source-01-03-broadcast-compound')
    truck = world.Model('period-broadcast-box-truck')
    common(truck, 10.0, 2.80, 1.22, 6.25, .51, GREEN)
    cabin(truck, -3.95, -2.48, -3.52, -2.54, 2.58, 2.30, 1.22, 2.82, '#ccc2a4')
    truck.box('broadcast-box-body', (0, 1.0, 2.23), (2.80, 7.40, 2.10), '#d5cbb0')
    for x in (-1.414, 1.414):
        truck.wall_panel('side-door-' + str(x), 'x', x, -.65, .35, .82, 2.85, GREEN)
        for y in (1.10, 2.20, 3.30):
            truck.wall_panel(f'side-equipment-window-{x}-{y}', 'x', x, y - .43, y + .43, 1.92, 2.52, '#527782')
    truck.box('rear-door-seam', (0, 4.714, 2.20), (.04, .02, 1.94), GREEN)
    for y in (-.25, 3.30):
        truck.box('roof-HVAC-' + str(y), (0, y, 3.43), (1.05, .85, .30), '#9eaa9b')
    for i in range(3):
        truck.box('fixed-right-service-step-' + str(i), (2.08 - i * .23, -.15, .18 + i * .26), (.30, .82, .10), STEEL)
    transformed_copy(m, truck, 'truck-fixed-left', (-7.0, 0, 0))
    van = world.Model('period-uplink-panel-van')
    common(van, 6.20, 2.25, 1.02, 3.70, .37, GREEN)
    van.box('van-rear-body', (0, 1.0, 1.78), (2.25, 4.20, 1.62), '#d7ccb0')
    cabin(van, -2.88, -1.10, -2.40, -1.10, 2.16, 2.02, 1.02, 2.58, '#d7ccb0')
    van.box('roof-dish-pedestal', (0, 1.15, 2.84), (.26, .30, .50), STEEL)
    van.box('roof-HVAC', (0, -.50, 2.76), (.86, .83, .28), '#9baa9b')
    transformed_copy(m, van, 'van-fixed-rear-right', (4.50, 4.0, 0))
    aim = dish(m, (4.50, 5.15, 3.15))
    m.box('generator-body-fixed-front-right', (6.15, -5.0, 1.0), (3.10, 1.85, 1.45), '#6e795a')
    for x in (5.0, 7.30):
        for y in (-5.65, -4.35):
            m.box(f'generator-foot-{x}-{y}', (x, y, .20), (.24, .24, .40), '#666e5c')
    for x in np.linspace(5.0, 7.30, 10):
        m.box('generator-front-vent-' + str(x), (float(x), -5.938, 1.03), (.07, .025, .83), '#344638')
    m.box('equipment-workbench-top', (2.55, -4.40, .97), (2.95, 1.18, .13), WOOD)
    for x in (1.23, 3.87):
        for y in (-4.88, -3.92):
            m.box(f'workbench-leg-{x}-{y}', (x, y, .45), (.13, .13, .90), WOOD)
    m.box('bench-red-toolbox', (1.85, -4.40, 1.21), (.82, .60, .36), '#a46650')
    m.box('bench-grey-equipment', (3.16, -4.40, 1.24), (.90, .66, .42), '#91998b')
    cylinder_x(m, 'fixed-cable-reel-core', (.65, -6.0, .84), .57, .85, '#303d3b')
    for x in (.16, 1.14):
        cylinder_x(m, 'fixed-reel-flange-' + str(x), (x, -6.0, .84), .76, .07, '#9e8a62')
        beam(m, 'fixed-reel-support-a-' + str(x), (x, -6.74, .04), (x, -6, .84), .09, STEEL)
        beam(m, 'fixed-reel-support-b-' + str(x), (x, -5.26, .04), (x, -6, .84), .09, STEEL)
    route = [(1.0, -5.95, .08), (2.0, -6.1, .08), (3.6, -5.9, .08), (4.8, -5.4, .08)]
    for i in range(len(route) - 1):
        beam(m, 'generator-cable-' + str(i), route[i], route[i + 1], .05, '#263c36')
    m.anchors.update({'truck-origin': (-7, 0, 0), 'van-origin': (4.50, 4, 0),
        'generator-centre': (6.15, -5, 1), 'workbench-centre': (2.55, -4.40, .97),
        'cable-reel-centre': (.65, -6, .84), 'front-open-service-gap': (-2.0, -7.6, 0), 'ground-origin': (0, 0, 0)})
    return m, {'scale_px_per_metre': 29, 'fixedIdentity': 'Exactly2period vehicles: truck left-X, van rear/right+X/+Y; both nose-Y. Generator front/right, bench/reel positions fixed; front service gap remains open; no slab.',
               'feature_vectors': {'truck_nose': [0, -1, 0], 'van_nose': [0, -1, 0], 'dish_aim': aim},
               'front_service_gap_metres': {'x': [-4.0, -.10], 'y': [-8.8, -3.2]}, 'ground_slab_present': False}


def main():
    jobs = {j['jobId']: j for j in json.loads(JOB_FILE.read_text())['jobs']}
    index = []
    for factory in (tv_tower, leaderboard, entrance, compound):
        m, settings = factory()
        job_id = m.name.split('/')[-1]
        job = jobs[job_id]
        plot = job['runtimeTarget']['footprintMetres']
        settings.update({'guide_version': 1, 'technical_labels': False, 'source_only': True,
            'placement_plot_metres': plot, 'internal_dimensions_are_design_proposals': True,
            'exact_native_calibration_or_runtime_acceptance_claimed': False})
        folder = ROOT / 'generated' / m.name / 'guides'
        if (folder / 'normal-world-v1.png').exists() or (folder / 'yaw8-world-v1.png').exists():
            raise RuntimeError('Existing guide version preserved: ' + str(folder))
        folder.mkdir(parents=True, exist_ok=True)
        mesh_path = folder / (job_id + '-world-model-v1.json')
        points = np.array([p for f in m.faces for p in f['vertices']])
        low, high = points.min(axis=0), points.max(axis=0)
        if max(abs(low[0]), abs(high[0])) > plot['width'] / 2 + 1e-8 or max(abs(low[1]), abs(high[1])) > plot['depth'] / 2 + 1e-8:
            raise RuntimeError('Proposed component exceeds exact plot: ' + job_id)
        mesh_path.write_text(json.dumps({'model': job_id, 'settings': settings, 'faces': m.faces,
            'anchors_world_metres': m.anchors, 'components': m.components, 'model_bounds_metres': {'min': low.tolist(), 'max': high.tolist()},
            'technical_only': True, 'final_native_art_approved': False, 'runtime_integrated': False}, indent=2) + '\n', encoding='utf-8')
        outputs = {}
        for family in ('normal', 'yaw8'):
            png = Path(world.render(m, settings, family))
            cal_file = folder / (family + '-world-v1.calibration.json')
            cal = json.loads(cal_file.read_text())
            cal['model'], cal['mesh_file'], cal['mesh_sha256'] = job_id, mesh_path.name, world.digest(mesh_path)
            cal['source_brief'] = {'file': str(JOB_FILE), 'sha256': world.digest(JOB_FILE), 'jobId': job_id,
                                    'functionalIdentity': job['functionalIdentity']}
            cal['generator'] = {'file': str(Path(__file__)), 'sha256': world.digest(Path(__file__))}
            cal['scope'] = 'Fixed-layout proposed source-art guide only; no native image acceptance, per-view calibration, alias or runtime integration.'
            for view in cal['views']:
                theta = view['object_rotation_degrees_about_Z']
                beta = cal['camera_horizontal_offset_degrees']
                view['runtime_heading_degrees_if_local_basis_x_minus_y'] = (beta - theta - 45) % 360
                view['runtime_basis_note'] = 'Only if runtime local=(guide x,-guide y); source-camera labels are not object yaw labels.'
                right = np.array(cal['basis']['screen_right'])
                down = np.array(cal['basis']['screen_down'])
                view['projected_fixed_feature_vectors'] = {}
                for name, vector in settings.get('feature_vectors', {}).items():
                    r = world.rotate([vector], theta / 90)[0]
                    view['projected_fixed_feature_vectors'][name] = {'guide_world_vector': vector,
                        'rotated_world_vector': r.tolist(), 'screen_vector': [float(r @ right), float(r @ down)]}
            cal_file.write_text(json.dumps(cal, indent=2) + '\n', encoding='utf-8')
            outputs[family] = {'png': str(png), 'sha256': world.digest(png), 'calibration': str(cal_file)}
        brief = {'jobId': job_id, 'functionalIdentity': job['functionalIdentity'], 'exact_placement_plot_metres': plot,
            'model_bounds_metres': {'min': low.tolist(), 'max': high.tolist()}, 'fixedIdentity': settings['fixedIdentity'],
            'geometry_is_proposed_not_measured_native': True, 'ground_plate': False,
            'world_convention': 'x right, y rear, z up; model front-Y. Rotate entire mesh, never relocate features for visibility.',
            'source_art_modified': False, 'runtime_modified': False, 'outputs': outputs}
        (folder / 'design-brief-v1.json').write_text(json.dumps(brief, indent=2) + '\n', encoding='utf-8')
        index.append(brief)
        print(json.dumps({'jobId': job_id, 'guides': str(folder)}), flush=True)
    (BATCH / 'complex-world-guide-index-v1.json').write_text(json.dumps({'source_only': True, 'count': 4, 'jobs': index}, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
