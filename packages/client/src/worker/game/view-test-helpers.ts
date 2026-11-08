import type { Matrix, Paint, ThorVGNamespace } from '@thorvg/webcanvas';
import type { DrawableAssetId } from '@vs/shared';
import type { GameViewOptions } from './view';

/** A recorded fake paint: visibility, opacity, the last matrix or translation, and the last text. */
export interface FakePaint {
  id: string;
  visible: boolean;
  opacity: number;
  matrix: Matrix | null;
  translate: [number, number] | null;
  text: string | null;
  textWrites: number;
}

/** A fake of ThorVG's `Paint`/`Shape`/`Text` chain methods that records into `state`. */
function fakePaint(state: FakePaint): Paint {
  const paint: Record<string, unknown> = {
    visible(value?: boolean) {
      if (value === undefined) return state.visible;
      state.visible = value;
      return paint;
    },
    opacity(value?: number) {
      if (value === undefined) return state.opacity;
      state.opacity = value;
      return paint;
    },
    transform(m: Matrix) {
      state.matrix = { ...m };
      return paint;
    },
    translate(x: number, y: number) {
      state.translate = [x, y];
      return paint;
    },
    text(value: string) {
      state.text = value;
      state.textWrites++;
      return paint;
    },
  };
  for (const name of ['appendRect', 'fill', 'font', 'fontSize', 'outline', 'align'])
    paint[name] = () => paint;
  return paint as unknown as Paint;
}

/** Fakes for `createGameView`: a library and `Shape`/`Text` constructors that record every paint they create. */
export function fakeGameView() {
  const paints: FakePaint[] = [];
  const record = (id: string): Paint => {
    const state: FakePaint = {
      id,
      visible: true,
      opacity: 255,
      matrix: null,
      translate: null,
      text: null,
      textWrites: 0,
    };
    paints.push(state);
    return fakePaint(state);
  };
  const translations: [number, number][] = [];
  const add = () => undefined as never;
  const TVG = {
    Shape: function Shape() {
      return record('Shape');
    },
    Text: function Text() {
      return record('Text');
    },
  } as unknown as Pick<ThorVGNamespace, 'Shape' | 'Text'>;
  const options: GameViewOptions = {
    TVG,
    library: {
      create: (id: DrawableAssetId) => ({ paint: record(id), offsetX: 0, offsetY: 0 }),
    },
    layers: {
      world: {
        translate: (x: number, y: number) => (translations.push([x, y]), undefined as never),
      },
      ground: { add },
      enemies: { add },
      player: { add },
      hud: { add },
    },
    scale: () => 2,
  };
  return { options, paints, translations };
}
