// ── Profanity Filter ──
// Lightweight client-side wordlist check for user-visible text
// (level names, bottle messages, hint stones). Not meant to catch
// everything — real moderation happens via report + admin review.

// Short starter list. Keep conservative. Covers common English + Hungarian slurs.
// Stored as lowercase substrings; matches if any appears in normalized input.
const BLOCKED = [
  // English
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'faggot', 'retard',
  // Hungarian
  'fasz', 'picsa', 'kurva', 'geci', 'buzi', 'cigany',
];

/** Normalize: lowercase, strip accents, collapse repeats, remove non-letters. */
function _normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

/** True if input contains a blocked word. */
export function hasProfanity(input) {
  if (typeof input !== 'string' || !input) return false;
  const norm = _normalize(input);
  if (!norm) return false;
  for (const word of BLOCKED) {
    if (norm.includes(word)) return true;
  }
  return false;
}

/** For tests + future admin use. */
export function _blockedWords() { return [...BLOCKED]; }
