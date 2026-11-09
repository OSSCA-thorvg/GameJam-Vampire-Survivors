// #22: shows a finished stress scenario's summary (dev and `perf` builds only). Every call into this module is wrapped
// in `if (import.meta.env.DEV || import.meta.env.MODE === 'perf')`, and it has no top-level side effects, so the normal
// production bundle drops it. Text goes through `textContent` only (ADR 0011).
import type { StressResult } from '../protocol/worker-messages';

/** The full summary: the worker's timings plus what only the main thread knows. */
export type StressSummary = StressResult & { ua: string; gpu: string; loadMs: number | null };

/** The unmasked WebGL renderer string, or `"unavailable"` when the browser hides it. */
export function readGpu(doc: Document = document): string {
  try {
    const gl = doc.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer: unknown = gl && info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
    return typeof renderer === 'string' && renderer !== '' ? renderer : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/**
 * Logs the summary as one JSON line (`console.warn`) and shows it with a "Copy results" button that puts the same
 * JSON on the clipboard. `loadMs` is the time from navigation to `assetsReady`, or `null` if it had not arrived.
 */
export function showStressResult(
  root: HTMLElement,
  result: StressResult,
  loadMs: number | null,
): StressSummary {
  const summary: StressSummary = { ...result, ua: navigator.userAgent, gpu: readGpu(), loadMs };
  const json = JSON.stringify(summary);
  console.warn(`[stress] result ${json}`);
  const box = document.createElement('div');
  box.id = 'stress-result';
  const text = document.createElement('pre');
  text.textContent = JSON.stringify(summary, null, 2);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Copy results';
  button.addEventListener('click', () => {
    navigator.clipboard.writeText(json).then(
      () => {
        button.textContent = 'Copied';
      },
      (error: unknown) => {
        console.warn('[stress] copy failed:', error);
        button.textContent = 'Copy failed';
      },
    );
  });
  box.append(button, text);
  root.append(box);
  return summary;
}
