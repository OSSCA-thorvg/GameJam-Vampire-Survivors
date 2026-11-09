import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createCachedLottie } from '../../packages/client/src/worker/assets/image-lottie.ts';
import { validateLottie } from '../../packages/shared/src/lottie.ts';
const base = resolve(process.argv[2] ?? 'verification/issue-84/publication/rotation-proof');
const pkg = resolve('packages/client/node_modules/@thorvg/webcanvas/dist');
const { init } = createRequire(import.meta.url)(resolve(pkg, 'webcanvas.cjs.js'));
class Sink {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.last = null;
  }
  getContext() {
    return {
      putImageData: (v) => {
        this.last = Uint8Array.from(v.data);
      },
      clearRect: () => {
        this.last = null;
      },
    };
  }
}
globalThis.OffscreenCanvas = Sink;
globalThis.ImageData = class {
  data;
  width;
  height;
  constructor(data, w, h) {
    this.data = data;
    this.width = w;
    this.height = h;
  }
};
const TVG = await init({
  renderer: 'sw',
  locateFile: () =>
    `data:application/wasm;base64,${readFileSync(resolve(pkg, 'thorvg.wasm')).toString('base64')}`,
});
const resources = JSON.parse(readFileSync(resolve(base, 'derived.json'), 'utf8')).resources.filter(
  (r) => r.rotationEnvelope,
);
const results = [];
const q = 4,
  pad = 8,
  samples = 720;
function instance(doc, owner) {
  const json = JSON.stringify(doc),
    definition = validateLottie(doc, owner, 'flat'),
    images = new Map();
  for (const image of definition.images) {
    const bytes = Uint8Array.from(
      readFileSync(resolve(base, 'assets', dirname(owner), image.path)),
    );
    images.set(image.path, bytes);
    images.set('/' + image.path, bytes);
  }
  const animation = createCachedLottie(TVG, { json, definition, images });
  const sink = new Sink(doc.w * q, doc.h * q);
  const canvas = new TVG.Canvas(sink, {
    width: sink.width,
    height: sink.height,
    enableDevicePixelRatio: false,
  });
  canvas.add(animation.picture);
  animation.picture.transform({
    e11: q,
    e12: 0,
    e13: 0,
    e21: 0,
    e22: q,
    e23: 0,
    e31: 0,
    e32: 0,
    e33: 1,
  });
  return {
    animation,
    sink,
    canvas,
    dispose() {
      canvas.remove(animation.picture);
      animation.dispose();
      canvas.destroy();
    },
  };
}
for (const resource of resources) {
  const owner = resource.file.replace(/\/pose-0\.png$/, '.json'),
    final = JSON.parse(readFileSync(resolve(base, 'assets', owner), 'utf8'));
  for (const variant of ['original50', 'fitted']) {
    const doc = structuredClone(final);
    if (variant === 'original50') doc.layers[0].ks.s.k = [50, 50, 100];
    const ref = structuredClone(doc);
    ref.w += pad * 2;
    ref.h += pad * 2;
    ref.layers[0].ks.p.k[0] += pad;
    ref.layers[0].ks.p.k[1] += pad;
    const a = instance(doc, owner),
      b = instance(ref, owner);
    let clippedSamples = 0,
      maxOutside = 0,
      insideMismatch = 0,
      minAlpha = Infinity;
    for (let j = 0; j < samples; j++) {
      const t = (j / samples) * doc.op;
      a.animation.frame(t);
      b.animation.frame(t);
      a.canvas.update().render();
      b.canvas.update().render();
      let outside = 0,
        sum = 0,
        mismatch = 0;
      for (let y = 0; y < b.sink.height; y++)
        for (let x = 0; x < b.sink.width; x++) {
          const alpha = b.sink.last[(y * b.sink.width + x) * 4 + 3];
          sum += alpha;
          const ax = x - pad * q,
            ay = y - pad * q;
          if (ax < 0 || ay < 0 || ax >= a.sink.width || ay >= a.sink.height) {
            if (alpha) outside++;
          } else if (alpha !== a.sink.last[(ay * a.sink.width + ax) * 4 + 3]) mismatch++;
        }
      if (outside) clippedSamples++;
      maxOutside = Math.max(maxOutside, outside);
      insideMismatch = Math.max(insideMismatch, mismatch);
      minAlpha = Math.min(minAlpha, sum);
    }
    results.push({
      id: resource.id,
      variant,
      frames: samples,
      loop: [doc.ip, doc.op],
      scalePercent: doc.layers[0].ks.s.k[0],
      clippedSamples,
      maxOutside,
      insideMismatch,
      minAlpha,
    });
    a.dispose();
    b.dispose();
  }
}
TVG.term();
writeFileSync(
  resolve(base, 'native-all-angle-result.json'),
  JSON.stringify(
    {
      kind: 'Actual createCachedLottie/ThorVG SW all-angle loop sweep versus enlarged reference viewport',
      samplesPerVariant: samples,
      qualityScale: q,
      referencePadding: pad,
      analyticContinuousEnvelope:
        'Opaque pixel-corner radius +0.5 logical-pixel margin; native720samples cover actual unchanged0..360 rotation timeline',
      results,
    },
    null,
    2,
  ) + '\n',
);
process.stdout.write(JSON.stringify(results) + '\n');
if (results.filter((r) => r.variant === 'fitted').some((r) => r.clippedSamples || r.minAlpha === 0))
  process.exitCode = 1;
