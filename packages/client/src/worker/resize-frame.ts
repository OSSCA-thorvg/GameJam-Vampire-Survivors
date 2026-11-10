export interface ResizeFrameOptions {
  /** Resizes the ThorVG canvas, scales the root scene and places the panes for the new size. */
  apply: () => void;
  /** Draws one frame (`canvas.update()` and `canvas.render()`). */
  render: () => void;
  /** Whether a frame may be drawn now: the game loop exists (boot is over). */
  ready: () => boolean;
  /** Whether the tab is hidden; a hidden tab never renders, and the loop draws once it shows again. */
  hidden: () => boolean;
}

/**
 * The worker's `resize` policy (#165). Resizing a WebGL `OffscreenCanvas` clears its drawing buffer, and the browser
 * presents that buffer when the task ends. So the task that resizes also draws the frame: the old frame stays on
 * screen until the new one replaces it, and a slow first frame after a resize (seconds under swiftshader) never shows
 * as a black canvas. One render per resize; the main thread debounces resizes within a layout (`main/resize.ts`), so
 * this never resizes or draws per event.
 */
export function createResizeFrame(opts: ResizeFrameOptions): { resize(): void } {
  return {
    resize() {
      opts.apply();
      if (!opts.ready() || opts.hidden()) return;
      opts.render();
    },
  };
}
