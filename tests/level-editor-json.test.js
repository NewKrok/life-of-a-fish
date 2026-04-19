import { describe, it, expect, beforeEach } from 'vitest';
import { TILE_SIZE } from '../level-data.js';

// ── Minimal LevelEditor construction for testing serialize/deserialize ──
// We can't import the full class (needs canvas/DOM), so we replicate the
// core serialize/deserialize logic by creating a lightweight mock that
// has the same data structures.

// Re-create the constants used by serialize/deserialize
const ENTITY_IDS = new Set([5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38]);

const PATROL_DEFAULTS = {
  6:  { type: 'point', range: 80 },
  12: { axis: 'x', range: 100 },
  13: { axis: 'y', range: 60 },
  14: { axis: 'x', range: 50 },
  15: { axis: 'x', range: 60 },
  28: { type: 'point', range: 70 },
};

const PALETTE = [
  { id: -1, char: '.', category: 'tools' },
  { id: 0,  char: '.', category: 'tools' },
  { id: 1,  char: '#', category: 'terrain' },
  { id: 2,  char: 's', category: 'terrain' },
  { id: 3,  char: 'c', category: 'terrain' },
  { id: 4,  char: 'x', category: 'terrain' },
  { id: 8,  char: 'd', category: 'terrain' },
  { id: 5,  char: 'p', category: 'items' },
  { id: 7,  char: '@', category: 'items' },
  { id: 9,  char: 'B', category: 'items' },
  { id: 10, char: 'R', category: 'items' },
  { id: 11, char: 'T', category: 'items' },
  { id: 26, char: 'W', category: 'items' },
  { id: 34, char: 'L', category: 'items' },
  { id: 35, char: 'H', category: 'items' },
  { id: 36, char: 'I', category: 'items' },
  { id: 37, char: 'J', category: 'items' },
  { id: 27, char: 'K', category: 'terrain' },
  { id: 6,  char: 'e', category: 'enemies' },
  { id: 28, char: 'A', category: 'enemies' },
  { id: 12, char: 'S', category: 'enemies' },
  { id: 13, char: 'U', category: 'enemies' },
  { id: 14, char: 'C', category: 'enemies' },
  { id: 15, char: 'F', category: 'enemies' },
  { id: 29, char: 'P', category: 'enemies' },
  { id: 38, char: 'M', category: 'enemies' },
  { id: 30, char: 'V', category: 'items' },
  { id: 31, char: 'N', category: 'items' },
  { id: 32, char: 'O', category: 'items' },
  { id: 33, char: 'G', category: 'items' },
  { id: 16, char: '1', category: 'keys' },
  { id: 17, char: '2', category: 'keys' },
  { id: 18, char: '3', category: 'keys' },
  { id: 19, char: '4', category: 'keys' },
  { id: 20, char: '5', category: 'keys' },
  { id: 21, char: 'a', category: 'chests' },
  { id: 22, char: 'b', category: 'chests' },
  { id: 23, char: 'g', category: 'chests' },
  { id: 24, char: 'y', category: 'chests' },
  { id: 25, char: 'q', category: 'chests' },
];

const ID_TO_CHAR = {};
for (const p of PALETTE) ID_TO_CHAR[p.id] = p.char;

// ── Helper: replicate serializeLevel logic ──
function serializeLevel(tiles, entities, meta) {
  // Export strings (merge tiles + entity chars)
  const rows = tiles.length;
  const cols = tiles[0]?.length || 0;
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const t = tiles[r][c];
      line += ID_TO_CHAR[t] || '.';
    }
    lines.push(line);
  }
  for (const ent of entities) {
    const col = Math.round((ent.x - TILE_SIZE / 2) / TILE_SIZE);
    const row = Math.round((ent.y - TILE_SIZE / 2) / TILE_SIZE);
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      const ch = ID_TO_CHAR[ent.tileId] || '.';
      const arr = lines[row].split('');
      arr[col] = ch;
      lines[row] = arr.join('');
    }
  }

  const serializedEntities = [];
  for (const ent of entities) {
    const col = Math.round((ent.x - TILE_SIZE / 2) / TILE_SIZE);
    const row = Math.round((ent.y - TILE_SIZE / 2) / TILE_SIZE);
    const e = { tileId: ent.tileId, row, col };
    if (ent.patrol) {
      if (ent.patrol.x1 !== undefined) {
        e.patrol = {
          x1: Math.round(ent.patrol.x1), y1: Math.round(ent.patrol.y1),
          x2: Math.round(ent.patrol.x2), y2: Math.round(ent.patrol.y2),
        };
      } else if (ent.patrol.axis) {
        e.patrol = {
          axis: ent.patrol.axis,
          min: Math.round(ent.patrol.min),
          max: Math.round(ent.patrol.max),
        };
      }
    }
    if (ent.group !== undefined) e.group = ent.group;
    if (ent.text !== undefined && ent.text !== '...') e.text = ent.text;
    if (ent.chainLength !== undefined) e.chainLength = ent.chainLength;
    serializedEntities.push(e);
  }

  return {
    version: 1,
    name: meta.name || 'Untitled',
    cols,
    rows,
    waterRow: meta.waterRow ?? 4,
    bossLevel: meta.bossLevel || undefined,
    levelGoal: meta.levelGoal || undefined,
    noCaveBg: meta.noCaveBg || undefined,
    strings: lines,
    entities: serializedEntities,
  };
}

// ── Helper: replicate deserializeLevel logic ──
function deserializeLevel(data) {
  const charToId = {};
  for (const p of PALETTE) charToId[p.char] = p.id;

  const newCols = data.cols || data.strings[0]?.length || 0;
  const newRows = data.rows || data.strings.length || 0;
  const tiles = [];
  for (let r = 0; r < newRows; r++) {
    const row = [];
    const str = data.strings[r] || '';
    for (let c = 0; c < newCols; c++) {
      const ch = str[c] || '.';
      const id = charToId[ch] ?? 0;
      row.push(ENTITY_IDS.has(id) ? 0 : id);
    }
    tiles.push(row);
  }

  const entities = [];
  for (const e of data.entities) {
    const cx = e.col * TILE_SIZE + TILE_SIZE / 2;
    const cy = e.row * TILE_SIZE + TILE_SIZE / 2;
    const ent = { x: cx, y: cy, tileId: e.tileId };
    if (e.patrol) ent.patrol = { ...e.patrol };
    if (e.group !== undefined) ent.group = e.group;
    if (e.text !== undefined) ent.text = e.text;
    if (e.chainLength !== undefined) ent.chainLength = e.chainLength;
    if (!ent.patrol && PATROL_DEFAULTS[e.tileId]) {
      const pDef = PATROL_DEFAULTS[e.tileId];
      const snap = (v) => Math.floor(v / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
      if (pDef.type === 'point') {
        ent.patrol = { x1: snap(cx - pDef.range), y1: cy, x2: snap(cx + pDef.range), y2: cy };
      } else if (pDef.axis === 'x') {
        ent.patrol = { axis: 'x', min: snap(cx - pDef.range), max: snap(cx + pDef.range) };
      } else {
        ent.patrol = { axis: 'y', min: snap(cy - pDef.range), max: snap(cy + pDef.range) };
      }
    }
    if ((e.tileId === 36 || e.tileId === 37) && !ent.text) ent.text = '...';
    if (e.tileId === 35 && ent.chainLength === undefined) ent.chainLength = 96;
    entities.push(ent);
  }

  return { tiles, entities, meta: { cols: newCols, rows: newRows, waterRow: data.waterRow, name: data.name, bossLevel: data.bossLevel, levelGoal: data.levelGoal, noCaveBg: data.noCaveBg } };
}

// ── Tests ──

describe('level JSON serialize/deserialize', () => {

  // Build a small 5×3 test level
  function makeTestLevel() {
    const cols = 5, rows = 3;
    const tiles = [
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 2, 2, 2, 1],
    ];
    const entities = [
      { x: 1 * 32 + 16, y: 1 * 32 + 16, tileId: 7 }, // player spawn at (1,1)
      { x: 2 * 32 + 16, y: 0 * 32 + 16, tileId: 5 }, // pearl at (2,0)
      {
        x: 3 * 32 + 16, y: 1 * 32 + 16, tileId: 6,  // piranha at (3,1)
        patrol: { x1: 2 * 32 + 16, y1: 1 * 32 + 16, x2: 4 * 32 + 16, y2: 1 * 32 + 16 },
      },
    ];
    return { tiles, entities, meta: { name: 'Test Level', waterRow: 1, cols, rows } };
  }

  it('serialize produces valid JSON structure', () => {
    const { tiles, entities, meta } = makeTestLevel();
    const json = serializeLevel(tiles, entities, meta);

    expect(json.version).toBe(1);
    expect(json.name).toBe('Test Level');
    expect(json.cols).toBe(5);
    expect(json.rows).toBe(3);
    expect(json.waterRow).toBe(1);
    expect(json.strings).toHaveLength(3);
    expect(json.entities).toHaveLength(3);
  });

  it('serialize embeds entities into strings', () => {
    const { tiles, entities, meta } = makeTestLevel();
    const json = serializeLevel(tiles, entities, meta);

    // Row 0 should have pearl at col 2
    expect(json.strings[0][2]).toBe('p');
    // Row 1 should have player at col 1 and piranha at col 3
    expect(json.strings[1][1]).toBe('@');
    expect(json.strings[1][3]).toBe('e');
  });

  it('serialize preserves patrol data', () => {
    const { tiles, entities, meta } = makeTestLevel();
    const json = serializeLevel(tiles, entities, meta);

    const piranha = json.entities.find(e => e.tileId === 6);
    expect(piranha.patrol).toBeDefined();
    expect(piranha.patrol.x1).toBe(2 * 32 + 16);
    expect(piranha.patrol.x2).toBe(4 * 32 + 16);
  });

  it('round-trip: deserialize(serialize(level)) preserves tiles', () => {
    const { tiles, entities, meta } = makeTestLevel();
    const json = serializeLevel(tiles, entities, meta);
    const result = deserializeLevel(json);

    // Tiles should match (entity positions cleared to 0)
    expect(result.tiles).toHaveLength(3);
    expect(result.tiles[0]).toEqual([1, 0, 0, 0, 1]); // pearl cleared
    expect(result.tiles[2]).toEqual([1, 2, 2, 2, 1]); // sand preserved
  });

  it('round-trip: preserves entity count and positions', () => {
    const { tiles, entities, meta } = makeTestLevel();
    const json = serializeLevel(tiles, entities, meta);
    const result = deserializeLevel(json);

    expect(result.entities).toHaveLength(3);

    const spawn = result.entities.find(e => e.tileId === 7);
    expect(spawn.x).toBe(1 * 32 + 16);
    expect(spawn.y).toBe(1 * 32 + 16);

    const pearl = result.entities.find(e => e.tileId === 5);
    expect(pearl.x).toBe(2 * 32 + 16);
    expect(pearl.y).toBe(0 * 32 + 16);
  });

  it('round-trip: preserves patrol data', () => {
    const { tiles, entities, meta } = makeTestLevel();
    const json = serializeLevel(tiles, entities, meta);
    const result = deserializeLevel(json);

    const piranha = result.entities.find(e => e.tileId === 6);
    expect(piranha.patrol.x1).toBe(2 * 32 + 16);
    expect(piranha.patrol.y1).toBe(1 * 32 + 16);
    expect(piranha.patrol.x2).toBe(4 * 32 + 16);
    expect(piranha.patrol.y2).toBe(1 * 32 + 16);
  });

  it('round-trip: preserves metadata', () => {
    const { tiles, entities, meta } = makeTestLevel();
    const json = serializeLevel(tiles, entities, meta);
    const result = deserializeLevel(json);

    expect(result.meta.name).toBe('Test Level');
    expect(result.meta.waterRow).toBe(1);
    expect(result.meta.cols).toBe(5);
    expect(result.meta.rows).toBe(3);
  });

  it('serialize handles switch-gate groups', () => {
    const tiles = [[1, 0, 0, 1]];
    const entities = [
      { x: 1 * 32 + 16, y: 0 * 32 + 16, tileId: 30, group: 0 }, // toggle switch
      { x: 2 * 32 + 16, y: 0 * 32 + 16, tileId: 33, group: 0 }, // gate
    ];
    const json = serializeLevel(tiles, entities, { name: 'Switch Test', cols: 4, rows: 1 });

    const sw = json.entities.find(e => e.tileId === 30);
    expect(sw.group).toBe(0);
    const gate = json.entities.find(e => e.tileId === 33);
    expect(gate.group).toBe(0);
  });

  it('serialize handles bottle messages and hint stones', () => {
    const tiles = [[0, 0, 0]];
    const entities = [
      { x: 0 * 32 + 16, y: 0 * 32 + 16, tileId: 36, text: 'Hello world!' },
      { x: 1 * 32 + 16, y: 0 * 32 + 16, tileId: 37, text: 'Press E to grab' },
      { x: 2 * 32 + 16, y: 0 * 32 + 16, tileId: 36, text: '...' }, // default text, should be omitted
    ];
    const json = serializeLevel(tiles, entities, { name: 'Text Test', cols: 3, rows: 1 });

    const bottle = json.entities.find(e => e.tileId === 36 && e.col === 0);
    expect(bottle.text).toBe('Hello world!');

    const hint = json.entities.find(e => e.tileId === 37);
    expect(hint.text).toBe('Press E to grab');

    const defaultBottle = json.entities.find(e => e.tileId === 36 && e.col === 2);
    expect(defaultBottle.text).toBeUndefined();
  });

  it('deserialize restores default text for bottles/hints without text', () => {
    const data = {
      version: 1, name: 'T', cols: 2, rows: 1, waterRow: 4,
      strings: ['..'],
      entities: [
        { tileId: 36, row: 0, col: 0 }, // bottle without text
        { tileId: 37, row: 0, col: 1 }, // hint without text
      ],
    };
    const result = deserializeLevel(data);
    expect(result.entities[0].text).toBe('...');
    expect(result.entities[1].text).toBe('...');
  });

  it('serialize handles anchor chain lengths', () => {
    const tiles = [[0]];
    const entities = [
      { x: 0 * 32 + 16, y: 0 * 32 + 16, tileId: 35, chainLength: 128 },
    ];
    const json = serializeLevel(tiles, entities, { name: 'Anchor Test', cols: 1, rows: 1 });
    expect(json.entities[0].chainLength).toBe(128);
  });

  it('deserialize restores default chain length for anchors', () => {
    const data = {
      version: 1, name: 'T', cols: 1, rows: 1, waterRow: 4,
      strings: ['.'],
      entities: [{ tileId: 35, row: 0, col: 0 }],
    };
    const result = deserializeLevel(data);
    expect(result.entities[0].chainLength).toBe(96);
  });

  it('serialize handles boss level flags', () => {
    const tiles = [[0]];
    const json = serializeLevel(tiles, [], {
      name: 'Boss Test', cols: 1, rows: 1, waterRow: 3,
      bossLevel: true, levelGoal: 'boss', noCaveBg: true,
    });
    expect(json.bossLevel).toBe(true);
    expect(json.levelGoal).toBe('boss');
    expect(json.noCaveBg).toBe(true);
  });

  it('deserialize restores default patrol for enemies without explicit patrol', () => {
    const data = {
      version: 1, name: 'T', cols: 3, rows: 1, waterRow: 4,
      strings: ['...'],
      entities: [{ tileId: 12, row: 0, col: 1 }], // shark without patrol
    };
    const result = deserializeLevel(data);
    const shark = result.entities[0];
    expect(shark.patrol).toBeDefined();
    expect(shark.patrol.axis).toBe('x');
    expect(shark.patrol.min).toBeLessThan(shark.x);
    expect(shark.patrol.max).toBeGreaterThan(shark.x);
  });

  it('JSON.stringify(serialize) produces parseable JSON', () => {
    const { tiles, entities, meta } = makeTestLevel();
    const json = serializeLevel(tiles, entities, meta);
    const str = JSON.stringify(json);
    const parsed = JSON.parse(str);
    expect(parsed.version).toBe(1);
    expect(parsed.entities).toHaveLength(3);
    expect(parsed.strings).toHaveLength(3);
  });

  it('axis-aligned patrol round-trip (pufferfish vertical)', () => {
    const tiles = [[0]];
    const cx = 0 * 32 + 16, cy = 0 * 32 + 16;
    const entities = [{
      x: cx, y: cy, tileId: 13,
      patrol: { axis: 'y', min: cy - 60, max: cy + 60 },
    }];
    const json = serializeLevel(tiles, entities, { name: 'P', cols: 1, rows: 1 });
    const result = deserializeLevel(json);
    const puffer = result.entities[0];
    expect(puffer.patrol.axis).toBe('y');
    expect(puffer.patrol.min).toBe(cy - 60);
    expect(puffer.patrol.max).toBe(cy + 60);
  });
});
