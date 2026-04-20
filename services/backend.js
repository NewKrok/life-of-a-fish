// ── Backend Interface ──
// Abstract data-layer for community features (publish levels, fetch by code,
// list my levels). The concrete implementation is plugged in at startup via
// setBackendImpl(). This indirection keeps the rest of the game free of any
// Firebase / Supabase / etc. details, so swapping providers touches only
// one file.
//
// Any impl must provide the following shape — see firebase-backend.js for
// the production implementation and tests/ for mock examples.
//
//   initBackend(): Promise<void>
//   getUid(): string | null
//   onAuthReady(cb: (uid) => void): () => void   // returns unsubscribe
//   publishLevel(levelData, { name }): Promise<{ levelId, code }>
//   updateMyLevel(levelId, levelData, { name }): Promise<void>
//   fetchLevelByCode(code): Promise<LevelDoc>
//   listMyLevels(): Promise<LevelDoc[]>
//   deleteMyLevel(levelId): Promise<void>
//   reportLevel(levelId, reason): Promise<void>
//
// Community browser (#22):
//   listCommunityLevels({ cursor?, pageSize?, search? })
//                                    : Promise<{ levels, nextCursor }>
//   rateLevel(levelId, stars): Promise<void>           // stars in 1..5
//   myRatingFor(levelId): Promise<number | null>
//   getLevelRatingStats(levelId): Promise<{ avg, count }>
//   getLevelReportCount(levelId): Promise<number>
//
// Errors thrown by impls should carry a stable `.code` string so the UI
// can localize messages: 'not-initialized', 'not-signed-in', 'rate-limit',
// 'too-large', 'bad-name', 'profanity', 'not-found', 'permission-denied',
// 'network', 'unknown', 'bad-rating'.

let _impl = null;

export function setBackendImpl(impl) {
  _impl = impl;
}

export function hasBackend() {
  return _impl !== null;
}

function _req() {
  if (!_impl) {
    const err = new Error('Backend not initialized');
    err.code = 'not-initialized';
    throw err;
  }
  return _impl;
}

// ── Lifecycle ──
export function initBackend() { return _req().initBackend(); }
export function getUid() { return _impl ? _impl.getUid() : null; }
export function onAuthReady(cb) { return _req().onAuthReady(cb); }

// ── Level publishing / fetching ──
export function publishLevel(levelData, opts) { return _req().publishLevel(levelData, opts); }
export function updateMyLevel(levelId, levelData, opts) { return _req().updateMyLevel(levelId, levelData, opts); }
export function fetchLevelByCode(code) { return _req().fetchLevelByCode(code); }
export function listMyLevels() { return _req().listMyLevels(); }
export function deleteMyLevel(levelId) { return _req().deleteMyLevel(levelId); }
export function reportLevel(levelId, reason) { return _req().reportLevel(levelId, reason); }

// ── Community browser ──
export function listCommunityLevels(opts) { return _req().listCommunityLevels(opts || {}); }
export function rateLevel(levelId, stars) { return _req().rateLevel(levelId, stars); }
export function myRatingFor(levelId) { return _req().myRatingFor(levelId); }
export function getLevelRatingStats(levelId) { return _req().getLevelRatingStats(levelId); }
export function getLevelReportCount(levelId) { return _req().getLevelReportCount(levelId); }

/** Page size for community level listings. */
export const COMMUNITY_PAGE_SIZE = 20;
/** Client-side auto-hide threshold: hide levels with >= this many reports. */
export const REPORT_HIDE_THRESHOLD = 3;

// ── Validation (shared across impls) ──

/** Max serialized JSON size (bytes) for the embedded level data field. */
export const MAX_LEVEL_BYTES = 50 * 1024;
/** Max length of a level name. */
export const MAX_NAME_LENGTH = 50;
/** Daily publish limit per user (client-side guard; Rules also enforce). */
export const DAILY_PUBLISH_LIMIT = 10;

/**
 * Validate a level payload before publishing. Returns { ok, code, message }.
 * `code` matches the error codes listed above.
 */
export function validateLevelForPublish(levelData, name) {
  if (!levelData || typeof levelData !== 'object') {
    return { ok: false, code: 'bad-level', message: 'Level data missing' };
  }
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { ok: false, code: 'bad-name', message: 'Name required' };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, code: 'bad-name', message: `Name > ${MAX_NAME_LENGTH} chars` };
  }
  let json;
  try {
    json = JSON.stringify(levelData);
  } catch {
    return { ok: false, code: 'bad-level', message: 'Level not serializable' };
  }
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > MAX_LEVEL_BYTES) {
    return { ok: false, code: 'too-large', message: `Level > ${MAX_LEVEL_BYTES} bytes` };
  }
  return { ok: true, bytes };
}
