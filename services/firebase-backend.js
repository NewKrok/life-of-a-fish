// ── Firebase Backend Implementation ──
// Concrete impl of the backend interface (see backend.js) using Firebase
// Auth (anonymous) + Firestore. No Cloud Functions yet — free-tier friendly.

import { initializeApp } from 'firebase/app';
import {
  getAuth, signInAnonymously, onAuthStateChanged,
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
let _authReadyListeners = new Set();
let _initPromise = null;

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

async function initBackend() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    _app = initializeApp(firebaseConfig);
    _auth = getAuth(_app);
    _db = getFirestore(_app);
    onAuthStateChanged(_auth, (user) => {
      _uid = user ? user.uid : null;
      if (_uid) {
        for (const cb of _authReadyListeners) {
          try { cb(_uid); } catch (e) { console.error(e); }
        }
      }
    });
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

const firebaseBackend = {
  initBackend, getUid, onAuthReady,
  publishLevel, updateMyLevel, fetchLevelByCode,
  listMyLevels, deleteMyLevel, reportLevel,
  listCommunityLevels, rateLevel, myRatingFor,
  getLevelRatingStats, getLevelReportCount,
};

/** Install the Firebase implementation as the active backend. Call once at app start. */
export function installFirebaseBackend() {
  setBackendImpl(firebaseBackend);
}
