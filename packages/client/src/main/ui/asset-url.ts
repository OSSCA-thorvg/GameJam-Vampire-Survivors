import { validateManifest, type AssetId } from '@vs/shared';

/** Resolves an asset ID to the URL of its art, or `null` when the manifest has none for it. */
export type AssetUrl = (id: AssetId) => string | null;

/**
 * Fetches `manifest.json` from the assets base URL once and validates it (ADR 0007), for DOM screens that show icons
 * (#11's level-up cards; #12 and #14 reuse it). IDs without valid art resolve to `null` and the screen draws a magenta
 * box instead. A failed fetch resolves every ID to `null` with one warning.
 */
export async function loadAssetUrls(baseUrl: string): Promise<AssetUrl> {
  try {
    const response = await fetch(new URL('manifest.json', baseUrl));
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    const { manifest } = validateManifest(await response.json());
    return (id) => {
      const entry = manifest.assets[id];
      return entry ? new URL(entry.file, baseUrl).href : null;
    };
  } catch (error) {
    console.warn(
      `[assets] icon manifest failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return () => null;
  }
}
