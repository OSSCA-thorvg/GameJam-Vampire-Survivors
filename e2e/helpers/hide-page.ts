import type { Page } from '@playwright/test';
import { snapshot } from '../helpers';

export interface PageVisibility {
  ownership: { gameTargetId: string; blankTargetId: string; browserContextId: string | undefined };
  hide(): Promise<void>;
  show(): Promise<void>;
  dispose(): Promise<void>;
}

/** Observe native visibility without focusing, screenshotting or mutating the page. */
async function waitForVisibility(page: Page, hidden: boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  let last;
  while (Date.now() < deadline) {
    last = {
      document: await page.evaluate(() => document.visibilityState),
      worker: await snapshot(page),
    };
    if (last.document === (hidden ? 'hidden' : 'visible') && last.worker.hidden === hidden) return;
    await page.waitForTimeout(50);
  }
  throw new Error(`Native visibility did not become ${String(hidden)}: ${JSON.stringify(last)}`);
}

/** Only use with a page from the browser/context launched by this Playwright run. */
export async function hidePage(page: Page): Promise<PageVisibility> {
  const session = await page.context().newCDPSession(page);
  const { targetInfo } = await session.send('Target.getTargetInfo');
  const browserContextId = targetInfo.browserContextId;
  const ownership = { gameTargetId: targetInfo.targetId, blankTargetId: '', browserContextId };
  let disposed = false;
  const visibility: PageVisibility = {
    ownership,
    async hide() {
      await session.send('Target.activateTarget', { targetId: ownership.blankTargetId });
      try {
        await waitForVisibility(page, true);
      } catch (error) {
        throw new Error(`Native hide failed; ownership=${JSON.stringify(ownership)}`, {
          cause: error,
        });
      }
    },
    async show() {
      await session.send('Target.activateTarget', { targetId: ownership.gameTargetId });
      await waitForVisibility(page, false);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      try {
        if (!page.isClosed()) await visibility.show();
      } finally {
        try {
          if (ownership.blankTargetId)
            await session.send('Target.closeTarget', { targetId: ownership.blankTargetId });
        } finally {
          await session.detach();
        }
      }
    },
  };
  try {
    const { targetId } = await session.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId,
      newWindow: false,
      background: false,
    });
    ownership.blankTargetId = targetId;
    await visibility.hide();
    return visibility;
  } catch (error) {
    await visibility.dispose();
    throw error;
  }
}
