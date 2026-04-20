// ── Level Code ──
// Short, human-readable IDs for community levels.
// Format: LOAF-XXXXXX (6 chars from a 32-char alphabet → ~1 billion combos).
// Omits visually confusing chars (0/O, 1/I/L).

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 31 chars — no 0,1,I,L,O
const LEN = 6;
const PREFIX = 'LOAF-';

/** Generate a new random level code (e.g. "LOAF-7K2PXM"). */
export function generateLevelCode() {
  let code = PREFIX;
  const buf = new Uint8Array(LEN);
  (globalThis.crypto || globalThis.msCrypto).getRandomValues(buf);
  for (let i = 0; i < LEN; i++) {
    code += ALPHABET[buf[i] % ALPHABET.length];
  }
  return code;
}

/** Normalize user input to canonical form (uppercase, strip whitespace, add prefix if missing). */
export function normalizeLevelCode(input) {
  if (typeof input !== 'string') return '';
  let s = input.trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
  if (!s.startsWith(PREFIX)) {
    const stripped = s.replace(/-/g, '');
    if (stripped.length === LEN) s = PREFIX + stripped;
  }
  return s;
}

/** True if the given string is a structurally valid level code. Does NOT check existence. */
export function isValidLevelCode(input) {
  const s = typeof input === 'string' ? input : '';
  if (!s.startsWith(PREFIX)) return false;
  const body = s.slice(PREFIX.length);
  if (body.length !== LEN) return false;
  for (const ch of body) if (!ALPHABET.includes(ch)) return false;
  return true;
}

export const LEVEL_CODE_PREFIX = PREFIX;
export const LEVEL_CODE_LENGTH = LEN;
