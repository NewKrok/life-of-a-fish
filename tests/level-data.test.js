import { describe, it, expect, beforeEach } from 'vitest';
import {
  TILE_SIZE,
  TILES,
  LEVEL_COLS,
  LEVEL_ROWS,
  WORLD_W,
  WORLD_H,
  WATER_SURFACE_Y,
  KEY_CHEST_COLORS,
  getLevels,
  setCurrentLevel,
  getCurrentLevelIndex,
  resetTiles,
  getLevelEntities,
  getMergedSolidBodies,
  getWaterZones,
} from '../level-data.js';

// ── Constants ──

describe('constants', () => {
  it('TILE_SIZE is 32', () => {
    expect(TILE_SIZE).toBe(32);
  });

  it('KEY_CHEST_COLORS has 5 entries with matching key-chest pairs', () => {
    expect(KEY_CHEST_COLORS).toHaveLength(5);
    for (const color of KEY_CHEST_COLORS) {
      expect(color).toHaveProperty('name');
      expect(color).toHaveProperty('keyId');
      expect(color).toHaveProperty('chestId');
      expect(color.chestId - color.keyId).toBe(5); // chest IDs are keyId + 5
    }
  });

  it('KEY_CHEST_COLORS key IDs are 16-20, chest IDs are 21-25', () => {
    const keyIds = KEY_CHEST_COLORS.map(c => c.keyId);
    const chestIds = KEY_CHEST_COLORS.map(c => c.chestId);
    expect(keyIds).toEqual([16, 17, 18, 19, 20]);
    expect(chestIds).toEqual([21, 22, 23, 24, 25]);
  });
});

// ── Level switching ──

describe('level management', () => {
  beforeEach(() => {
    setCurrentLevel(0);
  });

  it('getLevels returns all levels with name and description', () => {
    const levels = getLevels();
    expect(levels.length).toBeGreaterThanOrEqual(3);
    for (const l of levels) {
      expect(l).toHaveProperty('index');
      expect(l).toHaveProperty('name');
      expect(l).toHaveProperty('description');
      expect(l.name.length).toBeGreaterThan(0);
    }
  });

  it('setCurrentLevel updates dimensions', () => {
    setCurrentLevel(0);
    const cols0 = LEVEL_COLS;
    const rows0 = LEVEL_ROWS;
    expect(WORLD_W).toBe(cols0 * TILE_SIZE);
    expect(WORLD_H).toBe(rows0 * TILE_SIZE);
  });

  it('getCurrentLevelIndex tracks current level', () => {
    setCurrentLevel(0);
    expect(getCurrentLevelIndex()).toBe(0);
    setCurrentLevel(1);
    expect(getCurrentLevelIndex()).toBe(1);
  });

  it('setCurrentLevel ignores invalid indices', () => {
    setCurrentLevel(0);
    setCurrentLevel(-1);
    expect(getCurrentLevelIndex()).toBe(0);
    setCurrentLevel(999);
    expect(getCurrentLevelIndex()).toBe(0);
  });
});

// ── Tile parsing ──

describe('tile parsing', () => {
  beforeEach(() => {
    setCurrentLevel(0);
    resetTiles();
  });

  it('TILES has correct dimensions', () => {
    expect(TILES.length).toBe(LEVEL_ROWS);
    for (const row of TILES) {
      expect(row.length).toBe(LEVEL_COLS);
    }
  });

  it('all tile values are valid (0-37)', () => {
    for (let r = 0; r < LEVEL_ROWS; r++) {
      for (let c = 0; c < LEVEL_COLS; c++) {
        const t = TILES[r][c];
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(37);
      }
    }
  });

  it('border tiles are stone on level 1', () => {
    // First and last column should be stone (#=1)
    for (let r = 0; r < LEVEL_ROWS; r++) {
      expect(TILES[r][0]).toBe(1);
      expect(TILES[r][LEVEL_COLS - 1]).toBe(1);
    }
  });

  it('resetTiles restores original state after mutation', () => {
    const original = TILES[0][0];
    TILES[0][0] = 99;
    resetTiles();
    expect(TILES[0][0]).toBe(original);
  });
});

// ── Entity extraction ──

describe('getLevelEntities', () => {
  beforeEach(() => {
    setCurrentLevel(0);
    resetTiles();
  });

  it('finds player spawn', () => {
    const ent = getLevelEntities();
    expect(ent.playerSpawn).toBeDefined();
    expect(ent.playerSpawn.x).toBeGreaterThan(0);
    expect(ent.playerSpawn.y).toBeGreaterThan(0);
  });

  it('clears entity tiles from TILES array', () => {
    getLevelEntities();
    // After extraction, no entity tile IDs (5,6,7,9-25) should remain in TILES
    // (except type 4/hazard and type 8/seagrass which stay for terrain rendering)
    const keptInTiles = new Set([0, 1, 2, 3, 4, 8]);
    for (let r = 0; r < LEVEL_ROWS; r++) {
      for (let c = 0; c < LEVEL_COLS; c++) {
        expect(keptInTiles.has(TILES[r][c])).toBe(true);
      }
    }
  });

  it('extracts enemies, pearls, and other entities', () => {
    const ent = getLevelEntities();
    expect(ent.enemies.length).toBeGreaterThan(0);
    expect(ent.pearls.length).toBeGreaterThan(0);
  });

  it('entity positions are within world bounds', () => {
    const ent = getLevelEntities();
    const allPositions = [
      ent.playerSpawn,
      ...ent.enemies,
      ...ent.pearls,
      ...ent.buoys,
      ...ent.boulders,
      ...ent.sharks,
      ...ent.pufferfish,
      ...ent.crabs,
      ...ent.toxicFish,
      ...ent.crates,
      ...ent.breakableWalls,
      ...ent.armoredFish,
      ...ent.spittingCoral,
      ...ent.toggleSwitches,
      ...ent.pressureSwitches,
      ...ent.timedSwitches,
      ...ent.gates,
      ...ent.floatingLogs,
      ...ent.swingingAnchors,
      ...ent.bottleMessages,
      ...ent.hintStones,
    ];
    for (const pos of allPositions) {
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.x).toBeLessThanOrEqual(WORLD_W);
      expect(pos.y).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeLessThanOrEqual(WORLD_H);
    }
  });

  it('keys have valid colorIndex (0-4)', () => {
    const ent = getLevelEntities();
    for (const key of ent.keys) {
      expect(key.colorIndex).toBeGreaterThanOrEqual(0);
      expect(key.colorIndex).toBeLessThanOrEqual(4);
    }
  });

  it('chests have valid colorIndex (0-4)', () => {
    const ent = getLevelEntities();
    for (const chest of ent.chests) {
      expect(chest.colorIndex).toBeGreaterThanOrEqual(0);
      expect(chest.colorIndex).toBeLessThanOrEqual(4);
    }
  });

  it('extracts breakable walls from level 1', () => {
    const ent = getLevelEntities();
    expect(ent.breakableWalls.length).toBeGreaterThan(0);
    for (const bw of ent.breakableWalls) {
      expect(bw.x).toBeGreaterThan(0);
      expect(bw.y).toBeGreaterThan(0);
    }
  });

  it('extracts armored fish from level 1', () => {
    const ent = getLevelEntities();
    expect(ent.armoredFish.length).toBeGreaterThan(0);
    for (const af of ent.armoredFish) {
      expect(af.x).toBeGreaterThan(0);
      expect(af.y).toBeGreaterThan(0);
    }
  });

  it('extracts spitting coral from level 1', () => {
    const ent = getLevelEntities();
    expect(ent.spittingCoral.length).toBeGreaterThan(0);
    for (const sc of ent.spittingCoral) {
      expect(sc.x).toBeGreaterThan(0);
      expect(sc.y).toBeGreaterThan(0);
    }
  });

  it('extracts toggle switches from level 1', () => {
    const ent = getLevelEntities();
    expect(ent.toggleSwitches.length).toBeGreaterThan(0);
    for (const sw of ent.toggleSwitches) {
      expect(sw.x).toBeGreaterThan(0);
      expect(sw.y).toBeGreaterThan(0);
      expect(sw.group).toBeGreaterThanOrEqual(0);
    }
  });

  it('extracts pressure switches from level 1', () => {
    const ent = getLevelEntities();
    expect(ent.pressureSwitches.length).toBeGreaterThan(0);
    for (const sw of ent.pressureSwitches) {
      expect(sw.x).toBeGreaterThan(0);
      expect(sw.y).toBeGreaterThan(0);
      expect(sw.group).toBeGreaterThanOrEqual(0);
    }
  });

  it('extracts timed switches from level 1', () => {
    const ent = getLevelEntities();
    expect(ent.timedSwitches.length).toBeGreaterThan(0);
    for (const sw of ent.timedSwitches) {
      expect(sw.x).toBeGreaterThan(0);
      expect(sw.y).toBeGreaterThan(0);
      expect(sw.group).toBeGreaterThanOrEqual(0);
    }
  });

  it('extracts gates from level 1', () => {
    const ent = getLevelEntities();
    expect(ent.gates.length).toBeGreaterThan(0);
    for (const g of ent.gates) {
      expect(g.x).toBeGreaterThan(0);
      expect(g.y).toBeGreaterThan(0);
      expect(g.group).toBeGreaterThanOrEqual(0);
    }
  });

  it('switch-gate groups are correctly linked', () => {
    const ent = getLevelEntities();
    const allSwitches = [...ent.toggleSwitches, ...ent.pressureSwitches, ...ent.timedSwitches];
    // Each gate's group should match at least one switch's group
    for (const g of ent.gates) {
      const hasMatchingSwitch = allSwitches.some(s => s.group === g.group);
      expect(hasMatchingSwitch).toBe(true);
    }
  });

  it('extracts floating logs from level 1', () => {
    const ent = getLevelEntities();
    expect(ent.floatingLogs.length).toBeGreaterThan(0);
    for (const fl of ent.floatingLogs) {
      expect(fl.x).toBeGreaterThan(0);
      expect(fl.y).toBeGreaterThan(0);
    }
  });

  it('extracts swinging anchors from level 1 with chain length', () => {
    const ent = getLevelEntities();
    expect(ent.swingingAnchors.length).toBeGreaterThan(0);
    for (const sa of ent.swingingAnchors) {
      expect(sa.x).toBeGreaterThan(0);
      expect(sa.y).toBeGreaterThan(0);
      expect(sa.chainLength).toBeGreaterThanOrEqual(32); // at least 1 tile
    }
  });

  it('anchor chain lengths are assigned from level metadata', () => {
    const ent = getLevelEntities();
    // Level 1 has anchorChainLengths metadata with chainLength: 128
    const customAnchor = ent.swingingAnchors.find(a => a.chainLength === 128);
    expect(customAnchor).toBeDefined();
  });

  it('extracts bottle messages from level 1 with text', () => {
    const ent = getLevelEntities();
    expect(ent.bottleMessages.length).toBeGreaterThan(0);
    for (const bm of ent.bottleMessages) {
      expect(bm.x).toBeGreaterThan(0);
      expect(bm.y).toBeGreaterThan(0);
      expect(typeof bm.text).toBe('string');
      expect(bm.text.length).toBeGreaterThan(0);
    }
  });

  it('bottle message texts are assigned from level metadata', () => {
    const ent = getLevelEntities();
    // Level 1 has bottleMessages metadata with specific texts
    const pufferBottle = ent.bottleMessages.find(b => b.text.includes('pufferfish'));
    expect(pufferBottle).toBeDefined();
  });

  it('extracts hint stones from level 1 with text', () => {
    const ent = getLevelEntities();
    expect(ent.hintStones.length).toBeGreaterThan(0);
    for (const hs of ent.hintStones) {
      expect(hs.x).toBeGreaterThan(0);
      expect(hs.y).toBeGreaterThan(0);
      expect(typeof hs.text).toBe('string');
      expect(hs.text.length).toBeGreaterThan(0);
    }
  });

  it('hint stone texts are assigned from level metadata', () => {
    const ent = getLevelEntities();
    const dashHint = ent.hintStones.find(h => h.text.includes('Dash'));
    expect(dashHint).toBeDefined();
  });

  it('floating logs are not included in merged solid bodies', () => {
    const ent = getLevelEntities();
    const bodies = getMergedSolidBodies();
    for (const fl of ent.floatingLogs) {
      for (const body of bodies) {
        const left = body.x - body.w / 2;
        const right = body.x + body.w / 2;
        const top = body.y - body.h / 2;
        const bottom = body.y + body.h / 2;
        const inside = fl.x > left && fl.x < right && fl.y > top && fl.y < bottom;
        expect(inside).toBe(false);
      }
    }
  });

  it('breakable walls are not included in merged solid bodies', () => {
    const ent = getLevelEntities();
    const bodies = getMergedSolidBodies();
    // Breakable wall positions should not overlap with any merged solid body
    for (const bw of ent.breakableWalls) {
      for (const body of bodies) {
        const left = body.x - body.w / 2;
        const right = body.x + body.w / 2;
        const top = body.y - body.h / 2;
        const bottom = body.y + body.h / 2;
        const inside = bw.x > left && bw.x < right && bw.y > top && bw.y < bottom;
        expect(inside).toBe(false);
      }
    }
  });
});

// ── Merged solid bodies (physics optimization) ──

describe('getMergedSolidBodies', () => {
  beforeEach(() => {
    setCurrentLevel(0);
    resetTiles();
    getLevelEntities(); // clear entity tiles first
  });

  it('returns merged rectangles', () => {
    const bodies = getMergedSolidBodies();
    expect(bodies.length).toBeGreaterThan(0);
  });

  it('all bodies have valid position and dimensions', () => {
    const bodies = getMergedSolidBodies();
    for (const b of bodies) {
      expect(b.w).toBeGreaterThan(0);
      expect(b.h).toBeGreaterThan(0);
      expect(b.x).toBeGreaterThan(0);
      expect(b.y).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(b.type);
    }
  });

  it('merged bodies cover all solid tiles', () => {
    // Count solid tiles in TILES
    let solidTileCount = 0;
    for (let r = 0; r < LEVEL_ROWS; r++) {
      for (let c = 0; c < LEVEL_COLS; c++) {
        if ([1, 2, 3].includes(TILES[r][c])) solidTileCount++;
      }
    }

    // Count total tile area from merged bodies
    const bodies = getMergedSolidBodies();
    let mergedTileCount = 0;
    for (const b of bodies) {
      mergedTileCount += (b.w / TILE_SIZE) * (b.h / TILE_SIZE);
    }

    expect(mergedTileCount).toBe(solidTileCount);
  });
});

// ── Water zones ──

describe('getWaterZones', () => {
  beforeEach(() => {
    setCurrentLevel(0);
  });

  it('returns at least one zone', () => {
    const zones = getWaterZones();
    expect(zones.length).toBeGreaterThan(0);
  });

  it('water zone starts at WATER_SURFACE_Y', () => {
    const zones = getWaterZones();
    const topEdge = zones[0].y - zones[0].h / 2;
    expect(topEdge).toBe(WATER_SURFACE_Y);
  });

  it('water zone covers full width', () => {
    const zones = getWaterZones();
    expect(zones[0].w).toBe(WORLD_W);
  });
});

// ── Cross-level consistency ──

describe('cross-level consistency', () => {
  it('every level has a player spawn', () => {
    const levels = getLevels();
    for (const l of levels) {
      setCurrentLevel(l.index);
      resetTiles();
      const ent = getLevelEntities();
      expect(ent.playerSpawn).toBeDefined();
      expect(ent.playerSpawn.x).toBeGreaterThan(0);
    }
  });

  it('every level has at least one pearl', () => {
    const levels = getLevels();
    for (const l of levels) {
      setCurrentLevel(l.index);
      resetTiles();
      const ent = getLevelEntities();
      expect(ent.pearls.length).toBeGreaterThan(0);
    }
  });
});
