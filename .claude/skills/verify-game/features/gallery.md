# Asset gallery

Development/e2e `/?gallery` shows every drawable catalog ID through the replaceable manifest loader (#3).

## Sub-features

- Loading text shows `Loading n/total` until assetsReady; the `assets` snapshot reports `ready`, `loaded`, `total`, `placeholders`, `font`. Baseline is 5/5, font `hud`, 77 placeholders.
- `gallery` reports `ids`, `panX`, `panY`, `width`, `height`, `lottieFrame`: all 81 drawable IDs, fonts excluded; real arrow input pans through all groups; white crosses mark anchors.
- The bat, placeholder reference, favicon and level-up ring draw as art. The ring advances its frame; remaining IDs are magenta. Static instance creation makes no requests after loading.
- File-only SVG replacement and manifest PNG format switching preserve the logical size/anchor after reload. Broken drawables warn once, render magenta, and keep simulating.
- `font.hud` can move to a different manifest path; absent/invalid fonts including HTML returned with HTTP 200 warn once and select `default`, with boot continuing.
- Catalog edits without assets:sync fail the real check; after syncing a new ID is labelled and magenta.

## How to get to it (user POV)

Open `/?gallery` after verify:launch and Doctor succeed. No server is needed. Hold arrow keys to pan. Production does not contain this entry point. Mutation journeys use the isolated verification worktree and restore every modified file in finally; stop other file editors while running them.

## Driving it

### Claude in Chrome

1. Detect the extension with tabs_context_mcp, create a new verification tab, start GIF recording and navigate to `http://localhost:5180/?gallery`. Use Playwright when the extension is unavailable.
2. Read `await window.__vsTest.waitFor(s => s.assets?.ready, 30000)` and capture a screenshot. Check 5/5, hud, 81 drawable IDs, 77 placeholders and no font.hud in gallery.ids.
3. Use real ArrowDown key presses with repeat, taking screenshots after each pan; inspect every group, readable labels and white anchor crosses. Record the ring before/after its frame advances. ArrowUp returns toward the top.
4. In the isolated verification worktree, save the bat and manifest, replace the bat with a cyan SVG, reload and record the changed bat. Write a green 32×32 PNG, switch only the manifest file/format, reload and record the same anchor/size. Restore files after the journey.
5. Temporarily rename the bat file and reload: magenta bat, one worker warning and continuing steps. Restore. Read worker logs through the Playwright companion because extension console cannot inspect workers.
6. Temporarily relocate identical font bytes and edit font.hud: hud still works. Then reference an absent .ttf and an HTML .ttf: default font, one clear warning each, continuing steps. Restore all files.
7. Add a temporary catalog ID, run pnpm check (fails generated IDs), assets:sync, check (passes), reload and pan to the new magenta ID. Restore catalog and generated IDs.
8. Export the GIF, screenshots, snapshot JSON and companion worker/network logs to verification/issue-3/, close only the created tab, then cleanup.

### Playwright

Save the following complete spec to `verification/issue-3/journeys/gallery.spec.ts`. Run it against a launched/Doctored client using the commands in verify-game. It creates dedicated browser contexts, uses real keyboard input, collects evidence and restores temporary disk edits.

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
const batPath = file('assets/enemies/bat.svg');
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
function png32() {
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
  header.writeUInt32BE(32);
  header.writeUInt32BE(32, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(32 * (1 + 32 * 4));
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const i = y * 129 + 1 + x * 4;
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
test.describe.configure({ mode: 'serial' });

test('gallery: loading progress, all IDs, panning, animation and no repeat fetch', async ({
  page,
  context,
}) => {
  const ev = startEvidence(page, 'gallery');
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await context.route('**/enemies/bat.svg', async (route) => {
    await gate;
    await route.continue();
  });
  const requests: string[] = [];
  context.on('request', (r) => requests.push(r.url()));
  try {
    await page.goto('/?gallery');
    await expect(page.locator('#loading')).toContainText(/Loading \d\/5/);
    await ev.shot('loading');
    release();
    const ready = await assetsReady(page);
    ev.json('ready', ready);
    await expect(page.locator('#loading')).toHaveCount(0);
    expect(selected(ready)).toMatchObject({ loaded: 5, total: 5, font: 'hud' });
    expect(selected(ready).placeholders).toHaveLength(77);
    expect(gallery(ready).ids).toHaveLength(81);
    expect(gallery(ready).ids).not.toContain('font.hud');
    const seeds = ['ui.placeholder', 'enemy.bat', 'fx.levelUp', 'ui.favicon'];
    expect(selected(ready).placeholders).toEqual(
      gallery(ready)
        .ids.filter((id) => !seeds.includes(id))
        .sort(),
    );
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
    await context.unroute('**/enemies/bat.svg');
  }
});

test('gallery: SVG replacement and PNG format switch require only file edits and reload', async ({
  page,
}) => {
  const ev = startEvidence(page, 'gallery-swap');
  const png = file('assets/enemies/bat-test.png');
  try {
    await openGame(page, '/?gallery');
    await assetsReady(page);
    await holdKeys(page, ['ArrowDown'], 850);
    await ev.shot('original-bat');
    writeFileSync(
      batPath,
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#00ffff"/></svg>',
    );
    await openGame(page, '/?gallery');
    expect(selected(await assetsReady(page)).placeholders).not.toContain('enemy.bat');
    await holdKeys(page, ['ArrowDown'], 850);
    await ev.shot('cyan-replacement');
    writeFileSync(png, png32());
    await expect
      .poll(async () =>
        Buffer.compare(
          await (await page.request.get('/enemies/bat-test.png')).body(),
          readFileSync(png),
        ),
      )
      .toBe(0);
    writeManifest((json) => {
      json.assets['enemy.bat'].file = 'enemies/bat-test.png';
      json.assets['enemy.bat'].format = 'png';
      json.assets['enemy.bat'].filter = 'nearest';
    });
    await openGame(page, '/?gallery');
    const s = await assetsReady(page);
    expect(selected(s).placeholders).not.toContain('enemy.bat');
    await holdKeys(page, ['ArrowDown'], 850);
    await ev.shot('green-png');
    ev.json('png', s);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    writeFileSync(batPath, batBytes);
    writeFileSync(manifestPath, manifestBytes);
    try {
      unlinkSync(png);
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
    const failed = command(['check']);
    ev.json('unsynced-check', failed);
    expect(failed.status).not.toBe(0);
    expect(failed.output).toContain('generated IDs');
    expect(command(['assets:sync']).status).toBe(0);
    const passed = command(['check']);
    ev.json('synced-check', passed);
    expect(passed.status).toBe(0);
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

## Gotchas

- 2026-11-08 (#3): gallery is dev/e2e only; fonts are intentionally not drawable. Baseline counts change when later art issues add entries; derive expected placeholder lists from IDs and seeded art.
- 2026-11-08 (#3): Vite returns missing assets as index.html with HTTP 200. Picture dimensions and sfnt framing must reject that response; an HTTP-status check alone is insufficient.
- 2026-11-08 (#3): extension key presses are instantaneous; use repeated presses and snapshot pan changes, while Playwright uses timed holds. Worker logs and request assertions need the Playwright companion.
- 2026-11-08 (#3): catalog mutation runs pnpm check twice and needs exclusive file/port access; its timeout is 120 seconds. File restoration always runs. Lottie JSON is parsed per independent animation instance; the no-Picture.load cloning invariant applies to static formats.

- 2026-11-08 (#3): Vite discovers newly created public files asynchronously; the fixture journeys wait for matching HTTP bytes before reloading, without restarting the server.
