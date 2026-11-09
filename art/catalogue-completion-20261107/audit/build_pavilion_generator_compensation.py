"""A generator-feedback experiment, explicitly NOT an eight-degree proof.

Preserves the original24-budget-v1 world model and all ideal guides. The four
reference cameras are intentionally different; none is a runtime artifact heading.
"""
import base64
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ART = Path(__file__).resolve().parent.parent
ASSET = ART / 'generated/seated-pavilion-24-budget'
OUTPUT = ASSET / 'guides/generator-compensation/attempt-1'
MODEL = ASSET / 'guides/seated-pavilion-24-budget-world-model-v1.json'
REVIEW = ASSET / 'qa-normal-v2-yaw8-v1/review.json'
DRAFT_PROOF = ART / 'plan/pavilion-guide-handedness-proof.json'
IDEAL = ASSET / 'guides/yaw8-world-v1.calibration.json'
CELL = 800
DOWN = math.radians(30)
TARGET_BETA = math.radians(8)
TARGET_SLOPE = math.sin(DOWN) * math.tan(TARGET_BETA)
spec = importlib.util.spec_from_file_location('technical_zbuffer', Path(__file__).with_name('build_world_geometry_guides.py'))
geometry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(geometry)


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def record(path):
    return {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size}


def atomic(path, value):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def main():
    design = read(ART / 'plan/seating-world-designs-20261107.json')
    protected = [Path(item['path']) for item in design['existing_24_budget_v1_preservation']]
    protected += [MODEL, REVIEW, DRAFT_PROOF, DRAFT_PROOF.with_suffix('.md'), ASSET / 'normal-v2.png', ASSET / 'yaw8-v1.png']
    before = {str(path): record(path)['sha256'] for path in protected}
    model, review = read(MODEL), read(REVIEW)
    assert record(Path(review['sources']['yaw8']['file']))['sha256'] == review['sources']['yaw8']['sha256']
    observed = {view['key'][4:]: float(view['measuredEdges'][0]['slope']) for view in review['views'] if view['key'].startswith('yaw8')}
    assert set(observed) == {'N', 'E', 'S', 'W'}
    OUTPUT.mkdir(parents=True, exist_ok=True)
    image = Image.new('RGBA', (CELL * 2, CELL * 2))
    font_path = Path('C:/Windows/Fonts/arialbd.ttf')
    font = ImageFont.truetype(str(font_path), 20) if font_path.exists() else ImageFont.load_default()
    scale = model['settings']['scale_px_per_metre']
    cells = []
    for quarter, name in enumerate(('N', 'E', 'S', 'W')):
        slope = observed[name]
        beta = math.atan(math.tan(TARGET_BETA) * TARGET_SLOPE / slope)
        right = np.array([math.cos(beta), math.sin(beta), 0.0])
        down = np.array([math.sin(DOWN) * math.sin(beta), -math.sin(DOWN) * math.cos(beta), -math.cos(DOWN)])
        toward = np.array([math.cos(DOWN) * math.sin(beta), -math.cos(DOWN) * math.cos(beta), math.sin(DOWN)])
        sun = .8 * right - .7 * down + .9 * toward;sun /= np.linalg.norm(sun)
        faces = [(face, geometry.rotate(face['vertices'], quarter)) for face in model['faces']]
        points = np.vstack([vertices for _, vertices in faces])
        projection = np.column_stack((points @ right, points @ down))
        offset = np.array([CELL / 2, CELL / 2]) - scale * (projection.min(axis=0) + projection.max(axis=0)) / 2
        canvas = np.zeros((CELL, CELL, 4), dtype=np.uint8)
        depth_buffer = np.full((CELL, CELL), -np.inf)
        for face, vertices in faces:
            projected = scale * np.column_stack((vertices @ right, vertices @ down)) + offset
            depth = vertices @ toward
            normal = np.cross(vertices[1] - vertices[0], vertices[2] - vertices[0])
            length = np.linalg.norm(normal);normal = normal / length if length else normal
            light = .67 + .33 * abs(float(normal @ sun))
            rgb = tuple(min(255, round(int(face['color'][i:i + 2], 16) * light)) for i in (1, 3, 5))
            for triangle in range(1, len(vertices) - 1):
                indices = [0, triangle, triangle + 1]
                geometry.raster_triangle(canvas, depth_buffer, projected[indices], depth[indices], rgb + (255,))
        tile = Image.fromarray(canvas)
        cell_origin = np.array([(quarter % 2) * CELL, (quarter // 2) * CELL])
        image.paste(tile, tuple(cell_origin))
        draw = ImageDraw.Draw(image)
        draw.text(tuple(cell_origin + [16, 16]), 'GENERATOR COMPENSATION - NOT AN 8 DEGREE PROOF', fill=(160, 40, 25, 255), font=font)
        draw.text(tuple(cell_origin + [16, 44]), f'{name}: reference camera {math.degrees(beta):.8f} deg; intended FINAL target8deg', fill=(50, 70, 55, 255), font=font)
        anchors = {}
        for key, point in model['anchors_world_metres'].items():
            rotated = geometry.rotate([point], quarter)[0]
            projected = np.array([rotated @ right, rotated @ down])
            anchors[key] = {'original_world_metres_unchanged': point, 'rotated_world_metres': rotated.tolist(),
                'compensation_reference_pixel': (scale * projected + offset + cell_origin).tolist(),
                'NOT_a_final_native_or_runtime_anchor': True}
        cells.append({'source_label': name, 'cell_index': quarter, 'object_rotation_degrees_about_Z': quarter * 90,
            'observed_previous_native_clean_deck_slope': slope,
            'target_FINAL_native_slope': TARGET_SLOPE, 'target_FINAL_native_camera_offset_degrees': 8,
            'generator_response_gain_assumption': slope / TARGET_SLOPE,
            'actual_compensation_reference_camera_offset_degrees': math.degrees(beta),
            'actual_compensation_reference_ground_edge_slope': math.sin(DOWN) * math.tan(beta),
            'camera_down_degrees': 30, 'basis': {'screen_right': right.tolist(), 'screen_down': down.tolist(), 'toward_camera': toward.tolist()},
            'scale_px_per_metre': scale, 'local_offset_px': offset.tolist(),
            'cell_box': [int(cell_origin[0]), int(cell_origin[1]), int(cell_origin[0] + CELL), int(cell_origin[1] + CELL)],
            'projected_model_anchors_for_reference_only': anchors,
            'runtime_heading_degrees': None, 'runtime_import_permitted': False})
    png = OUTPUT / 'GENERATOR-COMPENSATION-reference-v1.png'
    image.save(png)
    svg = OUTPUT / 'GENERATOR-COMPENSATION-reference-v1.svg'
    svg.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600"><title>GENERATOR COMPENSATION EXPERIMENT, NOT8DEGREE GEOMETRY</title><image width="1600" height="1600" href="data:image/png;base64,' + base64.b64encode(png.read_bytes()).decode() + '"/></svg>\n', encoding='utf-8')
    after = {str(path): record(path)['sha256'] for path in protected}
    assert before == after, 'Original inputs/proof changed'
    metadata = {'purpose': 'GENERATOR-COMPENSATION prompt/reference experiment ONLY; explicitly NOT an8degree geometry proof',
        'model_identity': 'original seated-pavilion-24-budget-v1, no feature/normal/world-coordinate changes',
        'input_world_model': record(MODEL), 'measured_previous_native_source': record(Path(review['sources']['yaw8']['file'])),
        'review_source': record(REVIEW), 'unchanged_ideal8degree_calibration': record(IDEAL), 'unchanged_draft_game_projection_proof': record(DRAFT_PROOF),
        'formula': {'beta_new': 'atan(tan(8 degrees) * targetSlope / observedSlope)',
                    'targetSlope': 'sin(30 degrees)*tan(8 degrees)', 'targetSlope_value': TARGET_SLOPE,
                    'assumption': 'multiplicative generator under-rotation response; an experiment, not physical artifact calibration'},
        'cell_order': [['N', 'E'], ['S', 'W']], 'cells': cells,
        'required_final_native_verification': ['Independently remeasure the NEW native deck edges against ORIGINAL ideal8degree model, not against this compensation reference.',
            'Final desired slope magnitude remains0.07027041735119574 at30degrees down; use measured edge fitting and uncertainty, not filename or nominal instructions.',
            'Verify actual source pixel scale/origin, all24seat/entry geometry, visibility and sixposts separately before release.',
            'Never register these compensation camera angles as artifact headings or release anchors.'],
        'original_input_sha256_preserved': before, 'outputs': [record(png), record(svg)],
        'runtime_import_permitted': False, 'runtime_headings_from_compensation_permitted': False,
        'final_native8degree_verified': False, 'capacity_validated': False, 'release_anchors_authored': False,
        'owner_approved': False, 'runtime_edited': False, 'guide_code': record(Path(__file__))}
    atomic(OUTPUT / 'GENERATOR-COMPENSATION-experiment-v1.json', metadata)
    print(str(png))
    print(json.dumps([{'view': item['source_label'], 'compensation_reference_degrees': item['actual_compensation_reference_camera_offset_degrees'], 'FINAL_target_degrees': 8} for item in cells], indent=2))


if __name__ == '__main__':
    main()
