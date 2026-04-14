// ── Level Data ──────────────────────────────────────────────────────────────
// Multi-level system. Each level has its own tile map, dimensions, and metadata.
// The active level is selected via setCurrentLevel(index).
// Exported constants (LEVEL_COLS, LEVEL_ROWS, etc.) always reflect the current level.
//
// Tile types:
//   0 = empty (air or water depending on Y)
//   1 = stone
//   2 = sand
//   3 = coral
//   4 = seaweed / spiky plant (hazard)
//   5 = pearl (collectible, placed in empty space)
//   6 = enemy spawn point
//   7 = player spawn point
//   8 = seagrass (non-solid, visual decoration)
//   9 = buoy (dynamic, floats on water surface)
//  10 = boulder (dynamic, heavy pushable rock, kills enemies)
//  11 = raft (dynamic, floats on water surface, player can ride it)
//  12 = shark (chasing enemy — patrols, then chases player within radius)
//  13 = pufferfish (vertical enemy — moves up and down)
//  14 = crab (ground pusher — patrols on ground, pushes player on contact)
//  15 = toxic fish (ranged enemy — shoots poison projectile at nearby player)
//  16-20 = keys (red, blue, green, yellow, purple) — carriable, throwable, no damage
//  21-25 = chests (red, blue, green, yellow, purple) — opened by matching key, spawns pearl
//  26 = crate (wooden box, destroyed by dashing, ~30% pearl drop)

export const TILE_SIZE = 32;

// ── Key-Chest color definitions (shared across modules) ──
export const KEY_CHEST_COLORS = [
  { name: 'red',    keyId: 16, chestId: 21, hex: 0xff4444 },
  { name: 'blue',   keyId: 17, chestId: 22, hex: 0x4488ff },
  { name: 'green',  keyId: 18, chestId: 23, hex: 0x44cc44 },
  { name: 'yellow', keyId: 19, chestId: 24, hex: 0xffcc00 },
  { name: 'purple', keyId: 20, chestId: 25, hex: 0xaa44ff },
];

// ── Tile key (shared across all levels) ──
const KEY = {
  '.': 0,  // empty
  '#': 1,  // stone
  's': 2,  // sand
  'c': 3,  // coral
  'x': 4,  // seaweed/hazard
  'p': 5,  // pearl
  'e': 6,  // enemy spawn
  '@': 7,  // player spawn
  'd': 8,  // seagrass
  'B': 9,  // buoy
  'R': 10, // boulder (rock)
  'T': 11, // raft (tutaj)
  'S': 12, // shark (chase enemy)
  'U': 13, // pufferfish (up-down)
  'C': 14, // crab (ground pusher)
  'F': 15, // toxic fish (ranged)
  '1': 16, // key red
  '2': 17, // key blue
  '3': 18, // key green
  '4': 19, // key yellow
  '5': 20, // key purple
  'a': 21, // chest red
  'b': 22, // chest blue
  'g': 23, // chest green
  'y': 24, // chest yellow
  'q': 25, // chest purple
  'W': 26, // crate (wooden box)
};

// ══════════════════════════════════════════════════════════════════════════════
// ── Level Definitions ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const LEVELS = [
  // ── Level 1: Coral Reef ──
  {
    name: 'Coral Reef',
    description: 'Warm shallow waters with colorful corals',
    cols: 125,
    rows: 25,
    waterRow: 4,  // water surface at row 4
    strings: [
      '#...........................................................................................................................#',  // 0
      '#................................................p..........................................................................#',  // 1
      '#...........................................................................................................................#',  // 2
      '#.................p....................##...................................................##..............................#',  // 3
      '#...........B.......................p....................B.................R..................R.R.........p.................#',  // 4
      '####....................##......##......e...##......####......###....T.....###..........###...###....####...........pd....###',  // 5
      '####..........p2..W.....##......##..........##......####......###..........###..........###...###.......U...........##...####',  // 6
      '####..@.......W.........##..................##d.....####d.....###d.........###..........###....................##....x##.x###',  // 7
      '####.............d1...........p.............a##......####d.....###....x...d###.......................S........W..........x###',  // 8
      '####........pd.###.............R............##g..F..p...x..W.d###.........###.p.dx..........B............................####',  // 9
      '####........######.................e.........##.......d......##..x..F..p........##....e.R.......................p........x###',  // 10
      '####............................R.............##......##..e..##p........W.......##......##..........R...............dpd..d###',  // 11
      '####..........................................##......##.....##.....##..........##......##..p..........S...........d####.####',  // 12
      '####.................U...........b............##......##.....x......##.........d##......##.............U..........d####..####',  // 13
      '####........e....................c......pU...##....x....d..d.......##..........##......##..e....................d#####..U####',  // 14
      '####.............................dc.c.......d##..x......####.....x........F....##d....x....................d.Cd.######...####',  // 15
      '####............................d###.......dd##.xx..d..d####.d.C............x...####d..d..................##########d..U.####',  // 16
      '####......................d.c.cdc###......ddd##.x..#####d....####......d........d.ddd####..............d..d###########...####',  // 17
      '####......................##..e..###.....ddd.##.xdp#####....U####....####.....###..dd####.....x.dR.....#############ppU..####',  // 18
      '####......................##.....###....###p.##dxdd#####..p..####....####.....###..pd####.....####...pd#############pp...####',  // 19
      '####........dd............##.....###....###..#########.......####....####.....###..e.####..e..####..##################...####',  // 20
      '####......dddd............##..p..###....###..#########.......####....####..p..###....####.....####..##################...####',  // 21
      '####..Cpddddddd..d...dp.d.##..d..###.d..###d.#########..d..d.####d...####..C..###d...####..d..####..##################..d####',  // 22
      '#sssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss#',  // 23
      '#############################################################################################################################',  // 24
    ],
  },

  // ── Level 2: Deep Caves ──
  {
    name: 'Deep Caves',
    description: 'Dark caverns with narrow tunnels',
    cols: 125,
    rows: 25,
    waterRow: 2,  // water surface higher — mostly underwater
    strings: [
      '#############################################################################################################################',  // 0
      '#############################################################################################################################',  // 1
      '#............##########............###############............##########............###########................##############',  // 2
      '#..@.........##########....p.......###############............##########............###########.....p..........##############',  // 3
      '#............##########............###############.....p......##########.....p......###########................##############',  // 4
      '#....d..d....##########............###############............##########............###########................##############',  // 5
      '#............###....###............#####....######............###....###............####....###................##############',  // 6
      '#...p........###....###.....p......#####....######............###....###.....p......####....###................##############',  // 7
      '#.....d...e..###....###............#####....######......x.....###....###............####....###................##############',  // 8
      '#............###....###.......d....#####....######............###....###............####....###................##############',  // 9
      '#............##########............###############............##########............###########.....p..........##############',  // 10
      '#.......p...........#####....................#####p...................#####....................#####........................#',  // 11
      '#...................#####.......p............#####....................#####...........U........#####........................#',  // 12
      '#..............p....#####...............F....#####........p...........#####....................#####........................#',  // 13
      '#...................#####....................#####....................#####.....p..............#####..........S.............#',  // 14
      '#...................#####....................#####...............S....#####....................#####.....p..................#',  // 15
      '#..............d....#####..........d.........#####.....d..............#####d...................#####........................#',  // 16
      '#.......p......######.......p......######.......p......######.......p......######.........p.........######..................#',  // 17
      '#...........U..######..............######...........U..######..............######...........U.......######..................#',  // 18
      '#.........########e#######....################....########S#######....################.........#####################........#',  // 19
      '#..C.##########################....##########################....##########################....##########################...#',  // 20
      '#....##########################d...##########################d...##########################d...##########################...#',  // 21
      '#....##########################.dC.##########################.d..##########################.d..##########################...#',  // 22
      '#sssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss#',  // 23
      '#############################################################################################################################',  // 24
    ],
  },

  // ── Level 3: Sunken Ruins ──
  {
    name: 'Sunken Ruins',
    description: 'Ancient structures beneath the waves',
    cols: 125,
    rows: 25,
    waterRow: 3,  // water surface at row 3
    strings: [
      '#############################################################################################################################',  // 0
      '#...........................................................................................................................#',  // 1
      '#...........................................................................................................................#',  // 2
      '#..@...........B....p...................B....p...................B....p...................B....p............................#',  // 3
      '#........pT..................p.....T.............p..........T........p...............T...p...................pT.............#',  // 4
      '#.....######..............######..............######..............######..............######..............######............#',  // 5
      '#.......##..................##..................##..................##..................##..................##..............#',  // 6
      '#.......##..................##..................##..................##..................##..................##..............#',  // 7
      '#......####................####................####................####................####................####.............#',  // 8
      '#....d...................d...................d...................d...................d...................d..................#',  // 9
      '#..............e..............p.........e..............p.........e..............p.........e..............p.........e........#',  // 10
      '#...........................................................................................................................#',  // 11
      '#....##########..........##########..........##########..........##########..........##########..........##########.........#',  // 12
      '#....##...p..##..........##...p..##..........##...p..##..........##...p..##..........##...p..##..........##...p..##.........#',  // 13
      '#....##..S...##..........##..F...##..........##..S...##..........##..F...##..........##......##..........##......##.........#',  // 14
      '#....##########..........##########..........##########..........##########..........##########..........##########.........#',  // 15
      '#.........d.........U.........d...................d.........U.........d...................d...................d.............#',  // 16
      '#.........p..............p..............p..............p..............p..............p..............p..............p........#',  // 17
      '#....###########....R....###########.........###########.........###########.........###########.........###########........#',  // 18
      '#....###########.........###########.........###########.........###########.........###########.........###########........#',  // 19
      '#....#####C#####.........###########.........#####C#####.........###########.........#####C#####.........###########........#',  // 20
      '#....###########.........###########.........###########.........###########.........###########.........###########........#',  // 21
      '#..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d..d...#',  // 22
      '#sssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss#',  // 23
      '#############################################################################################################################',  // 24
    ],
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// ── Active Level State ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

let _currentLevelIndex = 0;

// These are mutable — updated by setCurrentLevel() and resetTiles()
export let LEVEL_COLS = LEVELS[0].cols;
export let LEVEL_ROWS = LEVELS[0].rows;
export let WORLD_W = LEVEL_COLS * TILE_SIZE;
export let WORLD_H = LEVEL_ROWS * TILE_SIZE;
export let WATER_SURFACE_Y = LEVELS[0].waterRow * TILE_SIZE;

// Parse the string map into a 2D number array
export const TILES = [];
function _parseTiles() {
  const level = LEVELS[_currentLevelIndex];
  TILES.length = 0;
  for (let row = 0; row < level.rows; row++) {
    TILES[row] = [];
    const str = level.strings[row] || '';
    for (let col = 0; col < level.cols; col++) {
      const ch = str[col] || '.';
      TILES[row][col] = KEY[ch] ?? 0;
    }
  }
}
_parseTiles();

// ── Public API ──

/** Get list of all levels (for level select UI) */
export function getLevels() {
  return LEVELS.map((l, i) => ({ index: i, name: l.name, description: l.description }));
}

/** Get current level index */
export function getCurrentLevelIndex() {
  return _currentLevelIndex;
}

/** Switch to a different level. Updates all exported dimensions and re-parses tiles. */
export function setCurrentLevel(index) {
  if (index < 0 || index >= LEVELS.length) return;
  _currentLevelIndex = index;
  const level = LEVELS[index];

  // Update exported dimensions (these are `let` exports, reassignable from this module)
  LEVEL_COLS = level.cols;
  LEVEL_ROWS = level.rows;
  WORLD_W = LEVEL_COLS * TILE_SIZE;
  WORLD_H = LEVEL_ROWS * TILE_SIZE;
  WATER_SURFACE_Y = level.waterRow * TILE_SIZE;

  _parseTiles();
}

// Reset TILES to original state (re-parse from current level's strings)
export function resetTiles() {
  _parseTiles();
}

// Extract spawn points and special positions
export function getLevelEntities() {
  const entities = {
    playerSpawn: { x: 3 * TILE_SIZE + TILE_SIZE / 2, y: 7 * TILE_SIZE + TILE_SIZE / 2 },
    enemies: [],
    pearls: [],
    hazards: [],
    buoys: [],
    boulders: [],
    rafts: [],
    sharks: [],
    pufferfish: [],
    crabs: [],
    toxicFish: [],
    keys: [],      // { x, y, colorIndex } — colorIndex 0-4 maps to KEY_CHEST_COLORS
    chests: [],    // { x, y, colorIndex }
    crates: [],    // { x, y }
  };
  for (let row = 0; row < LEVEL_ROWS; row++) {
    for (let col = 0; col < LEVEL_COLS; col++) {
      const cx = col * TILE_SIZE + TILE_SIZE / 2;
      const cy = row * TILE_SIZE + TILE_SIZE / 2;
      const t = TILES[row][col];
      if (t === 7) {
        entities.playerSpawn = { x: cx, y: cy };
        TILES[row][col] = 0; // clear spawn marker from tile data
      } else if (t === 6) {
        entities.enemies.push({ x: cx, y: cy });
        TILES[row][col] = 0;
      } else if (t === 5) {
        entities.pearls.push({ x: cx, y: cy });
        TILES[row][col] = 0;
      } else if (t === 4) {
        entities.hazards.push({ x: cx, y: cy });
        // keep tile type 4 so terrain renderer can draw it
      } else if (t === 9) {
        entities.buoys.push({ x: cx, y: cy });
        TILES[row][col] = 0;
      } else if (t === 10) {
        entities.boulders.push({ x: cx, y: cy });
        TILES[row][col] = 0;
      } else if (t === 11) {
        entities.rafts.push({ x: cx, y: cy });
        TILES[row][col] = 0;
      } else if (t === 12) {
        entities.sharks.push({ x: cx, y: cy });
        TILES[row][col] = 0;
      } else if (t === 13) {
        entities.pufferfish.push({ x: cx, y: cy });
        TILES[row][col] = 0;
      } else if (t === 14) {
        entities.crabs.push({ x: cx, y: cy });
        TILES[row][col] = 0;
      } else if (t === 15) {
        entities.toxicFish.push({ x: cx, y: cy });
        TILES[row][col] = 0;
      } else if (t >= 16 && t <= 20) {
        entities.keys.push({ x: cx, y: cy, colorIndex: t - 16 });
        TILES[row][col] = 0;
      } else if (t >= 21 && t <= 25) {
        entities.chests.push({ x: cx, y: cy, colorIndex: t - 21 });
        TILES[row][col] = 0;
      } else if (t === 26) {
        entities.crates.push({ x: cx, y: cy });
        TILES[row][col] = 0;
      }
    }
  }
  return entities;
}

// Merge adjacent solid tiles (same row) into larger rectangles for physics optimization.
// Returns array of { x, y, w, h, type } where x,y is center.
export function getMergedSolidBodies() {
  const SOLID_TYPES = new Set([1, 2, 3]); // stone, sand, coral
  const bodies = [];
  const visited = Array.from({ length: LEVEL_ROWS }, () => new Array(LEVEL_COLS).fill(false));

  for (let row = 0; row < LEVEL_ROWS; row++) {
    let col = 0;
    while (col < LEVEL_COLS) {
      const t = TILES[row][col];
      if (!SOLID_TYPES.has(t) || visited[row][col]) {
        col++;
        continue;
      }
      // Find horizontal run of same type
      let endCol = col;
      while (endCol < LEVEL_COLS && TILES[row][endCol] === t && !visited[row][endCol]) {
        endCol++;
      }
      // Try to extend downward (greedy rectangle)
      let endRow = row + 1;
      outer:
      while (endRow < LEVEL_ROWS) {
        for (let c = col; c < endCol; c++) {
          if (TILES[endRow][c] !== t || visited[endRow][c]) break outer;
        }
        endRow++;
      }
      // Mark visited
      for (let r = row; r < endRow; r++) {
        for (let c = col; c < endCol; c++) {
          visited[r][c] = true;
        }
      }
      const w = (endCol - col) * TILE_SIZE;
      const h = (endRow - row) * TILE_SIZE;
      const cx = col * TILE_SIZE + w / 2;
      const cy = row * TILE_SIZE + h / 2;
      bodies.push({ x: cx, y: cy, w, h, type: t });
      col = endCol;
    }
  }
  return bodies;
}

// Get water zones — contiguous empty regions below water surface.
// Returns simplified large rectangles covering underwater empty space.
export function getWaterZones() {
  // Simple approach: one large water body covering the entire underwater area,
  // then the solid tiles naturally block it via collision.
  // Nape-js fluid shapes overlap with the entire area; solid bodies displace water.
  const zones = [];
  // Main water body from surface to bottom
  const waterTop = WATER_SURFACE_Y;
  const waterH = WORLD_H - waterTop;
  zones.push({
    x: WORLD_W / 2,
    y: waterTop + waterH / 2,
    w: WORLD_W,
    h: waterH,
  });
  return zones;
}
