import { HIT_INVULN_SEC } from '@vs/shared';

const FPS = 150;
const CYCLE_FRAMES = 600;
const STEP = 1 / 60;
const BLINK_SEC = 0.08;
const DIM_PERCENT = 39.216;

export const NORMAL_FEEDBACK_SLOT = { damage: { p: { a: 0, k: 100 } } };

interface HoldKey {
  t: number;
  s: number[];
  h: 1;
}

function nativePhase(frame: number): number {
  const remainder = frame % CYCLE_FRAMES;
  return Math.fround(remainder < 0 ? remainder + CYCLE_FRAMES : remainder) % CYCLE_FRAMES;
}

/** A HOLD change lies between displayed samples; put a cyclic seam exactly at zero. */
function transitionFrame(frame: number): number {
  const current = nativePhase(frame);
  const previous = nativePhase(frame - STEP * FPS);
  return previous > current ? 0 : Math.fround((previous + current) / 2);
}

/** Author native inclusive HOLD transitions at the actual fixed-step samples, without changing either clock. */
export function createHitFeedbackSlot(activeTime: number, remainingTime: number) {
  return createHitFeedbackSlotAtFrame(activeTime * FPS, remainingTime);
}

export function createHitFeedbackSlotAtFrame(activeFrame: number, remainingTime: number) {
  if (
    !Number.isFinite(activeFrame) ||
    activeFrame < 0 ||
    !Number.isFinite(remainingTime) ||
    remainingTime <= 0 ||
    remainingTime > HIT_INVULN_SEC
  )
    throw new RangeError('Invalid native hit feedback event');
  const changes: HoldKey[] = [];
  let remaining = remainingTime;
  let frame = activeFrame;
  let previous = 100;
  for (let step = 0; step <= 30; step++) {
    if (step) {
      remaining -= STEP;
      // The unchanged contact-damage system ends its countdown at this threshold.
      if (remaining <= 1e-6) remaining = 0;
      frame += STEP * FPS;
    }
    const value = remaining > 0 && Math.floor(remaining / BLINK_SEC) % 2 === 0 ? DIM_PERCENT : 100;
    if (value !== previous) {
      changes.push({ t: transitionFrame(frame), s: [value], h: 1 });
      previous = value;
    }
  }
  changes.sort((a, b) => a.t - b.t);
  const atZero = changes.find((key) => key.t === 0) ?? changes[changes.length - 1];
  if (!atZero) throw new Error('Hit feedback event has no native transitions');
  const period: HoldKey[] = [{ t: 0, s: atZero.s, h: 1 }, ...changes.filter((key) => key.t > 0)];
  const keys: HoldKey[] = [];
  for (const offset of [0, CYCLE_FRAMES])
    for (const key of period) keys.push({ ...key, t: key.t + offset });
  keys.push({ t: CYCLE_FRAMES * 2, s: atZero.s, h: 1 });
  return { damage: { p: { a: 1, k: keys } } };
}
