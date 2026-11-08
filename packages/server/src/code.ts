import { randomInt as cryptoRandomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@vs/shared';

/** An integer in `[0, max)`. The server passes `crypto.randomInt` (ADR 0011); tests pass a scripted sequence. */
export type RandomInt = (max: number) => number;

export const cryptoRandom: RandomInt = (max) => cryptoRandomInt(max);

/** Gives up after this many collisions in a row; with ~887 million codes it only happens with a broken RNG. */
const MAX_ATTEMPTS = 100;

/**
 * Draws a 6-character room code from `ROOM_CODE_ALPHABET` (ADR 0006), retrying while `isTaken` reports a
 * collision with a live room.
 */
export function generateRoomCode(
  isTaken: (code: string) => boolean,
  randomInt: RandomInt = cryptoRandom,
): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET.charAt(randomInt(ROOM_CODE_ALPHABET.length));
    }
    if (!isTaken(code)) return code;
  }
  throw new Error(`no free room code after ${String(MAX_ATTEMPTS)} attempts`);
}
