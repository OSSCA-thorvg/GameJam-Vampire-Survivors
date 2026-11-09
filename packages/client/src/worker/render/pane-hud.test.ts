import type { Paint, ThorVGNamespace } from '@thorvg/webcanvas';
import { describe, expect, it } from 'vitest';
import {
  AWAY_OPACITY,
  AWAY_TEXT,
  createOpponentHud,
  createPaneLabel,
  OPPONENT_LABEL,
  OUT_OPACITY,
  OUT_TEXT,
  YOU_LABEL,
} from './pane-hud';

function fakeText() {
  const texts: { visible: boolean; text: string; writes: number }[] = [];
  const TVG = {
    Text: function Text() {
      const state = { visible: true, text: '', writes: 0 };
      texts.push(state);
      const t: Record<string, unknown> = {};
      for (const name of ['font', 'fontSize', 'fill', 'outline', 'align', 'translate'])
        t[name] = () => t;
      t.text = (v: string) => ((state.text = v), state.writes++, t);
      t.visible = (v: boolean) => ((state.visible = v), t);
      return t;
    },
  } as unknown as Pick<ThorVGNamespace, 'Text'>;
  const layer = { add: () => layer } as never;
  return { TVG, texts, layer };
}

describe('pane HUD', () => {
  it('keeps every label printable ASCII', () => {
    for (const s of [YOU_LABEL, OPPONENT_LABEL, AWAY_TEXT, OUT_TEXT])
      expect(s).toMatch(/^[\x20-\x7e]+$/);
  });

  it('creates a hidden label once and only shows or hides it', () => {
    const f = fakeText();
    const label = createPaneLabel(f.TVG, f.layer, YOU_LABEL);
    expect(f.texts).toEqual([{ visible: false, text: 'YOU', writes: 1 }]);
    label.setVisible(true);
    expect(f.texts[0]?.visible).toBe(true);
    label.setVisible(false);
    expect(f.texts).toHaveLength(1);
  });

  it('shows the opponent timer once the first view arrives and rewrites it only on a new second', () => {
    const f = fakeText();
    const hud = createOpponentHud(f.TVG, f.layer, f.layer, []);
    const [label, timer] = f.texts;
    expect(label).toMatchObject({ visible: true, text: 'OPPONENT' });
    expect(timer?.visible).toBe(false);
    hud.sync(61_200);
    expect(timer).toMatchObject({ visible: true, text: '01:01' });
    const writes = timer?.writes ?? 0;
    hud.sync(61_900);
    expect(timer?.writes).toBe(writes);
    hud.sync(62_000);
    expect(timer?.text).toBe('01:02');
    hud.sync(null);
    expect(timer?.visible).toBe(false);
  });

  it('dims the opponent world and HUD to 60% while away and 40% once out, with the state line', () => {
    const f = fakeText();
    const opacities = [255, 255];
    const dim = opacities.map(
      (_, i) => ({ opacity: (v: number) => ((opacities[i] = v), undefined) }) as unknown as Paint,
    );
    const hud = createOpponentHud(f.TVG, f.layer, f.layer, dim);
    const line = f.texts[2];
    expect(line?.visible).toBe(false);
    hud.setState('away');
    expect(opacities).toEqual([AWAY_OPACITY, AWAY_OPACITY]);
    expect(line).toMatchObject({ visible: true, text: 'AWAY' });
    hud.setState('out');
    expect(opacities).toEqual([OUT_OPACITY, OUT_OPACITY]);
    expect(line?.text).toBe('OUT');
    hud.setState('live');
    expect(opacities).toEqual([255, 255]);
    expect(line?.visible).toBe(false);
    expect(hud.state).toBe('live');
  });
});
