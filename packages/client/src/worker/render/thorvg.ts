import ThorVG from '@thorvg/webcanvas';
import type { Canvas, Scene, ThorVGNamespace } from '@thorvg/webcanvas';

/**
 * Font for every ThorVG `Text`: `@thorvg/webcanvas` registers its built-in font as `'default'` during init, so no font
 * file is fetched. Always use `text.font(HUD_FONT)`, never a literal name. The built-in font lacks Hangul, so ThorVG
 * text stays ASCII, and it covers only letters, digits, space and `( ) + - . =`: `/`, `:`, `%` and other punctuation
 * render as gaps (checked in #2). Korean text and nicknames are DOM text (ADR 0009).
 */
export const HUD_FONT = 'default';

export interface ThorVGContext {
  TVG: ThorVGNamespace;
  canvas: Canvas;
  /** Root scene, scaled from logical units (1280×720) to device pixels. Later issues add their layers under it. */
  root: Scene;
}

/**
 * Initializes ThorVG once with the WebGL renderer on the transferred `OffscreenCanvas` (ADR 0003). The device pixel
 * ratio is applied through the root scene's scale, because a worker has no reliable `devicePixelRatio`.
 */
export async function initThorVG(
  offscreen: OffscreenCanvas,
  width: number,
  height: number,
  scale: number,
  assetBaseUrl: string,
): Promise<ThorVGContext> {
  const TVG = await ThorVG.init({
    renderer: 'gl',
    locateFile: (p) => new URL('thorvg/' + (p.split('/').pop() ?? p), assetBaseUrl).href,
  });
  const canvas = new TVG.Canvas(offscreen, { width, height, enableDevicePixelRatio: false });
  const root = new TVG.Scene();
  root.scale(scale);
  canvas.add(root);
  return { TVG, canvas, root };
}
