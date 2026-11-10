# Deployed site

The production client on GitHub Pages (#23, ADR 0017): the `pnpm build:pages` build under `/GameJam-Vampire-Survivors/` with ADR 0011's CSP as a `<meta>` tag, single player, and the multiplayer entry against the server named by the repository variable `VITE_SERVER_URL` (or the "not configured" notice while it is unset). The server side is checked with `packages/server/scripts/smoke.mjs`.

## Sub-features

- **Base path:** every request the page makes (HTML, JS, CSS, `manifest.json`, art, `thorvg/thorvg.wasm`, `fonts/hud.ttf`, the favicon) is under `https://ossca-thorvg.github.io/GameJam-Vampire-Survivors/`, apart from the support probe's `blob:` worker; nothing is requested from the site root.
- **CSP:** `<head>` starts with `<meta http-equiv="Content-Security-Policy">` whose content is ADR 0011's policy with `worker-src 'self' blob:`, no `frame-ancestors`, no `'unsafe-eval'`, and `connect-src 'self'` plus the `wss://` origin of `VITE_SERVER_URL` (only `'self'` when unset). No `securitypolicyviolation` event fires during a run or on the multiplayer entry.
- **Renderer:** the title appears after loading and the run renders with ThorVG `gl` (production has no `__vsTest`; the WebGL canvas and the HUD timer with its `:` prove the WASM and the font loaded).
- **Single player:** Start → character → run → the results screen ("Game over" or "Stage cleared") with Retry and Title.
- **Multiplayer entry, server unset:** status "Multiplayer is not available: no game server is configured for this site", Retry hidden, Create room and Join room disabled, no WebSocket opened.
- **Multiplayer entry, server set:** the status clears once `welcome` arrives; the two-context journeys of `lobby.md` and `versus-match.md` then run against the public URL.
- **Server (`smoke.mjs`):** `/healthz` answers `ok`; two clients with Origin `https://ossca-thorvg.github.io` create and join a room and both see 2 players; an upgrade with Origin `https://evil.example` gets HTTP 403.

No snapshot fields: production builds strip the test bridge.

## How to get to it (user POV)

Open <https://ossca-thorvg.github.io/GameJam-Vampire-Survivors/> after a successful run of `.github/workflows/deploy.yml` (`gh run list --workflow deploy.yml --limit 1`). Before a deploy, the same build can be checked locally: `pnpm build:pages` (with `VITE_SERVER_URL=wss://…` to include a server), then serve `packages/client/dist` under `/GameJam-Vampire-Survivors/` with no CSP header, for example on port 5194, so the `<meta>` tag is the only policy. For the server, run `pnpm --filter server exec node scripts/smoke.mjs https://<host> wss://<host>/ws https://ossca-thorvg.github.io`, or locally against `deploy/server/compose.yaml` published on another port.

## Driving it

### Claude in Chrome

1. `tabs_create_mcp`, `navigate` to the site URL. `javascript_tool`: `window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => __csp.push(e.violatedDirective + ' ' + e.blockedURI)); document.querySelector('meta[http-equiv="Content-Security-Policy"]').content`, and check the policy.
2. `find` the Start button, `computer` `left_click` it, `key` `Return` for the default character, `screenshot` the run (HUD timer visible).
3. Wait without moving, pressing `1` whenever the "Level up" dialog shows, until the results screen; `screenshot` it, then click Title.
4. Click Multiplayer, `key` `Return`; `read_page` the entry: the status text and the disabled Create room button (server unset), or an empty status (server set). `screenshot`.
5. `javascript_tool`: `JSON.stringify(__csp)` → `[]` (it covers the multiplayer part; reload and repeat step 1's listener first to cover the run too). `read_network_requests`: every URL starts with the site URL. Close the tab.
6. With a server configured, continue with `lobby.md` and `versus-match.md` in two tabs on the site URL.

### Playwright

Save as `verification/issue-<N>/journeys/deployed-site.spec.ts` and run with `VERIFY_URL=<site URL> VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> VERIFY_JOURNEYS=verification/issue-<N>/journeys pnpm exec playwright test -c e2e/playwright.config.ts --project chromium` (add `VERIFY_SERVER_CONFIGURED=1` when the build has a server). No `verify:launch` is needed: the site is already served.

```ts
import { expect, test } from '@playwright/test';
import { noteEvidence, pageErrors, startEvidence } from '../../../e2e/helpers';

// VERIFY_URL is the Pages URL (or a local copy served under /GameJam-Vampire-Survivors/). Production builds have no
// __vsTest, so everything is observed through the DOM, requests and securitypolicyviolation events.
const SITE = process.env.VERIFY_URL ?? 'https://ossca-thorvg.github.io/GameJam-Vampire-Survivors/';
const SERVER_CONFIGURED = process.env.VERIFY_SERVER_CONFIGURED === '1';

test('deployed site: CSP meta, single-player run to results, multiplayer entry', async ({
  page,
}, testInfo) => {
  test.setTimeout(8 * 60_000);
  const ev = startEvidence(page, 'deployed-site');
  noteEvidence(testInfo, ev);
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  try {
    await page.goto(SITE);
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    ev.json('csp', { csp });
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
    await page.getByRole('button', { name: 'Start' }).waitFor({ timeout: 30_000 });
    await ev.shot('title');
    await page.getByRole('button', { name: 'Start' }).click();
    await page.keyboard.press('Enter');
    await ev.shot('run');
    const title = page.getByRole('button', { name: 'Title' });
    const levelUp = page.getByRole('dialog', { name: 'Level up' });
    await expect(async () => {
      if (await levelUp.isVisible()) await page.keyboard.press('Digit1');
      expect(await title.isVisible()).toBe(true);
    }).toPass({ timeout: 7 * 60_000, intervals: [250] });
    await ev.shot('results');
    await title.click();
    await page.getByRole('button', { name: 'Multiplayer' }).click();
    await page.keyboard.press('Enter');
    const status = page.locator('.multiplayer-entry .status');
    if (SERVER_CONFIGURED) await expect(status).toHaveText('', { timeout: 10_000 });
    else
      await expect(status).toHaveText(
        'Multiplayer is not available: no game server is configured for this site',
      );
    await ev.shot('multiplayer-entry');
    const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    const base = new URL(SITE).href;
    const outside = requests.filter(
      (u) => !u.startsWith(base) && !u.startsWith('blob:') && !u.startsWith('data:'),
    );
    ev.json('result', { violations, outside, requests: requests.length });
    expect(violations).toEqual([]);
    expect(outside).toEqual([]);
    expect(requests).toContain(`${base}thorvg/thorvg.wasm`);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});
```

## Gotchas

- Production builds have no `__vsTest`, so this journey observes the DOM, requests and CSP events only; `renderer: 'gl'` is shown by the canvas drawing at all (there is no fallback renderer) (2026-11-09, #23).
- An idle Warden dies in about 15 s (about 1–2 minutes (balance probe seeds 1–30: 39–206 s, over 2 minutes in 2 of 30) since #148's retune), which is how the journey reaches the results quickly; a stronger build may survive longer, hence the 7-minute bound (2026-11-09, #23).
- Pages sends no headers, so `frame-ancestors` cannot be enforced there; `vite preview` sends the header version for local checks (2026-11-09, #23).
- The Pages build fails if `VITE_SERVER_URL` is not `wss://`: an https page cannot open `ws://` sockets (2026-11-09, #23).
- Until the owner sets up the server's domain and TLS, only the "server unset" path can run on the public site; the server is checked locally with `deploy/server/compose.yaml` and `smoke.mjs` (2026-11-09, #23).
- A server deploy (`git pull --ff-only`, then `NODE_VERSION=$(cat .nvmrc) docker compose -f deploy/server/compose.yaml up -d --build`, ADR 0023) restarts the only instance and drops every room; never deploy during someone's verification (2026-11-09, #23).
