// Audio decode journey (ADR 0021, #128): the browser decodes every sfx.* and music.* MP3 the manifest lists to exactly
// its recorded `samples` at 44.1 kHz, so a buffer loop with `loopEnd = duration` is gapless. The `chromium` project runs
// it in CI; `VERIFY_AUDIO_ENGINES=1` adds the `audio-firefox` and `audio-webkit` projects (installed separately).
import { expect, test } from '@playwright/test';
import { noteEvidence, startEvidence } from './helpers';

interface Decoded {
  id: string;
  file: string;
  samples: number;
  length: number;
  sampleRate: number;
  bytes: number;
}

test('decodes every audio asset to its exact manifest length', async ({ page }, info) => {
  const evidence = startEvidence(page, `audio-decode-${info.project.name}`);
  await page.goto('/');
  const decoded = await page.evaluate(async (): Promise<Decoded[]> => {
    const base = new URL('manifest.json', document.baseURI);
    const manifest = (await (await fetch(base)).json()) as {
      assets: Record<string, { file: string; format: string; samples?: number }>;
    };
    const out: Decoded[] = [];
    for (const [id, entry] of Object.entries(manifest.assets)) {
      if (entry.format !== 'mp3') continue;
      const response = await fetch(new URL(entry.file, base));
      if (!response.ok) throw new Error(`${id}: HTTP ${String(response.status)}`);
      const bytes = await response.arrayBuffer();
      const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes.slice(0));
      out.push({
        id,
        file: entry.file,
        samples: entry.samples ?? -1,
        length: buffer.length,
        sampleRate: buffer.sampleRate,
        bytes: bytes.byteLength,
      });
    }
    return out;
  });
  evidence.json('decoded', decoded);
  evidence.flush();
  noteEvidence(info, evidence);
  expect(decoded).toHaveLength(19);
  expect(decoded.map((sound) => sound.id)).not.toContain('sfx.splash');
  for (const sound of decoded) {
    expect(sound.sampleRate, sound.id).toBe(44100);
    expect(sound.length, sound.id).toBe(sound.samples);
  }
});
