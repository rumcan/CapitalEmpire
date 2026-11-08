"""Build an evidence-bound worklist without generating, accepting, or integrating art."""
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LIVE = Path('E:/Repos/CapitalEmpire/worktrees/theme-consistency')
NORMAL = ('NE', 'SE', 'SW', 'NW')
TURNED = ('N', 'E', 'S', 'W')


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def record(path):
    with path.open('rb') as handle:
        sha = hashlib.file_digest(handle, 'sha256').hexdigest()
    return {'path': str(path), 'sha256': sha, 'bytes': path.stat().st_size}


def sheet_quality(path, version):
    with Image.open(path) as source:
        mode = source.mode
        image = source.convert('RGBA')
        w, h = image.size
    alpha = image.getchannel('A')
    histogram = alpha.histogram()
    total = w * h
    cells = []
    hashes = []
    for k, view in enumerate(('SE', 'SW', 'NW', 'NE')):
        box = ((k % 2) * w // 2, (k // 2) * h // 2, (k % 2 + 1) * w // 2, (k // 2 + 1) * h // 2)
        cell = image.crop(box)
        a = cell.getchannel('A')
        hist = a.histogram()
        bbox = a.point(lambda value: 255 if value > 24 else 0).getbbox()
        margins = None if bbox is None else [bbox[0], bbox[1], cell.width - bbox[2], cell.height - bbox[3]]
        if bbox:
            hashes.append(hashlib.sha256(cell.crop(bbox).tobytes()).hexdigest())
        cells.append({'view': view, 'cell_box': box, 'subject_bbox_alpha_gt24': bbox,
                      'margins_px_alpha_gt24': margins, 'true_zero_alpha_fraction': hist[0] / (cell.width * cell.height),
                      'alpha_le24_fraction': sum(hist[:25]) / (cell.width * cell.height)})
    quality = {'id': 'golf:clubhouse-shanty', 'variant': '1950s-budget-redesign', 'version': version,
        'kind': 'normal-corners', 'raw': record(path), 'source_mode': mode, 'dimensions': [w, h],
        'alpha_extrema': alpha.getextrema(), 'true_zero_alpha_fraction': histogram[0] / total,
        'alpha_le24_fraction': sum(histogram[:25]) / total, 'cell_order': [['SE', 'SW'], ['NW', 'NE']],
        'cells': cells, 'distinct_cell_hashes': len(set(hashes)),
        'owner_approved': False, 'runtime_integrated': False,
        'native_pixels_unchanged': True, 'pixel_reconstruction_performed': False}
    prompt = path.with_suffix('.prompt.txt')
    if prompt.exists():
        quality['exact_prompt'] = record(prompt)
    if version == 1:
        quality.update({'status': 'held-matte-and-layout-requires-review',
            'findings': ['RGBA, not an opaque RGB image: hidden backdrop samples have alpha 1–4.',
                         'Very little exact zero alpha and substantial low-alpha matte residue; original hidden RGB makes naive viewers look opaque.',
                         'Strong-alpha cell margins are clear but do not meet the requested 60 pixels.',
                         'Preserve historical v1. V2 is the native transparency-correction candidate.']})
    else:
        failures = []
        if mode != 'RGBA' or any(cell['true_zero_alpha_fraction'] < .01 for cell in cells):
            failures.append('insufficient native zero-alpha background')
        if any(not cell['margins_px_alpha_gt24'] or min(cell['margins_px_alpha_gt24']) < 2 for cell in cells):
            failures.append('subject touches a cell boundary')
        if len(set(hashes)) != 4:
            failures.append('cells are not four distinct pixel payloads')
        quality.update({'status': 'candidate-needs-owner-and-registration-review' if not failures else 'held-validation',
            'validation_errors': failures,
            'findings': ['Four enclosed cream/green manufactured 1950s cabin views with matching corrugated roof, door, hatch and chimney identity.',
                         'Native transparency is assessed from alpha, not a rendered backdrop; tiny low-alpha RGB fringes must not be mistaken for opaque content.',
                         'No owner approval, runtime import, perspective guarantee or large-scene completion is implied.']})
    write(path.with_suffix('.quality.json'), quality)
    return quality


def task(idd, kind, views, candidates, redesign=False):
    return {'task_id': idd + '::' + kind, 'kind': kind, 'required_views': views,
            'status': 'generation-required-for-1950s-redesign' if redesign else 'existing-candidate-needs-review' if len(candidates) == len(views) else 'generation-required',
            'existing_candidate_views': candidates, 'review_state': 'not-reviewed-by-current-workflow',
            'owner_approved': False, 'runtime_ready': False, 'runtime_integrated': False}


def main():
    audit_path = ROOT / 'audit/catalogue-audit.json'
    registry_path = ROOT / 'audit/runtime-registry.json'
    budget_path = ROOT / 'plan/budget-replacement-inventory.json'
    matrix_path = ROOT / 'plan/facility-expansion-matrix.json'
    audit, registry, budget, matrix = [read(path) for path in (audit_path, registry_path, budget_path, matrix_path)]
    budget_ids = {item['id'] for item in budget['selectedBudgetNewprops']}
    budget_ids.add(budget['starterClubhouse']['id'])
    quality = {}
    for version in (1, 2):
        path = ROOT / f'generated/old-clubhouse-1950/normal-v{version}.png'
        if path.exists():
            quality[version] = sheet_quality(path, version)
    subjects = []
    for row in sorted(audit['items'], key=lambda item: (not item['golf_priority'], item['id'] not in budget_ids, item['id'])):
        idd = row['id']
        candidates = row['selected_candidate_views']
        normal = task(idd, 'normal-corners', list(NORMAL), {view: candidates[view] for view in NORMAL if view in candidates}, idd in budget_ids)
        yawed = task(idd, 'yaw8-cardinals', list(TURNED), {view: candidates[view] for view in TURNED if view in candidates}, idd in budget_ids)
        if idd == 'golf:clubhouse-shanty' and 2 in quality:
            normal.update({'status': 'native-v2-candidate-needs-review', 'new_candidate': quality[2]['raw'],
                           'quality_report': 'generated/old-clubhouse-1950/normal-v2.quality.json',
                           'held_prior_version': 'generated/old-clubhouse-1950/normal-v1.quality.json'})
            normal['technical_camera_guide'] = 'generated/old-clubhouse-1950/guides/normal-corners-camera-v1.calibration.json'
            yawed['technical_camera_guide'] = 'generated/old-clubhouse-1950/guides/yaw8-camera-v1.calibration.json'
            held_yaw = ROOT / 'generated/old-clubhouse-1950/yaw8-v1.quality.json'
            if held_yaw.exists():
                yawed['held_new_attempt'] = {'quality': str(held_yaw), 'reason': read(held_yaw)['status']}
        clickthrough = {'task_id': idd + '::large-clickthrough', 'kind': 'large-clickthrough',
            'views_required': ['exterior'] + (['interior'] if row['classification'] == 'building' else ['detail-inspection']),
            'condition_variants': ['budget-worn', 'upgraded'] if row['classification'] == 'building' else ['matching-current-asset'],
            'status': 'mapping-and-generation-required', 'prior_scene_candidates': 'see separate legacy_scene_candidates; no stable-ID association is invented',
            'review_state': 'not-reviewed-by-current-workflow', 'owner_approved': False, 'runtime_ready': False, 'runtime_integrated': False}
        subjects.append({'runtime_id': idd, 'name': row['name'], 'category': row['category'], 'classification': row['classification'],
            'golf_priority': row['golf_priority'], 'requires_1950s_budget_redesign': idd in budget_ids,
            'preserve_compatibility_id': True, 'source_reference': row['original_source'],
            'audit_known_review': row['known_review'], 'source_review_evidence': row['reviews_from_sources'],
            'known_clipped_source': row.get('known_cutoff', False),
            'existing_registration': row['registered_view_mapping'], 'registered_axis_yaw': row['registered_axis_yaw_degrees'],
            'baseline_player_has_eight_facings': row['runtime_eight_player_facings'],
            'required_tasks': [normal, yawed, clickthrough],
            'review_state': 'not-owner-approved-by-this-worklist', 'runtime_ready': False})
    proposals = []
    for group in ('seatingDesigns', 'seatingModules'):
        for value in matrix[group]:
            proposals.append({'proposal_id': value['proposalKey'], 'runtime_id': None, 'proposal_group': group,
                'design': value, 'status': 'proposal-needs-design-review-not-a-runtime-asset',
                'required_tasks': ['normal-corners', 'yaw8-cardinals', 'large-clickthrough-context'],
                'owner_approved': False, 'runtime_ready': False})
    for family in matrix['eventInfrastructureFamilies']:
        for tier in family['conditionTiers']:
            key = re.sub(r'[^a-z0-9]+', '-', family['family'].lower()).strip('-')
            proposals.append({'proposal_id': 'event-family-' + key + '-' + tier, 'runtime_id': None,
                'proposal_group': 'eventInfrastructureFamilies', 'condition_tier': tier, 'design': family,
                'status': 'proposal-needs-specific-size-and-identity-design',
                'required_tasks': ['normal-corners', 'yaw8-cardinals', 'large-clickthrough-context'],
                'owner_approved': False, 'runtime_ready': False})
    pavilion = ROOT / 'generated/seated-pavilion-24-budget/normal-v1.png'
    if pavilion.exists():
        proposals.append({'proposal_id': 'owner-requested-seated-pavilion-24-budget', 'runtime_id': None,
            'proposal_group': 'owner-requested-native-candidate', 'condition_tier': 'budget-worn',
            'requested_capacity': 24, 'capacity_validated': False, 'requested_geometry': 'roofed seating pavilion with three bench rows; exact seats/supports need review',
            'status': 'native-normal-candidate-needs-seating-and-camera-review', 'native_candidate': record(pavilion),
            'quality_report': 'generated/seated-pavilion-24-budget/normal-v1.quality.json',
            'required_tasks': ['review-normal-corners', 'yaw8-cardinals', 'large-clickthrough-context', 'author-seat-map-and-audience-focus'],
            'owner_approved': False, 'runtime_ready': False})
    portraits = []
    portrait_runtime = ROOT.parents[1] / 'src/assets/portraits'
    portrait_manifest_path = portrait_runtime / 'manifest.json'
    imported_portraits = {item['lookId']: item for item in read(portrait_manifest_path)['pictures']} if portrait_manifest_path.exists() else {}
    pack_index = ROOT / 'generated/portraits/references/reference-index.json'
    reference_pack = {item['look_id']: item for item in read(pack_index)['looks']} if pack_index.exists() else {}
    for group, base in [('WALKER_PEOPLE', 'people3d'), ('SPECTATOR_PEOPLE', 'spectators'), ('GOLFER_PEOPLE', 'golfers')]:
        for look in registry['people'][group]:
            stem = look['id'].split(':')[-1]
            directory = LIVE / 'art' / base
            options = [directory / 'pics' / (stem + '.png'), directory / stem / 'preview.png', directory / stem / 'style.png']
            reference = next((path for path in options if path.exists()), None)
            portraits.append({'look_id': look['id'], 'actual_cast_group': group, 'runtime_look': look,
                'task_id': look['id'] + '::large-portrait', 'kind': 'matching-character-portrait',
                'identity_reference': record(reference) if reference else None,
                'source_model': str(directory / stem / 'model.glb'),
                'status': 'generation-required' if reference else 'identity-reference-review-required',
                'requirements': 'Match the actual existing face, age, hair, clothing and proportions; large portrait only, never alter animation/sprite frames.',
                'owner_approved': False, 'runtime_ready': False, 'runtime_integrated': False})
            if look['id'] in reference_pack:
                packed = reference_pack[look['id']]
                portraits[-1]['original_identity_reference'] = portraits[-1]['identity_reference']
                portraits[-1]['identity_reference'] = packed['primary_reference']
                portraits[-1]['reference_pack_method'] = packed['method']
                portraits[-1]['reference_pack_no_resize_or_repaint'] = True
            imported = imported_portraits.get(look['id'])
            if imported:
                portraits[-1].update({'status': 'imported-reviewed-native-portrait',
                    'registered_manifest_record': imported, 'registered_file': record(portrait_runtime / imported['file']),
                    'runtime_integrated': True, 'runtime_ready': True,
                    'runtime_readiness_scope': 'actual look-matched native portrait file and manifest entry; not all portrait tasks or animation',
                    'review_state': 'parent visually reviewed source identity/style; owner approval not inferred'})
    assert len(subjects) == 1208 and len({item['runtime_id'] for item in subjects}) == 1208
    assert len(portraits) == 40 and len({item['look_id'] for item in portraits}) == 40
    result = {'schema': 1, 'created_utc': datetime.now(timezone.utc).isoformat(),
        'branch': 'lead/eight-facing-runtime-20261107', 'workspace': 'F:/Repos/ce-wt/eight-facing-runtime-20261107',
        'input_evidence': [record(path) for path in (audit_path, registry_path, budget_path, matrix_path)],
        'policy': {'plant_and_decal_exclusions': 'audit/exclusions.json', 'aliases_not_new_subjects': 'audit/aliases.json',
            'lighting': 'future generations: late-afternoon daytime, upper-right sun, lower-left shadows, no window/neon glow',
            'normal_cell_order': [['SE', 'SW'], ['NW', 'NE']], 'yaw8_cell_order': [['N', 'E'], ['S', 'W']],
            'yaw_degrees': -8, 'corner_and_yaw8_are_distinct_required_tasks': True,
            'owner_approval_inferred_from_files': False, 'runtime_readiness_inferred_from_registration': False,
            'generate_only_missing_or_explicit_redesigns_after_review': True,
            'scenes_and_portraits_do_not_replace_map_sprites': True,
            'historical_lighting': 'Only from now on; preserve earlier sheets except explicitly requested corrections/redesigns.'},
        'counts': {'existing_eligible_subjects': len(subjects), 'golf_priority_subjects': sum(item['golf_priority'] for item in subjects),
            'normal_tasks': len(subjects), 'yaw8_tasks': len(subjects), 'clickthrough_tasks': len(subjects),
            'explicit_budget_redesign_subjects': sum(item['requires_1950s_budget_redesign'] for item in subjects),
            'separate_proposal_records': len(proposals), 'actual_cast_portrait_looks': len(portraits),
            'portrait_candidates_imported': sum(item['runtime_integrated'] for item in portraits),
            'portrait_tasks_remaining': sum(not item['runtime_integrated'] for item in portraits),
            'portrait_groups': dict(Counter(item['actual_cast_group'] for item in portraits)),
            'baseline_distinct_eight_view_candidates': audit['counts']['candidate_full_eight'],
            'baseline_registered_corner_and_yaw8_sets': audit['counts']['runtime_registered_corners_and_yawed8_cardinals'],
            'baseline_player_eight_facing_cycles': 0},
        'subjects_golf_first': subjects, 'proposed_tiers_stands_and_event_variants': proposals,
        'actual_cast_portraits': portraits, 'legacy_scene_candidates_unmapped_to_stable_ids': registry['sceneManifest'],
        'unregistered_source_or_design_backlog': read(ROOT / 'audit/supplemental-source-only.json'),
        'owner_approved': False, 'runtime_ready': False, 'runtime_integrated': False}
    write(ROOT / 'generation-worklist.json', result)
    print(json.dumps(result['counts'], indent=2))
    for version, value in quality.items():
        print('CLUBHOUSE', version, value['status'], 'dimensions', value['dimensions'], 'alpha', value['alpha_extrema'],
              'zero_alpha', value['true_zero_alpha_fraction'], 'margins', [cell['margins_px_alpha_gt24'] for cell in value['cells']])


if __name__ == '__main__':
    main()
