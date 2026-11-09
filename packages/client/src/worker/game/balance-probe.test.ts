// The headless survival probe (#148). Slow (seconds to minutes of simulation), so it runs only with VS_BALANCE=1:
//   VS_BALANCE=1 pnpm --filter client exec vitest run src/worker/game/balance-probe.test.ts
import { CHARACTERS } from '@vs/shared';
import { describe, expect, it, vi } from 'vitest';
import { runProbe, type ProbePolicy, type ProbeResult } from './balance-probe';

const SEEDS = [1, 2, 3];

/**
 * The `player` policy's medians on `main` before the retune (96a9475, verification/issue-148/baseline.txt): the
 * 12-run median and each character's median over seeds 1–3, in simulated seconds.
 */
const BASELINE = {
  median: 185.75,
  characters: { warden: 115.1, ember: 166.8, swift: 202.7, aurelia: 326.2 } as Record<
    string,
    number
  >,
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

function play(characterId: string, seed: number, policy: ProbePolicy): ProbeResult {
  const result = runProbe({ seed, characterId, policy, maxSec: 900 });
  // One table line per run: character seed policy survivedSec level kills.
  process.stdout.write(
    `${[characterId, seed, policy, result.survivedSec, result.level, result.kills].join(' ')}\n`,
  );
  return result;
}

describe.skipIf(!process.env.VS_BALANCE)('balance probe (#148)', () => {
  it('survives at least twice the baseline median (and 6:00), each character 1.5 times its own', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    process.stdout.write('character seed policy survivedSec level kills\n');
    const all: number[] = [];
    const perCharacter = new Map<string, number[]>();
    for (const c of CHARACTERS) {
      for (const seed of SEEDS) {
        const { survivedSec } = play(c.id, seed, 'player');
        all.push(survivedSec);
        perCharacter.set(c.id, [...(perCharacter.get(c.id) ?? []), survivedSec]);
      }
    }
    process.stdout.write(`player median ${String(median(all))}\n`);
    for (const [id, times] of perCharacter)
      process.stdout.write(`player median ${id} ${String(median(times))}\n`);
    expect(median(all)).toBeGreaterThanOrEqual(Math.max(2 * BASELINE.median, 360));
    for (const [id, times] of perCharacter)
      expect(median(times), id).toBeGreaterThanOrEqual(1.5 * (BASELINE.characters[id] ?? Infinity));
  }, 600_000);

  it('still kills a Warden who stands still within 2:00', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const seed of SEEDS) {
      const result = play('warden', seed, 'idle');
      expect(result.cause, String(seed)).toBe('dead');
      expect(result.survivedSec, String(seed)).toBeLessThan(120);
    }
  }, 600_000);
});
