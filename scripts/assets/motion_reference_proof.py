"""Read-only replay of upstream direction-anchor, generation-plan and guide ancestry."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import tempfile

from sprite_gen.curate.anchor import anchor_image, frame_source_path
from sprite_gen.curate.curation import load_curation_report
from sprite_gen.gen.prepare import build_generation_plan, draw_guide
from sprite_gen.spec.layout import guide_rel
from rebuild_common import ROOT, digest, portable, read_json


def prove(origin, selected_request, state, references):
    request_file = origin / 'sprite-request.json'
    request = read_json(request_file)
    for key in ['layout', 'directions', 'cell', 'fit', 'chroma_key', 'chroma']:
        if request.get(key) != selected_request.get(key):
            raise ValueError('Adopted source request geometry/direction differs from its provider origin')
    if request['states'][state] != selected_request['states'][state]:
        raise ValueError('Adopted source state differs from its original generation request')
    plan_file = origin / 'references/generation-plan.json'
    plan = build_generation_plan(request)
    if read_json(plan_file) != plan:
        raise ValueError('Generation plan differs from the upstream request-derived plan')
    guide = origin / guide_rel(request, state)
    with tempfile.TemporaryDirectory(prefix='motion-guide-proof-', dir=ROOT / 'verification') as temporary:
        expected = Path(temporary) / 'guide.png'
        draw_guide(expected, request['states'][state]['frames'], request['cell'])
        if digest(expected) != digest(guide):
            raise ValueError('Layout guide differs from its exact upstream request-derived geometry')
    identity = origin / 'base-source.png'
    result = {'originRequest': portable(request_file), 'originRequestSha256': digest(request_file),
              'generationPlan': portable(plan_file), 'generationPlanSha256': digest(plan_file),
              'layoutGuide': portable(guide), 'layoutGuideSha256': digest(guide)}
    if state == 'down45_walk':
        identity = origin / 'references/anchors/down45-anchor-x8.png'
        curation, status = load_curation_report(origin)
        if status['dropped'] or status['anchors_stale']:
            raise ValueError('Curated anchor generation must remain current and fully verifiable')
        image, resolved = anchor_image(origin, request, curation, 'down45')
        if resolved['source'] != 'picked' or resolved['state'] != 'down45_idle':
            raise ValueError('Walk identity requires the explicitly curated idle direction anchor')
        encoded = io.BytesIO()
        image.save(encoded, format='PNG')
        if hashlib.sha256(encoded.getvalue()).hexdigest() != digest(identity):
            raise ValueError('Walk anchor cache differs from its actual curated upstream derivation')
        source = frame_source_path(origin, request, curation, resolved['state'], resolved['index'])
        result['anchor'] = {'selection': resolved, 'curationFile': portable(origin / 'curation.json'),
            'curationSha256': digest(origin / 'curation.json'), 'sourceFrame': portable(source),
            'sourceFrameSha256': digest(source), 'derivedReference': portable(identity),
            'derivedReferenceSha256': digest(identity), 'idleRawSha256': digest(origin / 'raw/down45/idle.png')}
    expected_refs = [{'file': portable(path), 'sha256': digest(path)} for path in [identity, guide]]
    if references != expected_refs:
        raise ValueError('Actual generation must reference exactly its declared identity and layout guide')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    args = parser.parse_args()
    value = read_json(args.input)
    print(json.dumps(prove(Path(value['origin']), value['request'], value['state'], value['references'])))
