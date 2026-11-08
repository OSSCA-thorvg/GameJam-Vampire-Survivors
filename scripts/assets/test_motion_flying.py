"""Real upstream causal regression and optional genuine flying provenance attacks."""
import copy
import os
from pathlib import Path
import tempfile
import unittest

from PIL import Image, ImageDraw
import sprite_gen.frames.extract as engine
from sprite_gen.curate.curation import apply_transform
from motion_refine_flying import coordinate_mapping, mask_evidence
from motion_bank_proof import validate_bank
from motion_inventory import DEFAULT_MOTION_RECIPE
from rebuild_common import ROOT, read_json, write_json


def amber_y(image):
    points = [(x, y) for y in range(image.height) for x in range(image.width)
              if (lambda p: p[3] >= 128 and p[0] > 100 and p[1] > 75 and p[2] < .8 * p[1])(image.getpixel((x, y)))]
    return sum(y for _, y in points) / len(points)


class FlyingCausalTests(unittest.TestCase):
    def test_wing_extent_cannot_move_a_source_stable_core(self):
        raw = Image.new('RGBA', (1600, 200), (0, 0, 0, 0))
        draw = ImageDraw.Draw(raw)
        for index in range(8):
            x = index * 200 + 100
            draw.rectangle((x - 20, 80, x + 20, 120 if index != 2 else 175), fill=(100, 30, 130, 255))
            draw.rectangle((x + 2, 98, x + 9, 105), fill=(255, 190, 20, 255))
        groups = engine.connected_components(raw)
        components, corrected = [], []
        for index, group in enumerate(groups):
            component = engine.component_group_image(raw, [group])
            proof, _ = mask_evidence(raw, [group])
            mapping = coordinate_mapping(proof, component.size, raw.size, index, .5, [128, 128])
            stage = apply_transform(component, mapping['componentToCellTransform'], (128, 128))
            corrected.append(engine.binarize_alpha(engine._kcentroid_downscale(stage, 64, 64, True)))
            components.append(component)
        old = engine.register_row_frames(components, slack_x=2, slack_y=1)
        old_ys, new_ys = [amber_y(im) for im in old], [amber_y(im) for im in corrected]
        self.assertGreater(max(old_ys) - min(old_ys), 20)
        self.assertLessEqual(max(new_ys) - min(new_ys), 1)


@unittest.skipUnless(os.environ.get('MOTION_TEST_FLYING_BANK'), 'Set MOTION_TEST_FLYING_BANK for genuine flying attacks')
class GenuineFlyingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path = (ROOT / os.environ['MOTION_TEST_FLYING_BANK']).resolve()
        cls.bank = read_json(cls.path)
        cls.recipe = read_json(DEFAULT_MOTION_RECIPE)
        cls.asset = next(a for a in cls.recipe['assets'] if a['id'] == cls.bank['id'])
        cls.tool = Path(os.environ.get('MOTION_TOOL_ROOT', str(ROOT / 'verification/issue-84/tool/sprite-gen'))).resolve() / '.venv/bin/sprite-gen'

    def reject(self, mutate):
        bank = copy.deepcopy(self.bank)
        mutate(bank)
        with tempfile.NamedTemporaryFile(prefix='flying-adversarial-', suffix='.json', dir=self.path.parent) as temporary:
            path = Path(temporary.name); write_json(path, bank)
            with self.assertRaises((ValueError, KeyError)):
                validate_bank(path, self.recipe, self.asset, self.tool)

    def coordinate_mutation(self, mutate):
        def update(bank):
            for frame in [*bank['sourceFrames'], *bank['frames']]:
                if frame['state'] == 'move' and frame.get('sourceIndex', frame['index']) == 2:
                    mutate(frame['coordinateProof'])
        self.reject(update)

    def test_actual_raw_component_coordinate_replay_passes(self):
        validate_bank(self.path, self.recipe, self.asset, self.tool)

    def test_custom_per_pose_offset_is_rejected(self):
        self.coordinate_mutation(lambda p: p['componentToCellTransform'].update(dy=99))

    def test_fake_raw_bbox_is_rejected(self):
        self.coordinate_mutation(lambda p: p.update(rawBBox=[0, 0, 1, 1]))

    def test_fake_slot_origin_is_rejected(self):
        self.coordinate_mutation(lambda p: p.update(slotOrigin=[0, 99]))

    def test_fake_mask_count_is_rejected(self):
        self.coordinate_mutation(lambda p: p.update(maskPixelCount=1))

    def test_fake_mask_membership_is_rejected(self):
        self.coordinate_mutation(lambda p: p.update(maskRawIndexSha256='0' * 64))

    def test_bottom_registration_is_rejected(self):
        self.reject(lambda b: b['placement'].update(registration='bottom'))

    def test_missing_foundation_hashes_are_rejected(self):
        self.reject(lambda b: b.update(foundationScripts=[]))


if __name__ == '__main__':
    unittest.main()
