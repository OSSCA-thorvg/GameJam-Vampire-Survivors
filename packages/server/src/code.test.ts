import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { generateRoomCode } from './code.js';

describe('generateRoomCode', () => {
  it('emits only alphabet characters, 6 long', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const code = generateRoomCode(() => false);
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
      for (const ch of code) seen.add(ch);
    }
    // 12 000 draws hit every one of the 31 characters.
    expect(seen.size).toBe(ROOM_CODE_ALPHABET.length);
  });

  it('retries past a forced collision', () => {
    // Scripted RNG: the first code is AAAAAA (taken), the second BBBBBB.
    const draws = [...Array<number>(6).fill(0), ...Array<number>(6).fill(1)];
    const randomInt = (max: number): number => {
      const next = draws.shift();
      if (next === undefined || next >= max) throw new Error('script exhausted');
      return next;
    };
    const taken = new Set(['AAAAAA']);
    expect(generateRoomCode((c) => taken.has(c), randomInt)).toBe('BBBBBB');
  });

  it('throws instead of looping forever when every code collides', () => {
    expect(() => generateRoomCode(() => true)).toThrow(/no free room code/);
  });
});
