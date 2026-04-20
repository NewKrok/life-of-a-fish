import { describe, it, expect, beforeEach } from 'vitest';
import {
  setBackendImpl, hasBackend,
  initBackend, getUid, onAuthReady,
  publishLevel, fetchLevelByCode, listMyLevels, deleteMyLevel,
  validateLevelForPublish, MAX_LEVEL_BYTES, MAX_NAME_LENGTH,
} from '../services/backend.js';

// In-memory mock backend — mirrors the required interface, backed by a Map.
// Demonstrates that nothing in the rest of the codebase needs to know about
// Firebase: swap implementations by implementing this shape.
function makeMockBackend() {
  const state = {
    uid: null,
    levels: new Map(),  // levelId -> doc
    nextId: 1,
    clock: 1000,        // monotonic so ordering is deterministic in tests
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

    async reportLevel() { /* no-op in mock */ },
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
