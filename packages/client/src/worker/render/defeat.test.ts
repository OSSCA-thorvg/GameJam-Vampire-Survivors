import { expect, it } from 'vitest';
import type { Paint, ThorVGNamespace } from '@thorvg/webcanvas';
import { createDefeatOverlay, DEFEAT_DIM, DEFEAT_TEXT } from './defeat';

it('shows a printable-ASCII line over the world dimmed to 40% and restores it (#20)', () => {
  const text = { visible: true, text: '' };
  const fake: Record<string, unknown> = {};
  for (const name of ['font', 'fontSize', 'fill', 'outline', 'align', 'translate'])
    fake[name] = () => fake;
  fake.text = (t: string) => ((text.text = t), fake);
  fake.visible = (v: boolean) => ((text.visible = v), fake);
  const TVG = {
    Text: function Text() {
      return fake;
    },
  } as unknown as Pick<ThorVGNamespace, 'Text'>;
  const added: unknown[] = [];
  const opacities = [255, 255];
  const dim = opacities.map(
    (_, i) => ({ opacity: (v: number) => ((opacities[i] = v), undefined) }) as unknown as Paint,
  );
  const overlay = createDefeatOverlay(
    TVG,
    { add: (p) => (added.push(p), undefined as never) },
    dim,
  );
  expect(added).toEqual([fake]);
  expect(text.visible).toBe(false);
  expect(DEFEAT_TEXT).toMatch(/^[\x20-\x7e]+$/);
  overlay.setVisible(true);
  expect(overlay.visible).toBe(true);
  expect(text).toEqual({ visible: true, text: DEFEAT_TEXT });
  expect(opacities).toEqual([DEFEAT_DIM, DEFEAT_DIM]);
  expect(DEFEAT_DIM / 255).toBeCloseTo(0.4, 2);
  overlay.setVisible(false);
  expect(opacities).toEqual([255, 255]);
  expect(text.visible).toBe(false);
});
