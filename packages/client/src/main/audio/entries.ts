import {
  isAudioEntry,
  validateManifest,
  type AudioAssetEntry,
  type AudioAssetId,
} from '@vs/shared';

/** The manifest's audio entries by ID (#129, ADR 0021). */
export type AudioEntries = Partial<Record<AudioAssetId, AudioAssetEntry>>;

/**
 * Fetches and validates `manifest.json` once, like `loadAssetUrls`, and keeps only its `mp3` entries. A failure
 * leaves the game silent: `{}` and one warning.
 */
export async function loadAudioEntries(
  baseUrl: string,
  fetchJson: (url: URL) => Promise<unknown> = async (url) => {
    const response = await fetch(url, { redirect: 'error' });
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    return response.json();
  },
): Promise<AudioEntries> {
  try {
    const { manifest } = validateManifest(await fetchJson(new URL('manifest.json', baseUrl)));
    const out: AudioEntries = {};
    for (const [id, entry] of Object.entries(manifest.assets))
      if (isAudioEntry(entry)) out[id as AudioAssetId] = entry;
    return out;
  } catch (error) {
    console.warn(
      `[audio] manifest failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {};
  }
}
