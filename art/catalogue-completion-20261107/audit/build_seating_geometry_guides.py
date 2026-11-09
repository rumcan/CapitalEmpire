"""Proposed seating technical references only. No runtime or final-art output."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ART = Path(__file__).resolve().parent.parent
DESIGN = ART / 'plan/seating-world-designs-20261107.json'
SPEC = json.loads(DESIGN.read_text(encoding='utf-8'))
shared_path = Path(__file__).with_name('build_world_geometry_guides.py')
loader = importlib.util.spec_from_file_location('world_technical', shared_path)
world = importlib.util.module_from_spec(loader)
loader.loader.exec_module(world)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')


def beam(model, name, start, end, width, color):
    a, b = np.array(start, float), np.array(end, float)
    direction = b - a
    direction /= np.linalg.norm(direction)
    helper = np.array([0, 0, 1.0]) if abs(direction[2]) < .9 else np.array([0, 1.0, 0])
    u = np.cross(direction, helper);u /= np.linalg.norm(u)
    v = np.cross(direction, u)
    points = [point + width / 2 * (su * u + sv * v) for point in (a, b) for su, sv in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
    for k, face in enumerate([(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]):
        model.face(name + '/' + str(k), [points[i].tolist() for i in face], color)
    model.components.append({'name': name, 'kind': 'manufactured-beam', 'start': start, 'end': end, 'width': width})


def prism(model, name, vertices, extrusion, color):
    a = np.array(vertices, float);b = a + np.array(extrusion, float)
    model.face(name + '/front', a.tolist(), color)
    model.face(name + '/rear', b[::-1].tolist(), color)
    for i in range(len(a)):
        j = (i + 1) % len(a)
        model.face(name + '/edge-' + str(i), [a[i].tolist(), a[j].tolist(), b[j].tolist(), b[i].tolist()], color)


def rounded_rectangle(width, height, radius):
    x, y, r = width / 2, height / 2, radius
    return [(-x + r, -y), (x - r, -y), (x, -y + r), (x, y - r),
            (x - r, y), (-x + r, y), (-x, y - r), (-x, -y + r)]


def chair(model, name, x, y, floor):
    spec = SPEC['upgraded_chair_prototype']
    width, depth, thick = spec['seat_width_metres'], spec['seat_depth_metres'], spec['shell_thickness_metres']
    pan = [(x + u, y + v, floor + .45 - thick) for u, v in rounded_rectangle(width, depth, .04)]
    prism(model, name + '/molded-seat-pan', pan, (0, 0, thick), '#e9e0c6')
    back = []
    for u, v in rounded_rectangle(.48, .45, .04):
        t = (v + .225) / .45
        back.append((x + u, y + .20 + .08 * t, floor + .55 + .45 * t))
    prism(model, name + '/molded-back', back, (0, .035, 0), '#e9e0c6')
    # Separate steel brackets per actual chair; row beam is shared, shells never merge.
    for sign in (-1, 1):
        beam(model, name + '/mount-' + str(sign), (x + sign * .16, y - .10, floor + .28),
             (x + sign * .16, y + .20, floor + .43), .035, '#315f4c')
    model.components.append({'name': name, 'kind': 'individual-1985-molded-chair', 'seat_world': [x, y, floor + .45],
                             'prototype': spec['prototype_key'], 'release_anchor': False})


def bench(model, name, center_x, y, floor, width, tier):
    color = '#82916b' if tier == 'budget' else '#e4dac0'
    model.box(name + '/seat-board', (center_x, y, floor + .41), (width, .45, .08), color)
    model.box(name + '/back-board', (center_x, y + .26, floor + .735), (width, .075, .53), color)
    for x in np.linspace(center_x - width / 2 + .35, center_x + width / 2 - .35, max(3, math.ceil(width / 2.4))):
        model.box(name + '/leg-' + str(round(float(x), 3)), (float(x), y, floor + .185), (.12, .33, .37), '#64725a')


def populate_seating(model, design):
    tier = design['condition']
    seats = design['proposed_seat_centres']
    for row in range(design.get('seat_rows', design.get('rows'))):
        row_seats = [seat for seat in seats if seat['row'] == row]
        x = sum(seat['world_metres'][0] for seat in row_seats) / len(row_seats)
        y, seat_height = row_seats[0]['world_metres'][1:]
        floor = seat_height - .45
        pitch = design['seat_pitch_metres']
        board_width = design.get('bench_board_width_metres_proxy', len(row_seats) * pitch)
        if tier == 'budget':
            bench(model, 'bench-row-' + str(row), x, y, floor, board_width, tier)
        else:
            model.box('steel-row-beam-' + str(row), (x, y + .05, floor + .25), (len(row_seats) * pitch, .09, .12), '#315f4c')
            for seat in row_seats:
                sx, sy, sz = seat['world_metres']
                chair(model, f'chair-{row}-{seat["place"]}', sx, sy, sz - .45)
            for sx in np.linspace(x - board_width / 2 + .35, x + board_width / 2 - .35, max(3, math.ceil(board_width / 2.4))):
                model.box('row-pedestal-' + str(row) + '-' + str(round(float(sx), 3)), (float(sx), y + .05, floor + .125), (.10, .22, .25), '#315f4c')
        for seat in row_seats:
            sx, sy, sz = seat['world_metres']
            key = f'proposed-seat-{seat["row"]}-{seat["place"]}'
            model.anchors[key] = (sx, sy, sz)
            model.anchors[key + '/head'] = (sx, sy, sz + .82)


def pavilion(design):
    model = world.Model(design['design_key'])
    width, depth = design['footprint_metres']
    tier = design['condition'];budget = tier == 'budget'
    timber, frame = ('#b7a786', '#527158') if budget else ('#e5ddc8', '#315f4c')
    eaves, rise = design['roof_eaves_metres_proxy'], design['roof_rise_metres_proxy']
    model.box('raised-deck', (0, 0, .125), (width, depth, .25), '#a68f6c' if budget else '#c8b78f')
    post_y = max(abs(y) for _, y in design['post_world_xy'])
    roof_at_post = eaves + rise * (depth / 2 - post_y) / (depth / 2)
    beam_top = roof_at_post - .10
    beam_center = beam_top - .09
    post_top = beam_center - .09
    for i, (x, y) in enumerate(design['post_world_xy']):
        model.box('roof-post-' + str(i), (x, y, (.25 + post_top) / 2), (.18 if budget else .14, .18 if budget else .14, post_top - .25), timber)
    for y in (-post_y, post_y):
        model.box('longitudinal-eave-beam-' + str(y), (0, y, beam_center), (width - .35, .18, .18), frame)
    xstations = sorted(set(x for x, _ in design['post_world_xy']))
    for station, x in enumerate(xstations):
        beam(model, f'truss-{station}/bottom-chord', (x, -post_y, beam_center), (x, post_y, beam_center), .12, frame)
        beam(model, f'truss-{station}/front-rafter', (x, -post_y, roof_at_post - .13), (x, 0, eaves + rise - .13), .10, frame)
        beam(model, f'truss-{station}/back-rafter', (x, 0, eaves + rise - .13), (x, post_y, roof_at_post - .13), .10, frame)
        beam(model, f'truss-{station}/king-post', (x, 0, beam_center), (x, 0, eaves + rise - .13), .09, frame)
        for side in (-1, 1):
            beam(model, f'truss-{station}/web-{side}', (x, side * post_y * .62, beam_center), (x, 0, eaves + rise - .13), .075, frame)
    populate_seating(model, design)
    for i, entry in enumerate(design['proposed_rear_entries']):
        x, _, z = entry['world_metres']
        model.box('rear-step-lower-' + str(i), (x, depth / 2 + .60, .0625), (1.1, .8, .125), timber)
        model.box('rear-step-upper-' + str(i), (x, depth / 2 + .22, .125), (1.1, .55, .25), timber)
        model.anchors['proposed-rear-entry-' + str(i)] = (x, depth / 2, z)
    model.gable_roof(width, depth, eaves, rise, .3)
    if budget:
        for i, x in enumerate(np.arange(-width / 2, width / 2 + .001, .40)):
            for side in (-1, 1):
                edge_z = eaves - rise * .3 / (depth / 2)
                beam(model, f'corrugated-roof-rib-{i}-{side}', (float(x), side * (depth / 2 + .3), edge_z + .026),
                     (float(x), 0, eaves + rise + .026), .022, '#bac0bd')
    else:
        for face in model.faces:
            if face['name'].startswith('roof-'):
                face['color'] = '#ede5d1' if 'underside' not in face['name'] else '#c8c5b3'
    model.anchors['proposed-audience-focus'] = (0, -depth / 2 - 3, 0)
    return model


def bleacher(design):
    model = world.Model(design['design_key'])
    tier = design['condition'];frame = '#647268' if tier == 'budget' else '#315f4c'
    platform = '#b0a286' if tier == 'budget' else '#c1c7bb'
    for row, floor in enumerate(design['row_platform_heights_metres']):
        y = -1.5 + row * .60
        model.box('tier-platform-' + str(row), (-.60, y, floor - .05), (6.4, .60, .10), platform)
        # Bridge the clearance between row platform and the side-stair tread;
        # leaving the nominal zones separated must not create a physical gap.
        model.box('row-access-landing-' + str(row), (2.65, y, floor - .05), (.30, .30, .10), platform)
        for x in (-3.45, -.65, 2.25):
            model.box(f'tier-support-{row}-{x}', (x, y, (floor - .10) / 2), (.10, .10, floor - .10), frame)
    populate_seating(model, design)
    for step in range(12):
        top = (step + 1) * .16
        y = -1.95 + step * .30 + .15
        model.box('side-stair-tread-' + str(step), (3.25, y, top - .04), (1.1, .30, .08), platform)
        model.box('side-stair-riser-' + str(step), (3.25, y - .15, top - .08), (1.1, .06, .16), frame)
        model.anchors['proposed-stair-step-' + str(step)] = (3.25, y, top)
        if step % 2:
            row = step // 2
            model.anchors['proposed-row-access-' + str(row)] = (2.65, -1.5 + row * .60, top)
    for y, floor in [(-1.8, .16), (-.6, .8), (.6, 1.44), (1.5, 1.92)]:
        model.box('outer-stair-handrail-post-' + str(y), (3.94, y, floor + .50), (.065, .065, 1.0), frame)
    beam(model, 'outer-stair-handrail', (3.94, -1.95, 1.10), (3.94, 1.80, 3.02), .065, frame)
    beam(model, 'left-safety-rail', (-3.94, -1.80, 1.42), (-3.94, 1.90, 3.02), .065, frame)
    beam(model, 'rear-safety-rail', (-3.94, 1.92, 3.02), (3.94, 1.92, 3.02), .065, frame)
    for x in (-3.94, -.6, 2.5, 3.94):
        model.box('rear-rail-post-' + str(x), (x, 1.92, 2.47), (.065, .065, 1.10), frame)
    model.anchors['proposed-ground-stair-entry'] = tuple(design['stair_entry_world_metres'])
    model.anchors['proposed-audience-focus'] = (0, -5, 0)
    return model


def plan_view(model, design, folder, version):
    width, depth = design['footprint_metres']
    scale = min(1100 / (width + 2), 800 / (depth + 2.5))
    image = Image.new('RGBA', (1200, 1000), '#f7f4e8');draw = ImageDraw.Draw(image)
    def point(x, y):
        return (600 + scale * x, 500 - scale * y)
    def rect(x0, y0, x1, y1, fill, outline='#64715f'):
        draw.rectangle([point(x0, y1), point(x1, y0)], fill=fill, outline=outline, width=2)
    rect(-width / 2, -depth / 2, width / 2, depth / 2, '#ded4b8')
    for seat in design['proposed_seat_centres']:
        x, y, z = seat['world_metres']
        rect(x - .24, y - .23, x + .24, y + .23, '#f1e9d4' if design['condition'] == 'upgraded' else '#83946d')
        draw.text(point(x - .12, y + .07), str(seat['row'] * design.get('places_per_row', 10) + seat['place'] + 1), fill='#263e32')
    for x, y in design.get('post_world_xy', []):
        rect(x - .10, y - .10, x + .10, y + .10, '#77674f')
    if 'single_side_stair_zone_x_metres' in design:
        low, high = design['single_side_stair_zone_x_metres']
        rect(low, -1.95, high, 1.65, '#b3bdb6')
    else:
        for entry in design['proposed_rear_entries']:
            x, y, z = entry['world_metres'];rect(x - .55, y, x + .55, y + 1.0, '#b3bdb6')
    draw.text((20, 20), f'{model.name}: {design["capacity_target"]} PROPOSED places — TECHNICAL PLAN ONLY', fill='#263e32')
    draw.text((20, 42), 'Top is rear (+y). Bottom is audience/front (-y). Not released runtime anchors or art approval.', fill='#263e32')
    path = folder / f'seating-top-plan-v{version}.png';image.save(path)
    return path


def main():
    for previous in SPEC['existing_24_budget_v1_preservation']:
        assert sha(Path(previous['path'])) == previous['sha256']
    designs = SPEC['pavilion_designs'] + SPEC['compact_bleacher_designs']
    results = []
    prototype = world.Model('molded-chair-1985-cream-green')
    chair(prototype, 'one-chair', 0, 0, 0)
    proto_folder = ART / 'generated/seating-reference-models';proto_folder.mkdir(parents=True, exist_ok=True)
    prototype_path = proto_folder / 'molded-chair-1985-cream-green-v1.json'
    save(prototype_path, {'specification': SPEC['upgraded_chair_prototype'], 'faces': prototype.faces,
        'components': prototype.components, 'technical_only': True, 'owner_approved': False, 'runtime_ready': False})
    prototype_guides = []
    for kind in ('normal', 'yaw8'):
        image = Path(world.render(prototype, {'guide_version': 1, 'scale_px_per_metre': 600,
            'capacity_validated': False, 'release_anchors_authored': False,
            'purpose': 'close technical view of ONE molded shell/mount assembly; row beam belongs to pavilion/bleacher model',
            'heading_filename_labels_provisional': True}, kind))
        calibration = image.with_suffix('.calibration.json')
        data = json.loads(calibration.read_text())
        data.update({'mesh_file': str(prototype_path), 'seating_guide_code': {'path': str(Path(__file__)), 'sha256': sha(Path(__file__))},
                     'capacity_validated': False, 'release_anchors_authored': False, 'heading_filename_labels_provisional': True})
        save(calibration, data)
        prototype_guides.append({'path': str(image), 'sha256': sha(image)})
    for design in designs:
        model = pavilion(design) if design['design_key'].startswith('seated-pavilion') else bleacher(design)
        version = design['guide_version'];width, depth = design['footprint_metres']
        settings = {**design, 'scale_px_per_metre': min(56, 640 / ((width + depth + 1.2) / math.sqrt(2))),
            'capacity_validated': False, 'release_anchors_authored': False, 'anchors_status': 'technical proposals only',
            'heading_filename_labels_provisional': True, 'guide_to_game_handedness_proof': 'scene-agent pending; raw world coordinates and projection bases authoritative'}
        seats = [key for key in model.anchors if key.startswith('proposed-seat-') and '/head' not in key]
        chairs = [part for part in model.components if part['kind'] == 'individual-1985-molded-chair']
        assert len(seats) == design['capacity_target']
        assert len(chairs) == (design['capacity_target'] if design['condition'] == 'upgraded' else 0)
        folder = ART / 'generated' / model.name / 'guides';folder.mkdir(parents=True, exist_ok=True)
        mesh = folder / (model.name + f'-world-model-v{version}.json')
        save(mesh, {'model': model.name, 'settings': settings, 'faces': model.faces, 'anchors_world_metres': model.anchors,
            'components': model.components, 'chair_prototype': {'path': str(prototype_path), 'sha256': sha(prototype_path)} if chairs else None,
            'technical_only': True, 'release_anchors_authored': False, 'owner_approved': False, 'runtime_ready': False})
        images = []
        for kind in ('normal', 'yaw8'):
            png = Path(world.render(model, settings, kind));images.append(str(png))
            calibration = png.with_suffix('.calibration.json')
            data = json.loads(calibration.read_text())
            data.update({'seating_guide_code': {'path': str(Path(__file__)), 'sha256': sha(Path(__file__))},
                'capacity_validated': False, 'release_anchors_authored': False, 'heading_filename_labels_provisional': True,
                'guide_to_game_handedness_proof': settings['guide_to_game_handedness_proof'],
                'exact_molded_chair_count': len(chairs), 'proposed_place_count': len(seats)})
            save(calibration, data)
        plan = plan_view(model, design, folder, version)
        results.append({'design_key': model.name, 'capacity_target': design['capacity_target'], 'proposed_place_count': len(seats),
            'individual_molded_chairs': len(chairs), 'normal_and_yaw8_guides': images, 'top_plan': str(plan), 'world_mesh': str(mesh),
            'release_anchors_authored': False, 'owner_approved': False, 'runtime_ready': False})
        print(model.name, 'proposed places', len(seats), 'molded chairs', len(chairs), flush=True)
    for previous in SPEC['existing_24_budget_v1_preservation']:
        assert sha(Path(previous['path'])) == previous['sha256']
    save(ART / 'generated/seating-reference-models/seating-guide-index.json', {'design_specification': {'path': str(DESIGN), 'sha256': sha(DESIGN)},
        'exact_chair_prototype': {'path': str(prototype_path), 'sha256': sha(prototype_path)},
        'chair_prototype_closeup_guides': prototype_guides,
        'variants': results, 'variant_count': len(results), 'proposed_places_total': sum(row['proposed_place_count'] for row in results),
        'individual_molded_chair_meshes_total': sum(row['individual_molded_chairs'] for row in results),
        'prior_24_budget_v1_files_preserved': SPEC['existing_24_budget_v1_preservation'],
        'status': 'technical proposed references; final native sheets must match; no release anchors/approval',
        'runtime_edited': False, 'release_anchors_authored': False, 'owner_approved': False})


if __name__ == '__main__':
    main()
