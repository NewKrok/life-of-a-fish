// ── Level Data ──────────────────────────────────────────────────────────────
// 2D tile map for the demo cave level.
// Each cell is a tile type:
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

export const TILE_SIZE = 32;
export const LEVEL_COLS = 125;  // 4000px / 32
export const LEVEL_ROWS = 25;   // 800px / 32
export const WORLD_W = LEVEL_COLS * TILE_SIZE;
export const WORLD_H = LEVEL_ROWS * TILE_SIZE;

// Water surface Y (in pixels) — everything below this is underwater
export const WATER_SURFACE_Y = 4 * TILE_SIZE; // row 4 = 128px

// The level is stored as an array of strings for readability.
// Each character maps to a tile type.
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
};

// 125 columns x 25 rows
// Row 0 = top (sky/air), Row 24 = bottom
// Each string is exactly 125 characters (LEVEL_COLS).
// Legend: . = empty, # = stone, s = sand, c = coral, x = hazard, p = pearl, e = enemy, @ = player, d = seagrass
const LEVEL_STRINGS = [
  '#...........................................................................................................................#',  // 0
  '#................................................p..........................................................................#',  // 1
  '#...........................................................................................................................#',  // 2
  '#.................p....................##...................................................##..............................#',  // 3
  '#...........B.......................p....................B................................................p.................#',  // 4
  '####....................##......##..........##......####......###....T.....###..........###...###....####...........pd....###',  // 5
  '####..........p.........##......##..........##......####......###..........###..........###...###.......U...........##...####',  // 6
  '####..@.................##..................##d.....####......###d.........###..........###....................##.....##..###',  // 7
  '####.............d............p..............##......####......###....x...d###.......................S....................###',  // 8
  '####........pd.###.............R............##......p...x....d###.........###.p.dx..........B............................####',  // 9
  '####........######.................e.........##......pd......##..x.....p........##....e.........................p.........###',  // 10
  '####............................R.............##......##.....##p................##......##..........R................pd..d###',  // 11
  '####.....................F....................##......##.e...##.....##..........##......##..p..........S............####.####',  // 12
  '####.................U........................##......##.....x......##.........d##......##.............U..........d####..####',  // 13
  '####.............................c......p....##....x....d..d.......##..........##......##..e.....................#####...####',  // 14
  '####.............................dc.c........##.........####.....x........F....##d....x....................d..d.######...####',  // 15
  '####.............................###.........##.....d..d####.d..............x...####...d..................##########d....####',  // 16
  '####......................d.c.c.c###.........##....#####.....####......d........d....####..............d..d###########...####',  // 17
  '####......................##.....###.....d...##....#####.....####....####.....###....####.....x.d......#############.....####',  // 18
  '####......................##.....###....###..##d...#####..C..####....####..C..###....####.....####....d#############.....####',  // 19
  '####......................##.....###....###..#########.......####....####.....###....####.....####..##################...####',  // 20
  '####......................##.....###....###..#########.......####....####.....###....####.....####..##################...####',  // 21
  '####..C.d..d..d..d...d..d.##..d..###.d..###d.#########..d..d.####d...####..d..###d...####..d..####..##################..d####',  // 22
  '#sssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss#',  // 23
  '#############################################################################################################################',  // 24
];

// Parse the string map into a 2D number array
export const TILES = [];
for (let row = 0; row < LEVEL_ROWS; row++) {
  TILES[row] = [];
  const str = LEVEL_STRINGS[row] || '';
  for (let col = 0; col < LEVEL_COLS; col++) {
    const ch = str[col] || '.';
    TILES[row][col] = KEY[ch] ?? 0;
  }
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
