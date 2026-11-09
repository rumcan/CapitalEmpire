"""SOURCE ART ONLY: clearer fixed 3D dish, unchanged compound subassemblies.

Keeps v1 references/native images. A thick curved shell, round rim, feed tripod
and convex back ribs distinguish a real dish from a flat aerial in oblique poses.
"""
import json
import math
from pathlib import Path

import numpy as np

import build_world_geometry_guides as world
import build_golf_complex_world_guides as golf


def revised_dish(model):
    centre = np.array([4.50, 5.15, 3.15])
    axis = np.array([.25, -.55, .797])
    axis /= np.linalg.norm(axis)
    u = np.cross(axis, [0, 0, 1])
    u /= np.linalg.norm(u)
    v = np.cross(axis, u)
    radius, depth, thickness = .90, .30, .085

    def surface(r, angle, back=False):
        radial = math.cos(angle) * u + math.sin(angle) * v
        return centre + r * radial + axis * (depth * (r / radius) ** 2 - (thickness if back else 0))

    # Separate coloured physical surfaces, not a double-sided flat polygon.
    for back, color in [(False, '#d9d4bc'), (True, '#71857c')]:
        face = 'convex-back' if back else 'concave-front'
        for ring in range(10):
            r0, r1 = radius * ring / 10, radius * (ring + 1) / 10
            for i in range(48):
                a0, a1 = 2 * math.pi * i / 48, 2 * math.pi * (i + 1) / 48
                points = [surface(r0, a0, back), surface(r1, a0, back),
                          surface(r1, a1, back), surface(r0, a1, back)]
                if ring == 0:
                    points = [points[0], points[1], points[2]]
                if back:
                    points.reverse()
                model.face(f'dish-v2/{face}/{ring}-{i}', [p.tolist() for p in points], color)

    # Rounded torus rim remains unmistakably curved even almost edge-on.
    for i in range(48):
        for j in range(8):
            points = []
            for a, b in [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]:
                theta, phi = 2 * math.pi * a / 48, 2 * math.pi * b / 8
                radial = math.cos(theta) * u + math.sin(theta) * v
                points.append((centre + radial * (radius + .038 * math.cos(phi))
                               + axis * (depth - thickness / 2 + .038 * math.sin(phi))).tolist())
            model.face(f'dish-v2/round-rim/{i}-{j}', points, '#e7dfc6')

    feed = centre + axis * .75
    for i in range(3):
        a = 2 * math.pi * i / 3 + math.pi / 2
        start = surface(radius * .94, a)
        golf.beam(model, 'dish-v2/feed-tripod-' + str(i), start, feed, .032, '#485e59')
    model.box('dish-v2/feed-receiver', tuple(feed), (.11, .12, .14), '#a4b1a5')
    for i in range(4):
        a = math.pi * i / 2
        points = [surface(r, a, True) - axis * .018 for r in (.08, .30, .55, .80)]
        for j in range(len(points) - 1):
            golf.beam(model, f'dish-v2/curved-back-rib-{i}-{j}', points[j], points[j + 1], .045, '#495e57')
    back_hub = centre - axis * .14
    model.box('dish-v2/back-pivot-hub', tuple(back_hub), (.22, .23, .23), '#5f7368')
    golf.beam(model, 'dish-v2/mount-to-existing-pedestal', (4.50, 5.15, 2.84), back_hub, .10, '#7c8e80')
    model.anchors.update({'dish-centre': tuple(centre), 'dish-aim-point': tuple(centre + axis * 2),
                          'dish-v2/feed-receiver': tuple(feed), 'dish-v2/back-pivot-hub': tuple(back_hub)})
    model.components.append({'name': 'dish-v2', 'kind': 'curved-parabolic-shell',
        'centre_metres': centre.tolist(), 'fixed_aim_unit_vector': axis.tolist(), 'radius_metres': radius,
        'bowl_depth_metres': depth, 'shell_thickness_metres': thickness, 'front_color': '#d9d4bc',
        'back_color': '#71857c', 'orientation_policy': 'ONE fixed axis rotates with vehicle/compound. Never aim at viewer per cell.'})
    return axis


def main():
    model, settings = golf.compound()
    job_id = model.name.split('/')[-1]
    folder = world.ART / 'generated' / model.name / 'guides'
    original_mesh = folder / (job_id + '-world-model-v1.json')
    old = json.loads(original_mesh.read_text())

    def old_dish_face(face):
        return face['name'].startswith(('ONE-fixed-roof-dish-', 'dish-feed-arm/'))

    original_non_dish = [face for face in old['faces'] if not old_dish_face(face)]
    model.faces = [face for face in model.faces if not old_dish_face(face)]
    if json.loads(json.dumps(model.faces)) != original_non_dish:
        raise RuntimeError('A non-dish part changed; retain exact v1 compound')
    axis = revised_dish(model)
    settings.update({'guide_version': 2, 'technical_labels': False, 'source_only': True,
        'placement_plot_metres': {'width': 30, 'depth': 20}, 'internal_dimensions_are_design_proposals': True,
        'revision_scope': 'Dish shell/rim/feed/back only; original camera, scale, all nondish faces/components/positions unchanged.'})
    mesh_path = folder / (job_id + '-world-model-v2.json')
    for file in [mesh_path, folder / 'normal-world-v2.png', folder / 'yaw8-world-v2.png']:
        if file.exists():
            raise RuntimeError('Keep existing v2: ' + str(file))
    mesh_path.write_text(json.dumps({'model': job_id, 'settings': settings, 'faces': model.faces,
        'anchors_world_metres': model.anchors, 'components': model.components, 'technical_only': True,
        'non_dish_faces_identical_to_v1': True, 'v1_mesh_sha256': world.digest(original_mesh),
        'native_art_modified': False, 'runtime_integrated': False}, indent=2) + '\n', encoding='utf-8')
    index = {'jobId': job_id, 'scope': settings['revision_scope'], 'source_only': True,
        'fixed_dish_axis_world': axis.tolist(), 'non_dish_faces_identical_to_v1': True,
        'mesh': str(mesh_path), 'mesh_sha256': world.digest(mesh_path), 'outputs': {},
        'paint_instruction': 'Preserve a smooth curved dish in oblique views. Show the back shell/ribs when facing away. Do not rotate its aim to expose the concave interior in every cell.'}
    for family in ('normal', 'yaw8'):
        png = Path(world.render(model, settings, family))
        cal_file = folder / (family + '-world-v2.calibration.json')
        cal, previous = json.loads(cal_file.read_text()), json.loads((folder / (family + '-world-v1.calibration.json')).read_text())
        for key in ('model', 'source_brief', 'scope'):
            cal[key] = previous[key]
        cal.update({'mesh_file': mesh_path.name, 'mesh_sha256': world.digest(mesh_path),
            'generator': {'file': str(Path(__file__)), 'sha256': world.digest(Path(__file__))},
            'non_dish_faces_identical_to_v1': True, 'dish_revision': settings['revision_scope']})
        toward = np.array(cal['basis']['toward_camera'])
        for view, old_view in zip(cal['views'], previous['views']):
            theta = view['object_rotation_degrees_about_Z']
            rotated = world.rotate([axis], theta / 90)[0]
            dot = float(rotated @ toward)
            for key in ('runtime_heading_degrees_if_local_basis_x_minus_y', 'runtime_basis_note', 'projected_fixed_feature_vectors'):
                view[key] = old_view[key]
            view['dish_visibility'] = {'fixed_axis_rotated_world': rotated.tolist(),
                'front_normal_dot_toward_camera': dot,
                'dominant_surface': 'concave front' if dot > 0 else 'convex ribbed back',
                'aperture_ellipse_minor_major_ratio': abs(dot),
                'note': 'Technical aperture projection only; depth/rim/feed make a real3D silhouette. This is not native-painted camera metrology.'}
        cal_file.write_text(json.dumps(cal, indent=2) + '\n', encoding='utf-8')
        index['outputs'][family] = {'png': str(png), 'sha256': world.digest(png),
            'calibration': str(cal_file), 'dish_faces': [{'view': v['view'], **v['dish_visibility']} for v in cal['views']]}
        print(str(png), flush=True)
    (folder / 'dish-v2-guide-index.json').write_text(json.dumps(index, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
