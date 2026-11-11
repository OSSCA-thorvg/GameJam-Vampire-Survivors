// The headless survival probe (#148, retargeted in #173). Slow, so it runs only with VS_BALANCE=1:
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

/**
 * The same medians after #148's retune (PR 155), in simulated seconds. #173 aims about halfway between `BASELINE` and
 * these: harder than #148, never harder than before it. Right before #173 `main` measured a median of 611.7
 * (verification/issue-173/before.txt), since later changes had made runs easier still.
 */
const RETUNE_148 = {
  median: 541.8,
  characters: { warden: 491.2, ember: 522.8, swift: 647.5, aurelia: 538.4 } as Record<
    string,
    number
  >,
  idle: [91.5, 75.1, 38.9],
};

/** #173's targets: the 12-run median, each character's ceiling and the idle Warden's median, in simulated seconds. */
const TARGET = { medianMin: 330, medianMax: 450, characterMax: 600, idleMedianMax: 60 };

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

describe.skipIf(!process.env.VS_BALANCE)('balance probe (#148, #173)', () => {
  it('lands between the pre-#148 baseline and #148 (about halfway)', () => {
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
    process.stdout.write(
      `player median ${String(median(all))} (#148: ${String(RETUNE_148.median)})\n`,
    );
    for (const [id, times] of perCharacter)
      process.stdout.write(
        `player median ${id} ${String(median(times))} (#148: ${String(RETUNE_148.characters[id])})\n`,
      );
    expect(median(all)).toBeGreaterThanOrEqual(TARGET.medianMin);
    expect(median(all)).toBeLessThanOrEqual(TARGET.medianMax);
    for (const [id, times] of perCharacter) {
      expect(median(times), id).toBeGreaterThanOrEqual(BASELINE.characters[id] ?? Infinity);
      expect(median(times), id).toBeLessThanOrEqual(TARGET.characterMax);
    }
  }, 600_000);

  it('kills a Warden who stands still in every seed, within 2:00 and a median under 1:00', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const times: number[] = [];
    for (const seed of SEEDS) {
      const result = play('warden', seed, 'idle');
      expect(result.cause, String(seed)).toBe('dead');
      expect(result.survivedSec, String(seed)).toBeLessThan(120);
      times.push(result.survivedSec);
    }
    process.stdout.write(
      `idle median warden ${String(median(times))} (#148: ${String(median(RETUNE_148.idle))})\n`,
    );
    expect(median(times)).toBeLessThan(TARGET.idleMedianMax);
  }, 600_000);
});
