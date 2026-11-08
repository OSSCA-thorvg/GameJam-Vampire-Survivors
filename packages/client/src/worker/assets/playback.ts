import type { LottieAnimation } from '@thorvg/webcanvas';
import type { ActorMotion, MotionState } from '@vs/shared';
import { assertLottieResources } from './image-lottie';
import { createHitFeedbackSlotAtFrame, NORMAL_FEEDBACK_SLOT } from './hit-feedback';

export interface PlaybackCounters {
  frameCalls: number;
  segmentChanges: number;
  slotApplications: number;
}
export interface PlaybackOptions {
  animation: LottieAnimation;
  fps: number;
  frames: number;
  loop: boolean;
  motion: ActorMotion | null;
  counters: PlaybackCounters;
}

/** Native controllers stay pooled; inactive controllers receive neither time nor native calls. */
export class NativePlayback {
  active = true;
  private clock = 0;
  private compensation = 0;
  private state: MotionState = 'idle';
  private selected: MotionState | null = null;
  private lastFrame = -1;
  private lastPose = -1;
  private lastFeedback = -1;
  private resetPending = false;
  private rate = 1;
  private flash: { normal: number; dim: number; shown: boolean } | null = null;
  private readonly normal: number | null;
  private feedback: { id: number; keys: readonly { t: number }[] } | null = null;

  constructor(private readonly options: PlaybackOptions) {
    this.normal =
      options.motion?.kind === 'player' ? options.animation.gen(NORMAL_FEEDBACK_SLOT) : null;
    if (this.normal !== null) this.apply(this.normal);
    if (options.motion) this.sync(true, this.normal !== null);
  }

  tick(dt: number): void {
    if (!this.active) return;
    const increment = dt * this.options.fps * this.rate - this.compensation;
    const next = this.clock + increment;
    this.compensation = next - this.clock - increment;
    this.clock = next;
    this.sync();
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (active) {
      if (this.resetPending) this.clearVisualFeedback();
      this.resetPending = false;
      this.sync(true);
    }
  }

  reset(): void {
    this.rate = 1;
    this.clock = 0;
    this.compensation = 0;
    this.state = 'idle';
    this.selected = null;
    this.lastPose = -1;
    this.lastFeedback = -1;
    this.resetPending = true;
    if (this.active) {
      this.clearVisualFeedback();
      this.resetPending = false;
      this.sync(true);
    }
  }

  setMotion(state: MotionState): void {
    if (!this.options.motion || this.state === state) return;
    this.state = state;
    if (this.active) this.sync(true);
  }

  setFeedback(remaining: number): boolean {
    if (this.options.motion?.kind !== 'player' || this.normal === null) return false;
    if (!this.active) return true;
    if (remaining <= 0) {
      if (this.feedback) this.clearFeedback();
      return true;
    }
    const payload = createHitFeedbackSlotAtFrame(this.clock, remaining);
    const previous = this.feedback;
    const id = this.options.animation.gen(payload);
    this.feedback = { id, keys: payload.damage.p.k };
    this.apply(id);
    this.sync(true, true);
    if (previous) this.options.animation.del(previous.id);
    return true;
  }

  setDuration(duration: number): void {
    if (this.options.motion) throw new Error('Duration fitting is limited to flat event clips');
    if (!Number.isFinite(duration) || duration <= 0)
      throw new RangeError('Invalid native event duration');
    const rate = this.options.frames / this.options.fps / duration;
    if (!Number.isFinite(rate) || rate <= 0) throw new RangeError('Invalid native event rate');
    this.rate = rate;
  }

  setFlash(shown: boolean): boolean {
    if (this.options.motion?.kind !== 'actor') return false;
    if (!this.active) return true;
    if (!this.flash) {
      if (!shown) return true;
      this.flash = {
        normal: this.options.animation.gen(NORMAL_FEEDBACK_SLOT),
        dim: this.options.animation.gen({ damage: { p: { a: 0, k: 54.902 } } }),
        shown: false,
      };
    }
    if (this.flash.shown === shown) return true;
    this.flash.shown = shown;
    this.apply(shown ? this.flash.dim : this.flash.normal);
    this.sync(true, true);
    return true;
  }

  private clearVisualFeedback(): void {
    this.clearFeedback();
    this.setFlash(false);
  }

  private apply(id: number): void {
    this.options.animation.apply(id);
    this.options.counters.slotApplications++;
  }

  private clearFeedback(): void {
    const previous = this.feedback;
    this.feedback = null;
    if (previous && this.normal !== null) {
      this.apply(this.normal);
      this.sync(true, true);
      this.options.animation.del(previous.id);
    }
  }

  private frame(value: number): void {
    this.options.counters.frameCalls++;
    this.options.animation.frame(value);
    assertLottieResources(this.options.animation);
    this.lastFrame = value;
  }

  private sync(force = false, refreshSlot = false): void {
    const { animation, frames, loop, motion } = this.options;
    if (!motion) {
      const current = this.clock;
      const frame = Math.fround(
        loop ? current % frames : Math.min(current, Math.max(0, frames - 1)),
      );
      if (force || frame !== this.lastFrame) this.frame(frame);
      return;
    }
    const range = motion[this.state];
    if (this.selected !== this.state) {
      animation.segment(this.state);
      this.options.counters.segmentChanges++;
      this.selected = this.state;
      force = true;
    }
    let frame = Math.fround(this.clock % range.frames);
    if (frame >= range.frames) frame = 0;
    const pose = Math.floor(frame / range.poseFrames);
    let feedback = -1;
    if (this.feedback) {
      const absolute = range.start + frame;
      for (let index = 0; index < this.feedback.keys.length; index++) {
        const key = this.feedback.keys[index];
        if (!key || key.t > absolute) break;
        feedback = index;
      }
    }
    if (force || pose !== this.lastPose || feedback !== this.lastFeedback) {
      if (refreshSlot) this.frame(frame < range.frames / 4 ? range.frames / 2 : 0);
      this.frame(frame);
      this.lastPose = pose;
      this.lastFeedback = feedback;
    }
  }
}
