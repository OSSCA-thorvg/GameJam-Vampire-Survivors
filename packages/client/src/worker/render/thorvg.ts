import ThorVG from '@thorvg/webcanvas';
import type { Canvas, Scene, ThorVGNamespace } from '@thorvg/webcanvas';
import type { AssetManifest } from '@vs/shared';

/** Name under which `initThorVG` registers the bundled HUD font (ADR 0013). */
export const HUD_FONT_NAME = 'hud';
/** Font built into `@thorvg/webcanvas`, registered as `'default'` during init; the fallback when the HUD font fails. */
export const FALLBACK_FONT = 'default';
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
  manifest: AssetManifest,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const entry = manifest.assets['font.hud'];
  const url = entry?.format === 'ttf' ? new URL(entry.file, assetBaseUrl).href : 'font.hud';
  try {
    if (entry?.format !== 'ttf') throw new Error('font.hud missing from manifest');
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    validateTrueType(bytes);
    TVG.Font.load(HUD_FONT_NAME, bytes, { type: 'ttf' });
    HUD_FONT = HUD_FONT_NAME;
  } catch (err) {
    HUD_FONT = FALLBACK_FONT;
    console.warn(
      `[render] font.hud ${url} failed to load (${err instanceof Error ? err.message : String(err)}); using the built-in '${FALLBACK_FONT}' font`,
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
  manifest: AssetManifest,
): Promise<ThorVGContext> {
  const TVG = await ThorVG.init({
    renderer: 'gl',
    locateFile: (p) => new URL('thorvg/' + (p.split('/').pop() ?? p), assetBaseUrl).href,
  });
  await loadHudFont(TVG, assetBaseUrl, manifest);
  const canvas = new TVG.Canvas(offscreen, { width, height, enableDevicePixelRatio: false });
  const root = new TVG.Scene();
  root.scale(scale);
  canvas.add(root);
  return { TVG, canvas, root };
}

/** Validate sfnt framing before ThorVG: a missing Vite file may be HTML with status 200. */
export function validateTrueType(bytes: Uint8Array): void {
  if (bytes.length < 12) throw new Error('invalid TrueType header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0x00010000 && view.getUint32(0) !== 0x74727565)
    throw new Error('response is not a TrueType font');
  const count = view.getUint16(4);
  if (count === 0 || 12 + count * 16 > bytes.length) throw new Error('invalid TrueType directory');
  const tables = new Set<string>();
  for (let i = 0; i < count; i++) {
    const start = 12 + i * 16;
    const tag = String.fromCharCode(...bytes.subarray(start, start + 4));
    const offset = view.getUint32(start + 8);
    const length = view.getUint32(start + 12);
    if (offset < 12 + count * 16 || offset + length > bytes.length)
      throw new Error('invalid TrueType table bounds');
    tables.add(tag);
  }
  if (
    ['cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name'].some((tag) => !tables.has(tag))
  )
    throw new Error('missing TrueType tables');
}
