"""Read-only source/art audit. Outputs only beside this script; never imports game code."""
import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps

LIVE = Path('E:/Repos/CapitalEmpire/worktrees/theme-consistency')
ISOLATED = Path('E:/Repos/CapitalEmpire/.claude/worktrees/art-repaint-20261106')
OUTPUT = Path(__file__).resolve().parent
REPAINT = Path('D:/AI/repaint/out')
IDOL = Path('D:/AI/idol-batch/out')
CORNER = ('NE', 'SE', 'SW', 'NW')
CARDINAL = ('N', 'E', 'S', 'W')
ALL = CORNER + CARDINAL
DECODER = json.JSONDecoder()
IMAGE_CACHE = {}


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(name, data):
    (OUTPUT / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def parse_items(path):
    text = path.read_text(encoding='utf-8-sig')
    found = {}
    for match in re.finditer(r'\{"id"\s*:', text):
        try:
            item, _ = DECODER.raw_decode(text[match.start():])
            if isinstance(item, dict) and 'kind' in item and 'tex' in item:
                found[item['id']] = item
        except (ValueError, TypeError):
            pass
    return found


def json_export(path, name):
    text = path.read_text(encoding='utf-8-sig')
    match = re.search(r'export const ' + name + r'[^=\n]*=\s*', text)
    if not match:
        return {}
    try:
        return DECODER.raw_decode(text[match.end():])[0]
    except ValueError:
        return {}


def image_info(path):
    key = str(path)
    if key in IMAGE_CACHE:
        return IMAGE_CACHE[key]
    info = {'path': key, 'exists': path.is_file(), 'valid': False}
    if path.is_file():
        try:
            raw = path.read_bytes()
            info['sha256'] = hashlib.sha256(raw).hexdigest()
            with Image.open(path) as image:
                image.load()
                info.update({'format': image.format, 'mode': image.mode, 'size': list(image.size)})
                alpha_present = 'A' in image.getbands() or 'transparency' in image.info
                rgba = image.convert('RGBA')
                alpha = rgba.getchannel('A')
                bbox = alpha.point(lambda x: 255 if x > 24 else 0).getbbox()
                info['subject_bbox'] = bbox
                info['true_transparency'] = alpha_present and alpha.getextrema()[0] == 0
                info['valid'] = bool(bbox) and info['true_transparency'] and min(image.size) >= 4
                if bbox:
                    cropped = rgba.crop(bbox)
                    # Ignore invisible RGB payloads, which do not change visible art.
                    visible = cropped.getchannel('A').point(lambda value: 255 if value > 24 else 0)
                    normalized = Image.composite(cropped, Image.new('RGBA', cropped.size), visible)
                    prefix = str(cropped.size).encode()
                    info['pixel_sha256'] = hashlib.sha256(prefix + normalized.tobytes()).hexdigest()
                    info['mirror_pixel_sha256'] = hashlib.sha256(prefix + ImageOps.mirror(normalized).tobytes()).hexdigest()
                if not info['valid']:
                    info['problem'] = 'blank, lacks native transparent alpha, or too small'
        except Exception as error:
            info['problem'] = f'corrupt/unreadable image: {error}'
    IMAGE_CACHE[key] = info
    return info


def review_summary(provenance):
    keys = ('status', 'integrationStatus', 'integrationReason', 'integrationReview', 'review',
            'reviewStatus', 'owner_approved', 'runtime_integrated', 'geometryReview')
    return {key: provenance[key] for key in keys if key in provenance}


def held(provenance):
    status = str(provenance.get('status', '')).lower()
    integration = str(provenance.get('integrationStatus', '')).lower()
    return 'held' in status or 'rejected' in status or integration in ('blocked', 'held', 'rejected')


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    modules = {}
    definitions = defaultdict(list)
    for path in sorted((LIVE / 'src/game').glob('*library.ts')):
        modules[path.stem] = parse_items(path)
        for idd, item in modules[path.stem].items():
            definitions[idd].append({'module': str(path.relative_to(LIVE)), 'item': item})
    studio_removed = read(LIVE / 'scripts/assets/removed.json')
    scales = (LIVE / 'src/game/lots/scales.ts').read_text()
    match = re.search(r'export const REMOVED_IDS[^=]*=\s*\[([^\]]*)\]', scales)
    removed = set(studio_removed) | set(re.findall(r'"([^"\n]+)"', match[1] if match else ''))
    inventory = read(LIVE / 'art/theme-consistency/inventory.json')
    inventory_by_id = {item['id']: item for key in ('items', 'excludedNonSubjects', 'sourceOnly', 'excluded') for item in inventory.get(key, [])}
    flags = read(LIVE / 'scripts/assets/review-flags.json')
    runtime_path = OUTPUT / 'runtime-registry.json'
    runtime = {item['subject']: item for item in read(runtime_path).get('rotationSubjects', [])} if runtime_path.exists() else {}
    axis_foot = json_export(LIVE / 'src/game/axis-library.ts', 'AXIS_FOOT')
    aliases = []
    exclusions = []
    eligible = {}
    excluded_kinds = {'tree', 'palm', 'bush', 'shrub', 'flower', 'decal', 'pond', 'walker'}
    for idd, defs in definitions.items():
        item = next((entry['item'] for entry in defs if entry['module'] not in ('src/game/views-library.ts', 'src/game/axis-library.ts', 'src/game/extra-views-library.ts')), defs[0]['item'])
        if idd.startswith('view:'):
            aliases.append({'id': idd, 'subject': idd[5:idd.rfind(':')], 'direction': idd.rsplit(':', 1)[1], 'type': 'heading-registration-not-an-independent-subject'})
            continue
        if idd.startswith('east:'):
            aliases.append({'id': idd, 'subject': idd[5:], 'type': 'east-registration-alias; historical sources may be mirrored'})
            continue
        why = None
        if idd in removed:
            why = 'removed/retired from current runtime catalogue'
        elif item['kind'] in excluded_kinds:
            why = 'plants/foliage excluded by owner' if item['kind'] in {'tree', 'palm', 'bush', 'shrub', 'flower'} else 'decal excluded by owner' if item['kind'] == 'decal' else 'water/terrain or character, outside buildings/props scope'
        elif item.get('cat') == 'New: People' or re.search(r'newprop:(?:course-worker|groundskeeper)', idd):
            why = 'character art, outside buildings/props scope; separate character workstream'
        elif idd in ('business:golf-bunker-crescent', 'business:golf-pond'):
            why = 'baked golf terrain/water artwork, not a building or prop'
        if why:
            exclusions.append({'id': idd, 'name': item.get('name'), 'kind': item['kind'], 'category': item.get('cat'), 'reason': why})
            continue
        eligible[idd] = {'id': idd, 'name': item.get('name', idd), 'category': item.get('cat'), 'kind': item['kind'],
                         'definition_sources': [entry['module'] for entry in defs],
                         'classification': 'building' if item['kind'] in {'building', 'house', 'business', 'venue', 'arcade', 'gazebo', 'lot'} else 'prop',
                         'inventory_classification': inventory_by_id.get(idd, {}).get('category'),
                         'known_review': flags.get(idd), 'original_source': None}
    pools = defaultdict(lambda: defaultdict(list))
    stores = []
    source_only = []

    def add(idd, kind, folder, suffix, origin, priority, provenance=None, registered=False, yaw=None):
        views = CORNER if kind == 'corners' else CARDINAL
        provenance = provenance or {}
        for view in views:
            path = folder / f'{view}{suffix}'
            if path.is_file():
                pools[idd][view].append({'path': path, 'origin': origin, 'priority': priority,
                    'kind': kind, 'yaw_degrees': yaw, 'registered_source': registered,
                    'review': review_summary(provenance), 'held': held(provenance),
                    'generator': provenance.get('generator', 'ChatGPT repaint' if origin.startswith('D:/AI/repaint') else 'retained generated native art'),
                    'evidence_provenance': provenance.get('_path')})

    # Registered stores are authoritative native files, not atlas identifiers or mirrors.
    for relative in ('art/building-views', 'art/extra-views', 'art/axis-views'):
        for source_path in sorted((LIVE / relative).glob('*/source.json')):
            source = read(source_path);idd = source.get('id')
            if not idd:
                continue
            folder = source_path.parent
            provenance_path = folder / 'provenance.json'
            provenance = read(provenance_path) if provenance_path.exists() else {}
            provenance['_path'] = str(provenance_path if provenance_path.exists() else source_path)
            if relative == 'art/axis-views':
                turn = folder / 'turned/turned.json'
                if turn.exists():
                    yaw = read(turn).get('yaw')
                    add(idd, 'axisturn', folder / 'turned', '.png', relative + '/turned', 30, provenance, True, yaw)
                # Square cardinals are recorded but intentionally never count as yaw-8 views.
                add(idd, 'axis-square', folder, '.png', relative + '/square', 90, provenance, True, 0)
            else:
                add(idd, 'corners', folder, '.png', relative, 40, provenance, True)
            stores.append({'id': idd, 'folder': str(folder), 'source': source, 'review': review_summary(provenance)})

    idol_by_folder = {}
    rough_hashes = defaultdict(set)
    for set_name in ('missing', 'marked'):
        for meta_path in sorted((IDOL / set_name).glob('*/meta.json')):
            meta = read(meta_path);idd = meta.get('id', meta_path.parent.name.replace('~', ':'))
            idol_by_folder[meta_path.parent.name] = idd
            for path in list(meta_path.parent.glob('view_*.png')) + list((meta_path.parent / 'turned').glob('view_*.png')):
                info = image_info(path)
                if info.get('pixel_sha256'):
                    rough_hashes[idd].add(info['pixel_sha256'])
    for folder in sorted(REPAINT.iterdir()):
        if not folder.is_dir():
            continue
        idd = idol_by_folder.get(folder.name, folder.name.replace('~', ':'))
        add(idd, 'corners', folder, '.png', 'D:/AI/repaint/out/corners', 20)
        add(idd, 'axisturn', folder / 'turned', '.png', 'D:/AI/repaint/out/turned', 20, yaw=-8)

    native_root = ISOLATED / 'art/theme-consistency/native-resume-20261106'
    for path in sorted(native_root.glob('*/*-v*.provenance.json')):
        data = read(path)
        if data.get('status') != 'imported-awaiting-visual-review':
            continue
        idd = data['id'].replace('~', ':');kind = data.get('kind', 'corners')
        data['_path'] = str(path)
        # Only the currently selected version's crops occupy the subject root.
        current = all((path.parent / ('turned' if kind == 'axisturn' else '') / f"{crop['view']}.native.png").is_file() and image_info(path.parent / ('turned' if kind == 'axisturn' else '') / f"{crop['view']}.native.png").get('sha256') == crop['project_copy']['sha256'] for crop in data.get('crops', []))
        if current:
            add(idd, kind, path.parent / ('turned' if kind == 'axisturn' else ''), '.native.png', 'isolated/native-resume', 10, data, False, -8 if kind == 'axisturn' else None)

    # Additional retained generated sets, including props absent from T017.
    generated = LIVE / 'art/theme-consistency/generated'
    generated_ids = defaultdict(list)
    for path in sorted(generated.rglob('*.provenance.json')):
        try:
            data = read(path)
        except (ValueError, OSError):
            continue
        idd = data.get('id')
        if not isinstance(idd, str):
            continue
        generated_ids[idd].append(str(path))
        stem = path.name.removesuffix('.provenance.json');folder = path.parent / stem
        data['_path'] = str(path)
        if folder.is_dir():
            add(idd, 'corners', folder, '.native.png', 'live/generated-unregistered', 60, data)
            if 'screen-axis' in stem:
                add(idd, 'axis-square', folder, '.native.png', 'live/generated-square', 95, data, yaw=0)

    new_manifest = read(LIVE / 'art/new-props/items.json')['items']
    new_by_id = {item['id']: item for item in new_manifest}
    kit = read(LIVE / 'art/concept-kit/items.json')['items']
    kit_by_id = {item['id']: item for item in kit}
    desert_manifest = read(LIVE / 'art/desert-props/manifest.json')
    desert_by_id = {}
    for code, item in desert_manifest.get('props', {}).items():
        if not isinstance(item, dict) or not item.get('name'):
            continue
        slug = 'desert-' + re.sub(r'[^a-z0-9]+', '-', item['name'].lower()).strip('-')
        desert_by_id['newprop:' + slug] = {'code': code, **item, 'file': str(LIVE / 'art/desert-props' / (slug + '.webp'))}
    for idd, row in eligible.items():
        inv = inventory_by_id.get(idd, {})
        source = inv.get('source', {})
        if isinstance(source, dict) and source.get('native'):
            row['original_source'] = str(LIVE / source['native'])
        if idd in new_by_id:
            item = new_by_id[idd]
            row['original_source'] = str(LIVE / 'art/new-props' / (item['slug'] + '.webp'))
            row['source_sheet'] = item.get('sheet')
            row['known_cutoff'] = item.get('cutOff', False)
        if idd in kit_by_id:
            row['original_source'] = str(LIVE / 'art/concept-kit' / (idd.split(':', 1)[1] + '.webp'))
            row['source_metadata'] = kit_by_id[idd].get('src')
        if idd in desert_by_id:
            row['original_source'] = desert_by_id[idd]['file']
            row['source_metadata'] = {'catalogue': 'art/desert-props/manifest.json', **desert_by_id[idd]}
        if idd.startswith('golf:') and (LIVE / 'art/golf' / (idd[5:] + '.png')).exists():
            row['original_source'] = str(LIVE / 'art/golf' / (idd[5:] + '.png'))
        if not row['original_source']:
            row['original_source'] = {'atlas_definition': row['definition_sources'][0], 'tex': definitions[idd][0]['item']['tex'], 'note': 'single original atlas sprite; not asserted to be an independently labelled angle'}
        context = idd.startswith(('golf:', 'business:golf-', 'kit:')) or (row.get('category', '').startswith('New: ') and row['category'] != 'New: Buildings')
        row['golf_priority'] = bool(context)
        row['golf_priority_reason'] = 'explicit golf/business-golf, course/event new-prop or concept-kit asset' if context else None
        row['registered'] = True
        row['registered_view_mapping'] = runtime.get(idd, {'subject': idd, 'cornerViewIds': [], 'axisViewIds': [], 'cornerIdsPresent': False, 'axisIdsPresent': False, 'propsToolRotations': 4, 'eightPlayerSelectableFacings': False})
        axis_ids = row['registered_view_mapping'].get('axisViewIds', [])
        row['registered_axis_yaw_degrees'] = {v: axis_foot.get(view_id, [None, None, None])[2] for v, view_id in zip(CARDINAL, axis_ids)}
        row['registered_eight_degree_cardinals'] = bool(axis_ids) and len(axis_ids) == 4 and all(abs(abs(axis_foot.get(view_id, [0, 0, 0])[2]) - 8) < .01 for view_id in axis_ids)
        row['heading_candidates'] = {}
        chosen = {}
        all_review = []
        for view in ALL:
            candidates = []
            for candidate in sorted(pools[idd][view], key=lambda item: item['priority']):
                info = image_info(candidate['path'])
                value = {key: item for key, item in candidate.items() if key != 'priority'}
                value['path'] = str(value['path']);value['file'] = info
                value['render_only'] = info.get('pixel_sha256') in rough_hashes[idd]
                value['usable_independent_view'] = bool(info['valid'] and not candidate['held'] and not value['render_only'] and (view in CORNER or candidate['kind'] == 'axisturn' and abs(abs(candidate.get('yaw_degrees') or 0) - 8) < .01))
                candidates.append(value)
                if candidate['review'] and candidate['review'] not in all_review:
                    all_review.append(candidate['review'])
            row['heading_candidates'][view] = candidates
            valid = [value for value in candidates if value['usable_independent_view']]
            if valid:
                chosen[view] = valid[0]
        collisions = []
        independent = {}
        for view in ALL:
            if view not in chosen:
                continue
            value = chosen[view];info = value['file']
            duplicate = next((other for other, old in independent.items() if info.get('pixel_sha256') in (old['file'].get('pixel_sha256'), old['file'].get('mirror_pixel_sha256'))), None)
            if duplicate:
                collisions.append({'view': view, 'same_or_mirrored_as': duplicate, 'reason': 'duplicate/mirrored decoded pixels cannot count as an independent generated angle'})
            else:
                independent[view] = value
        row['selected_candidate_views'] = {view: {'path': value['path'], 'sha256': value['file']['sha256'], 'origin': value['origin'], 'generator': value['generator'], 'yaw_degrees': value['yaw_degrees']} for view, value in independent.items()}
        row['duplicate_or_mirrored_views'] = collisions
        row['reviews_from_sources'] = all_review
        row['missing_corner_views'] = [view for view in CORNER if view not in independent]
        row['missing_turned_8degree_views'] = [view for view in CARDINAL if view not in independent]
        row['corner_count'] = 4 - len(row['missing_corner_views'])
        row['turned_8degree_count'] = 4 - len(row['missing_turned_8degree_views'])
        row['candidate_eight_views_present'] = len(independent) == 8
        row['owner_approved'] = False
        row['runtime_eight_player_facings'] = False
        row['generated_extra_views_not_registered'] = bool(independent) and not (row['registered_view_mapping'].get('cornerIdsPresent') and row['registered_view_mapping'].get('axisIdsPresent') and row['registered_eight_degree_cardinals'])
    # Source/design catalogues not represented by active stable runtime IDs stay explicit.
    for item in read(LIVE / 'art/golf/items.json')['items']:
        idd = 'golf:' + item['id']
        if idd not in eligible:
            source_only.append({'source_id': idd, 'runtime_id': idd if idd in definitions else None, 'name': item['name'], 'catalogue': 'art/golf/items.json', 'reason': 'retired runtime asset' if idd in removed else 'manifest design exists but no active runtime registration', 'file': str(LIVE / 'art/golf' / (item['id'] + '.png')), 'file_exists': (LIVE / 'art/golf' / (item['id'] + '.png')).exists()})
    budget = read(LIVE / 'art/grass-management/budget-props/manifest.json')
    for item in budget.get('assets', []):
        if item['id'] in ('red-maple-4views', 'blue-green-conifer-4views'):
            exclusions.append({'source_id': item['id'], 'runtime_id': None, 'catalogue': 'art/grass-management/budget-props/manifest.json', 'reason': 'plants/foliage excluded by owner'})
            continue
        source_only.append({'source_id': item['id'], 'runtime_id': None, 'name': item['id'], 'catalogue': 'art/grass-management/budget-props/manifest.json', 'reason': 'four-view source set lacks authoritative stable runtime-ID mapping', 'corner_files': item.get('views'), 'cardinal_files': [], 'review': item.get('gameReview')})
    for sheet in read(LIVE / 'art/new-props/manifest.json')['sheets']:
        existing = [item for item in new_manifest if item.get('sheet') == sheet['sheet']]
        if not existing:
            for name in sheet.get('names', []):
                source_only.append({'source_id': None, 'runtime_id': None, 'name': name, 'catalogue': 'art/new-props/manifest.json', 'source_sheet': sheet['sheet'], 'category': sheet['cat'], 'reason': 'manifest subject has no cutout in items.json or runtime item; this sheet was not cut successfully'})
    tournament = read(LIVE / 'art/golf-tournament/prompts.json')
    for sheet in tournament.get('sheets', []):
        source_only.append({'source_id': sheet.get('name', sheet.get('id')), 'runtime_id': None, 'catalogue': 'art/golf-tournament/prompts.json', 'reason': 'multi-subject facility design/source sheet has no per-subject stable runtime IDs', 'subject_description': sheet.get('subject'), 'sheet_record': sheet})
    for idd, paths in generated_ids.items():
        if idd not in definitions and not any(word in idd for word in ['tree', 'bush', 'flower', 'grass', 'soil', 'decal', 'hydrangea', 'water-edge-plant']):
            source_only.append({'source_id': idd, 'runtime_id': None, 'catalogue': 'art/theme-consistency/generated', 'reason': 'generated source ID is not registered in active static library modules', 'provenance': paths})
    rows = sorted(eligible.values(), key=lambda row: (not row['golf_priority'], row['category'] or '', row['id']))
    golf_missing = [row for row in rows if row['golf_priority'] and not row['candidate_eight_views_present']]
    summary = {'schema': 1, 'created_utc': datetime.now(timezone.utc).isoformat(), 'live_checkout_read_only': str(LIVE),
        'scope': 'All statically registered building/prop stable subject IDs across every active generated library, including props omitted from T017; separate source-only/design catalogue and exclusions.',
        'counts': {'eligible_runtime_subjects': len(rows), 'eligible_buildings': sum(row['classification'] == 'building' for row in rows), 'eligible_props': sum(row['classification'] == 'prop' for row in rows),
                   'golf_priority_subjects': sum(row['golf_priority'] for row in rows), 'candidate_four_corners': sum(row['corner_count'] == 4 for row in rows),
                   'candidate_four_yawed8_cardinals': sum(row['turned_8degree_count'] == 4 for row in rows), 'candidate_full_eight': sum(row['candidate_eight_views_present'] for row in rows),
                   'runtime_eight_player_selectable': 0, 'golf_missing_any_eight_views': len(golf_missing), 'explicit_alias_records': len(aliases),
                   'excluded_runtime_subjects': sum('id' in item for item in exclusions), 'excluded_source_only_records': sum('source_id' in item for item in exclusions),
                   'supplemental_source_or_design_records': len(source_only),
                   'runtime_registered_corners_and_yawed8_cardinals': sum(row['registered_eight_degree_cardinals'] and row['registered_view_mapping'].get('cornerIdsPresent', False) for row in rows)},
        'limitations': ['File/alpha/hash checks do not certify visual camera yaw, style fidelity, or owner approval.', 'Eight-degree generated classification uses explicit turned directory/metadata or actual generation provenance; square N/E/S/W and Idol rough renders never count.', 'Current PropsTool has four rotation positions; eight file candidates do not imply eight player-selectable facings.', 'Certain manifests are multi-subject designs without stable runtime IDs; mapped separately instead of inventing IDs.', 'Nested geometry-review holds/conflicts are retained in review evidence even when legacy integrationStatus says ready.', 'No full tests, builds, game servers or runtime modifications.'],
        'owner_approval_claimed': False, 'items': rows}
    write('catalogue-audit.json', summary)
    write('exclusions.json', exclusions)
    write('aliases.json', aliases)
    write('supplemental-source-only.json', source_only)
    write('missing-golf-views.json', [{'id': row['id'], 'name': row['name'], 'category': row['category'], 'missing_corners': row['missing_corner_views'], 'missing_turned_8degree': row['missing_turned_8degree_views'], 'registered_mapping': row['registered_view_mapping'], 'known_review': row['known_review'], 'known_cutoff': row.get('known_cutoff'), 'source': row['original_source']} for row in golf_missing])
    fields = ['id', 'name', 'category', 'kind', 'classification', 'golf_priority', 'corner_count', 'turned_8degree_count', 'candidate_eight_views_present', 'registered_eight_degree_cardinals', 'runtime_eight_player_facings', 'missing_corner_views', 'missing_turned_8degree_views', 'original_source']
    fields += [view + '_candidate_path' for view in ALL]
    with (OUTPUT / 'catalogue-audit.csv').open('w', newline='', encoding='utf-8-sig') as handle:
        writer = csv.DictWriter(handle, fieldnames=fields);writer.writeheader()
        for row in rows:
            values = {field: json.dumps(row[field], ensure_ascii=False) if isinstance(row[field], (dict, list)) else row[field] for field in fields if not field.endswith('_candidate_path')}
            values.update({view + '_candidate_path': row['selected_candidate_views'].get(view, {}).get('path', '') for view in ALL})
            writer.writerow(values)
    with (OUTPUT / 'missing-golf-views.csv').open('w', newline='', encoding='utf-8-sig') as handle:
        fields = ['id', 'name', 'category', 'missing_corners', 'missing_turned_8degree', 'known_cutoff', 'source']
        writer = csv.DictWriter(handle, fieldnames=fields);writer.writeheader()
        for row in golf_missing:
            values = {'id': row['id'], 'name': row['name'], 'category': row['category'], 'missing_corners': row['missing_corner_views'], 'missing_turned_8degree': row['missing_turned_8degree_views'], 'known_cutoff': row.get('known_cutoff'), 'source': row['original_source']}
            writer.writerow({key: json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else value for key, value in values.items()})
    compact = {key: value for key, value in summary.items() if key != 'items'}
    compact['golf_primary_missing'] = [{'id': row['id'], 'name': row['name'], 'missing_corners': row['missing_corner_views'], 'missing_turned_8degree': row['missing_turned_8degree_views']} for row in golf_missing if row['id'].startswith(('golf:', 'business:golf-'))]
    compact['additional_golf_manifest_without_cutouts'] = [item['name'] for item in source_only if item.get('catalogue') == 'art/new-props/manifest.json' and not item.get('runtime_id')]
    compact['known_clipped_golf_originals'] = [row['id'] for row in rows if row.get('known_cutoff')]
    compact['blocking_schema_ambiguities'] = ['T017 excluded693 non-subjects under its old scope; this audit includes their eligible props.', 'Golf manifest designs, budget sets and tournament sheets can lack authoritative stable runtime IDs; source-only records preserve that ambiguity.', 'Legacy ready registration can conflict with nested held geometry reviews; file presence never implies owner approval.']
    write('audit-summary.json', compact)
    print(json.dumps(summary['counts'], indent=2))


if __name__ == '__main__':
    main()
