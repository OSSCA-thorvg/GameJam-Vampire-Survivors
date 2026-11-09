# Asset gallery

Development/e2e `/?gallery` shows every drawable catalog ID through the replaceable manifest loader (#3), with the starter art pack for every ID and a speed preview of mass art (#5).

## Sub-features

- Loading text shows `Loading n/total` until assetsReady; the `assets` snapshot reports `ready`, `loaded`, `total`, `placeholders`, `font`. Baseline is 85/85, font `hud`, no placeholders (`placeholders` is `[]`).
- `gallery` reports `ids`, `panX`, `panY`, `width`, `height`, `lottieFrame`: all 84 drawable IDs, fonts excluded; real arrow input pans through all groups; white crosses mark anchors.
- Every drawable ID draws as art (#5 starter pack); the only magenta on screen is the `ui.placeholder` reference itself. Both Lottie effects, `fx.levelUp` and `fx.chestOpen`, animate. Static instance creation makes no requests after loading.
- Speed preview (#5, dev builds only): `V` (`KeyV`, debug command `galleryPreview`) toggles a view of `stage.ground` tiled across the screen with a labelled cluster of 30 instances for each of the 18 mass IDs (six enemies, three gems, nine mass projectiles) drifting at 100 units/s, odd rows rightward and the middle row leftward, flipped. The `galleryPreview` snapshot field is `true` while it shows; the worker logs `[debug] gallery preview shown`/`hidden`. Ground tiles show no seams. Its Paints are created once, the first time it opens.
- Replacing the static `portrait.warden` PNG at four-times `ASSET_SIZES` dimensions changes only that portrait cell; all four static portraits retain their logical size/anchor. Animated actor primaries and their owned pose banks remain untouched.
- A temporary orange bat PNG establishes the static-format baseline, file-only green PNG replacement and an inert SVG format switch preserve its32×32 logical size/anchor after reload. Broken drawables warn once, render magenta, and keep simulating.
- `font.hud` can move to a different manifest path; absent/invalid fonts including HTML returned with HTTP 200 warn once and select `default`, with boot continuing.
- Catalog edits without assets:sync fail the real asset/catalog/graph tests; after syncing, the same checks name the new `needed` ID without generated-ID drift, and that ID is labelled and magenta in the gallery until its art and manifest entry exist. The mutation invokes the real tests directly so fixture formatting does not hide the intended negative checks; full `pnpm check` remains the normal release gate.

## How to get to it (user POV)

Open `/?gallery` after verify:launch and Doctor succeed. No server is needed. Hold arrow keys to pan. Press `V` for the speed preview, `V` again to return. Production does not contain this entry point. Mutation journeys use the isolated verification worktree and restore every modified file in finally; stop other file editors while running them.

## Driving it

### Claude in Chrome

1. Detect the extension with tabs_context_mcp, create a new verification tab, start GIF recording and navigate to `http://localhost:5180/?gallery`. Use Playwright when the extension is unavailable.
2. Read `await window.__vsTest.waitFor(s => s.assets?.ready, 30000)` and capture a screenshot. Check 85/85, hud, 84 drawable IDs, an empty placeholders list and no font.hud in gallery.ids.
3. Press `v` once with `computer` `key`, wait for `s.galleryPreview === true`, screenshot, wait 1 s, screenshot again (the clusters moved; the middle row drifts left, flipped), zoom on tile corners to check for seams, press `v` again and wait for `false`.
4. Use real ArrowDown key presses with repeat, taking screenshots after each pan; inspect every group, readable labels and white anchor crosses. Record the ring before/after its frame advances. ArrowUp returns toward the top.
5. Save the manifest. Leave the actor primary JSON/owned PNG bank intact. Create an orange128×128 `enemies/bat-test.png`, temporarily point enemy.bat to PNG/nearest with loop removed, reload, then change only this PNG to green and reload at the same32×32 size/anchor. Switch to an inert cyan32×32 SVG, remove filter/loop, reload, then restore the manifest and remove both fixtures. Separately replace only the static portrait.warden PNG at four-times its logical size; compare all four portrait cells and restore its bytes.
6. Temporarily rename the bat file and reload: magenta bat, one worker warning and continuing steps. Restore. Read worker logs through the Playwright companion because extension console cannot inspect workers.
7. Temporarily relocate identical font bytes and edit font.hud: hud still works. Then reference an absent .ttf and an HTML .ttf: default font, one clear warning each, continuing steps. Restore all files.
8. Add a temporary catalog ID; run `pnpm exec vitest run packages/shared/src/assets.test.ts packages/shared/src/assets-catalog.test.ts packages/shared/src/motion-graph.test.ts` (fails generated IDs), run assets:sync, and repeat those real checks (fails naming the new ID, without generated-ID drift). Reload and pan to the new magenta ID. Restore catalog and generated IDs. Direct tests avoid the deliberately edited Markdown fixture failing formatting before the intended catalog assertions.
9. Export the GIF, screenshots, snapshot JSON and companion worker/network logs to verification/issue-<N>/, close only the created tab, then cleanup.

### Playwright

Save the following two complete specs to `verification/issue-<N>/journeys/gallery.spec.ts` (#3: loading, panning, replacement, fallbacks, catalog drift) and `verification/issue-<N>/journeys/gallery-pack.spec.ts` (#5: no placeholders, magenta budget, both Lottie effects, the speed preview, the static portrait swap). Run it against a launched/Doctored client using the commands in verify-game. It creates dedicated browser contexts, uses real keyboard input, collects evidence and restores temporary disk edits.

```ts
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import {
  openGame,
  waitForSnapshot,
  snapshot,
  holdKeys,
  startEvidence,
  pageErrors,
} from '../../../e2e/helpers';

const root = resolve(import.meta.dirname, '../../..');
const file = (path: string) => resolve(root, path);
const manifestPath = file('assets/manifest.json');
const manifestBytes = readFileSync(manifestPath);
const baseline = JSON.parse(manifestBytes.toString());
const batPath = file('assets/' + baseline.assets['enemy.bat'].file);
const batBytes = readFileSync(batPath);
const assetsReady = (page: Parameters<typeof snapshot>[0]) =>
  waitForSnapshot(page, (s) => (s.assets as { ready?: boolean })?.ready === true, 30000);
const selected = (s: Awaited<ReturnType<typeof snapshot>>) =>
  s.assets as {
    ready: boolean;
    font: string;
    loaded: number;
    total: number;
    placeholders: string[];
  };
const gallery = (s: Awaited<ReturnType<typeof snapshot>>) =>
  s.gallery as { ids: string[]; panX: number; panY: number; height: number; lottieFrame: number };
function writeManifest(edit: (json: typeof baseline) => void) {
  const json = structuredClone(baseline);
  edit(json);
  writeFileSync(manifestPath, JSON.stringify(json));
}
function command(args: string[]) {
  const run = spawnSync('pnpm', args, { cwd: root, encoding: 'utf8' });
  return { status: run.status, output: run.stdout + run.stderr };
}
function diagnosticPng(
  width: number,
  height: number,
  rgb: readonly [number, number, number] = [20, 240, 100],
) {
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const b of bytes) {
      c ^= b;
      for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (name: string, data: Buffer) => {
    const tag = Buffer.from(name);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const hash = Buffer.alloc(4);
    hash.writeUInt32BE(crc(Buffer.concat([tag, data])));
    return Buffer.concat([size, tag, data, hash]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * (1 + width * 4) + 1 + x * 4;
      rows[i] = rgb[0];
      rows[i + 1] = rgb[1];
      rows[i + 2] = rgb[2];
      rows[i + 3] = 255;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
test.describe.configure({ mode: 'serial' });

test('gallery: loading progress, all IDs, panning, animation and no repeat fetch', async ({
  page,
  context,
}) => {
  const ev = startEvidence(page, 'gallery');
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await context.route('**/' + baseline.assets['enemy.bat'].file, async (route) => {
    await gate;
    await route.continue();
  });
  const requests: string[] = [];
  context.on('request', (r) => requests.push(r.url()));
  try {
    await page.goto('/?gallery');
    await expect(page.locator('#loading')).toContainText(/Loading \d+\/85/);
    await ev.shot('loading');
    release();
    const ready = await assetsReady(page);
    ev.json('ready', ready);
    await expect(page.locator('#loading')).toHaveCount(0);
    expect(selected(ready)).toMatchObject({ loaded: 85, total: 85, font: 'hud' });
    expect(selected(ready).placeholders).toEqual([]);
    expect(gallery(ready).ids).toHaveLength(84);
    expect(gallery(ready).ids).not.toContain('font.hud');
    await ev.shot('top');
    const requestCount = requests.length;
    let previous = ready;
    while (gallery(previous).panY < gallery(previous).height - 720) {
      await holdKeys(page, ['ArrowDown'], 1000);
      previous = await snapshot(page);
      await ev.shot(`pan-${Math.round(gallery(previous).panY)}`);
    }
    ev.json('bottom', previous);
    expect(gallery(previous).panY).toBeGreaterThan(0);
    const first = gallery(previous).lottieFrame;
    await waitForSnapshot(page, (s) => Math.abs(gallery(s).lottieFrame - first) > 8, 500);
    await ev.shot('animation-later');
    expect(
      requests.slice(requestCount).filter((url) => /\.(svg|ttf|json|png|webp)(\?|$)/.test(url)),
    ).toEqual([]);
    ev.json('requests', requests);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    release();
    ev.flush();
    await context.unroute('**/' + baseline.assets['enemy.bat'].file);
  }
});

test('gallery: PNG replacement and SVG format switch preserve logical size/anchor', async ({
  page,
}) => {
  const ev = startEvidence(page, 'gallery-swap');
  const svg = file('assets/enemies/bat-test.svg');
  const png = file('assets/enemies/bat-test.png');
  const contract = {
    size: baseline.assets['enemy.bat'].size,
    anchor: baseline.assets['enemy.bat'].anchor,
  };
  expect(contract.size).toEqual([32, 32]);
  expect(contract.anchor).toEqual([0.5, 0.5]);
  try {
    await openGame(page, '/?gallery');
    await assetsReady(page);
    await holdKeys(page, ['ArrowDown'], 850);
    await ev.shot('original-bat');
    // Native actor JSON and its owned bank remain untouched. Establish a temporary static PNG first.
    const orange = diagnosticPng(128, 128, [240, 140, 20]);
    writeFileSync(png, orange);
    await expect
      .poll(async () =>
        Buffer.compare(await (await page.request.get('/enemies/bat-test.png')).body(), orange),
      )
      .toBe(0);
    writeManifest((json) => {
      json.assets['enemy.bat'].file = 'enemies/bat-test.png';
      json.assets['enemy.bat'].format = 'png';
      json.assets['enemy.bat'].filter = 'nearest';
      delete json.assets['enemy.bat'].loop;
    });
    await openGame(page, '/?gallery');
    expect(selected(await assetsReady(page)).placeholders).not.toContain('enemy.bat');
    await holdKeys(page, ['ArrowDown'], 850);
    await ev.shot('orange-png-baseline');
    const pngManifest = readFileSync(manifestPath);
    const replacement = diagnosticPng(128, 128);
    writeFileSync(png, replacement);
    await expect
      .poll(async () =>
        Buffer.compare(await (await page.request.get('/enemies/bat-test.png')).body(), replacement),
      )
      .toBe(0);
    await openGame(page, '/?gallery');
    expect(selected(await assetsReady(page)).placeholders).not.toContain('enemy.bat');
    await holdKeys(page, ['ArrowDown'], 850);
    await ev.shot('green-png-replacement');
    expect(readFileSync(manifestPath)).toEqual(pngManifest);
    expect(readFileSync(batPath)).toEqual(batBytes);
    expect(JSON.parse(pngManifest.toString()).assets['enemy.bat']).toMatchObject(contract);
    const svgSource =
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" fill="#00ffff"/></svg>';
    writeFileSync(svg, svgSource);
    await expect
      .poll(async () => (await page.request.get('/enemies/bat-test.svg')).text())
      .toBe(svgSource);
    writeManifest((json) => {
      json.assets['enemy.bat'].file = 'enemies/bat-test.svg';
      json.assets['enemy.bat'].format = 'svg';
      delete json.assets['enemy.bat'].filter;
      delete json.assets['enemy.bat'].loop;
    });
    await openGame(page, '/?gallery');
    const state = await assetsReady(page);
    expect(selected(state).placeholders).not.toContain('enemy.bat');
    await holdKeys(page, ['ArrowDown'], 850);
    await ev.shot('cyan-svg-format-switch');
    expect(JSON.parse(readFileSync(manifestPath, 'utf8')).assets['enemy.bat']).toMatchObject(
      contract,
    );
    ev.json('svg', { state, contract });
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    writeFileSync(manifestPath, manifestBytes);
    for (const temporary of [png, svg])
      try {
        unlinkSync(temporary);
      } catch {}
    ev.flush();
  }
});

test('gallery: missing drawable becomes one warned placeholder and simulation continues', async ({
  page,
}) => {
  const ev = startEvidence(page, 'gallery-missing');
  const saved = batPath + '.saved';
  try {
    renameSync(batPath, saved);
    await openGame(page, '/?gallery');
    const s = await assetsReady(page);
    expect(selected(s).placeholders).toContain('enemy.bat');
    await waitForSnapshot(page, (next) => next.steps > s.steps + 10, 3000);
    await holdKeys(page, ['ArrowDown'], 850);
    await ev.shot('magenta-bat');
    ev.json('missing', s);
    expect(ev.workerLog.filter((line) => line.includes('enemy.bat failed:'))).toHaveLength(1);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    renameSync(saved, batPath);
    ev.flush();
  }
});

test('gallery: manifest font relocation and HTML-200/invalid-font fallback', async ({ page }) => {
  const ev = startEvidence(page, 'gallery-font');
  const relocated = file('assets/fonts/hud-relocated.ttf');
  try {
    writeFileSync(relocated, readFileSync(file('assets/fonts/hud.ttf')));
    await expect
      .poll(async () =>
        Buffer.compare(
          await (await page.request.get('/fonts/hud-relocated.ttf')).body(),
          readFileSync(relocated),
        ),
      )
      .toBe(0);
    writeManifest((json) => {
      json.assets['font.hud'].file = 'fonts/hud-relocated.ttf';
    });
    await openGame(page, '/?gallery');
    expect(selected(await assetsReady(page)).font).toBe('hud');
    await ev.shot('relocated-hud');
    for (const path of ['fonts/missing-hud.ttf', 'fonts/not-font.ttf']) {
      if (path.includes('not-font')) {
        writeFileSync(file('assets/' + path), '<!doctype html><html>not a font</html>');
        await expect
          .poll(async () => (await page.request.get('/' + path)).text())
          .toBe('<!doctype html><html>not a font</html>');
      }
      writeManifest((json) => {
        json.assets['font.hud'].file = path;
      });
      const before = ev.workerLog.length;
      await openGame(page, '/?gallery');
      const s = await assetsReady(page);
      expect(selected(s).font).toBe('default');
      await waitForSnapshot(page, (next) => next.steps > s.steps + 5, 3000);
      await ev.shot(path.includes('missing') ? 'html-200-fallback' : 'invalid-fallback');
      ev.json(path.includes('missing') ? 'html-200' : 'invalid', s);
      expect(
        ev.workerLog
          .slice(before)
          .filter((line) => line.includes('font.hud') && line.includes('using the built-in')),
      ).toHaveLength(1);
    }
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    writeFileSync(manifestPath, manifestBytes);
    for (const p of [relocated, file('assets/fonts/not-font.ttf')])
      try {
        unlinkSync(p);
      } catch {}
    ev.flush();
  }
});

test('gallery: catalog drift fails checks and synchronized new ID appears', async ({ page }) => {
  test.setTimeout(120000);
  const ev = startEvidence(page, 'gallery-sync');
  const catalog = file('assets/CATALOG.md');
  const generated = file('packages/shared/src/generated/asset-ids.ts');
  const original = readFileSync(catalog);
  const originalIds = readFileSync(generated);
  try {
    writeFileSync(
      catalog,
      original.toString() +
        '\n## Verification sample\n\n| ID | Size | Format | Original role | Used by | Status |\n|---|---|---|---|---|---|\n| `ui.verificationSample` | 32×32 | svg | Sync proof | #3 | needed |\n',
    );
    // Run the real catalog/graph checks directly: the deliberately edited fixture is not Prettier output.
    const checks = [
      'exec',
      'vitest',
      'run',
      'packages/shared/src/assets.test.ts',
      'packages/shared/src/assets-catalog.test.ts',
      'packages/shared/src/motion-graph.test.ts',
    ];
    const failed = command(checks);
    ev.json('unsynced-check', failed);
    expect(failed.status).not.toBe(0);
    expect(failed.output).toContain('generated IDs');
    expect(command(['assets:sync']).status).toBe(0);
    // #5: a synced `needed` ID without art still fails the check, naming the ID; the generated IDs now match.
    const synced = command(checks);
    ev.json('synced-check', synced);
    expect(synced.status).not.toBe(0);
    expect(synced.output).toContain('ui.verificationSample');
    expect(synced.output).not.toMatch(/FAIL.*generated IDs/);
    await openGame(page, '/?gallery');
    const s = await assetsReady(page);
    expect(gallery(s).ids).toContain('ui.verificationSample');
    expect(selected(s).placeholders).toContain('ui.verificationSample');
    await holdKeys(page, ['ArrowDown'], 12000);
    await ev.shot('new-catalog-placeholder');
    ev.json('synced', s);
  } finally {
    writeFileSync(catalog, original);
    writeFileSync(generated, originalIds);
    ev.flush();
  }
});
```

`gallery-pack.spec.ts` (#5):

```ts
import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { ASSET_IDS, ASSET_SIZES } from '../../../packages/shared/src/generated/asset-ids';
import {
  openGame,
  waitForSnapshot,
  snapshot,
  holdKeys,
  startEvidence,
  pageErrors,
} from '../../../e2e/helpers';

const root = resolve(import.meta.dirname, '../../..');
const packManifest = JSON.parse(readFileSync(resolve(root, 'assets/manifest.json'), 'utf8'));
const portraitFile = packManifest.assets['portrait.warden'].file;
const portraitPath = resolve(root, 'assets', portraitFile);
const portraitBytes = readFileSync(portraitPath);
function diagnosticPng(width: number, height: number) {
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const b of bytes) {
      c ^= b;
      for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (name: string, data: Buffer) => {
    const tag = Buffer.from(name);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const hash = Buffer.alloc(4);
    hash.writeUInt32BE(crc(Buffer.concat([tag, data])));
    return Buffer.concat([size, tag, data, hash]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * (1 + width * 4) + 1 + x * 4;
      rows[i] = 20;
      rows[i + 1] = 240;
      rows[i + 2] = 100;
      rows[i + 3] = 255;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

type Snap = Awaited<ReturnType<typeof snapshot>>;
const assetsOf = (s: Snap) =>
  s.assets as { ready: boolean; loaded: number; total: number; placeholders: string[] };
const galleryOf = (s: Snap) => s.gallery as { panY: number; height: number; lottieFrame: number };
const assetsReady = (page: Page) =>
  waitForSnapshot(
    page,
    (s) => (s.assets as { ready?: boolean } | undefined)?.ready === true,
    30000,
  );

// The gallery's layout (packages/client/src/worker/debug/gallery.ts), to clip one asset's cell from a screenshot.
const GROUPS = [
  'player',
  'portrait',
  'enemy',
  'boss',
  'weapon',
  'icon',
  'gem',
  'pickup',
  'stage',
  'fx',
  'ui',
];
function cells(): Map<string, { x: number; y: number; w: number; h: number }> {
  const map = new Map<string, { x: number; y: number; w: number; h: number }>();
  const ids = ASSET_IDS.filter((id) => !id.startsWith('font.'));
  let y = 32;
  for (const group of GROUPS) {
    const groupIds = ids.filter((id) => id.split('.')[0] === group);
    if (!groupIds.length) continue;
    y += 40;
    for (let start = 0; start < groupIds.length; start += 5) {
      const row = groupIds.slice(start, start + 5);
      const height =
        Math.max(...row.map((id) => (ASSET_SIZES[id] as readonly number[])[1] ?? 0)) + 66;
      row.forEach((id, column) => map.set(id, { x: 24 + column * 244, y, w: 244, h: height - 24 }));
      y += height;
    }
    y += 28;
  }
  return map;
}
const layout = cells();
async function clipOf(page: Page, id: string, panY: number) {
  const box = await page.locator('#app canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const s = box.width / 1280;
  const cell = layout.get(id);
  if (!cell) throw new Error(`no cell for ${id}`);
  return {
    x: box.x + cell.x * s,
    y: box.y + (cell.y - panY) * s,
    width: cell.w * s,
    height: cell.h * s,
  };
}
async function panTo(page: Page, target: number): Promise<Snap> {
  let s = await snapshot(page);
  while (galleryOf(s).panY < target && galleryOf(s).panY < galleryOf(s).height - 720) {
    await holdKeys(page, ['ArrowDown'], 120);
    s = await snapshot(page);
  }
  return s;
}
/** Pixels that are the placeholder magenta (#ff00ff), counted in the page from a PNG screenshot. */
async function magenta(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return -1;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4)
      if ((data[i] ?? 0) > 230 && (data[i + 1] ?? 255) < 40 && (data[i + 2] ?? 0) > 230) n++;
    return n;
  }, png.toString('base64'));
}

test.describe.configure({ mode: 'serial' });

test('pack: every catalog ID has art, no stray magenta, both Lottie effects animate', async ({
  page,
}) => {
  test.setTimeout(120000);
  const ev = startEvidence(page, 'gallery-pack');
  try {
    await page.goto('/?gallery');
    const ready = await assetsReady(page);
    ev.json('ready', ready);
    expect(assetsOf(ready)).toMatchObject({ loaded: 85, total: 85, placeholders: [] });
    const box = await page.locator('#app canvas').boundingBox();
    const scale = (box?.width ?? 1280) / 1280;
    // Only ui.placeholder (the 64×64 magenta reference) may contain magenta.
    const budget = 64 * 64 * scale * scale;
    const counts: Record<string, number> = {};
    let s = ready;
    for (let i = 0; ; i++) {
      const png = await page.screenshot();
      writeFileSync(
        `${ev.dir}/pan-${String(i).padStart(2, '0')}-y${String(Math.round(galleryOf(s).panY))}.png`,
        png,
      );
      counts[`pan-${String(i)}`] = await magenta(page, png);
      if (galleryOf(s).panY >= galleryOf(s).height - 720 - 1) break;
      await holdKeys(page, ['ArrowDown'], 1200);
      s = await snapshot(page);
    }
    ev.json('magenta-pixels-per-screen', { counts, budget });
    for (const n of Object.values(counts)) expect(n).toBeLessThanOrEqual(budget);
    // Lottie: fx.levelUp and fx.chestOpen, two clips 0.3 s apart.
    await page.goto('/?gallery');
    await assetsReady(page);
    const fxTop = layout.get('fx.chestOpen')?.y ?? 0;
    const at = await panTo(page, fxTop - 200);
    const panY = galleryOf(at).panY;
    const frames: Record<string, [string, string]> = {};
    for (const id of ['fx.levelUp', 'fx.chestOpen']) {
      const clip = await clipOf(page, id, panY);
      const a = await page.screenshot({ clip, path: `${ev.dir}/lottie-${id}-a.png` });
      await page.waitForTimeout(300);
      const b = await page.screenshot({ clip, path: `${ev.dir}/lottie-${id}-b.png` });
      frames[id] = [a.toString('base64').slice(-32), b.toString('base64').slice(-32)];
      expect(Buffer.compare(a, b), `${id} frames 0.3 s apart differ`).not.toBe(0);
    }
    ev.json('lottie', { panY, frames, snapshot: await snapshot(page) });
    await ev.shot('fx-row');
    expect(pageErrors(ev)).toEqual([]);
    expect(ev.workerLog.filter((l) => l.includes('[assets]'))).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('pack: V opens the speed preview over tiled ground and toggles back', async ({ page }) => {
  const ev = startEvidence(page, 'gallery-preview');
  try {
    await openGame(page, '/?gallery');
    await assetsReady(page);
    expect((await snapshot(page)).galleryPreview).toBe(false);
    await page.keyboard.press('KeyV');
    const on = await waitForSnapshot(page, (s) => s.galleryPreview === true, 3000);
    await ev.shot('preview-open');
    await page.waitForTimeout(500);
    await ev.shot('preview-500ms-later');
    ev.json('preview-on', on);
    expect(ev.workerLog.filter((l) => l.includes('[debug] gallery preview shown'))).toHaveLength(1);
    await page.keyboard.press('KeyV');
    await waitForSnapshot(page, (s) => s.galleryPreview === false, 3000);
    await ev.shot('preview-closed');
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('pack: replacing a static portrait PNG preserves its logical size/anchor and changes only that cell', async ({
  page,
}) => {
  const ev = startEvidence(page, 'gallery-portrait-swap');
  const clips = async () => {
    const out: Record<string, Buffer> = {};
    for (const id of ['portrait.warden', 'portrait.ember', 'portrait.swift', 'portrait.aurelia'])
      out[id] = await page.screenshot({ clip: await clipOf(page, id, 0) });
    return out;
  };
  try {
    await openGame(page, '/?gallery');
    await assetsReady(page);
    const before = await clips();
    await ev.shot('before-swap');
    const [width, height] = ASSET_SIZES['portrait.warden'];
    const entry = packManifest.assets['portrait.warden'];
    expect(entry.format).toBe('png');
    expect(entry.size).toEqual([width, height]);
    expect(entry.anchor).toEqual([0.5, 0.5]);
    const beforeManifest = readFileSync(resolve(root, 'assets/manifest.json'));
    const swapped = diagnosticPng(width * 4, height * 4);
    writeFileSync(portraitPath, swapped);
    await expect
      .poll(async () =>
        Buffer.compare(await (await page.request.get('/' + portraitFile)).body(), swapped),
      )
      .toBe(0);
    await openGame(page, '/?gallery');
    const s = await assetsReady(page);
    expect(assetsOf(s).placeholders).toEqual([]);
    const after = await clips();
    await ev.shot('after-swap');
    const changed = Object.keys(before).filter(
      (id) => Buffer.compare(before[id]!, after[id]!) !== 0,
    );
    ev.json('swap', { changed, snapshot: s });
    expect(changed).toEqual(['portrait.warden']);
    expect(readFileSync(resolve(root, 'assets/manifest.json'))).toEqual(beforeManifest);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    writeFileSync(portraitPath, portraitBytes);
    ev.flush();
  }
});
```

## Gotchas

- 2026-11-08 (#3): gallery is dev/e2e only; fonts are intentionally not drawable. Baseline counts change when later art issues add entries; derive expected placeholder lists from IDs and seeded art.
- 2026-11-08 (#3): Vite returns missing assets as index.html with HTTP 200. Picture dimensions and sfnt framing must reject that response; an HTTP-status check alone is insufficient.
- 2026-11-08 (#3): extension key presses are instantaneous; use repeated presses and snapshot pan changes, while Playwright uses timed holds. Worker logs and request assertions need the Playwright companion.
- 2026-11-08 (#3): catalog mutation runs the real asset/catalog/graph tests twice and needs exclusive file/port access; its timeout is 120 seconds. File restoration always runs. Lottie JSON is parsed per independent animation instance; the no-Picture.load cloning invariant applies to static formats.

- 2026-11-08 (#3): Vite discovers newly created public files asynchronously; the fixture journeys wait for matching HTTP bytes before reloading, without restarting the server.
- 2026-11-08 (#5): ground tiles placed edge to edge show hairline seams at fractional view scales (anti-aliased edges let the backdrop through), even though the art is seamless. The preview overlaps tiles by 1 unit (scale 129/128); #7 must do the same.
- 2026-11-08 (#5): the magenta check counts pure `#ff00ff` pixels per screenshot and allows the `ui.placeholder` reference (64×64 at the view scale); it decodes the PNG on a throwaway page canvas, never the game canvas.
- 2026-11-08 (#5): sixty instant extension presses pan only about 8 units; drive the full pan, the Lottie clips and the static portrait swap with the Playwright `gallery-pack` spec, and the speed preview (a single `v`) with either driver.

- 2026-11-08 (#84): Native actor primaries are JSON, not PNG. PNG-format mutation uses a temporary bat fixture and explicit manifest transition; static pixel isolation compares the four non-animated portraits. Replacing a native primary requires its whole validated12-image owned bank/graph and receipt policy (ADR0018), not PNG bytes written into JSON. Original actor JSON and pose resources are never edited by these journeys.
