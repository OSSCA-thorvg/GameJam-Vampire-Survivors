import ThorVG from '@thorvg/webcanvas';
import type { Canvas, Scene, ThorVGNamespace } from '@thorvg/webcanvas';

/** Name under which `initThorVG` registers the bundled HUD font (ADR 0013). */
export const HUD_FONT_NAME = 'hud';
/** Font built into `@thorvg/webcanvas`, registered as `'default'` during init; the fallback when the HUD font fails. */
export const FALLBACK_FONT = 'default';
/**
 * Path of the HUD font under the asset base URL, served from the Vite `publicDir` (`assets/fonts/hud.ttf`). #3 moves
 * this lookup to the asset manifest (`font.hud`).
 */
export const HUD_FONT_PATH = 'fonts/hud.ttf';

/**
 * Font for every ThorVG `Text`. Always use `text.font(HUD_FONT)`, never a literal name, and read it only after
 * `initThorVG` resolves: it is a live binding that `initThorVG` sets to `'hud'` once `assets/fonts/hud.ttf` (Noto Sans
 * Mono Regular, printable ASCII U+0020-007E only, ADR 0013) is loaded. If the load fails it stays `'default'`, the
 * built-in font, which covers only letters, digits, space and `( ) + - . =` (checked in #2), and one warning is
 * logged. Either way ThorVG text stays ASCII; Korean text and nicknames are DOM text (ADR 0009).
 */
export let HUD_FONT: string = FALLBACK_FONT;

export interface ThorVGContext {
  TVG: ThorVGNamespace;
  canvas: Canvas;
  /** Root scene, scaled from logical units (1280×720) to device pixels. Later issues add their layers under it. */
  root: Scene;
}

/**
 * Fetches the HUD font from `assetBaseUrl` and registers it with ThorVG, then points `HUD_FONT` at it. Never throws:
 * on any failure it logs one `console.warn`, leaves `HUD_FONT` as `'default'` and returns it. Called once by
 * `initThorVG`; exported for tests.
 */
export async function loadHudFont(
  TVG: Pick<ThorVGNamespace, 'Font'>,
  assetBaseUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const url = new URL(HUD_FONT_PATH, assetBaseUrl).href;
  try {
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    TVG.Font.load(HUD_FONT_NAME, bytes, { type: 'ttf' });
    HUD_FONT = HUD_FONT_NAME;
  } catch (err) {
    HUD_FONT = FALLBACK_FONT;
    console.warn(
      `[render] HUD font ${url} failed to load (${err instanceof Error ? err.message : String(err)}); using the built-in '${FALLBACK_FONT}' font`,
    );
  }
  return HUD_FONT;
}

/**
 * Initializes ThorVG once with the WebGL renderer on the transferred `OffscreenCanvas` (ADR 0003), then loads the HUD
 * font (ADR 0013). The device pixel ratio is applied through the root scene's scale, because a worker has no reliable
 * `devicePixelRatio`.
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
  await loadHudFont(TVG, assetBaseUrl);
  const canvas = new TVG.Canvas(offscreen, { width, height, enableDevicePixelRatio: false });
  const root = new TVG.Scene();
  root.scale(scale);
  canvas.add(root);
  return { TVG, canvas, root };
}
