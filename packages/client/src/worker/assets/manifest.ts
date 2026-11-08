import { validateManifest, type ManifestValidation } from '@vs/shared';

export async function loadManifest(baseUrl: string): Promise<ManifestValidation> {
  try {
    const response = await fetch(new URL('manifest.json', baseUrl));
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    const json: unknown = await response.json();
    const validated = validateManifest(json);
    for (const error of validated.errors) console.error(`[assets] ${error}`);
    return validated;
  } catch (error) {
    console.warn(
      `[assets] manifest failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      manifest: { version: 1, assets: {} },
      errors: [],
      missing: validateManifest({ version: 1, assets: {} }).missing,
    };
  }
}
