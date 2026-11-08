// The last nickname, remembered as a convenience only (#19). Storage may be unavailable (private mode, disabled
// storage), so every access is guarded; nothing depends on it.
const NICKNAME_KEY = 'vs.nickname';
/** Longer stored values are not a nickname this client wrote; they are ignored. */
const STORED_MAX = 64;

export function loadNickname(): string {
  try {
    const value = localStorage.getItem(NICKNAME_KEY);
    return value !== null && value.length <= STORED_MAX ? value : '';
  } catch {
    return '';
  }
}

export function saveNickname(nickname: string): void {
  try {
    localStorage.setItem(NICKNAME_KEY, nickname);
  } catch {
    // Best effort.
  }
}
