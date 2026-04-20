import { describe, it, expect, beforeEach } from 'vitest';
import {
  setBackendImpl, hasBackend,
  initBackend, getUid, onAuthReady,
  publishLevel, fetchLevelByCode, listMyLevels, deleteMyLevel,
  listCommunityLevels, rateLevel, myRatingFor,
  getLevelRatingStats, getLevelReportCount, reportLevel,
  validateLevelForPublish, MAX_LEVEL_BYTES, MAX_NAME_LENGTH,
  COMMUNITY_PAGE_SIZE,
} from '../services/backend.js';

// In-memory mock backend — mirrors the required interface, backed by a Map.
// Demonstrates that nothing in the rest of the codebase needs to know about
// Firebase: swap implementations by implementing this shape.
function makeMockBackend() {
  const state = {
    uid: null,
    levels: new Map(),   // levelId -> doc
    ratings: new Map(),  // `${levelId}:${uid}` -> stars
    reports: new Map(),  // `${levelId}:${uid}` -> reason
    nextId: 1,
    clock: 1000,         // monotonic so ordering is deterministic in tests
    authListeners: new Set(),
  };
  const tick = () => ++state.clock;

  return {
    _state: state,

    async initBackend() {
      state.uid = 'mock-uid-1';
      for (const cb of state.authListeners) cb(state.uid);
    },
    getUid() { return state.uid; },
    onAuthReady(cb) {
      if (state.uid) Promise.resolve().then(() => cb(state.uid));
      state.authListeners.add(cb);
      return () => state.authListeners.delete(cb);
    },

    async publishLevel(data, { name }) {
      const v = validateLevelForPublish(data, name);
      if (!v.ok) { const e = new Error(v.message); e.code = v.code; throw e; }
      const levelId = 'lvl_' + (state.nextId++);
      const code = 'LOAF-TST' + String(state.nextId).padStart(3, '0');
      const ts = tick();
      state.levels.set(levelId, {
        levelId, code, ownerId: state.uid, name, data,
        createdAt: ts, updatedAt: ts,
        plays: 0, ratingSum: 0, ratingCount: 0, flagged: 0, featured: false,
      });
      return { levelId, code };
    },

    async updateMyLevel(levelId, data, { name }) {
      const doc = state.levels.get(levelId);
      if (!doc) { const e = new Error('not found'); e.code = 'not-found'; throw e; }
      if (doc.ownerId !== state.uid) { const e = new Error('denied'); e.code = 'permission-denied'; throw e; }
      doc.name = name; doc.data = data; doc.updatedAt = tick();
    },

    async fetchLevelByCode(code) {
      for (const d of state.levels.values()) if (d.code === code) return { ...d };
      const e = new Error('not found'); e.code = 'not-found'; throw e;
    },

    async listMyLevels() {
      const out = [];
      for (const d of state.levels.values()) if (d.ownerId === state.uid) out.push({ ...d });
      return out.sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async deleteMyLevel(levelId) {
      const doc = state.levels.get(levelId);
      if (!doc) return;
      if (doc.ownerId !== state.uid) { const e = new Error('denied'); e.code = 'permission-denied'; throw e; }
      state.levels.delete(levelId);
    },

    async reportLevel(levelId, reason) {
      const uid = state.uid;
      state.reports.set(`${levelId}:${uid}`, reason || '');
    },

    // ── Community browser ──
    async listCommunityLevels({ cursor = null, pageSize, search } = {}) {
      const size = pageSize || COMMUNITY_PAGE_SIZE;
      let all = [...state.levels.values()];
      if (search && search.trim()) {
        const s = search.trim();
        all = all.filter((d) => d.name && d.name.startsWith(s));
        all.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      } else {
        all.sort((a, b) => b.createdAt - a.createdAt);
      }
      let startIdx = 0;
      if (cursor) startIdx = all.findIndex((d) => d.levelId === cursor.levelId) + 1;
      const page = all.slice(startIdx, startIdx + size);
      const hasMore = startIdx + size < all.length;
      return {
        levels: page.map((d) => ({ ...d })),
        nextCursor: hasMore ? { levelId: page[page.length - 1].levelId } : null,
      };
    },
    async rateLevel(levelId, stars) {
      const n = Number(stars);
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        const e = new Error('bad rating'); e.code = 'bad-rating'; throw e;
      }
      state.ratings.set(`${levelId}:${state.uid}`, n);
    },
    async myRatingFor(levelId) {
      const v = state.ratings.get(`${levelId}:${state.uid}`);
      return typeof v === 'number' ? v : null;
    },
    async getLevelRatingStats(levelId) {
      const prefix = `${levelId}:`;
      let total = 0, count = 0;
      for (const [key, stars] of state.ratings) {
        if (key.startsWith(prefix)) { total += stars; count++; }
      }
      return { avg: count > 0 ? total / count : 0, count };
    },
    async getLevelReportCount(levelId) {
      const prefix = `${levelId}:`;
      let n = 0;
      for (const key of state.reports.keys()) if (key.startsWith(prefix)) n++;
      return n;
    },
  };
}

const sampleLevel = () => ({
  version: 1, name: 'Test', cols: 125, rows: 25, waterRow: 4,
  strings: Array(25).fill('.'.repeat(125)),
  entities: [{ tileId: 7, row: 20, col: 3 }],
});

describe('backend interface — lifecycle', () => {
  beforeEach(() => setBackendImpl(null));

  it('throws with code=not-initialized before setBackendImpl', () => {
    expect(hasBackend()).toBe(false);
    expect(() => initBackend()).toThrow();
    try { initBackend(); } catch (err) { expect(err.code).toBe('not-initialized'); }
  });

  it('getUid returns null before any backend is set', () => {
    expect(getUid()).toBe(null);
  });

  it('initBackend signs in and fires onAuthReady', async () => {
    const mock = makeMockBackend();
    setBackendImpl(mock);
    let readyUid = null;
    onAuthReady((uid) => { readyUid = uid; });
    await initBackend();
    expect(getUid()).toBe('mock-uid-1');
    // onAuthReady fires synchronously for late subscribers, but async for
    // subs registered before init — give microtask a chance.
    await Promise.resolve();
    expect(readyUid).toBe('mock-uid-1');
  });
});

describe('backend interface — publish/fetch/list/delete roundtrip', () => {
  beforeEach(async () => {
    setBackendImpl(makeMockBackend());
    await initBackend();
  });

  it('publish returns a levelId and code', async () => {
    const { levelId, code } = await publishLevel(sampleLevel(), { name: 'My Level' });
    expect(typeof levelId).toBe('string');
    expect(code).toMatch(/^LOAF-/);
  });

  it('fetchLevelByCode retrieves a just-published level', async () => {
    const { code } = await publishLevel(sampleLevel(), { name: 'Findable' });
    const doc = await fetchLevelByCode(code);
    expect(doc.name).toBe('Findable');
    expect(doc.data.entities).toHaveLength(1);
  });

  it('listMyLevels returns everything I published, newest first', async () => {
    await publishLevel(sampleLevel(), { name: 'First' });
    await publishLevel(sampleLevel(), { name: 'Second' });
    const list = await listMyLevels();
    expect(list.map(l => l.name)).toEqual(['Second', 'First']);
  });

  it('deleteMyLevel removes from list', async () => {
    const { levelId } = await publishLevel(sampleLevel(), { name: 'DeleteMe' });
    await deleteMyLevel(levelId);
    const list = await listMyLevels();
    expect(list.find(l => l.levelId === levelId)).toBeUndefined();
  });

  it('fetchLevelByCode with unknown code throws not-found', async () => {
    try {
      await fetchLevelByCode('LOAF-NOPE99');
      throw new Error('should not reach');
    } catch (err) {
      expect(err.code).toBe('not-found');
    }
  });
});

describe('validateLevelForPublish', () => {
  it('accepts a small valid level', () => {
    const v = validateLevelForPublish(sampleLevel(), 'Fine');
    expect(v.ok).toBe(true);
    expect(v.bytes).toBeGreaterThan(0);
  });

  it('rejects empty/whitespace name', () => {
    expect(validateLevelForPublish(sampleLevel(), '').code).toBe('bad-name');
    expect(validateLevelForPublish(sampleLevel(), '   ').code).toBe('bad-name');
  });

  it('rejects name over MAX_NAME_LENGTH', () => {
    const longName = 'X'.repeat(MAX_NAME_LENGTH + 1);
    expect(validateLevelForPublish(sampleLevel(), longName).code).toBe('bad-name');
  });

  it('rejects missing level data', () => {
    expect(validateLevelForPublish(null, 'ok').code).toBe('bad-level');
    expect(validateLevelForPublish(undefined, 'ok').code).toBe('bad-level');
  });

  it('rejects oversize levels', () => {
    // Build a level whose serialized size definitely exceeds the cap by
    // padding entities with large filler strings.
    const lvl = sampleLevel();
    const filler = 'x'.repeat(500);
    lvl.entities = Array(200).fill(null).map((_, i) => ({
      tileId: 5, row: 5, col: i % 125, text: filler,
    }));
    const v = validateLevelForPublish(lvl, 'too big');
    expect(v.ok).toBe(false);
    expect(v.code).toBe('too-large');
    expect(JSON.stringify(lvl).length).toBeGreaterThan(MAX_LEVEL_BYTES);
  });
});

describe('community browser — pagination & search', () => {
  beforeEach(async () => {
    setBackendImpl(makeMockBackend());
    await initBackend();
  });

  it('listCommunityLevels paginates with cursor until exhausted', async () => {
    // Publish more than one page so pagination kicks in
    const total = COMMUNITY_PAGE_SIZE + 3;
    for (let i = 0; i < total; i++) {
      await publishLevel(sampleLevel(), { name: `Level ${String(i).padStart(2, '0')}` });
    }
    const page1 = await listCommunityLevels({});
    expect(page1.levels).toHaveLength(COMMUNITY_PAGE_SIZE);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listCommunityLevels({ cursor: page1.nextCursor });
    expect(page2.levels.length).toBe(3);
    expect(page2.nextCursor).toBeNull();

    // No duplicates across pages
    const all = [...page1.levels, ...page2.levels].map((l) => l.levelId);
    expect(new Set(all).size).toBe(all.length);
  });

  it('returns newest first by default (sorted by createdAt desc)', async () => {
    await publishLevel(sampleLevel(), { name: 'Oldest' });
    await publishLevel(sampleLevel(), { name: 'Middle' });
    await publishLevel(sampleLevel(), { name: 'Newest' });
    const { levels } = await listCommunityLevels({});
    expect(levels.map(l => l.name)).toEqual(['Newest', 'Middle', 'Oldest']);
  });

  it('search filters by name prefix', async () => {
    await publishLevel(sampleLevel(), { name: 'Coral Cave' });
    await publishLevel(sampleLevel(), { name: 'Coral Reef' });
    await publishLevel(sampleLevel(), { name: 'Deep Abyss' });
    const { levels } = await listCommunityLevels({ search: 'Coral' });
    expect(levels.map(l => l.name).sort()).toEqual(['Coral Cave', 'Coral Reef']);
  });

  it('search with no match returns empty list', async () => {
    await publishLevel(sampleLevel(), { name: 'Coral Cave' });
    const { levels, nextCursor } = await listCommunityLevels({ search: 'Xyzzy' });
    expect(levels).toHaveLength(0);
    expect(nextCursor).toBeNull();
  });
});

describe('community browser — rating', () => {
  beforeEach(async () => {
    setBackendImpl(makeMockBackend());
    await initBackend();
  });

  it('rateLevel stores my rating and myRatingFor retrieves it', async () => {
    const { levelId } = await publishLevel(sampleLevel(), { name: 'Rated' });
    expect(await myRatingFor(levelId)).toBe(null);
    await rateLevel(levelId, 4);
    expect(await myRatingFor(levelId)).toBe(4);
  });

  it('rateLevel overwrites previous rating (same user can re-rate)', async () => {
    const { levelId } = await publishLevel(sampleLevel(), { name: 'Re-rated' });
    await rateLevel(levelId, 2);
    await rateLevel(levelId, 5);
    expect(await myRatingFor(levelId)).toBe(5);
  });

  it('rateLevel rejects invalid star counts', async () => {
    const { levelId } = await publishLevel(sampleLevel(), { name: 'Bad' });
    for (const bad of [0, 6, 3.5, -1, NaN, 'four']) {
      try {
        await rateLevel(levelId, bad);
        throw new Error(`expected bad-rating for ${bad}`);
      } catch (err) {
        expect(err.code).toBe('bad-rating');
      }
    }
  });

  it('getLevelRatingStats returns zero for unrated levels', async () => {
    const { levelId } = await publishLevel(sampleLevel(), { name: 'Lonely' });
    const stats = await getLevelRatingStats(levelId);
    expect(stats.count).toBe(0);
    expect(stats.avg).toBe(0);
  });
});

describe('community browser — reports', () => {
  beforeEach(async () => {
    setBackendImpl(makeMockBackend());
    await initBackend();
  });

  it('reportLevel + getLevelReportCount increment', async () => {
    const { levelId } = await publishLevel(sampleLevel(), { name: 'Reportable' });
    expect(await getLevelReportCount(levelId)).toBe(0);
    await reportLevel(levelId, 'inappropriate');
    expect(await getLevelReportCount(levelId)).toBe(1);
  });

  it('same user reporting twice does not double-count', async () => {
    // Mock uses key `levelId:uid` so re-report overwrites, which matches the
    // Firestore behavior of one-report-per-user-per-level.
    const { levelId } = await publishLevel(sampleLevel(), { name: 'Reportable' });
    await reportLevel(levelId, 'first');
    await reportLevel(levelId, 'again');
    expect(await getLevelReportCount(levelId)).toBe(1);
  });
});
