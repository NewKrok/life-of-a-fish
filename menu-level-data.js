// ── Menu Level Data ─────────────────────────────────────────────────────────
// Dedicated tile map for the main menu background — an aquarium scene.
// Wider than the screen so the camera can pan back and forth.
// No player spawn, no hazards, no pearls — just terrain and fish.

import { TILE_SIZE } from './level-data.js';

export const MENU_COLS = 60;
export const MENU_ROWS = 25;
export const MENU_WORLD_W = MENU_COLS * TILE_SIZE;   // 1920px
export const MENU_WORLD_H = MENU_ROWS * TILE_SIZE;   // 800px
export const MENU_WATER_SURFACE_Y = 4 * TILE_SIZE;   // row 4 = 128px (matches game level)

// Legend: . = empty, # = stone, s = sand, c = coral, d = seagrass
// Fish entities: e = regular fish, S = shark, U = pufferfish, F = toxic fish
const KEY = {
  '.': 0,
  '#': 1,
  's': 2,
  'c': 3,
  'x': 4,
  'd': 8,
  'e': 6,
  'S': 12,
  'U': 13,
  'C': 14,
  'F': 15,
};

// 60 columns x 25 rows — each string must be exactly 60 characters
//         1111111111222222222233333333334444444444555555555566
//1234567890123456789012345678901234567890123456789012345678901234567890
const MENU_STRINGS = [
  '############################################################',// 0
  '############################################################',// 1
  '############################################################',// 2
  '############################################################',// 3
  '............................................................',// 4
  '...............................ddd..d.......................',// 5
  '................................dddd........................',// 6
  '........e.....e...........S......dd......e..................',// 7
  '...........e......................d.......e..e..............',// 8
  '..................................d..................e......',// 9
  '...S....................e....e..............................',// 10
  '...................U..C.....................................',// 11
  '.........e...........####...e..U..........e.................',// 12
  '..............e......d##d...................................',// 13
  '...................e..d#d........e..........................',// 14
  '..e...................##x....................e..............',// 15
  '.........e............#d.................e..................',// 16
  '......................#.....................................',// 17
  '....d..d..c......d..d.#........d.d..c..d.....d..d..d........',// 18
  '..d#..####.d...d.##..d#d.c.d..d####.d.###.d..d##..d###d.....',// 19
  '..d##d####.##d.d##..####.d..d.####..d.###d..d.##.d####.#....',// 20
  '..###.#####.###.####.####.#..######..#.####.####.#####.##...',// 21
  '.d###d#####d###d####d####d#dd######dd#d####d####d#####d##d..',// 22
  'ssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss',// 23
  '############################################################',// 24
];

// Parse into 2D number array
export const MENU_TILES = [];
for (let row = 0; row < MENU_ROWS; row++) {
  MENU_TILES[row] = [];
  const str = MENU_STRINGS[row] || '';
  for (let col = 0; col < MENU_COLS; col++) {
    const ch = str[col] || '.';
    MENU_TILES[row][col] = KEY[ch] ?? 0;
  }
}

// Extract fish spawn positions from menu tiles
export function getMenuFish() {
  const fish = { enemies: [], sharks: [], pufferfish: [], crabs: [] };
  for (let row = 0; row < MENU_ROWS; row++) {
    for (let col = 0; col < MENU_COLS; col++) {
      const cx = col * TILE_SIZE + TILE_SIZE / 2;
      const cy = row * TILE_SIZE + TILE_SIZE / 2;
      const t = MENU_TILES[row][col];
      if (t === 6) {
        fish.enemies.push({ x: cx, y: cy });
        MENU_TILES[row][col] = 0;
      } else if (t === 12) {
        fish.sharks.push({ x: cx, y: cy });
        MENU_TILES[row][col] = 0;
      } else if (t === 13) {
        fish.pufferfish.push({ x: cx, y: cy });
        MENU_TILES[row][col] = 0;
      } else if (t === 14) {
        fish.crabs.push({ x: cx, y: cy });
        MENU_TILES[row][col] = 0;
      }
    }
  }
  return fish;
}

// Merge solid tiles for physics
export function getMenuMergedBodies() {
  const SOLID_TYPES = new Set([1, 2, 3]);
  const bodies = [];
  const visited = Array.from({ length: MENU_ROWS }, () => new Array(MENU_COLS).fill(false));

  for (let row = 0; row < MENU_ROWS; row++) {
    let col = 0;
    while (col < MENU_COLS) {
      const t = MENU_TILES[row][col];
      if (!SOLID_TYPES.has(t) || visited[row][col]) { col++; continue; }
      let endCol = col;
      while (endCol < MENU_COLS && MENU_TILES[row][endCol] === t && !visited[row][endCol]) endCol++;
      let endRow = row + 1;
      outer:
      while (endRow < MENU_ROWS) {
        for (let c = col; c < endCol; c++) {
          if (MENU_TILES[endRow][c] !== t || visited[endRow][c]) break outer;
        }
        endRow++;
      }
      for (let r = row; r < endRow; r++) {
        for (let c = col; c < endCol; c++) visited[r][c] = true;
      }
      const w = (endCol - col) * TILE_SIZE;
      const h = (endRow - row) * TILE_SIZE;
      bodies.push({ x: col * TILE_SIZE + w / 2, y: row * TILE_SIZE + h / 2, w, h, type: t });
      col = endCol;
    }
  }
  return bodies;
}

// Single large water zone below surface
export function getMenuWaterZones() {
  const waterTop = MENU_WATER_SURFACE_Y;
  const waterH = MENU_WORLD_H - waterTop;
  return [{ x: MENU_WORLD_W / 2, y: waterTop + waterH / 2, w: MENU_WORLD_W, h: waterH }];
}
