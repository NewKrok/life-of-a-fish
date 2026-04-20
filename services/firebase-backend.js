// ── Firebase Backend Implementation ──
// Concrete impl of the backend interface (see backend.js) using Firebase
// Auth (anonymous) + Firestore. No Cloud Functions yet — free-tier friendly.

import { initializeApp } from 'firebase/app';
import {
  getAuth, signInAnonymously, onAuthStateChanged,
  GoogleAuthProvider, OAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  linkWithPopup, linkWithRedirect,
} from 'firebase/auth';
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, deleteDoc, updateDoc,
  startAfter, getAggregateFromServer, getCountFromServer,
  sum, average, count,
} from 'firebase/firestore';

import { firebaseConfig } from './firebase-config.js';
import {
  setBackendImpl, validateLevelForPublish, DAILY_PUBLISH_LIMIT,
  COMMUNITY_PAGE_SIZE,
} from './backend.js';
import { generateLevelCode, normalizeLevelCode, isValidLevelCode } from './level-code.js';
import { hasProfanity } from './profanity-filter.js';

let _app = null;
let _auth = null;
let _db = null;
let _uid = null;
let _user = null;                      // Full Firebase user (or null before sign-in)
let _authReadyListeners = new Set();
let _authStateListeners = new Set();
let _initPromise = null;

// Choose between popup and redirect based on platform. Mobile browsers handle
// redirect far more reliably than popups (popups get killed by app-switches).
function _isMobile() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

function _makeErr(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function _mapFirestoreErr(err) {
  const code = err && err.code ? String(err.code) : '';
  if (code.includes('permission-denied')) return _makeErr('permission-denied', err.message);
  if (code.includes('unavailable') || code.includes('network')) return _makeErr('network', err.message);
  return _makeErr('unknown', err && err.message ? err.message : String(err));
}

function _mapAuthErr(err) {
  const code = err && err.code ? String(err.code) : '';
  // Firebase prefixes most auth errors with 'auth/'. Strip for a stable short code.
  const short = code.startsWith('auth/') ? code.slice(5) : code;
  const known = new Set([
    'popup-blocked', 'popup-closed-by-user', 'cancelled-popup-request',
    'credential-already-in-use', 'email-already-in-use',
    'provider-already-linked', 'operation-not-allowed',
    'user-cancelled', 'network-request-failed', 'internal-error',
    'account-exists-with-different-credential',
  ]);
  if (!known.has(short)) return _makeErr('unknown', err && err.message ? err.message : String(err));
  // Collapse to the codes the UI localizes.
  if (short === 'popup-closed-by-user' || short === 'cancelled-popup-request' || short === 'user-cancelled') {
    return _makeErr('cancelled', err.message);
  }
  if (short === 'popup-blocked') return _makeErr('popup-blocked', err.message);
  if (short === 'credential-already-in-use' || short === 'email-already-in-use' || short === 'account-exists-with-different-credential') {
    return _makeErr('credential-already-in-use', err.message);
  }
  if (short === 'provider-already-linked') return _makeErr('already-linked', err.message);
  if (short === 'operation-not-allowed') return _makeErr('provider-disabled', err.message);
  if (short === 'network-request-failed') return _makeErr('network', err.message);
  return _makeErr('unknown', err.message);
}

function _shapeUser(u) {
  if (!u) return null;
  // Firebase stores linked providers in u.providerData; u.isAnonymous stays
  // true on unlinked anon accounts. Pick the first non-anonymous provider
  // as the "primary" one for display.
  let providerId = 'anonymous';
  if (!u.isAnonymous && u.providerData && u.providerData.length > 0) {
    providerId = u.providerData[0].providerId;
  }
  return {
    uid: u.uid,
    displayName: u.displayName || null,
    photoURL: u.photoURL || null,
    providerId,
    isAnonymous: !!u.isAnonymous,
  };
}

async function initBackend() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    _app = initializeApp(firebaseConfig);
    _auth = getAuth(_app);
    _db = getFirestore(_app);
    onAuthStateChanged(_auth, (user) => {
      _user = user;
      _uid = user ? user.uid : null;
      const shaped = _shapeUser(user);
      if (_uid) {
        for (const cb of _authReadyListeners) {
          try { cb(_uid); } catch (e) { console.error(e); }
        }
      }
      for (const cb of _authStateListeners) {
        try { cb(shaped); } catch (e) { console.error(e); }
      }
    });

    // Handle a pending redirect sign-in (mobile flow). Fires before the
    // anon-fallback below, so if the user came back from Google we skip anon.
    try {
      const result = await getRedirectResult(_auth);
      if (result && result.user) {
        // User is now signed in with the linked/provider account.
        return;
      }
    } catch (err) {
      // Ignore redirect failures here — UI flow will surface any real issues.
      console.warn('[auth] getRedirectResult:', err && err.message);
    }

    // If we already have a user (including anon) from persistence, stop.
    if (_auth.currentUser) return;

    try {
      await signInAnonymously(_auth);
    } catch (err) {
      throw _makeErr('network', `Anonymous sign-in failed: ${err.message}`);
    }
  })();
  return _initPromise;
}

function getUid() { return _uid; }

function onAuthReady(cb) {
  if (_uid) {
    // Already signed in — fire async to keep consistent ordering
    Promise.resolve().then(() => cb(_uid));
  }
  _authReadyListeners.add(cb);
  return () => _authReadyListeners.delete(cb);
}

function _requireUid() {
  if (!_uid) throw _makeErr('not-signed-in', 'Not signed in yet');
  return _uid;
}

/**
 * Client-side daily rate-limit check: counts levels this user has published
 * in the last 24h. Not authoritative (Rules should back this up) but catches
 * the honest case.
 */
async function _checkRateLimit(uid) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const q = query(
    collection(_db, 'levels'),
    where('ownerId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(DAILY_PUBLISH_LIMIT + 1),
  );
  const snap = await getDocs(q);
  let recent = 0;
  snap.forEach((d) => {
    const ts = d.data().createdAt;
    const ms = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
    if (ms >= cutoff) recent++;
  });
  if (recent >= DAILY_PUBLISH_LIMIT) {
    throw _makeErr('rate-limit', `Daily publish limit reached (${DAILY_PUBLISH_LIMIT}/day)`);
  }
}

/**
 * Generate a unique level code, retrying on the rare birthday collision.
 * With 31^6 (~887M) codes and retry, practical collision risk is negligible.
 */
async function _allocateUniqueCode() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateLevelCode();
    const existing = await getDocs(query(
      collection(_db, 'levels'), where('code', '==', code), limit(1),
    ));
    if (existing.empty) return code;
  }
  throw _makeErr('unknown', 'Could not allocate unique code after 5 attempts');
}

async function publishLevel(levelData, { name }) {
  const uid = _requireUid();
  const v = validateLevelForPublish(levelData, name);
  if (!v.ok) throw _makeErr(v.code, v.message);
  if (hasProfanity(name)) throw _makeErr('profanity', 'Name contains blocked words');

  try {
    await _checkRateLimit(uid);
    const code = await _allocateUniqueCode();
    const levelRef = doc(collection(_db, 'levels'));
    const payload = {
      ownerId: uid,
      ownerName: _ownerDisplayName(),
      code,
      name: name.trim(),
      data: levelData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      plays: 0,
      ratingSum: 0,
      ratingCount: 0,
      flagged: 0,
      featured: false,
    };
    await setDoc(levelRef, payload);
    return { levelId: levelRef.id, code };
  } catch (err) {
    if (err.code && ['rate-limit', 'profanity', 'bad-name', 'too-large', 'bad-level'].includes(err.code)) {
      throw err;
    }
    throw _mapFirestoreErr(err);
  }
}

async function updateMyLevel(levelId, levelData, { name }) {
  const uid = _requireUid();
  const v = validateLevelForPublish(levelData, name);
  if (!v.ok) throw _makeErr(v.code, v.message);
  if (hasProfanity(name)) throw _makeErr('profanity', 'Name contains blocked words');

  try {
    const ref = doc(_db, 'levels', levelId);
    const existing = await getDoc(ref);
    if (!existing.exists()) throw _makeErr('not-found', 'Level not found');
    if (existing.data().ownerId !== uid) throw _makeErr('permission-denied', 'Not your level');
    await updateDoc(ref, {
      name: name.trim(),
      data: levelData,
      ownerName: _ownerDisplayName(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    if (err.code && ['not-found', 'permission-denied', 'profanity', 'bad-name', 'too-large', 'bad-level'].includes(err.code)) {
      throw err;
    }
    throw _mapFirestoreErr(err);
  }
}

async function fetchLevelByCode(code) {
  const norm = normalizeLevelCode(code);
  if (!isValidLevelCode(norm)) throw _makeErr('bad-code', 'Invalid level code');
  try {
    const snap = await getDocs(query(
      collection(_db, 'levels'), where('code', '==', norm), limit(1),
    ));
    if (snap.empty) throw _makeErr('not-found', 'Level not found');
    const d = snap.docs[0];
    return _shapeLevelDoc(d.id, d.data());
  } catch (err) {
    if (err.code === 'not-found' || err.code === 'bad-code') throw err;
    throw _mapFirestoreErr(err);
  }
}

async function listMyLevels() {
  const uid = _requireUid();
  try {
    const snap = await getDocs(query(
      collection(_db, 'levels'),
      where('ownerId', '==', uid),
      orderBy('updatedAt', 'desc'),
      limit(50),
    ));
    const out = [];
    snap.forEach((d) => out.push(_shapeLevelDoc(d.id, d.data())));
    return out;
  } catch (err) {
    throw _mapFirestoreErr(err);
  }
}

async function deleteMyLevel(levelId) {
  const uid = _requireUid();
  try {
    const ref = doc(_db, 'levels', levelId);
    const existing = await getDoc(ref);
    if (!existing.exists()) return; // idempotent
    if (existing.data().ownerId !== uid) throw _makeErr('permission-denied', 'Not your level');
    await deleteDoc(ref);
  } catch (err) {
    if (err.code === 'permission-denied') throw err;
    throw _mapFirestoreErr(err);
  }
}

async function reportLevel(levelId, reason) {
  const uid = _requireUid();
  try {
    // One report per (user, level) — doc ID contains uid so Rules can enforce ownership.
    const reportRef = doc(_db, 'levels', levelId, 'reports', uid);
    await setDoc(reportRef, {
      reporterId: uid,
      reason: typeof reason === 'string' ? reason.slice(0, 200) : '',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    throw _mapFirestoreErr(err);
  }
}

// ── Cross-platform auth (#23) ──

function getCurrentUser() {
  return _shapeUser(_user);
}

function onAuthStateChange(cb) {
  // Fire current state immediately (async, matching onAuthReady semantics).
  Promise.resolve().then(() => cb(_shapeUser(_user)));
  _authStateListeners.add(cb);
  return () => _authStateListeners.delete(cb);
}

function _googleProvider() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  return p;
}

function _appleProvider() {
  const p = new OAuthProvider('apple.com');
  p.addScope('email');
  p.addScope('name');
  return p;
}

async function _linkOrSignIn(provider, { allowMerge = false } = {}) {
  if (!_auth) throw _makeErr('not-initialized', 'Auth not ready');
  const mobile = _isMobile();
  const current = _auth.currentUser;

  try {
    // If we're currently anonymous, prefer LINK so the UID (and all owned
    // levels / ratings) are preserved.
    if (current && current.isAnonymous) {
      try {
        if (mobile) {
          await linkWithRedirect(current, provider);
          // Redirect happens; this never resolves.
          return _shapeUser(current);
        }
        const result = await linkWithPopup(current, provider);
        return _shapeUser(result.user);
      } catch (err) {
        const short = err && err.code ? String(err.code).replace(/^auth\//, '') : '';
        if (short === 'credential-already-in-use' || short === 'account-exists-with-different-credential' || short === 'email-already-in-use') {
          if (!allowMerge) throw _mapAuthErr(err);
          // Caller explicitly chose to switch — sign in with the existing
          // account. The anon account's data stays orphaned (documented).
        } else {
          throw _mapAuthErr(err);
        }
      }
    }

    // Plain sign-in flow (either already non-anonymous, or allowMerge branch).
    if (mobile) {
      await signInWithRedirect(_auth, provider);
      return _shapeUser(_auth.currentUser);
    }
    const result = await signInWithPopup(_auth, provider);
    return _shapeUser(result.user);
  } catch (err) {
    if (err.code && ['cancelled', 'popup-blocked', 'credential-already-in-use', 'already-linked', 'provider-disabled', 'network'].includes(err.code)) {
      throw err;
    }
    throw _mapAuthErr(err);
  }
}

async function linkGoogle() {
  return _linkOrSignIn(_googleProvider());
}

async function linkApple() {
  return _linkOrSignIn(_appleProvider());
}

async function signInWithGoogle({ allowMerge = false } = {}) {
  return _linkOrSignIn(_googleProvider(), { allowMerge });
}

async function signInWithApple({ allowMerge = false } = {}) {
  return _linkOrSignIn(_appleProvider(), { allowMerge });
}

async function signOut() {
  if (!_auth) throw _makeErr('not-initialized', 'Auth not ready');
  try {
    await _auth.signOut();
  } catch (err) {
    throw _mapAuthErr(err);
  }
  // Immediately start a fresh anonymous session so the app never sits in a
  // logged-out state (per the product decision: #23 answer 4a).
  try {
    await signInAnonymously(_auth);
  } catch (err) {
    throw _makeErr('network', `Anonymous sign-in failed: ${err.message}`);
  }
}

// ── Community browser (#22) ──

/**
 * List published community levels, newest first. Paginated via cursor
 * (last-seen Firestore snapshot). If `search` is set, filters by name
 * prefix — Firestore requires name-ordered query in that mode so sort
 * changes to name asc.
 */
async function listCommunityLevels({ cursor = null, pageSize, search } = {}) {
  _requireUid();
  const size = pageSize || COMMUNITY_PAGE_SIZE;
  try {
    const col = collection(_db, 'levels');
    const clauses = [];
    if (search && search.trim()) {
      const s = search.trim();
      // Name prefix match. Firestore needs orderBy(name) when using range on name.
      clauses.push(where('name', '>=', s));
      clauses.push(where('name', '<=', s + '\uf8ff'));
      clauses.push(orderBy('name', 'asc'));
    } else {
      clauses.push(orderBy('createdAt', 'desc'));
    }
    if (cursor) clauses.push(startAfter(cursor));
    clauses.push(limit(size + 1)); // one extra to detect "has more"

    const snap = await getDocs(query(col, ...clauses));
    const docs = snap.docs;
    const hasMore = docs.length > size;
    const pageDocs = hasMore ? docs.slice(0, size) : docs;
    const nextCursor = hasMore ? pageDocs[pageDocs.length - 1] : null;
    return {
      levels: pageDocs.map((d) => _shapeLevelDoc(d.id, d.data())),
      nextCursor,
    };
  } catch (err) {
    throw _mapFirestoreErr(err);
  }
}

async function rateLevel(levelId, stars) {
  const uid = _requireUid();
  const n = Number(stars);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw _makeErr('bad-rating', 'Stars must be an integer 1..5');
  }
  try {
    const ref = doc(_db, 'levels', levelId, 'ratings', uid);
    await setDoc(ref, { stars: n, ratedAt: serverTimestamp() });
  } catch (err) {
    throw _mapFirestoreErr(err);
  }
}

async function myRatingFor(levelId) {
  const uid = _requireUid();
  try {
    const snap = await getDoc(doc(_db, 'levels', levelId, 'ratings', uid));
    if (!snap.exists()) return null;
    return snap.data().stars ?? null;
  } catch (err) {
    throw _mapFirestoreErr(err);
  }
}

async function getLevelRatingStats(levelId) {
  try {
    const col = collection(_db, 'levels', levelId, 'ratings');
    const snap = await getAggregateFromServer(col, {
      avg: average('stars'),
      total: sum('stars'),
      n: count(),
    });
    const data = snap.data();
    return {
      avg: typeof data.avg === 'number' ? data.avg : 0,
      count: typeof data.n === 'number' ? data.n : 0,
    };
  } catch (err) {
    throw _mapFirestoreErr(err);
  }
}

async function getLevelReportCount(levelId) {
  try {
    const col = collection(_db, 'levels', levelId, 'reports');
    const snap = await getCountFromServer(col);
    return snap.data().count || 0;
  } catch (err) {
    throw _mapFirestoreErr(err);
  }
}

function _shapeLevelDoc(id, d) {
  return {
    levelId: id,
    code: d.code,
    ownerId: d.ownerId,
    ownerName: d.ownerName || null,
    name: d.name,
    data: d.data,
    createdAt: d.createdAt?.toMillis?.() ?? null,
    updatedAt: d.updatedAt?.toMillis?.() ?? null,
    plays: d.plays || 0,
    ratingSum: d.ratingSum || 0,
    ratingCount: d.ratingCount || 0,
    flagged: d.flagged || 0,
    featured: !!d.featured,
  };
}

/**
 * Best-effort display name for the current session. Anonymous users return
 * null (community cards fall back to an "Anon" label client-side).
 */
function _ownerDisplayName() {
  if (!_user || _user.isAnonymous) return null;
  const n = _user.displayName;
  if (typeof n !== 'string') return null;
  const trimmed = n.trim();
  if (trimmed.length === 0) return null;
  // Keep it short — the rules cap this at 50 chars to match name size.
  return trimmed.length > 50 ? trimmed.slice(0, 50) : trimmed;
}

const firebaseBackend = {
  initBackend, getUid, onAuthReady,
  publishLevel, updateMyLevel, fetchLevelByCode,
  listMyLevels, deleteMyLevel, reportLevel,
  listCommunityLevels, rateLevel, myRatingFor,
  getLevelRatingStats, getLevelReportCount,
  getCurrentUser, onAuthStateChange,
  linkGoogle, linkApple,
  signInWithGoogle, signInWithApple, signOut,
};

/** Install the Firebase implementation as the active backend. Call once at app start. */
export function installFirebaseBackend() {
  setBackendImpl(firebaseBackend);
}
