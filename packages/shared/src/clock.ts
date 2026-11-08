/**
 * `mm:ss` for a run time in seconds, whole seconds rounded down (the HUD timer and the results screen, #9). Minutes
 * keep counting past 59 (`75:00`). Negative or non-finite input reads `00:00`.
 */
export function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
