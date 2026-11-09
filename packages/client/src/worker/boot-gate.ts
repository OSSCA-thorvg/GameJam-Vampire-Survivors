/**
 * The boot gate (#126): `ready` waits for both the assets and the splash. `onReady` runs exactly once, when both
 * `assetsReady` and `splashEnded` have been called, in either order; repeated calls change nothing.
 */
export interface BootGate {
  assetsReady(): void;
  splashEnded(): void;
  readonly ready: boolean;
}

export function createBootGate(onReady: () => void): BootGate {
  let assets = false;
  let splash = false;
  let ready = false;
  const check = (): void => {
    if (ready || !assets || !splash) return;
    ready = true;
    onReady();
  };
  return {
    assetsReady() {
      assets = true;
      check();
    },
    splashEnded() {
      splash = true;
      check();
    },
    get ready() {
      return ready;
    },
  };
}
