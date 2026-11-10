import { describe, expect, it } from 'vitest';
import { createResizeFrame } from './resize-frame';

function setup(state: { ready: boolean; hidden: boolean }) {
  const calls: string[] = [];
  const resizer = createResizeFrame({
    apply: () => calls.push('apply'),
    render: () => calls.push('render'),
    ready: () => state.ready,
    hidden: () => state.hidden,
  });
  return { calls, resizer };
}

describe('createResizeFrame (#165)', () => {
  it('draws the resized canvas in the same task, so a cleared buffer is never presented', () => {
    const { calls, resizer } = setup({ ready: true, hidden: false });
    resizer.resize();
    // Nothing may be left for a later frame: the call that resizes the canvas also draws it, after the resize.
    expect(calls).toEqual(['apply', 'render']);
  });

  it('draws once per resize, however many resizes arrive', () => {
    const { calls, resizer } = setup({ ready: true, hidden: false });
    resizer.resize();
    resizer.resize();
    expect(calls).toEqual(['apply', 'render', 'apply', 'render']);
  });

  it('never draws in a hidden tab; the loop draws when it shows again', () => {
    const { calls, resizer } = setup({ ready: true, hidden: true });
    resizer.resize();
    expect(calls).toEqual(['apply']);
  });

  it('only applies the size before the game loop exists (boot)', () => {
    const { calls, resizer } = setup({ ready: false, hidden: false });
    resizer.resize();
    expect(calls).toEqual(['apply']);
  });
});
