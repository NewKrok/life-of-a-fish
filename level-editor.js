// ── Level Editor ────────────────────────────────────────────────────────────
// In-game tile editor activated with F4. Provides free camera, left sidebar
// palette with categories + preview thumbnails, entity placement/removal,
// patrol editing, move mode, and right-click camera drag.
// Works with both game level (level-data.js) and menu level (menu-level-data.js).

import { TILE_SIZE } from './level-data.js';
import { t } from './i18n.js';

// ── Tile palette definition ──
// Each entry: { id, char, label, color, category, previewKey? }
// previewKey maps to the key in the previews object passed via setPreviews()
const MOVE_TILE_ID = -1; // Special ID for move tool

const PALETTE = [
  { id: MOVE_TILE_ID, char: '.', labelKey: 'editor.pal.move',          color: '#00e5ff', category: 'tools',   previewKey: null },
  { id: 0,  char: '.', labelKey: 'editor.pal.erase',                   color: '#222',    category: 'tools',   previewKey: null },
  { id: 1,  char: '#', labelKey: 'editor.pal.stone',                   color: '#666',    category: 'terrain', previewKey: 'stone' },
  { id: 2,  char: 's', labelKey: 'editor.pal.sand',                    color: '#c8a86e', category: 'terrain', previewKey: 'sand' },
  { id: 3,  char: 'c', labelKey: 'editor.pal.coral',                   color: '#e06080', category: 'terrain', previewKey: 'coral' },
  { id: 4,  char: 'x', labelKey: 'editor.pal.hazard',                  color: '#40c040', category: 'terrain', previewKey: 'hazard' },
  { id: 8,  char: 'd', labelKey: 'editor.pal.seagrass',                color: '#2d8040', category: 'terrain', previewKey: 'seagrass' },
  { id: 5,  char: 'p', labelKey: 'editor.pal.pearl',                   color: '#ffd93d', category: 'items',   previewKey: 'pearl' },
  { id: 7,  char: '@', labelKey: 'editor.pal.spawn',                   color: '#00e5ff', category: 'items',   previewKey: 'player' },
  { id: 9,  char: 'B', labelKey: 'editor.pal.buoy',                    color: '#ff4444', category: 'items',   previewKey: 'buoy' },
  { id: 10, char: 'R', labelKey: 'editor.pal.boulder',                 color: '#888',    category: 'items',   previewKey: 'boulder' },
  { id: 11, char: 'T', labelKey: 'editor.pal.raft',                    color: '#8b5a2b', category: 'items',   previewKey: 'raft' },
  { id: 26, char: 'W', labelKey: 'editor.pal.crate',                   color: '#8B6914', category: 'items',   previewKey: 'crate' },
  { id: 34, char: 'L', labelKey: 'editor.pal.floatingLog',             color: '#6B4A2A', category: 'items',   previewKey: 'floatingLog' },
  { id: 35, char: 'H', labelKey: 'editor.pal.swAnchor',                color: '#5A5A6A', category: 'items',   previewKey: 'swingingAnchor' },
  { id: 36, char: 'I', labelKey: 'editor.pal.bottle',                  color: '#88ccaa', category: 'items',   previewKey: 'bottle' },
  { id: 37, char: 'J', labelKey: 'editor.pal.hintStone',               color: '#7a8a7a', category: 'items',   previewKey: 'hintStone' },
  { id: 27, char: 'K', labelKey: 'editor.pal.breakableWall',           color: '#7a7a8a', category: 'terrain', previewKey: 'breakableWall' },
  { id: 6,  char: 'e', labelKey: 'editor.pal.piranha',                 color: '#ff6060', category: 'enemies', previewKey: 'piranha' },
  { id: 28, char: 'A', labelKey: 'editor.pal.armoredFish',             color: '#6a7a8a', category: 'enemies', previewKey: 'armoredFish' },
  { id: 12, char: 'S', labelKey: 'editor.pal.shark',                   color: '#6080c0', category: 'enemies', previewKey: 'shark' },
  { id: 13, char: 'U', labelKey: 'editor.pal.pufferfish',              color: '#c0a060', category: 'enemies', previewKey: 'pufferfish' },
  { id: 14, char: 'C', labelKey: 'editor.pal.crab',                    color: '#d04020', category: 'enemies', previewKey: 'crab' },
  { id: 15, char: 'F', labelKey: 'editor.pal.toxicFish',               color: '#50c050', category: 'enemies', previewKey: 'toxicFish' },
  { id: 29, char: 'P', labelKey: 'editor.pal.spitCoral',               color: '#cc6688', category: 'enemies', previewKey: 'spittingCoral' },
  { id: 38, char: 'M', labelKey: 'editor.pal.giantCrabBoss',           color: '#8a1e1e', category: 'enemies', previewKey: 'giantCrabBoss' },
  { id: 30, char: 'V', labelKey: 'editor.pal.swToggle',                color: '#22aa44', category: 'items',   previewKey: 'switchToggle' },
  { id: 31, char: 'N', labelKey: 'editor.pal.swPressure',              color: '#3366cc', category: 'items',   previewKey: 'switchPressure' },
  { id: 32, char: 'O', labelKey: 'editor.pal.swTimed',                 color: '#cc8822', category: 'items',   previewKey: 'switchTimed' },
  { id: 33, char: 'G', labelKey: 'editor.pal.gate',                    color: '#888899', category: 'items',   previewKey: 'gate' },
  { id: 16, char: '1', labelKey: 'editor.pal.keyRed',                  color: '#ff4444', category: 'keys',    previewKey: 'keyRed' },
  { id: 17, char: '2', labelKey: 'editor.pal.keyBlue',                 color: '#4488ff', category: 'keys',    previewKey: 'keyBlue' },
  { id: 18, char: '3', labelKey: 'editor.pal.keyGreen',                color: '#44cc44', category: 'keys',    previewKey: 'keyGreen' },
  { id: 19, char: '4', labelKey: 'editor.pal.keyYellow',               color: '#ffcc00', category: 'keys',    previewKey: 'keyYellow' },
  { id: 20, char: '5', labelKey: 'editor.pal.keyPurple',               color: '#aa44ff', category: 'keys',    previewKey: 'keyPurple' },
  { id: 21, char: 'a', labelKey: 'editor.pal.chestRed',                color: '#cc2222', category: 'chests',  previewKey: 'chestRed' },
  { id: 22, char: 'b', labelKey: 'editor.pal.chestBlue',               color: '#2266cc', category: 'chests',  previewKey: 'chestBlue' },
  { id: 23, char: 'g', labelKey: 'editor.pal.chestGreen',              color: '#22aa22', category: 'chests',  previewKey: 'chestGreen' },
  { id: 24, char: 'y', labelKey: 'editor.pal.chestYellow',             color: '#ccaa00', category: 'chests',  previewKey: 'chestYellow' },
  { id: 25, char: 'q', labelKey: 'editor.pal.chestPurple',             color: '#8822cc', category: 'chests',  previewKey: 'chestPurple' },
];

// Category definitions in display order
const CATEGORIES = [
  { key: 'tools',   labelKey: 'editor.cat.tools' },
  { key: 'terrain', labelKey: 'editor.cat.terrain' },
  { key: 'items',   labelKey: 'editor.cat.items' },
  { key: 'enemies', labelKey: 'editor.cat.enemies' },
  { key: 'keys',    labelKey: 'editor.cat.keys' },
  { key: 'chests',  labelKey: 'editor.cat.chests' },
];

// Reverse lookup: tileId -> char
const ID_TO_CHAR = {};
for (const p of PALETTE) ID_TO_CHAR[p.id] = p.char;

// ── Pre-built lookup caches (avoid PALETTE.find/filter per frame) ──
const PALETTE_BY_ID = new Map();
for (const p of PALETTE) PALETTE_BY_ID.set(p.id, p);

const PALETTE_BY_CATEGORY = new Map();
for (const cat of CATEGORIES) {
  PALETTE_BY_CATEGORY.set(cat.key, PALETTE.filter(p => p.category === cat.key));
}

// Entity tile IDs (non-terrain — stored as entity positions)
const ENTITY_IDS = new Set([5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38]);

// Enemies with patrol ranges
const PATROL_DEFAULTS = {
  6:  { type: 'point', range: 80 },   // piranha (point-to-point, supports diagonal)
  12: { axis: 'x', range: 100 },      // shark
  13: { axis: 'y', range: 60 },       // pufferfish
  14: { axis: 'x', range: 50 },       // crab
  15: { axis: 'x', range: 60 },       // toxic fish
  28: { type: 'point', range: 70 },   // armored fish (point-to-point, supports diagonal)
};

// Ground-based entities — visually aligned to tile bottom instead of center
const GROUND_ENTITY_IDS = new Set([14, 29, 30, 31, 32, 33, 38]); // crab, spit coral, switches, gate, giant crab boss

// ── Camera scroll speed ──
const CAM_SPEED = 400;          // px/s
const CAM_FAST_MULTIPLIER = 2;  // shift held

// ── Sidebar layout constants ──
const SIDEBAR_W = 216;          // px width (20% wider than 180)
const SIDEBAR_PAD = 8;          // px inner padding
const CATEGORY_HEADER_H = 24;   // px height for category headers
const GRID_CELL_SIZE = 60;      // px — square grid cell for library items
const GRID_GAP = 4;             // px gap between grid cells
const PREVIEW_H = 80;           // px height for large preview area at top
const TOP_BAR_H = 32;           // px top info bar

export class LevelEditor {
  /**
   * @param {CanvasRenderingContext2D} hudCtx - HUD overlay context
   * @param {HTMLCanvasElement} hudCanvas - HUD canvas element
   * @param {number[][]} tiles - 2D tile array (mutated in place)
   * @param {number} cols - Number of columns
   * @param {number} rows - Number of rows
   * @param {number} worldW - World width in px
   * @param {number} worldH - World height in px
   */
  constructor(hudCtx, hudCanvas, tiles, cols, rows, worldW, worldH) {
    this.hudCtx = hudCtx;
    this.hudCanvas = hudCanvas;
    this.tiles = tiles;
    this.cols = cols;
    this.rows = rows;
    this.worldW = worldW;
    this.worldH = worldH;

    this.active = false;
    this.selectedTile = 1;  // default: stone

    // Free camera
    this.camX = 0;
    this.camY = 0;

    // Entity overlay: array of { x, y, tileId, patrol? }
    this.entities = [];

    // Patrol editing
    this._draggingPatrol = null;  // { entityIdx, handle: 'min'|'max' }

    // Move mode (active when Move tool is selected)
    this._movingEntity = null;    // { entityIdx }

    // Entity config toolbar (replaces Shift+click)
    this._configEntityIdx = -1;   // index into this.entities, or -1 if no toolbar shown
    this._configBtnRects = [];    // [{ x, y, w, h, action }] — screen-space hit rects

    // Category collapse state (all expanded by default)
    this._collapsed = {};

    // Sidebar scroll offset (for when content overflows)
    this._sidebarScrollY = 0;
    this._sidebarContentH = 0;  // calculated during render

    // Preview images — dataURL map set via setPreviews()
    // Keys: 'stone','sand','coral','hazard','seagrass','pearl','player','buoy',
    //        'boulder','raft','piranha','shark','pufferfish','crab','toxicFish','key','chest'
    this._previews = {};      // { key: dataURL string }
    this._previewImgs = {};   // { key: HTMLImageElement } — loaded from dataURLs

    // Input state
    this._keys = {};
    this._mouseWorld = { x: 0, y: 0 };
    this._mouseScreen = { x: 0, y: 0 };
    this._mouseDown = false;
    this._rightMouseDown = false;
    this._lastPlacedCell = null;
    this._dblClickTimer = 0;
    this._dblClickPos = null;
    this._paintDelay = 0;

    // Right-click camera drag state
    this._rightDragStart = null;   // { screenX, screenY, camX, camY }

    // Touch state for sidebar scrolling
    this._sidebarTouchId = null;
    this._sidebarTouchStartY = 0;
    this._sidebarScrollStart = 0;

    // Two-finger pan state (mobile camera drag)
    this._twoFingerPan = null;  // { startCamX, startCamY, startMidX, startMidY }

    // 3D ghost model at cursor position
    this._three = null;          // THREE reference — set via setScene()
    this._scene = null;          // Three.js scene
    this._voxelRenderer = null;  // VoxelRenderer instance
    this._ghostGroup = null;     // Current ghost THREE.Group in the scene
    this._ghostTileId = -1;      // Which tile the ghost was built for
    this._ghostCol = -1;         // Current ghost grid position
    this._ghostRow = -1;

    // Grid visibility
    this.showGrid = true;

    // Top bar button hit rects (set during render)
    this._saveBtnRect = null;
    this._loadBtnRect = null;
    this._copyBtnRect = null;
    this._playBtnRect = null;

    // Dirty flag for export
    this.dirty = false;

    // Level metadata (set via setLevelMeta, used by serialize)
    this._waterRow = 4;
    this._bossLevel = false;
    this._levelGoal = undefined;
    this._noCaveBg = false;
    this._levelName = 'Untitled';

    // Save/Load overlay state
    this._overlayMode = null;  // null | 'save' | 'load'
    this._overlaySlots = [];   // cached slot list for rendering
    this._overlayScroll = 0;   // scroll offset in overlay
    this._overlayInputName = ''; // name input for save
    this._overlayHoverIdx = -1;  // hovered slot index
    this._overlayDeleteIdx = -1; // hovered delete button index
    this._overlayBtnRects = [];  // [{ x, y, w, h, action, slotId? }] hit rects

    // Undo/Redo stacks (snapshot-based)
    this._undoStack = [];     // Array of { tiles, entities } snapshots
    this._redoStack = [];
    this._activeAction = null; // Snapshot taken at mousedown, pushed on mouseup
    this._MAX_UNDO = 100;

    // Sidebar rendering cache (offscreen canvas + dirty flag)
    this._sidebarDirty = true;
    this._sidebarCanvas = null;  // created on first render
    this._sidebarCachedH = 0;    // cached canvas height
    this._prevSelectedTile = -999;
    this._prevMoveMode = false;

    // Editor wants flat camera (no pitch) — game.js reads this
    this.flatCamera = true;

    // Rebuild callback — called when terrain or entities change
    this.onTerrainChange = null;
    this.onEntityChange = null;
    this.onPlayTest = null;  // called when Play button is clicked
    this.onLevelResize = null; // called after load/import resizes the level

    // Throttle terrain rebuilds
    this._terrainDirty = false;
    this._terrainRebuildTimer = 0;
    this._terrainRebuildInterval = 0.08; // seconds — fast rebuild for responsive painting

    // Bound handlers (for cleanup)
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onContextMenu = (e) => { if (this.active) e.preventDefault(); };
    this._onWheel = this._handleWheel.bind(this);
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchMove = this._handleTouchMove.bind(this);
    this._onTouchEnd = this._handleTouchEnd.bind(this);
  }

  get moveMode() { return this.selectedTile === MOVE_TILE_ID; }

  // ── Set 3D scene for ghost cursor model ──
  setScene(THREE, scene, voxelRenderer) {
    this._three = THREE;
    this._scene = scene;
    this._voxelRenderer = voxelRenderer;
  }

  // ── Set preview thumbnails ──
  // previewMap: { key: dataURL } — same keys as codex previews + terrain blocks
  setPreviews(previewMap) {
    this._previews = previewMap || {};
    this._previewImgs = {};
    for (const [key, url] of Object.entries(this._previews)) {
      if (!url) continue;
      const img = new Image();
      img.onload = () => this._invalidateSidebar();
      img.src = url;
      this._previewImgs[key] = img;
    }
    this._invalidateSidebar();
  }

  // ── Activate / Deactivate ──

  activate(camX, camY, entityList) {
    this.active = true;
    this.camX = camX;
    this.camY = camY;
    this.entities = entityList || [];
    this._draggingPatrol = null;
    this._movingEntity = null;
    this._rightDragStart = null;
    this.hudCanvas.style.pointerEvents = 'auto';

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.hudCanvas.addEventListener('mousemove', this._onMouseMove);
    this.hudCanvas.addEventListener('mousedown', this._onMouseDown);
    this.hudCanvas.addEventListener('mouseup', this._onMouseUp);
    this.hudCanvas.addEventListener('contextmenu', this._onContextMenu);
    this.hudCanvas.addEventListener('wheel', this._onWheel, { passive: false });
    this.hudCanvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.hudCanvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.hudCanvas.addEventListener('touchend', this._onTouchEnd);
  }

  deactivate() {
    this.active = false;
    this._draggingPatrol = null;
    this._movingEntity = null;
    this._rightDragStart = null;
    this._removeGhost();
    this.hudCanvas.style.pointerEvents = 'none';

    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.hudCanvas.removeEventListener('mousemove', this._onMouseMove);
    this.hudCanvas.removeEventListener('mousedown', this._onMouseDown);
    this.hudCanvas.removeEventListener('mouseup', this._onMouseUp);
    this.hudCanvas.removeEventListener('contextmenu', this._onContextMenu);
    this.hudCanvas.removeEventListener('wheel', this._onWheel);
    this.hudCanvas.removeEventListener('touchstart', this._onTouchStart);
    this.hudCanvas.removeEventListener('touchmove', this._onTouchMove);
    this.hudCanvas.removeEventListener('touchend', this._onTouchEnd);
  }

  // ── Build entity list from current tiles + known entities ──
  static buildEntityList(tiles, cols, rows, knownEntities) {
    const list = [];
    if (knownEntities) {
      const snapCenter = (v) => Math.floor(v / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
      const addGroup = (arr, tileId) => {
        for (const e of arr) {
          const entry = { x: e.x, y: e.y, tileId };
          const pDef = PATROL_DEFAULTS[tileId];
          if (pDef) {
            if (pDef.type === 'point') {
              entry.patrol = {
                x1: snapCenter(e.x - pDef.range), y1: e.y,
                x2: snapCenter(e.x + pDef.range), y2: e.y,
              };
            } else if (pDef.axis === 'x') {
              entry.patrol = { axis: 'x', min: snapCenter(e.x - pDef.range), max: snapCenter(e.x + pDef.range) };
            } else {
              entry.patrol = { axis: 'y', min: snapCenter(e.y - pDef.range), max: snapCenter(e.y + pDef.range) };
            }
          }
          // Preserve switch/gate group assignment
          if (e.group !== undefined) entry.group = e.group;
          list.push(entry);
        }
      };
      if (knownEntities.enemies) addGroup(knownEntities.enemies, 6);
      if (knownEntities.pearls) addGroup(knownEntities.pearls, 5);
      if (knownEntities.hazards) addGroup(knownEntities.hazards, 4);
      if (knownEntities.buoys) addGroup(knownEntities.buoys, 9);
      if (knownEntities.boulders) addGroup(knownEntities.boulders, 10);
      if (knownEntities.rafts) addGroup(knownEntities.rafts, 11);
      if (knownEntities.sharks) addGroup(knownEntities.sharks, 12);
      if (knownEntities.pufferfish) addGroup(knownEntities.pufferfish, 13);
      if (knownEntities.crabs) addGroup(knownEntities.crabs, 14);
      if (knownEntities.toxicFish) addGroup(knownEntities.toxicFish, 15);
      if (knownEntities.armoredFish) addGroup(knownEntities.armoredFish, 28);
      if (knownEntities.spittingCoral) addGroup(knownEntities.spittingCoral, 29);
      if (knownEntities.giantCrabBosses) addGroup(knownEntities.giantCrabBosses, 38);
      if (knownEntities.toggleSwitches) addGroup(knownEntities.toggleSwitches, 30);
      if (knownEntities.pressureSwitches) addGroup(knownEntities.pressureSwitches, 31);
      if (knownEntities.timedSwitches) addGroup(knownEntities.timedSwitches, 32);
      if (knownEntities.gates) addGroup(knownEntities.gates, 33);
      if (knownEntities.crates) addGroup(knownEntities.crates, 26);
      if (knownEntities.keys) {
        for (const k of knownEntities.keys) list.push({ x: k.x, y: k.y, tileId: 16 + k.colorIndex });
      }
      if (knownEntities.chests) {
        for (const ch of knownEntities.chests) list.push({ x: ch.x, y: ch.y, tileId: 21 + ch.colorIndex });
      }
      if (knownEntities.playerSpawn) {
        list.push({ x: knownEntities.playerSpawn.x, y: knownEntities.playerSpawn.y, tileId: 7 });
      }
    }
    // Scan tiles for remaining entities
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = tiles[r][c];
        if (ENTITY_IDS.has(t)) {
          const cx = c * TILE_SIZE + TILE_SIZE / 2;
          const cy = r * TILE_SIZE + TILE_SIZE / 2;
          const exists = list.some(e => Math.abs(e.x - cx) < 2 && Math.abs(e.y - cy) < 2 && e.tileId === t);
          if (!exists) {
            const entry = { x: cx, y: cy, tileId: t };
            const pDef = PATROL_DEFAULTS[t];
            if (pDef) {
              const snap = (v) => Math.floor(v / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
              if (pDef.axis === 'x') {
                entry.patrol = { axis: 'x', min: snap(cx - pDef.range), max: snap(cx + pDef.range) };
              } else {
                entry.patrol = { axis: 'y', min: snap(cy - pDef.range), max: snap(cy + pDef.range) };
              }
            }
            list.push(entry);
          }
        }
      }
    }
    return list;
  }

  // ── Update (called every frame when editor is active) ──
  update(dt, getVisibleSize) {
    if (!this.active) return;

    const { visW, visH } = getVisibleSize();
    const speed = CAM_SPEED * (this._keys['ShiftLeft'] || this._keys['ShiftRight'] ? CAM_FAST_MULTIPLIER : 1);

    // WASD / Arrow camera movement
    if (this._keys['ArrowLeft'] || this._keys['KeyA']) this.camX -= speed * dt;
    if (this._keys['ArrowRight'] || this._keys['KeyD']) this.camX += speed * dt;
    if (this._keys['ArrowUp'] || this._keys['KeyW']) this.camY -= speed * dt;
    if (this._keys['ArrowDown'] || this._keys['KeyS']) this.camY += speed * dt;

    // Clamp to world
    this.camX = Math.max(0, Math.min(this.camX, this.worldW - visW));
    this.camY = Math.max(0, Math.min(this.camY, this.worldH - visH));

    // Move mode: drag entity
    if (this.moveMode && this._movingEntity && this._mouseDown) {
      this._beginAction(); // snapshot before first move frame
      const ent = this.entities[this._movingEntity.entityIdx];
      if (ent) {
        const { visW: vw, visH: vh } = getVisibleSize();
        const wx = this.camX + ((this._mouseScreen.x - SIDEBAR_W) / (this.hudCanvas.width - SIDEBAR_W)) * vw;
        const wy = this.camY + (this._mouseScreen.y / this.hudCanvas.height) * vh;
        // Snap to grid center
        const col = Math.floor(wx / TILE_SIZE);
        const row = Math.floor(wy / TILE_SIZE);
        const newX = col * TILE_SIZE + TILE_SIZE / 2;
        const newY = row * TILE_SIZE + TILE_SIZE / 2;
        // Move patrol range with entity
        if (ent.patrol) {
          const dx = newX - ent.x;
          const dy = newY - ent.y;
          if (ent.patrol.x1 !== undefined) {
            ent.patrol.x1 += dx; ent.patrol.y1 += dy;
            ent.patrol.x2 += dx; ent.patrol.y2 += dy;
          } else {
            ent.patrol.min += ent.patrol.axis === 'x' ? dx : dy;
            ent.patrol.max += ent.patrol.axis === 'x' ? dx : dy;
          }
        }
        ent.x = newX;
        ent.y = newY;
        this.dirty = true;
        this._sgCacheDirty = true;
        if (this.onEntityChange) this.onEntityChange(this.entities);
      }
    }

    // Patrol handle drag
    if (!this.moveMode && this._mouseDown && !this._draggingPatrol && this._lastPlacedCell === null) {
      if (this._mouseScreen.x > SIDEBAR_W) {
        const { visW: hvw, visH: hvh } = getVisibleSize();
        const hsx = (this.hudCanvas.width - SIDEBAR_W) / hvw;
        const hwx = this.camX + ((this._mouseScreen.x - SIDEBAR_W) / (this.hudCanvas.width - SIDEBAR_W)) * hvw;
        const hwy = this.camY + (this._mouseScreen.y / this.hudCanvas.height) * hvh;
        const handle = this._findPatrolHandle(hwx, hwy, hsx);
        if (handle) {
          this._draggingPatrol = handle;
        }
      }
    }

    // Continuous painting while mouse held (skip if dragging patrol or in move mode)
    if (this._mouseDown && !this._draggingPatrol && !this.moveMode) {
      this._placeTileAtMouse(getVisibleSize);
    }

    // Drag patrol handle or chain handle (snapped to tile centers)
    if (this._draggingPatrol && this._mouseDown) {
      this._beginAction(); // snapshot before first drag frame
      const ent = this.entities[this._draggingPatrol.entityIdx];
      const { visW: vw, visH: vh } = getVisibleSize();
      const rawX = this.camX + ((this._mouseScreen.x - SIDEBAR_W) / (this.hudCanvas.width - SIDEBAR_W)) * vw;
      const rawY = this.camY + (this._mouseScreen.y / this.hudCanvas.height) * vh;
      // Snap to nearest tile center
      const snapX = Math.floor(rawX / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
      const snapY = Math.floor(rawY / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;

      if (this._draggingPatrol.handle === 'chain' && ent && ent.tileId === 35) {
        // Anchor chain length — drag vertically, minimum 1 tile
        const newLen = Math.max(TILE_SIZE, snapY - ent.y);
        ent.chainLength = newLen;
        this.dirty = true;
      } else if (ent && ent.patrol) {
        if (ent.patrol.x1 !== undefined) {
          // Point-to-point patrol — free drag both axes
          if (this._draggingPatrol.handle === 'min') {
            ent.patrol.x1 = snapX;
            ent.patrol.y1 = snapY;
          } else {
            ent.patrol.x2 = snapX;
            ent.patrol.y2 = snapY;
          }
        } else if (ent.patrol.axis === 'x') {
          if (this._draggingPatrol.handle === 'min') {
            ent.patrol.min = Math.min(snapX, ent.x - TILE_SIZE);
          } else {
            ent.patrol.max = Math.max(snapX, ent.x + TILE_SIZE);
          }
        } else {
          if (this._draggingPatrol.handle === 'min') {
            ent.patrol.min = Math.min(snapY, ent.y - TILE_SIZE);
          } else {
            ent.patrol.max = Math.max(snapY, ent.y + TILE_SIZE);
          }
        }
        this.dirty = true;
      }
    }

    // Right-click camera drag — always re-anchor to prevent drift at edges
    if (this._rightDragStart) {
      const dx = this._mouseScreen.x - this._rightDragStart.screenX;
      const dy = this._mouseScreen.y - this._rightDragStart.screenY;
      const viewW = this.hudCanvas.width - SIDEBAR_W;
      const scaleX = visW / viewW;
      const scaleY = visH / this.hudCanvas.height;
      this.camX = Math.max(0, Math.min(this._rightDragStart.camX - dx * scaleX, this.worldW - visW));
      this.camY = Math.max(0, Math.min(this._rightDragStart.camY - dy * scaleY, this.worldH - visH));
      // Re-anchor every frame so clamping doesn't accumulate offset
      this._rightDragStart.screenX = this._mouseScreen.x;
      this._rightDragStart.screenY = this._mouseScreen.y;
      this._rightDragStart.camX = this.camX;
      this._rightDragStart.camY = this.camY;
    }

    // Throttled terrain rebuild
    if (this._terrainDirty) {
      this._terrainRebuildTimer -= dt;
      if (this._terrainRebuildTimer <= 0) {
        this._terrainDirty = false;
        this._terrainRebuildTimer = this._terrainRebuildInterval;
        if (this.onTerrainChange) this.onTerrainChange();
      }
    }

    // Update 3D ghost model at cursor
    this.updateGhost(getVisibleSize);
  }

  // ── Render editor overlay on HUD ──
  render(getVisibleSize) {
    if (!this.active) return;

    const ctx = this.hudCtx;
    const W = this.hudCanvas.width;
    const H = this.hudCanvas.height;
    const { visW, visH } = getVisibleSize();

    // The world viewport starts after the sidebar
    const viewX = SIDEBAR_W;
    const viewW = W - SIDEBAR_W;
    const sx = viewW / visW;
    const sy = H / visH;

    // ── Grid ──
    if (this.showGrid) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(viewX, 0, viewW, H);
      ctx.clip();
      ctx.setTransform(sx, 0, 0, sy, viewX - this.camX * sx, -this.camY * sy);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 0.5 / sx;

      const startCol = Math.floor(this.camX / TILE_SIZE);
      const endCol = Math.ceil((this.camX + visW) / TILE_SIZE);
      const startRow = Math.floor(this.camY / TILE_SIZE);
      const endRow = Math.ceil((this.camY + visH) / TILE_SIZE);

      for (let c = startCol; c <= endCol; c++) {
        const x = c * TILE_SIZE;
        ctx.beginPath();
        ctx.moveTo(x, startRow * TILE_SIZE);
        ctx.lineTo(x, endRow * TILE_SIZE);
        ctx.stroke();
      }
      for (let r = startRow; r <= endRow; r++) {
        const y = r * TILE_SIZE;
        ctx.beginPath();
        ctx.moveTo(startCol * TILE_SIZE, y);
        ctx.lineTo(endCol * TILE_SIZE, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── Entity overlays + patrol ranges ──
    ctx.save();
    ctx.beginPath();
    ctx.rect(viewX, 0, viewW, H);
    ctx.clip();
    ctx.setTransform(sx, 0, 0, sy, viewX - this.camX * sx, -this.camY * sy);

    // Viewport culling bounds for entities (world coords + margin)
    const cullMargin = TILE_SIZE * 3;
    const cullLeft = this.camX - cullMargin;
    const cullRight = this.camX + visW + cullMargin;
    const cullTop = this.camY - cullMargin;
    const cullBottom = this.camY + visH + cullMargin;

    for (let i = 0; i < this.entities.length; i++) {
      const ent = this.entities[i];
      // Skip entities outside viewport
      if (ent.x < cullLeft || ent.x > cullRight || ent.y < cullTop || ent.y > cullBottom) continue;
      const pal = PALETTE_BY_ID.get(ent.tileId);
      const color = pal ? pal.color : '#ffffff';
      // Normalize short hex (#RGB) to full hex (#RRGGBB) for alpha concatenation
      const fullColor = color.length === 4
        ? '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3]
        : color;

      // Entity marker — fill the whole tile cell
      const ex = ent.x - TILE_SIZE / 2;
      const ey = ent.y - TILE_SIZE / 2;
      ctx.fillStyle = fullColor + '55';
      ctx.strokeStyle = fullColor;
      ctx.lineWidth = 2 / sx;
      ctx.fillRect(ex, ey, TILE_SIZE, TILE_SIZE);
      ctx.strokeRect(ex, ey, TILE_SIZE, TILE_SIZE);

      // Inner icon circle
      ctx.fillStyle = fullColor + '99';
      ctx.beginPath();
      ctx.arc(ent.x, ent.y, TILE_SIZE / 4, 0, Math.PI * 2);
      ctx.fill();

      // Move mode indicator
      if (this.moveMode) {
        ctx.strokeStyle = '#00e5ff88';
        ctx.lineWidth = 1.5 / sx;
        ctx.setLineDash([3 / sx, 3 / sx]);
        ctx.strokeRect(ex - 2 / sx, ey - 2 / sx, TILE_SIZE + 4 / sx, TILE_SIZE + 4 / sx);
        ctx.setLineDash([]);
      }

      // Label
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.max(5, 7 / sx)}px 'Silkscreen', monospace`;
      ctx.textAlign = 'center';
      const label = pal ? t(pal.labelKey) : '?';
      ctx.fillText(label, ent.x, ent.y - TILE_SIZE / 2 - 3 / sx);

      // ── Patrol visualization ──
      if (ent.patrol) {
        const pColor = fullColor;
        ctx.strokeStyle = pColor + 'aa';
        ctx.lineWidth = 1.5 / sx;
        ctx.setLineDash([4 / sx, 4 / sx]);

        if (ent.patrol.x1 !== undefined) {
          // Point-to-point patrol (piranha, armored fish)
          ctx.beginPath();
          ctx.moveTo(ent.patrol.x1, ent.patrol.y1);
          ctx.lineTo(ent.patrol.x2, ent.patrol.y2);
          ctx.stroke();
          this._drawPatrolHandle(ctx, ent.patrol.x1, ent.patrol.y1, pColor, sx);
          this._drawPatrolHandle(ctx, ent.patrol.x2, ent.patrol.y2, pColor, sx);
        } else if (ent.patrol.axis === 'x') {
          ctx.beginPath();
          ctx.moveTo(ent.patrol.min, ent.y);
          ctx.lineTo(ent.patrol.max, ent.y);
          ctx.stroke();
          this._drawPatrolHandle(ctx, ent.patrol.min, ent.y, pColor, sx);
          this._drawPatrolHandle(ctx, ent.patrol.max, ent.y, pColor, sx);
        } else {
          ctx.beginPath();
          ctx.moveTo(ent.x, ent.patrol.min);
          ctx.lineTo(ent.x, ent.patrol.max);
          ctx.stroke();
          this._drawPatrolHandle(ctx, ent.x, ent.patrol.min, pColor, sx);
          this._drawPatrolHandle(ctx, ent.x, ent.patrol.max, pColor, sx);
        }

        ctx.setLineDash([]);
      }

      // ── Bottle/Hint text preview ──
      if ((ent.tileId === 36 || ent.tileId === 37) && ent.text) {
        const truncated = ent.text.length > 20 ? ent.text.substring(0, 20) + '...' : ent.text;
        ctx.fillStyle = 'rgba(200, 240, 220, 0.85)';
        ctx.font = `${Math.max(4, 5 / sx)}px 'Silkscreen', monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(truncated, ent.x, ent.y + TILE_SIZE / 2 + 8 / sx);
      }

      // ── Anchor chain length visualization ──
      if (ent.tileId === 35 && ent.chainLength) {
        const aColor = fullColor;
        ctx.strokeStyle = aColor + 'cc';
        ctx.lineWidth = 2 / sx;
        ctx.setLineDash([3 / sx, 3 / sx]);
        // Draw chain line from entity position downward
        const chainEndY = ent.y + ent.chainLength;
        ctx.beginPath();
        ctx.moveTo(ent.x, ent.y);
        ctx.lineTo(ent.x, chainEndY);
        ctx.stroke();
        ctx.setLineDash([]);
        // Draw handle at chain end
        this._drawPatrolHandle(ctx, ent.x, chainEndY, aColor, sx);
      }
    }

    // ── Switch-gate connection lines ──
    this._drawSwitchGateLinks(ctx, sx);

    ctx.restore();

    // ── Cursor highlight ──
    if (this._mouseScreen.x > SIDEBAR_W && this._mouseScreen.y > TOP_BAR_H) {
      const mx = this.camX + ((this._mouseScreen.x - SIDEBAR_W) / viewW) * visW;
      const my = this.camY + (this._mouseScreen.y / H) * visH;
      const col = Math.floor(mx / TILE_SIZE);
      const row = Math.floor(my / TILE_SIZE);
      if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
        // Convert tile cell to screen coordinates
        const cellScreenX = viewX + (col * TILE_SIZE - this.camX) * sx;
        const cellScreenY = (row * TILE_SIZE - this.camY) * sy;
        const cellW = TILE_SIZE * sx;
        const cellH = TILE_SIZE * sy;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.beginPath();
        ctx.rect(viewX, 0, viewW, H);
        ctx.clip();

        const pal = PALETTE_BY_ID.get(this.selectedTile);
        const cursorColor = pal ? pal.color : '#fff';

        if (this.moveMode) {
          ctx.strokeStyle = '#00e5ffcc';
          ctx.lineWidth = 2;
          ctx.strokeRect(cellScreenX, cellScreenY, cellW, cellH);
        } else {
          // Dashed border — the 3D ghost model shows the actual preview
          ctx.strokeStyle = cursorColor + 'cc';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(cellScreenX, cellScreenY, cellW, cellH);
          ctx.setLineDash([]);
        }

        ctx.restore();
      }
    }

    // ── Sidebar ──
    this._renderSidebar(W, H);

    // ── Top bar info ──
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(SIDEBAR_W, 0, viewW, TOP_BAR_H);

    ctx.fillStyle = '#ffd93d';
    ctx.font = "bold 11px 'Silkscreen', monospace";
    ctx.textAlign = 'left';
    ctx.fillText(t('editor.title'), SIDEBAR_W + 10, 21);

    const mx = this.camX + ((this._mouseScreen.x - SIDEBAR_W) / viewW) * visW;
    const my = this.camY + (this._mouseScreen.y / H) * visH;
    const mCol = Math.floor(mx / TILE_SIZE);
    const mRow = Math.floor(my / TILE_SIZE);
    ctx.fillStyle = 'rgba(200,230,255,0.7)';
    ctx.font = "10px 'Silkscreen', monospace";
    const modeLabel = this.moveMode ? `  ${t('editor.moveMode')}` : '';
    ctx.fillText(`${t('editor.coordinates', { col: mCol, row: mRow })}${modeLabel}  |  ${t('editor.controls')}`, SIDEBAR_W + 170, 21);

    // ── Top bar buttons (Save, Load, Copy, Play) ──
    const btnW = 50;
    const btnH = 22;
    const btnY = 5;
    const btnGap = 6;

    // Buttons from right to left: Play, Copy, Load, Save
    const playBtnX = W - btnW - 10;
    const copyBtnX = playBtnX - btnW - btnGap;
    const loadBtnX = copyBtnX - btnW - btnGap;
    const saveBtnX = loadBtnX - btnW - btnGap;

    // Save button
    this._saveBtnRect = { x: saveBtnX, y: btnY, w: btnW, h: btnH };
    const saveActive = this._overlayMode === 'save';
    ctx.fillStyle = saveActive ? 'rgba(60, 160, 80, 0.9)' : 'rgba(40, 120, 60, 0.8)';
    ctx.fillRect(saveBtnX, btnY, btnW, btnH);
    ctx.strokeStyle = 'rgba(100, 255, 140, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(saveBtnX, btnY, btnW, btnH);
    ctx.fillStyle = '#fff';
    ctx.font = "bold 9px 'Silkscreen', monospace";
    ctx.textAlign = 'center';
    ctx.fillText(t('editor.save'), saveBtnX + btnW / 2, btnY + 15);

    // Load button
    this._loadBtnRect = { x: loadBtnX, y: btnY, w: btnW, h: btnH };
    const loadActive = this._overlayMode === 'load';
    ctx.fillStyle = loadActive ? 'rgba(60, 120, 200, 0.9)' : 'rgba(40, 80, 140, 0.8)';
    ctx.fillRect(loadBtnX, btnY, btnW, btnH);
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(loadBtnX, btnY, btnW, btnH);
    ctx.fillStyle = '#fff';
    ctx.font = "bold 9px 'Silkscreen', monospace";
    ctx.textAlign = 'center';
    ctx.fillText(t('editor.load'), loadBtnX + btnW / 2, btnY + 15);

    // Copy (JSON clipboard) button
    this._copyBtnRect = { x: copyBtnX, y: btnY, w: btnW, h: btnH };
    ctx.fillStyle = 'rgba(100, 80, 140, 0.8)';
    ctx.fillRect(copyBtnX, btnY, btnW, btnH);
    ctx.strokeStyle = 'rgba(180, 140, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(copyBtnX, btnY, btnW, btnH);
    ctx.fillStyle = '#fff';
    ctx.font = "bold 9px 'Silkscreen', monospace";
    ctx.textAlign = 'center';
    ctx.fillText(t('editor.copy'), copyBtnX + btnW / 2, btnY + 15);

    // Play button
    this._playBtnRect = { x: playBtnX, y: btnY, w: btnW, h: btnH };
    ctx.fillStyle = 'rgba(40, 80, 160, 0.8)';
    ctx.fillRect(playBtnX, btnY, btnW, btnH);
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(playBtnX, btnY, btnW, btnH);
    ctx.fillStyle = '#fff';
    ctx.font = "bold 9px 'Silkscreen', monospace";
    ctx.textAlign = 'center';
    ctx.fillText(`\u25B6 ${t('editor.play')}`, playBtnX + btnW / 2, btnY + 15);

    ctx.restore();

    // ── Save/Load overlay ──
    if (this._overlayMode) this._renderOverlay(W, H);

    // ── Entity config toolbar ──
    this._renderConfigToolbar(getVisibleSize);
  }

  // ── Render Save/Load overlay panel ──
  _renderOverlay(W, H) {
    const ctx = this.hudCtx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this._overlayBtnRects = [];

    // Dim background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(SIDEBAR_W, TOP_BAR_H, W - SIDEBAR_W, H - TOP_BAR_H);

    // Panel dimensions
    const panelW = 340;
    const panelH = Math.min(400, H - TOP_BAR_H - 40);
    const panelX = SIDEBAR_W + (W - SIDEBAR_W - panelW) / 2;
    const panelY = TOP_BAR_H + (H - TOP_BAR_H - panelH) / 2;

    // Panel background
    ctx.fillStyle = 'rgba(6, 21, 32, 0.95)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    // Title
    const isSave = this._overlayMode === 'save';
    ctx.fillStyle = '#ffd93d';
    ctx.font = "bold 12px 'Silkscreen', monospace";
    ctx.textAlign = 'center';
    ctx.fillText(isSave ? t('editor.saveTitle') : t('editor.loadTitle'), panelX + panelW / 2, panelY + 22);

    // Close button (top-right corner of panel)
    const closeBtnSize = 20;
    const closeX = panelX + panelW - closeBtnSize - 4;
    const closeY = panelY + 4;
    ctx.fillStyle = 'rgba(120, 40, 40, 0.8)';
    ctx.fillRect(closeX, closeY, closeBtnSize, closeBtnSize);
    ctx.fillStyle = '#fff';
    ctx.font = "bold 10px 'Silkscreen', monospace";
    ctx.textAlign = 'center';
    ctx.fillText('\u2715', closeX + closeBtnSize / 2, closeY + 15);
    this._overlayBtnRects.push({ x: closeX, y: closeY, w: closeBtnSize, h: closeBtnSize, action: 'close' });

    let curY = panelY + 36;

    // Save mode: name input + "Save New" button
    if (isSave) {
      const inputX = panelX + 12;
      const inputW = panelW - 80;
      const inputH = 24;

      // Name label + input box
      ctx.fillStyle = 'rgba(200, 230, 255, 0.7)';
      ctx.font = "9px 'Silkscreen', monospace";
      ctx.textAlign = 'left';
      ctx.fillText(t('editor.nameLabel'), inputX, curY + 10);

      const nameBoxX = inputX + 50;
      const nameBoxW = inputW - 50;
      ctx.fillStyle = 'rgba(20, 40, 60, 0.9)';
      ctx.fillRect(nameBoxX, curY, nameBoxW, inputH);
      ctx.strokeStyle = 'rgba(100, 200, 255, 0.4)';
      ctx.strokeRect(nameBoxX, curY, nameBoxW, inputH);
      ctx.fillStyle = '#fff';
      ctx.font = "10px 'Silkscreen', monospace";
      ctx.textAlign = 'left';
      const displayName = this._overlayInputName || this._levelName || 'Untitled';
      ctx.fillText(displayName.substring(0, 24), nameBoxX + 4, curY + 16);
      this._overlayBtnRects.push({ x: nameBoxX, y: curY, w: nameBoxW, h: inputH, action: 'editName' });

      // Save New button
      const saveBtnW = 50;
      const saveBtnX = panelX + panelW - saveBtnW - 12;
      ctx.fillStyle = 'rgba(40, 140, 70, 0.9)';
      ctx.fillRect(saveBtnX, curY, saveBtnW, inputH);
      ctx.strokeStyle = 'rgba(100, 255, 140, 0.5)';
      ctx.strokeRect(saveBtnX, curY, saveBtnW, inputH);
      ctx.fillStyle = '#fff';
      ctx.font = "bold 9px 'Silkscreen', monospace";
      ctx.textAlign = 'center';
      ctx.fillText(t('editor.saveNew'), saveBtnX + saveBtnW / 2, curY + 16);
      this._overlayBtnRects.push({ x: saveBtnX, y: curY, w: saveBtnW, h: inputH, action: 'saveNew' });

      curY += inputH + 10;
    }

    // Load mode: Import JSON button
    if (!isSave) {
      const importBtnW = 120;
      const importBtnX = panelX + (panelW - importBtnW) / 2;
      const importBtnH = 24;
      ctx.fillStyle = 'rgba(100, 80, 140, 0.9)';
      ctx.fillRect(importBtnX, curY, importBtnW, importBtnH);
      ctx.strokeStyle = 'rgba(180, 140, 255, 0.5)';
      ctx.strokeRect(importBtnX, curY, importBtnW, importBtnH);
      ctx.fillStyle = '#fff';
      ctx.font = "bold 9px 'Silkscreen', monospace";
      ctx.textAlign = 'center';
      ctx.fillText(t('editor.importJson'), importBtnX + importBtnW / 2, curY + 16);
      this._overlayBtnRects.push({ x: importBtnX, y: curY, w: importBtnW, h: importBtnH, action: 'importJson' });
      curY += importBtnH + 10;
    }

    // Divider
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(panelX + 12, curY);
    ctx.lineTo(panelX + panelW - 12, curY);
    ctx.stroke();
    curY += 8;

    // Slot list header
    ctx.fillStyle = 'rgba(200, 230, 255, 0.6)';
    ctx.font = "9px 'Silkscreen', monospace";
    ctx.textAlign = 'left';
    ctx.fillText(t('editor.savedLevels'), panelX + 12, curY + 10);
    curY += 18;

    // Slot list
    const slots = this._overlaySlots;
    const slotH = 32;
    const slotGap = 4;
    const listAreaH = panelY + panelH - curY - 8;
    const maxVisible = Math.floor(listAreaH / (slotH + slotGap));

    if (slots.length === 0) {
      ctx.fillStyle = 'rgba(200, 230, 255, 0.3)';
      ctx.font = "9px 'Silkscreen', monospace";
      ctx.textAlign = 'center';
      ctx.fillText(t('editor.noSavedLevels'), panelX + panelW / 2, curY + 20);
    }

    // Clip rendering to list area
    ctx.save();
    ctx.beginPath();
    ctx.rect(panelX, curY, panelW, listAreaH);
    ctx.clip();

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const sy = curY + i * (slotH + slotGap) - this._overlayScroll;
      if (sy + slotH < curY || sy > curY + listAreaH) continue;

      const isHover = this._overlayHoverIdx === i;

      // Slot background
      ctx.fillStyle = isHover ? 'rgba(40, 80, 120, 0.8)' : 'rgba(20, 40, 60, 0.6)';
      ctx.fillRect(panelX + 8, sy, panelW - 16, slotH);
      ctx.strokeStyle = isHover ? 'rgba(100, 200, 255, 0.5)' : 'rgba(100, 200, 255, 0.2)';
      ctx.strokeRect(panelX + 8, sy, panelW - 16, slotH);

      // Slot name
      ctx.fillStyle = '#fff';
      ctx.font = "bold 10px 'Silkscreen', monospace";
      ctx.textAlign = 'left';
      ctx.fillText(slot.name.substring(0, 22), panelX + 16, sy + 14);

      // Saved date
      ctx.fillStyle = 'rgba(200, 230, 255, 0.5)';
      ctx.font = "8px 'Silkscreen', monospace";
      const dateStr = _formatDate(slot.savedAt);
      ctx.fillText(dateStr, panelX + 16, sy + 26);

      // Size info
      const sizeStr = `${slot.data?.cols || '?'}x${slot.data?.rows || '?'}`;
      ctx.fillText(sizeStr, panelX + 160, sy + 26);

      // Action button: Load (in load mode) or Overwrite (in save mode)
      if (isSave) {
        // Overwrite button
        const owBtnW = 36;
        const owBtnX = panelX + panelW - 16 - owBtnW - 30;
        ctx.fillStyle = 'rgba(140, 120, 40, 0.8)';
        ctx.fillRect(owBtnX, sy + 4, owBtnW, slotH - 8);
        ctx.fillStyle = '#fff';
        ctx.font = "bold 8px 'Silkscreen', monospace";
        ctx.textAlign = 'center';
        ctx.fillText(t('editor.overwrite'), owBtnX + owBtnW / 2, sy + slotH / 2 + 3);
        this._overlayBtnRects.push({ x: owBtnX, y: sy + 4, w: owBtnW, h: slotH - 8, action: 'overwrite', slotId: slot.id });
      } else {
        // Load button
        const ldBtnW = 36;
        const ldBtnX = panelX + panelW - 16 - ldBtnW - 30;
        ctx.fillStyle = 'rgba(40, 120, 80, 0.8)';
        ctx.fillRect(ldBtnX, sy + 4, ldBtnW, slotH - 8);
        ctx.fillStyle = '#fff';
        ctx.font = "bold 8px 'Silkscreen', monospace";
        ctx.textAlign = 'center';
        ctx.fillText(t('editor.loadBtn'), ldBtnX + ldBtnW / 2, sy + slotH / 2 + 3);
        this._overlayBtnRects.push({ x: ldBtnX, y: sy + 4, w: ldBtnW, h: slotH - 8, action: 'loadSlot', slotId: slot.id });
      }

      // Delete button (both modes)
      const delBtnW = 24;
      const delBtnX = panelX + panelW - 16 - delBtnW;
      const isDelHover = this._overlayDeleteIdx === i;
      ctx.fillStyle = isDelHover ? 'rgba(180, 40, 40, 0.9)' : 'rgba(120, 40, 40, 0.6)';
      ctx.fillRect(delBtnX, sy + 4, delBtnW, slotH - 8);
      ctx.fillStyle = '#fff';
      ctx.font = "bold 9px 'Silkscreen', monospace";
      ctx.textAlign = 'center';
      ctx.fillText('\u2715', delBtnX + delBtnW / 2, sy + slotH / 2 + 3);
      this._overlayBtnRects.push({ x: delBtnX, y: sy + 4, w: delBtnW, h: slotH - 8, action: 'deleteSlot', slotId: slot.id });
    }

    ctx.restore(); // pop clip
    ctx.restore(); // pop transform
  }

  // ── Handle overlay button clicks ──
  _handleOverlayClick(ex, ey) {
    for (const btn of this._overlayBtnRects) {
      if (ex >= btn.x && ex <= btn.x + btn.w && ey >= btn.y && ey <= btn.y + btn.h) {
        switch (btn.action) {
          case 'close':
            this._overlayMode = null;
            return true;
          case 'saveNew': {
            const name = this._overlayInputName || this._levelName || 'Untitled';
            this._levelName = name;
            const slotId = 'slot_' + Date.now();
            if (this.saveToSlot(slotId)) {
              this._showToast(t('editor.savedToast', { name }));
              this._overlaySlots = LevelEditor.getSavedLevels();
            } else {
              this._showToast(t('editor.saveFailed'));
            }
            return true;
          }
          case 'overwrite': {
            const slot = this._overlaySlots.find(s => s.id === btn.slotId);
            if (slot && this.saveToSlot(btn.slotId)) {
              this._showToast(t('editor.savedToast', { name: slot.name }));
              this._overlaySlots = LevelEditor.getSavedLevels();
            }
            return true;
          }
          case 'loadSlot': {
            if (this.loadFromSlot(btn.slotId)) {
              const slot = this._overlaySlots.find(s => s.id === btn.slotId);
              this._showToast(t('editor.loadedToast', { name: slot?.name || '?' }));
              this._overlayMode = null;
            } else {
              this._showToast(t('editor.loadFailed'));
            }
            return true;
          }
          case 'deleteSlot': {
            LevelEditor.deleteSlot(btn.slotId);
            this._overlaySlots = LevelEditor.getSavedLevels();
            this._showToast(t('editor.deletedToast'));
            return true;
          }
          case 'importJson': {
            this._promptJsonImport();
            return true;
          }
          case 'editName': {
            const newName = prompt(t('editor.namePrompt'), this._overlayInputName || this._levelName || 'Untitled');
            if (newName !== null && newName.trim()) {
              this._overlayInputName = newName.trim();
              this._levelName = newName.trim();
            }
            return true;
          }
        }
      }
    }
    // Click outside panel closes overlay
    return false;
  }

  _promptJsonImport() {
    const input = prompt(t('editor.importPrompt'));
    if (!input) return;
    try {
      const data = JSON.parse(input);
      if (this.deserializeLevel(data)) {
        this._showToast(t('editor.importedToast'));
        this._overlayMode = null;
      } else {
        this._showToast(t('editor.importFailed'));
      }
    } catch {
      this._showToast(t('editor.importFailed'));
    }
  }

  _openOverlay(mode) {
    this._overlayMode = mode;
    this._overlaySlots = LevelEditor.getSavedLevels();
    this._overlayScroll = 0;
    this._overlayHoverIdx = -1;
    this._overlayDeleteIdx = -1;
    if (mode === 'save') {
      this._overlayInputName = this._levelName || 'Untitled';
    }
  }

  // ── Render floating config toolbar above selected entity ──
  _renderConfigToolbar(getVisibleSize) {
    this._configBtnRects = [];
    if (this._configEntityIdx < 0 || this._configEntityIdx >= this.entities.length) return;

    const ent = this.entities[this._configEntityIdx];
    const ctx = this.hudCtx;
    const { visW, visH } = getVisibleSize();
    const viewX = SIDEBAR_W;
    const viewW = this.hudCanvas.width - SIDEBAR_W;
    const H = this.hudCanvas.height;
    const sx = viewW / visW;
    const sy = H / visH;

    // Convert entity world position to screen position
    const screenX = viewX + (ent.x - this.camX) * sx;
    const screenY = (ent.y - this.camY) * sy;

    // Don't render if off-screen
    if (screenX < viewX || screenX > this.hudCanvas.width || screenY < 0 || screenY > H) return;

    // Determine which buttons to show based on entity type
    const buttons = [];
    if (this._isSwitchOrGate(ent.tileId)) {
      buttons.push({ label: `\u2699 ${t('editor.cfgGroup')}`, action: 'cycleGroup' });
    }
    if (ent.tileId === 36 || ent.tileId === 37) {
      buttons.push({ label: `\u270E ${t('editor.cfgText')}`, action: 'editText' });
    }
    // Close button always
    buttons.push({ label: '\u2715', action: 'close', small: true });

    if (buttons.length <= 1) { // only close button — nothing to configure
      this._configEntityIdx = -1;
      return;
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const btnH = 24;
    const btnPad = 6;
    const btnGap = 4;

    // Measure button widths
    ctx.font = "bold 9px 'Silkscreen', monospace";
    const btnWidths = buttons.map(b => b.small ? 24 : Math.max(60, ctx.measureText(b.label).width + 16));
    const totalW = btnWidths.reduce((a, w) => a + w, 0) + (buttons.length - 1) * btnGap;

    // Position toolbar centered above entity
    const toolbarX = Math.max(viewX + 4, Math.min(screenX - totalW / 2, this.hudCanvas.width - totalW - 4));
    const toolbarY = Math.max(TOP_BAR_H + 4, screenY - TILE_SIZE * sy - btnH - 8);

    // Background
    ctx.fillStyle = 'rgba(6, 21, 32, 0.92)';
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
    ctx.lineWidth = 1;
    const bgPad = 4;
    ctx.fillRect(toolbarX - bgPad, toolbarY - bgPad, totalW + bgPad * 2, btnH + bgPad * 2);
    ctx.strokeRect(toolbarX - bgPad, toolbarY - bgPad, totalW + bgPad * 2, btnH + bgPad * 2);

    // Render buttons
    let curX = toolbarX;
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const bw = btnWidths[i];

      ctx.fillStyle = btn.action === 'close' ? 'rgba(120, 40, 40, 0.8)' : 'rgba(40, 80, 120, 0.8)';
      ctx.fillRect(curX, toolbarY, bw, btnH);
      ctx.strokeStyle = 'rgba(100, 200, 255, 0.4)';
      ctx.strokeRect(curX, toolbarY, bw, btnH);

      ctx.fillStyle = '#fff';
      ctx.font = "bold 9px 'Silkscreen', monospace";
      ctx.textAlign = 'center';
      ctx.fillText(btn.label, curX + bw / 2, toolbarY + 16);

      this._configBtnRects.push({
        x: curX, y: toolbarY, w: bw, h: btnH, action: btn.action,
      });

      curX += bw + btnGap;
    }

    // Arrow pointing down to entity
    ctx.fillStyle = 'rgba(6, 21, 32, 0.92)';
    ctx.beginPath();
    ctx.moveTo(screenX - 6, toolbarY + btnH + bgPad);
    ctx.lineTo(screenX + 6, toolbarY + btnH + bgPad);
    ctx.lineTo(screenX, toolbarY + btnH + bgPad + 8);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // ── Draw a draggable patrol handle ──
  _drawPatrolHandle(ctx, x, y, color, sx) {
    const r = 8 / sx;
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5 / sx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // ── Rebuild switch-gate group cache ──
  _rebuildSwitchGateCache() {
    this._sgSwitchesByGroup = {};
    this._sgGatesByGroup = {};
    for (const ent of this.entities) {
      if (ent.group === undefined) continue;
      if (ent.tileId >= 30 && ent.tileId <= 32) {
        if (!this._sgSwitchesByGroup[ent.group]) this._sgSwitchesByGroup[ent.group] = [];
        this._sgSwitchesByGroup[ent.group].push(ent);
      } else if (ent.tileId === 33) {
        if (!this._sgGatesByGroup[ent.group]) this._sgGatesByGroup[ent.group] = [];
        this._sgGatesByGroup[ent.group].push(ent);
      }
    }
    this._sgCacheDirty = false;
  }

  // ── Switch-gate group connection lines ──
  _drawSwitchGateLinks(ctx, sx) {
    const GROUP_COLORS = ['#44ff44', '#4488ff', '#ff8844', '#ff44ff', '#ffff44',
                          '#44ffff', '#ff4444', '#88ff88', '#8888ff', '#ff88ff'];
    // Use cached group data
    if (this._sgCacheDirty !== false) this._rebuildSwitchGateCache();
    const switchesByGroup = this._sgSwitchesByGroup;
    const gatesByGroup = this._sgGatesByGroup;

    // Draw connection lines between switches and gates in the same group
    for (const g of Object.keys(switchesByGroup)) {
      const sw = switchesByGroup[g];
      const gt = gatesByGroup[g];
      if (!gt) continue;
      const color = GROUP_COLORS[g % GROUP_COLORS.length];
      ctx.strokeStyle = color + 'bb';
      ctx.lineWidth = 2 / sx;
      ctx.setLineDash([6 / sx, 4 / sx]);
      for (const s of sw) {
        for (const gate of gt) {
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(gate.x, gate.y);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);

      // Draw group number badge on each switch/gate
      const badge = (ent) => {
        const badgeR = 6 / sx;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(ent.x + TILE_SIZE / 2, ent.y - TILE_SIZE / 2, badgeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = `bold ${Math.max(4, 5 / sx)}px 'Silkscreen', monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(g, ent.x + TILE_SIZE / 2, ent.y - TILE_SIZE / 2 + 2 / sx);
      };
      for (const s of sw) badge(s);
      if (gt) for (const gate of gt) badge(gate);
    }

    // Also draw badges for unlinked switches/gates (no matching partner)
    for (const ent of this.entities) {
      if (!this._isSwitchOrGate(ent.tileId) || ent.group === undefined) continue;
      const g = ent.group;
      const color = GROUP_COLORS[g % GROUP_COLORS.length];
      const hasPair = (ent.tileId === 33)
        ? switchesByGroup[g] && switchesByGroup[g].length > 0
        : gatesByGroup[g] && gatesByGroup[g].length > 0;
      if (!hasPair) {
        // Draw warning badge — no linked partner
        const badgeR = 6 / sx;
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(ent.x + TILE_SIZE / 2, ent.y - TILE_SIZE / 2, badgeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(4, 5 / sx)}px 'Silkscreen', monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('?', ent.x + TILE_SIZE / 2, ent.y - TILE_SIZE / 2 + 2 / sx);
      }
    }
  }

  // ── Invalidate sidebar cache (call when selection, collapse, or scroll changes) ──
  _invalidateSidebar() {
    this._sidebarDirty = true;
  }

  // ── Left sidebar — grid layout (cached to offscreen canvas) ──
  _renderSidebar(W, H) {
    // Detect changes that require re-render
    const curMoveMode = this.moveMode;
    if (this._prevSelectedTile !== this.selectedTile || this._prevMoveMode !== curMoveMode) {
      this._prevSelectedTile = this.selectedTile;
      this._prevMoveMode = curMoveMode;
      this._sidebarDirty = true;
    }

    // Create or resize offscreen canvas
    if (!this._sidebarCanvas || this._sidebarCachedH !== H) {
      this._sidebarCanvas = document.createElement('canvas');
      this._sidebarCanvas.width = SIDEBAR_W;
      this._sidebarCanvas.height = H;
      this._sidebarCachedH = H;
      this._sidebarDirty = true;
    }

    if (this._sidebarDirty) {
      this._sidebarDirty = false;
      this._renderSidebarToCanvas(H);
    }

    // Blit cached sidebar
    const ctx = this.hudCtx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this._sidebarCanvas, 0, 0);
    ctx.restore();
  }

  _renderSidebarToCanvas(H) {
    const ctx = this._sidebarCanvas.getContext('2d');
    ctx.clearRect(0, 0, SIDEBAR_W, H);
    const sw = SIDEBAR_W;
    const contentW = sw - SIDEBAR_PAD * 2;
    // How many grid cells fit per row
    const cols = Math.floor((contentW + GRID_GAP) / (GRID_CELL_SIZE + GRID_GAP));
    const gridW = cols * GRID_CELL_SIZE + (cols - 1) * GRID_GAP;
    const gridOffsetX = SIDEBAR_PAD + (contentW - gridW) / 2;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Sidebar background
    ctx.fillStyle = 'rgba(6, 21, 32, 0.94)';
    ctx.fillRect(0, 0, sw, H);
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sw, 0);
    ctx.lineTo(sw, H);
    ctx.stroke();

    // ── Preview area at top ──
    const previewY = SIDEBAR_PAD;
    this._renderPreview(ctx, SIDEBAR_PAD, previewY, contentW, PREVIEW_H);

    // ── Category grid (scrollable) ──
    const listTop = previewY + PREVIEW_H + SIDEBAR_PAD;
    const listH = H - listTop - SIDEBAR_PAD;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, listTop, sw, listH);
    ctx.clip();

    let curY = listTop - this._sidebarScrollY;

    for (const cat of CATEGORIES) {
      const items = PALETTE_BY_CATEGORY.get(cat.key);
      if (!items || items.length === 0) continue;

      const isCollapsed = this._collapsed[cat.key];

      // Category header
      ctx.fillStyle = 'rgba(100, 180, 255, 0.15)';
      ctx.fillRect(SIDEBAR_PAD, curY, contentW, CATEGORY_HEADER_H);
      ctx.fillStyle = 'rgba(100, 200, 255, 0.9)';
      ctx.font = "bold 9px 'Silkscreen', monospace";
      ctx.textAlign = 'left';
      const arrow = isCollapsed ? '\u25B6' : '\u25BC';
      ctx.fillText(`${arrow} ${t(cat.labelKey)}`, SIDEBAR_PAD + 6, curY + 16);
      curY += CATEGORY_HEADER_H + 4;

      if (!isCollapsed) {
        for (let i = 0; i < items.length; i++) {
          const p = items[i];
          const gridCol = i % cols;
          const gridRow = Math.floor(i / cols);
          const cellX = gridOffsetX + gridCol * (GRID_CELL_SIZE + GRID_GAP);
          const cellY = curY + gridRow * (GRID_CELL_SIZE + GRID_GAP);
          const selected = p.id === this.selectedTile && !this.moveMode;

          // Cell background
          if (selected) {
            ctx.fillStyle = 'rgba(100, 200, 255, 0.25)';
            ctx.strokeStyle = 'rgba(100, 200, 255, 0.8)';
            ctx.lineWidth = 2;
          } else {
            ctx.fillStyle = 'rgba(30, 50, 70, 0.5)';
            ctx.strokeStyle = 'rgba(100, 180, 255, 0.12)';
            ctx.lineWidth = 1;
          }
          ctx.fillRect(cellX, cellY, GRID_CELL_SIZE, GRID_CELL_SIZE);
          ctx.strokeRect(cellX, cellY, GRID_CELL_SIZE, GRID_CELL_SIZE);

          // Preview image or color swatch (square, centered with padding)
          const imgPad = 4;
          const imgSize = GRID_CELL_SIZE - imgPad * 2 - 12; // leave room for label
          const imgX = cellX + (GRID_CELL_SIZE - imgSize) / 2;
          const imgY = cellY + imgPad;
          const img = p.previewKey ? this._previewImgs[p.previewKey] : null;
          if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
          } else {
            ctx.fillStyle = p.color;
            ctx.fillRect(imgX, imgY, imgSize, imgSize);
          }

          // Label below the preview
          ctx.fillStyle = selected ? '#fff' : 'rgba(200,230,255,0.6)';
          ctx.font = "7px 'Silkscreen', monospace";
          ctx.textAlign = 'center';
          ctx.fillText(t(p.labelKey), cellX + GRID_CELL_SIZE / 2, cellY + GRID_CELL_SIZE - 3);
        }
        const rowCount = Math.ceil(items.length / cols);
        curY += rowCount * (GRID_CELL_SIZE + GRID_GAP);
      }

      curY += 4;
    }

    this._sidebarContentH = curY + this._sidebarScrollY - listTop;

    ctx.restore(); // unclip

    // Scrollbar if content overflows
    if (this._sidebarContentH > listH) {
      const scrollRatio = listH / this._sidebarContentH;
      const thumbH = Math.max(20, scrollRatio * listH);
      const scrollRange = this._sidebarContentH - listH;
      const thumbY = listTop + (this._sidebarScrollY / scrollRange) * (listH - thumbH);
      ctx.fillStyle = 'rgba(100, 180, 255, 0.3)';
      ctx.fillRect(sw - 4, thumbY, 3, thumbH);
    }

    ctx.restore();
  }

  // ── Preview of selected tile ──
  _renderPreview(ctx, x, y, w, h) {
    const pal = PALETTE_BY_ID.get(this.selectedTile);
    if (!pal) return;

    // Background
    ctx.fillStyle = 'rgba(20, 35, 50, 0.8)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // Large preview image or swatch
    const imgSize = 48;
    const imgX = x + (w - imgSize) / 2;
    const imgY = y + 6;
    const img = pal.previewKey ? this._previewImgs[pal.previewKey] : null;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
    } else {
      // Fallback: large color swatch
      ctx.fillStyle = pal.color;
      ctx.fillRect(imgX, imgY, imgSize, imgSize);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(imgX, imgY, imgSize, imgSize);
    }

    // Label
    ctx.fillStyle = '#fff';
    ctx.font = "bold 9px 'Silkscreen', monospace";
    ctx.textAlign = 'center';
    ctx.fillText(t(pal.labelKey), x + w / 2, y + h - 8);
  }

  // ── Get sidebar item hit at screen position (grid layout) ──
  _hitTestSidebar(screenX, screenY) {
    if (screenX > SIDEBAR_W) return null;

    const sw = SIDEBAR_W;
    const contentW = sw - SIDEBAR_PAD * 2;
    const cols = Math.floor((contentW + GRID_GAP) / (GRID_CELL_SIZE + GRID_GAP));
    const gridW = cols * GRID_CELL_SIZE + (cols - 1) * GRID_GAP;
    const gridOffsetX = SIDEBAR_PAD + (contentW - gridW) / 2;

    // Category grid area
    const listTop = SIDEBAR_PAD + PREVIEW_H + SIDEBAR_PAD;
    if (screenY < listTop) return null;

    let curY = listTop - this._sidebarScrollY;

    for (const cat of CATEGORIES) {
      const items = PALETTE_BY_CATEGORY.get(cat.key);
      if (!items || items.length === 0) continue;

      // Category header hit
      if (screenY >= curY && screenY < curY + CATEGORY_HEADER_H) {
        return { type: 'category', key: cat.key };
      }
      curY += CATEGORY_HEADER_H + 4;

      if (!this._collapsed[cat.key]) {
        const rowCount = Math.ceil(items.length / cols);
        for (let i = 0; i < items.length; i++) {
          const gc = i % cols;
          const gr = Math.floor(i / cols);
          const cellX = gridOffsetX + gc * (GRID_CELL_SIZE + GRID_GAP);
          const cellY = curY + gr * (GRID_CELL_SIZE + GRID_GAP);
          if (screenX >= cellX && screenX < cellX + GRID_CELL_SIZE &&
              screenY >= cellY && screenY < cellY + GRID_CELL_SIZE) {
            return { type: 'tile', id: items[i].id };
          }
        }
        curY += rowCount * (GRID_CELL_SIZE + GRID_GAP);
      }

      curY += 4;
    }

    return null;
  }

  // ── Place tile or entity at current mouse position ──
  _placeTileAtMouse(getVisibleSize) {
    const { visW, visH } = getVisibleSize();
    const W = this.hudCanvas.width;
    const H = this.hudCanvas.height;
    const viewW = W - SIDEBAR_W;

    // Don't place if mouse is on sidebar
    if (this._mouseScreen.x <= SIDEBAR_W) return;
    // Don't place if mouse is on top bar
    if (this._mouseScreen.y < TOP_BAR_H) return;

    const wx = this.camX + ((this._mouseScreen.x - SIDEBAR_W) / viewW) * visW;
    const wy = this.camY + (this._mouseScreen.y / H) * visH;
    const col = Math.floor(wx / TILE_SIZE);
    const row = Math.floor(wy / TILE_SIZE);

    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;

    // Avoid repeated placement on same cell
    if (this._lastPlacedCell && this._lastPlacedCell.col === col && this._lastPlacedCell.row === row) return;
    this._lastPlacedCell = { col, row };

    // Snapshot before first mutation in this action (no-op if already tracking)
    this._beginAction();

    const cx = col * TILE_SIZE + TILE_SIZE / 2;
    const cy = row * TILE_SIZE + TILE_SIZE / 2;
    const tileId = this.selectedTile;

    if (tileId === 0) {
      // Erase: clear tile AND remove any entity at cell
      const hadTile = this.tiles[row][col] !== 0;
      this.tiles[row][col] = 0;
      const removedEntity = this._removeEntityAt(cx, cy);
      if (hadTile) this._terrainDirty = true;
      if (removedEntity) {
        this._sgCacheDirty = true;
        if (this.onEntityChange) this.onEntityChange(this.entities);
      }
    } else if (ENTITY_IDS.has(tileId)) {
      // Entity placement
      this._removeEntityAt(cx, cy);

      if (tileId === 4) {
        this.tiles[row][col] = tileId;
        this._terrainDirty = true;
      }

      const entry = { x: cx, y: cy, tileId };
      const pDef = PATROL_DEFAULTS[tileId];
      if (pDef) {
        // Snap patrol endpoints to tile centers
        const snapCenter = (v) => Math.floor(v / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
        if (pDef.type === 'point') {
          entry.patrol = {
            x1: snapCenter(cx - pDef.range), y1: cy,
            x2: snapCenter(cx + pDef.range), y2: cy,
          };
        } else if (pDef.axis === 'x') {
          entry.patrol = { axis: 'x', min: snapCenter(cx - pDef.range), max: snapCenter(cx + pDef.range) };
        } else {
          entry.patrol = { axis: 'y', min: snapCenter(cy - pDef.range), max: snapCenter(cy + pDef.range) };
        }
      }
      // Assign group for switches and gates
      if (tileId >= 30 && tileId <= 33) {
        entry.group = this._nextSwitchGateGroup();
      }
      // Assign default chain length for swinging anchors
      if (tileId === 35) {
        entry.chainLength = 96; // default 3 tiles
      }
      // Assign default text for bottles and hint stones
      if (tileId === 36 || tileId === 37) {
        entry.text = '...';
      }
      if (tileId === 7) {
        this.entities = this.entities.filter(e => e.tileId !== 7);
      }
      this.entities.push(entry);
      this._sgCacheDirty = true;
      if (this.onEntityChange) this.onEntityChange(this.entities);
    } else {
      // Terrain tile
      this.tiles[row][col] = tileId;
      this._terrainDirty = true;
      this._removeEntityAt(cx, cy);
    }
    this.dirty = true;
  }

  // ── Remove entity at world position ──
  _removeEntityAt(cx, cy) {
    let removed = false;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (Math.abs(e.x - cx) < TILE_SIZE / 2 && Math.abs(e.y - cy) < TILE_SIZE / 2) {
        this.entities.splice(i, 1);
        removed = true;
      }
    }
    return removed;
  }

  // ── Delete entity on double-click ──
  _deleteAtWorldPos(wx, wy) {
    let closestIdx = -1;
    let closestDist = TILE_SIZE;
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      const dx = e.x - wx;
      const dy = e.y - wy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < closestDist) {
        closestDist = d;
        closestIdx = i;
      }
    }
    if (closestIdx >= 0) {
      this.entities.splice(closestIdx, 1);
      this.dirty = true;
      this._sgCacheDirty = true;
      if (this.onEntityChange) this.onEntityChange(this.entities);
      return;
    }

    const col = Math.floor(wx / TILE_SIZE);
    const row = Math.floor(wy / TILE_SIZE);
    if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
      if (this.tiles[row][col] !== 0) {
        this.tiles[row][col] = 0;
        this.dirty = true;
        // Force immediate terrain rebuild for responsive delete feedback
        if (this.onTerrainChange) this.onTerrainChange();
      }
    }
  }

  // ── Find entity at world position (for move mode) ──
  _findEntityAt(wx, wy) {
    let closestIdx = -1;
    let closestDist = TILE_SIZE;
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      const dx = e.x - wx;
      const dy = e.y - wy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < closestDist) {
        closestDist = d;
        closestIdx = i;
      }
    }
    return closestIdx;
  }

  // ── Check if mouse is near a patrol handle or anchor chain handle ──
  _findPatrolHandle(wx, wy, sx) {
    const threshold = Math.max(12, 18 / sx);
    for (let i = 0; i < this.entities.length; i++) {
      const ent = this.entities[i];
      // Anchor chain length handle
      if (ent.tileId === 35 && ent.chainLength) {
        const chainEndY = ent.y + ent.chainLength;
        if (Math.abs(wx - ent.x) < threshold && Math.abs(wy - chainEndY) < threshold) {
          return { entityIdx: i, handle: 'chain' };
        }
      }
      if (!ent.patrol) continue;
      if (ent.patrol.x1 !== undefined) {
        // Point-to-point patrol
        if (Math.abs(wx - ent.patrol.x1) < threshold && Math.abs(wy - ent.patrol.y1) < threshold) {
          return { entityIdx: i, handle: 'min' };
        }
        if (Math.abs(wx - ent.patrol.x2) < threshold && Math.abs(wy - ent.patrol.y2) < threshold) {
          return { entityIdx: i, handle: 'max' };
        }
      } else if (ent.patrol.axis === 'x') {
        if (Math.abs(wx - ent.patrol.min) < threshold && Math.abs(wy - ent.y) < threshold) {
          return { entityIdx: i, handle: 'min' };
        }
        if (Math.abs(wx - ent.patrol.max) < threshold && Math.abs(wy - ent.y) < threshold) {
          return { entityIdx: i, handle: 'max' };
        }
      } else {
        if (Math.abs(wx - ent.x) < threshold && Math.abs(wy - ent.patrol.min) < threshold) {
          return { entityIdx: i, handle: 'min' };
        }
        if (Math.abs(wx - ent.x) < threshold && Math.abs(wy - ent.patrol.max) < threshold) {
          return { entityIdx: i, handle: 'max' };
        }
      }
    }
    return null;
  }

  // ── Switch/gate group helpers ──
  _isSwitchOrGate(tileId) { return tileId >= 30 && tileId <= 33; }

  _nextSwitchGateGroup() {
    // Find the highest group in use and return +1, or 0 if none
    let maxGroup = -1;
    for (const e of this.entities) {
      if (this._isSwitchOrGate(e.tileId) && e.group !== undefined) {
        maxGroup = Math.max(maxGroup, e.group);
      }
    }
    return maxGroup + 1;
  }

  _cycleSwitchGateGroup(entityIdx) {
    const ent = this.entities[entityIdx];
    if (!ent || !this._isSwitchOrGate(ent.tileId)) return;
    const maxGroup = this._nextSwitchGateGroup();
    ent.group = ((ent.group || 0) + 1) % Math.max(maxGroup + 1, 1);
    this.dirty = true;
    this._sgCacheDirty = true;
    if (this.onEntityChange) this.onEntityChange(this.entities);
  }

  // ── Export level as string array ──
  exportLevelStrings() {
    const lines = [];
    for (let r = 0; r < this.rows; r++) {
      let line = '';
      for (let c = 0; c < this.cols; c++) {
        const t = this.tiles[r][c];
        line += ID_TO_CHAR[t] || '.';
      }
      lines.push(line);
    }

    for (const ent of this.entities) {
      const col = Math.round((ent.x - TILE_SIZE / 2) / TILE_SIZE);
      const row = Math.round((ent.y - TILE_SIZE / 2) / TILE_SIZE);
      if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
        const ch = ID_TO_CHAR[ent.tileId] || '.';
        const arr = lines[row].split('');
        arr[col] = ch;
        lines[row] = arr.join('');
      }
    }

    return lines;
  }

  // ── Export patrol data ──
  exportPatrolData() {
    const patrols = [];
    for (const ent of this.entities) {
      if (!ent.patrol) continue;
      patrols.push({
        tileId: ent.tileId,
        x: ent.x,
        y: ent.y,
        patrol: { ...ent.patrol },
      });
    }
    return patrols;
  }

  // ── Copy full export to clipboard ──
  copyToClipboard() {
    const lines = this.exportLevelStrings();
    const patrols = this.exportPatrolData();

    let output = '// ── Level Strings ──\n';
    output += 'const LEVEL_STRINGS = [\n';
    for (let i = 0; i < lines.length; i++) {
      output += `  '${lines[i]}',  // ${i}\n`;
    }
    output += '];\n\n';

    if (patrols.length > 0) {
      output += '// ── Custom Patrol Ranges ──\n';
      output += '// Apply after entity creation:\n';
      for (const p of patrols) {
        const pal = PALETTE_BY_ID.get(p.tileId);
        const name = pal ? t(pal.labelKey) : 'unknown';
        if (p.patrol.x1 !== undefined) {
          output += `// ${name} at (${Math.round(p.x)}, ${Math.round(p.y)}): patrol (${Math.round(p.patrol.x1)},${Math.round(p.patrol.y1)}) → (${Math.round(p.patrol.x2)},${Math.round(p.patrol.y2)})\n`;
        } else if (p.patrol.axis === 'x') {
          const range = Math.round((p.patrol.max - p.patrol.min) / 2);
          output += `// ${name} at (${Math.round(p.x)}, ${Math.round(p.y)}): patrol range ±${range}px\n`;
        } else {
          const range = Math.round((p.patrol.max - p.patrol.min) / 2);
          output += `// ${name} at (${Math.round(p.x)}, ${Math.round(p.y)}): patrol range ±${range}px (vertical)\n`;
        }
      }
    }

    // Bottle message texts
    const bottleEnts = this.entities.filter(e => e.tileId === 36 && e.text && e.text !== '...');
    if (bottleEnts.length > 0) {
      output += '\n// ── Bottle Messages ──\n';
      output += 'bottleMessages: [\n';
      for (const b of bottleEnts) {
        const col = Math.round((b.x - TILE_SIZE / 2) / TILE_SIZE);
        const row = Math.round((b.y - TILE_SIZE / 2) / TILE_SIZE);
        output += `  { row: ${row}, col: ${col}, text: ${JSON.stringify(b.text)} },\n`;
      }
      output += '],\n';
    }

    // Hint stone texts
    const hintEnts = this.entities.filter(e => e.tileId === 37 && e.text && e.text !== '...');
    if (hintEnts.length > 0) {
      output += '\n// ── Hint Stones ──\n';
      output += 'hintStones: [\n';
      for (const h of hintEnts) {
        const col = Math.round((h.x - TILE_SIZE / 2) / TILE_SIZE);
        const row = Math.round((h.y - TILE_SIZE / 2) / TILE_SIZE);
        output += `  { row: ${row}, col: ${col}, text: ${JSON.stringify(h.text)} },\n`;
      }
      output += '],\n';
    }

    // Anchor chain length data
    const anchors = this.entities.filter(e => e.tileId === 35 && e.chainLength);
    if (anchors.length > 0) {
      output += '\n// ── Anchor Chain Lengths ──\n';
      output += 'anchorChainLengths: [\n';
      for (const a of anchors) {
        const col = Math.round((a.x - TILE_SIZE / 2) / TILE_SIZE);
        const row = Math.round((a.y - TILE_SIZE / 2) / TILE_SIZE);
        output += `  { row: ${row}, col: ${col}, chainLength: ${a.chainLength} },\n`;
      }
      output += ']\n';
    }

    // Switch-gate group data
    const groups = this._exportSwitchGateGroups();
    if (groups.length > 0) {
      output += '\n// ── Switch-Gate Groups ──\n';
      output += 'switchGateGroups: [\n';
      for (const g of groups) {
        const swParts = g.switches.map(s => `{ row: ${s.row}, col: ${s.col} }`).join(', ');
        const gtParts = g.gates.map(gt => `{ row: ${gt.row}, col: ${gt.col} }`).join(', ');
        output += `  { id: ${g.id}, switches: [${swParts}], gates: [${gtParts}] },\n`;
      }
      output += ']\n';
    }

    navigator.clipboard.writeText(output).then(() => {
      this._showToast(t('editor.copiedToast'));
    }).catch(() => {
      this._showToast(t('editor.copyFailed'));
    });
  }

  // ── Copy JSON format to clipboard ──
  copyJsonToClipboard() {
    const data = this.serializeLevel();
    const json = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      this._showToast(t('editor.jsonCopiedToast'));
    }).catch(() => {
      this._showToast(t('editor.copyFailed'));
    });
  }

  _exportSwitchGateGroups() {
    const groups = {};
    for (const ent of this.entities) {
      if (!this._isSwitchOrGate(ent.tileId) || ent.group === undefined) continue;
      if (!groups[ent.group]) groups[ent.group] = { id: ent.group, switches: [], gates: [] };
      const col = Math.round((ent.x - TILE_SIZE / 2) / TILE_SIZE);
      const row = Math.round((ent.y - TILE_SIZE / 2) / TILE_SIZE);
      if (ent.tileId === 33) {
        groups[ent.group].gates.push({ row, col });
      } else {
        groups[ent.group].switches.push({ row, col });
      }
    }
    return Object.values(groups);
  }

  // ── JSON Serialize / Deserialize ──

  /**
   * Serialize the current editor state to a JSON-compatible object.
   * This is the canonical level format — also used for Firebase (#21).
   * @param {string} [name] - Level name (defaults to 'Untitled')
   * @returns {object} JSON-serializable level data
   */
  serializeLevel(name) {
    const strings = this.exportLevelStrings();
    const entities = [];

    for (const ent of this.entities) {
      const col = Math.round((ent.x - TILE_SIZE / 2) / TILE_SIZE);
      const row = Math.round((ent.y - TILE_SIZE / 2) / TILE_SIZE);
      const e = { tileId: ent.tileId, row, col };

      // Patrol data (enemies)
      if (ent.patrol) {
        if (ent.patrol.x1 !== undefined) {
          // Point-to-point patrol (piranha, armored fish)
          e.patrol = {
            x1: Math.round(ent.patrol.x1), y1: Math.round(ent.patrol.y1),
            x2: Math.round(ent.patrol.x2), y2: Math.round(ent.patrol.y2),
          };
        } else if (ent.patrol.axis) {
          // Axis-aligned patrol (shark, puffer, crab, toxic)
          e.patrol = {
            axis: ent.patrol.axis,
            min: Math.round(ent.patrol.min),
            max: Math.round(ent.patrol.max),
          };
        }
      }

      // Switch/gate group
      if (ent.group !== undefined) e.group = ent.group;

      // Bottle/hint stone text
      if (ent.text !== undefined && ent.text !== '...') e.text = ent.text;

      // Anchor chain length
      if (ent.chainLength !== undefined) e.chainLength = ent.chainLength;

      entities.push(e);
    }

    return {
      version: 1,
      name: name || this._levelName || 'Untitled',
      cols: this.cols,
      rows: this.rows,
      waterRow: this._waterRow ?? 4,
      bossLevel: this._bossLevel || undefined,
      levelGoal: this._levelGoal || undefined,
      noCaveBg: this._noCaveBg || undefined,
      strings,
      entities,
    };
  }

  /**
   * Deserialize a JSON level object into the editor.
   * Replaces current tiles and entities entirely.
   * @param {object} data - Level data from serializeLevel() or localStorage
   */
  deserializeLevel(data) {
    if (!data || !data.strings || !data.entities) return false;

    // Keep editor grid size fixed — loaded data is clipped/padded to fit
    const targetCols = this.cols;
    const targetRows = this.rows;
    this._waterRow = data.waterRow ?? 4;
    this._bossLevel = !!data.bossLevel;
    this._levelGoal = data.levelGoal || undefined;
    this._noCaveBg = !!data.noCaveBg;
    this._levelName = data.name || 'Untitled';

    // Parse tile strings into 2D array (clip/pad to current grid size)
    const charToId = {};
    for (const p of PALETTE) charToId[p.char] = p.id;

    for (let r = 0; r < targetRows; r++) {
      const str = (data.strings && data.strings[r]) || '';
      for (let c = 0; c < targetCols; c++) {
        const ch = str[c] || '.';
        const id = charToId[ch] ?? 0;
        this.tiles[r][c] = ENTITY_IDS.has(id) ? 0 : id;
      }
    }

    // Rebuild entities from JSON (skip entities outside grid bounds)
    this.entities = [];
    for (const e of data.entities) {
      if (e.col < 0 || e.col >= targetCols || e.row < 0 || e.row >= targetRows) continue;
      const cx = e.col * TILE_SIZE + TILE_SIZE / 2;
      const cy = e.row * TILE_SIZE + TILE_SIZE / 2;
      const ent = { x: cx, y: cy, tileId: e.tileId };

      if (e.patrol) ent.patrol = { ...e.patrol };
      if (e.group !== undefined) ent.group = e.group;
      if (e.text !== undefined) ent.text = e.text;
      if (e.chainLength !== undefined) ent.chainLength = e.chainLength;

      // Restore default patrol for enemies that should have one but data lacks it
      if (!ent.patrol && PATROL_DEFAULTS[e.tileId]) {
        const pDef = PATROL_DEFAULTS[e.tileId];
        const snap = (v) => Math.floor(v / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
        if (pDef.type === 'point') {
          ent.patrol = {
            x1: snap(cx - pDef.range), y1: cy,
            x2: snap(cx + pDef.range), y2: cy,
          };
        } else if (pDef.axis === 'x') {
          ent.patrol = { axis: 'x', min: snap(cx - pDef.range), max: snap(cx + pDef.range) };
        } else {
          ent.patrol = { axis: 'y', min: snap(cy - pDef.range), max: snap(cy + pDef.range) };
        }
      }

      // Default text for bottles/hints
      if ((e.tileId === 36 || e.tileId === 37) && !ent.text) ent.text = '...';
      // Default chain length for anchors
      if (e.tileId === 35 && ent.chainLength === undefined) ent.chainLength = 96;

      this.entities.push(ent);
    }

    // Trigger full rebuild
    this._terrainDirty = true;
    this._sgCacheDirty = true;
    this.dirty = true;
    this._undoStack = [];
    this._redoStack = [];
    this.onTerrainChange?.();
    this.onEntityChange?.(this.entities);

    // Center camera on spawn point (tileId 7) if present
    const spawn = this.entities.find(e => e.tileId === 7);
    if (spawn) {
      this.camX = spawn.x - this.worldW * 0.3;
      this.camY = spawn.y - this.worldH * 0.4;
      this.camX = Math.max(0, this.camX);
      this.camY = Math.max(0, this.camY);
    }

    return true;
  }

  /**
   * Store metadata from the active level so serialize can include it.
   * Called by game.js when activating the editor.
   */
  setLevelMeta(meta) {
    this._waterRow = meta.waterRow ?? 4;
    this._bossLevel = !!meta.bossLevel;
    this._levelGoal = meta.levelGoal || undefined;
    this._noCaveBg = !!meta.noCaveBg;
    this._levelName = meta.name || 'Untitled';
  }

  // ── localStorage Save / Load ──

  static _STORAGE_KEY = 'loaf_editor_levels';
  static _MAX_SLOTS = 20;

  /** Get all saved level slots. Returns array of { id, name, savedAt }. */
  static getSavedLevels() {
    try {
      const raw = localStorage.getItem(LevelEditor._STORAGE_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }

  /** Save current editor state to a slot. */
  saveToSlot(slotId) {
    const data = this.serializeLevel();
    const list = LevelEditor.getSavedLevels();
    const now = new Date().toISOString();

    const existing = list.findIndex(s => s.id === slotId);
    const entry = { id: slotId, name: data.name, savedAt: now, data };

    if (existing >= 0) {
      list[existing] = entry;
    } else {
      if (list.length >= LevelEditor._MAX_SLOTS) {
        // Remove oldest
        list.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
        list.shift();
      }
      list.push(entry);
    }

    try {
      localStorage.setItem(LevelEditor._STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch { return false; }
  }

  /** Load a level from a slot. */
  loadFromSlot(slotId) {
    const list = LevelEditor.getSavedLevels();
    const slot = list.find(s => s.id === slotId);
    if (!slot || !slot.data) return false;
    return this.deserializeLevel(slot.data);
  }

  /** Delete a saved level slot. */
  static deleteSlot(slotId) {
    const list = LevelEditor.getSavedLevels();
    const filtered = list.filter(s => s.id !== slotId);
    try {
      localStorage.setItem(LevelEditor._STORAGE_KEY, JSON.stringify(filtered));
      return true;
    } catch { return false; }
  }

  // ── Undo / Redo ──

  _takeSnapshot() {
    return {
      tiles: this.tiles.map(row => [...row]),
      entities: JSON.parse(JSON.stringify(this.entities)),
    };
  }

  _applySnapshot(snap) {
    for (let r = 0; r < snap.tiles.length; r++) {
      for (let c = 0; c < snap.tiles[r].length; c++) {
        this.tiles[r][c] = snap.tiles[r][c];
      }
    }
    this.entities = snap.entities;
    this._terrainDirty = true;
    this._sgCacheDirty = true;
    this.dirty = true;
    this.onTerrainChange?.();
    this.onEntityChange?.(this.entities);
  }

  /** Begin tracking a continuous action (paint stroke, entity drag, patrol drag). */
  _beginAction() {
    if (this._activeAction) return; // already tracking
    this._activeAction = this._takeSnapshot();
  }

  /** Commit the current action to the undo stack. No-op if nothing changed. */
  _commitAction() {
    if (!this._activeAction) return;
    const before = this._activeAction;
    this._activeAction = null;
    // Only push if something actually changed
    if (this._snapshotsEqual(before, this._takeSnapshot())) return;
    this._undoStack.push(before);
    this._redoStack = [];
    if (this._undoStack.length > this._MAX_UNDO) this._undoStack.shift();
  }

  /** Push a single discrete action (not a continuous drag). */
  _pushUndoSnapshot() {
    const snap = this._takeSnapshot();
    this._undoStack.push(snap);
    this._redoStack = [];
    if (this._undoStack.length > this._MAX_UNDO) this._undoStack.shift();
  }

  _snapshotsEqual(a, b) {
    if (a.entities.length !== b.entities.length) return false;
    for (let r = 0; r < a.tiles.length; r++) {
      for (let c = 0; c < a.tiles[r].length; c++) {
        if (a.tiles[r][c] !== b.tiles[r][c]) return false;
      }
    }
    // Quick entity check — stringified comparison (entities are small)
    return JSON.stringify(a.entities) === JSON.stringify(b.entities);
  }

  undo() {
    this._commitAction(); // flush any in-progress action
    if (!this._undoStack.length) return;
    const current = this._takeSnapshot();
    const prev = this._undoStack.pop();
    this._redoStack.push(current);
    this._applySnapshot(prev);
    this._showToast('Undo');
  }

  redo() {
    if (!this._redoStack.length) return;
    const current = this._takeSnapshot();
    const next = this._redoStack.pop();
    this._undoStack.push(current);
    this._applySnapshot(next);
    this._showToast('Redo');
  }

  // ── Toast notification ──
  _toastMsg = '';
  _toastTimer = 0;

  _showToast(msg) {
    this._toastMsg = msg;
    this._toastTimer = 2000;
  }

  renderToast(dt) {
    if (this._toastTimer <= 0) return;
    this._toastTimer -= dt * 1000;
    const ctx = this.hudCtx;
    const W = this.hudCanvas.width;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const alpha = Math.min(1, this._toastTimer / 500);
    ctx.fillStyle = `rgba(6, 21, 32, ${0.9 * alpha})`;
    ctx.strokeStyle = `rgba(100, 200, 255, ${0.5 * alpha})`;
    ctx.lineWidth = 1;
    const tw = ctx.measureText(this._toastMsg).width + 40;
    const tx = SIDEBAR_W + ((W - SIDEBAR_W) - tw) / 2;
    ctx.fillRect(tx, 50, tw, 30);
    ctx.strokeRect(tx, 50, tw, 30);
    ctx.fillStyle = `rgba(200, 230, 255, ${alpha})`;
    ctx.font = "11px 'Silkscreen', monospace";
    ctx.textAlign = 'center';
    ctx.fillText(this._toastMsg, SIDEBAR_W + (W - SIDEBAR_W) / 2, 70);
    ctx.restore();
  }

  // ── Input Handlers ──

  _handleKeyDown(e) {
    if (!this.active) return;
    // Don't register movement keys when Ctrl/Meta is held (shortcuts like Ctrl+S, Ctrl+C)
    if (!e.ctrlKey && !e.metaKey) {
      this._keys[e.code] = true;
    }

    // Escape closes overlay
    if (e.code === 'Escape' && this._overlayMode) {
      this._overlayMode = null;
      e.preventDefault();
      return;
    }

    // Block other keys while overlay is open
    if (this._overlayMode) return;

    // Number keys 0-9 to select palette
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.replace('Digit', ''));
      if (n >= 0 && n < PALETTE.length) {
        this.selectedTile = PALETTE[n].id;
        this._invalidateSidebar();
        e.preventDefault();
      }
    }

    // G = toggle grid
    if (e.code === 'KeyG' && !e.ctrlKey && !e.metaKey) {
      this.showGrid = !this.showGrid;
      e.preventDefault();
    }

    // M = toggle move mode
    if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey) {
      this.selectedTile = this.moveMode ? 1 : MOVE_TILE_ID;
      this._movingEntity = null;
      this._invalidateSidebar();
      e.preventDefault();
    }

    // Ctrl+C = copy level as JSON
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
      this.copyJsonToClipboard();
      e.preventDefault();
    }

    // Ctrl+S = quick save to localStorage
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
      e.preventDefault();
      const slots = LevelEditor.getSavedLevels();
      // Overwrite most recent slot with same name, or create new
      const existing = slots.find(s => s.name === this._levelName);
      const slotId = existing ? existing.id : ('slot_' + Date.now());
      if (this.saveToSlot(slotId)) {
        this._showToast(t('editor.savedToast', { name: this._levelName }));
      } else {
        this._showToast(t('editor.saveFailed'));
      }
    }

    // Ctrl+Z = undo, Ctrl+Shift+Z / Ctrl+Y = redo
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
      this.undo();
      e.preventDefault();
    }
    if ((e.ctrlKey || e.metaKey) && ((e.code === 'KeyZ' && e.shiftKey) || e.code === 'KeyY')) {
      this.redo();
      e.preventDefault();
    }

    // Prevent game keys from acting
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
         'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  _handleKeyUp(e) {
    this._keys[e.code] = false;
  }

  _handleMouseMove(e) {
    this._mouseScreen.x = e.clientX;
    this._mouseScreen.y = e.clientY;
  }

  _handleMouseDown(e) {
    if (!this.active) return;
    this._mouseScreen.x = e.clientX;
    this._mouseScreen.y = e.clientY;

    if (e.button === 0) {
      // Check sidebar click
      if (e.clientX <= SIDEBAR_W) {
        const hit = this._hitTestSidebar(e.clientX, e.clientY);
        if (hit) {
          if (hit.type === 'category') {
            this._collapsed[hit.key] = !this._collapsed[hit.key];
            this._invalidateSidebar();
          } else if (hit.type === 'tile') {
            this.selectedTile = hit.id;
            this._movingEntity = null;
            this._invalidateSidebar();
          }
        }
        return;
      }

      // Check overlay clicks first (absorbs all clicks when overlay is open)
      if (this._overlayMode) {
        if (this._handleOverlayClick(e.clientX, e.clientY)) return;
        // Click outside panel closes overlay
        this._overlayMode = null;
        return;
      }

      // Check top bar button clicks
      if (e.clientY < TOP_BAR_H) {
        const hitBtn = (rect) => rect && e.clientX >= rect.x && e.clientX <= rect.x + rect.w && e.clientY >= rect.y && e.clientY <= rect.y + rect.h;
        if (hitBtn(this._saveBtnRect)) {
          this._openOverlay('save');
          return;
        }
        if (hitBtn(this._loadBtnRect)) {
          this._openOverlay('load');
          return;
        }
        if (hitBtn(this._copyBtnRect)) {
          this.copyJsonToClipboard();
          return;
        }
        if (hitBtn(this._playBtnRect)) {
          if (this.onPlayTest) this.onPlayTest();
          return;
        }
      }

      // Check config toolbar button click
      if (this._configEntityIdx >= 0 && this._configBtnRects.length > 0) {
        for (const btn of this._configBtnRects) {
          if (e.clientX >= btn.x && e.clientX <= btn.x + btn.w &&
              e.clientY >= btn.y && e.clientY <= btn.y + btn.h) {
            this._handleConfigAction(btn.action);
            return;
          }
        }
        // Clicked outside toolbar — close it
        this._configEntityIdx = -1;
      }

      // Shift-click on switch/gate to cycle group (desktop shortcut still works)
      if (e.shiftKey && e.clientX > SIDEBAR_W) {
        this._pendingGroupCycle = { screenX: e.clientX, screenY: e.clientY };
      }

      // Single click on configurable entity — open config toolbar
      if (!e.shiftKey && e.clientX > SIDEBAR_W && !this.moveMode) {
        this._pendingConfigCheck = { screenX: e.clientX, screenY: e.clientY };
      }

      // Check double-click
      const now = performance.now();
      if (this._dblClickPos &&
          Math.abs(e.clientX - this._dblClickPos.x) < 10 &&
          Math.abs(e.clientY - this._dblClickPos.y) < 10 &&
          now - this._dblClickTimer < 400) {
        this._dblClickTimer = 0;
        this._dblClickPos = null;
        this._pendingDblClick = { screenX: e.clientX, screenY: e.clientY };
        return;
      }
      this._dblClickTimer = now;
      this._dblClickPos = { x: e.clientX, y: e.clientY };

      // Move mode: pick up entity
      if (this.moveMode && e.clientX > SIDEBAR_W) {
        this._pendingMovePickup = { screenX: e.clientX, screenY: e.clientY };
      }

      this._mouseDown = true;
      this._lastPlacedCell = null;
    } else if (e.button === 2) {
      // Right-click: start camera drag
      this._rightMouseDown = true;
      if (e.clientX > SIDEBAR_W) {
        this._rightDragStart = {
          screenX: e.clientX,
          screenY: e.clientY,
          camX: this.camX,
          camY: this.camY,
        };
      }
    }
  }

  _handleMouseUp(e) {
    if (e.button === 0) {
      // Quick click: if no tile was placed yet during this mouseDown, ensure one is placed
      if (this._mouseDown && !this._lastPlacedCell && !this._draggingPatrol && !this.moveMode) {
        this._pendingSinglePlace = true;
      }
      this._mouseDown = false;
      this._draggingPatrol = null;
      this._movingEntity = null;
      // Commit continuous action to undo stack (skip if single-place is pending —
      // that placement hasn't happened yet, commit will occur in processPendingActions)
      if (!this._pendingSinglePlace) {
        this._commitAction();
      }
    } else if (e.button === 2) {
      this._rightMouseDown = false;
      this._rightDragStart = null;
    }
  }

  _handleWheel(e) {
    if (!this.active) return;
    e.preventDefault();

    // Sidebar scroll only — no palette cycling on world area
    if (this._mouseScreen.x <= SIDEBAR_W) {
      const listTop = SIDEBAR_PAD + PREVIEW_H + SIDEBAR_PAD;
      const listH = this.hudCanvas.height - listTop - SIDEBAR_PAD;
      const maxScroll = Math.max(0, this._sidebarContentH - listH);
      this._sidebarScrollY = Math.max(0, Math.min(maxScroll, this._sidebarScrollY + e.deltaY));
      this._invalidateSidebar();
    }
  }

  // ── Touch handlers (for mobile sidebar + world interaction) ──

  _handleTouchStart(e) {
    if (!this.active) return;
    const touches = e.touches;

    // Two-finger pan (camera drag on mobile)
    if (touches.length === 2) {
      e.preventDefault();
      const midX = (touches[0].clientX + touches[1].clientX) / 2;
      const midY = (touches[0].clientY + touches[1].clientY) / 2;
      this._twoFingerPan = {
        startCamX: this.camX,
        startCamY: this.camY,
        startMidX: midX,
        startMidY: midY,
      };
      // Cancel any single-finger action
      this._mouseDown = false;
      this._sidebarTouchId = null;
      return;
    }

    const t = e.changedTouches[0];
    if (!t) return;

    // Sidebar touch
    if (t.clientX <= SIDEBAR_W) {
      e.preventDefault();
      this._sidebarTouchId = t.identifier;
      this._sidebarTouchStartY = t.clientY;
      this._sidebarScrollStart = this._sidebarScrollY;
      this._sidebarTouchMoved = false;
      return;
    }

    // World touch — simulate mouse
    this._mouseScreen.x = t.clientX;
    this._mouseScreen.y = t.clientY;

    // Check config toolbar button tap
    if (this._configEntityIdx >= 0 && this._configBtnRects.length > 0) {
      for (const btn of this._configBtnRects) {
        if (t.clientX >= btn.x && t.clientX <= btn.x + btn.w &&
            t.clientY >= btn.y && t.clientY <= btn.y + btn.h) {
          e.preventDefault();
          this._handleConfigAction(btn.action);
          return;
        }
      }
      // Tapped outside toolbar — close it
      this._configEntityIdx = -1;
    }

    // Config check on tap (for configurable entities)
    if (!this.moveMode && t.clientX > SIDEBAR_W) {
      this._pendingConfigCheck = { screenX: t.clientX, screenY: t.clientY };
    }

    // Move mode pickup
    if (this.moveMode) {
      e.preventDefault();
      this._pendingMovePickup = { screenX: t.clientX, screenY: t.clientY };
      this._mouseDown = true;
      return;
    }

    // Double-tap detection
    const now = performance.now();
    if (this._dblClickPos &&
        Math.abs(t.clientX - this._dblClickPos.x) < 20 &&
        Math.abs(t.clientY - this._dblClickPos.y) < 20 &&
        now - this._dblClickTimer < 400) {
      e.preventDefault();
      this._dblClickTimer = 0;
      this._dblClickPos = null;
      this._pendingDblClick = { screenX: t.clientX, screenY: t.clientY };
      return;
    }
    this._dblClickTimer = now;
    this._dblClickPos = { x: t.clientX, y: t.clientY };

    e.preventDefault();
    this._mouseDown = true;
    this._lastPlacedCell = null;
  }

  _handleTouchMove(e) {
    if (!this.active) return;
    const touches = e.touches;

    // Two-finger pan
    if (this._twoFingerPan && touches.length >= 2) {
      e.preventDefault();
      const midX = (touches[0].clientX + touches[1].clientX) / 2;
      const midY = (touches[0].clientY + touches[1].clientY) / 2;
      const dx = midX - this._twoFingerPan.startMidX;
      const dy = midY - this._twoFingerPan.startMidY;
      // We need visW/visH but don't have getVisibleSize here, so use a stored ref
      // Approximate: assume the last known scale
      const viewW = this.hudCanvas.width - SIDEBAR_W;
      const approxScale = this.worldW / viewW; // rough estimate
      this.camX = this._twoFingerPan.startCamX - dx * approxScale;
      this.camY = this._twoFingerPan.startCamY - dy * approxScale;
      return;
    }

    // Sidebar scrolling
    for (const t of e.changedTouches) {
      if (t.identifier === this._sidebarTouchId) {
        e.preventDefault();
        const dy = this._sidebarTouchStartY - t.clientY;
        if (Math.abs(dy) > 5) this._sidebarTouchMoved = true;
        const listTop = SIDEBAR_PAD + PREVIEW_H + SIDEBAR_PAD;
        const listH = this.hudCanvas.height - listTop - SIDEBAR_PAD;
        const maxScroll = Math.max(0, this._sidebarContentH - listH);
        this._sidebarScrollY = Math.max(0, Math.min(maxScroll, this._sidebarScrollStart + dy));
        this._invalidateSidebar();
        return;
      }
    }

    // World touch
    const t = e.changedTouches[0];
    if (t && t.clientX > SIDEBAR_W) {
      this._mouseScreen.x = t.clientX;
      this._mouseScreen.y = t.clientY;
    }
  }

  _handleTouchEnd(e) {
    if (!this.active) return;

    // End two-finger pan when fingers lift
    if (this._twoFingerPan && e.touches.length < 2) {
      this._twoFingerPan = null;
    }

    for (const t of e.changedTouches) {
      // Sidebar touch end — treat as tap if didn't scroll
      if (t.identifier === this._sidebarTouchId) {
        if (!this._sidebarTouchMoved) {
          const hit = this._hitTestSidebar(t.clientX, t.clientY);
          if (hit) {
            if (hit.type === 'category') {
              this._collapsed[hit.key] = !this._collapsed[hit.key];
              this._invalidateSidebar();
            } else if (hit.type === 'tile') {
              this.selectedTile = hit.id;
              this._movingEntity = null;
              this._invalidateSidebar();
            }
          }
        }
        this._sidebarTouchId = null;
        return;
      }
    }

    // World touch end
    this._mouseDown = false;
    this._draggingPatrol = null;
    this._movingEntity = null;
    // Commit continuous touch action to undo stack
    this._commitAction();
  }

  // ── Process pending actions (needs getVisibleSize from game loop) ──
  processPendingActions(getVisibleSize) {
    // Double-click delete
    if (this._pendingDblClick) {
      const { visW, visH } = getVisibleSize();
      const viewW = this.hudCanvas.width - SIDEBAR_W;
      const wx = this.camX + ((this._pendingDblClick.screenX - SIDEBAR_W) / viewW) * visW;
      const wy = this.camY + (this._pendingDblClick.screenY / this.hudCanvas.height) * visH;
      this._pushUndoSnapshot();
      this._deleteAtWorldPos(wx, wy);
      this._pendingDblClick = null;
    }

    // Move mode: pick up entity
    if (this._pendingMovePickup) {
      const { visW, visH } = getVisibleSize();
      const viewW = this.hudCanvas.width - SIDEBAR_W;
      const wx = this.camX + ((this._pendingMovePickup.screenX - SIDEBAR_W) / viewW) * visW;
      const wy = this.camY + (this._pendingMovePickup.screenY / this.hudCanvas.height) * visH;
      const idx = this._findEntityAt(wx, wy);
      if (idx >= 0) {
        this._movingEntity = { entityIdx: idx };
      }
      this._pendingMovePickup = null;
    }

    // Shift-click: cycle switch/gate group OR edit bottle/hint text
    if (this._pendingGroupCycle) {
      const { visW, visH } = getVisibleSize();
      const viewW = this.hudCanvas.width - SIDEBAR_W;
      const wx = this.camX + ((this._pendingGroupCycle.screenX - SIDEBAR_W) / viewW) * visW;
      const wy = this.camY + (this._pendingGroupCycle.screenY / this.hudCanvas.height) * visH;
      const idx = this._findEntityAt(wx, wy);
      if (idx >= 0 && this._isSwitchOrGate(this.entities[idx].tileId)) {
        this._pushUndoSnapshot();
        this._cycleSwitchGateGroup(idx);
        this._showToast(t('editor.groupToast', { group: this.entities[idx].group }));
      } else if (idx >= 0 && (this.entities[idx].tileId === 36 || this.entities[idx].tileId === 37)) {
        // Edit bottle/hint text via prompt
        const ent = this.entities[idx];
        const typeName = ent.tileId === 36 ? 'Bottle' : 'Hint Stone';
        const newText = prompt(`${typeName} text:`, ent.text || '...');
        if (newText !== null) {
          this._pushUndoSnapshot();
          ent.text = newText;
          this.dirty = true;
          this._showToast(`${typeName}: "${newText.substring(0, 30)}${newText.length > 30 ? '...' : ''}"`);
        }
      }
      this._pendingGroupCycle = null;
    }

    // Config toolbar: check if click landed on a configurable entity
    if (this._pendingConfigCheck) {
      const { visW, visH } = getVisibleSize();
      const viewW = this.hudCanvas.width - SIDEBAR_W;
      const wx = this.camX + ((this._pendingConfigCheck.screenX - SIDEBAR_W) / viewW) * visW;
      const wy = this.camY + (this._pendingConfigCheck.screenY / this.hudCanvas.height) * visH;
      const idx = this._findEntityAt(wx, wy);
      if (idx >= 0) {
        const ent = this.entities[idx];
        const isConfigurable = this._isSwitchOrGate(ent.tileId) || ent.tileId === 36 || ent.tileId === 37;
        if (isConfigurable) {
          this._configEntityIdx = idx;
          this._pendingConfigCheck = null;
          return; // don't place tile when opening toolbar
        }
      }
      this._pendingConfigCheck = null;
    }

    // Single click placement (mouse released before paint delay expired)
    if (this._pendingSinglePlace) {
      this._lastPlacedCell = null; // reset so placement isn't skipped
      this._placeTileAtMouse(getVisibleSize);
      this._pendingSinglePlace = false;
      // Now commit the action (snapshot was taken inside _placeTileAtMouse via _beginAction)
      this._commitAction();
    }
  }

  // ── Handle config toolbar button action ──
  _handleConfigAction(action) {
    if (action === 'close') {
      this._configEntityIdx = -1;
      return;
    }

    const ent = this.entities[this._configEntityIdx];
    if (!ent) { this._configEntityIdx = -1; return; }

    if (action === 'cycleGroup') {
      this._pushUndoSnapshot();
      this._cycleSwitchGateGroup(this._configEntityIdx);
      this._showToast(t('editor.groupToast', { group: ent.group }));
    } else if (action === 'editText') {
      const typeName = ent.tileId === 36 ? 'Bottle' : 'Hint Stone';
      const newText = prompt(`${typeName} text:`, ent.text || '...');
      if (newText !== null) {
        this._pushUndoSnapshot();
        ent.text = newText;
        this.dirty = true;
        this._showToast(`${typeName}: "${newText.substring(0, 30)}${newText.length > 30 ? '...' : ''}"`);
      }
    }
  }

  // ── 3D ghost model at cursor ──

  // Update ghost position and model each frame. Call from update().
  updateGhost(getVisibleSize) {
    if (!this._three || !this._scene || !this._voxelRenderer) return;
    if (this.moveMode) { this._hideGhost(); return; }

    // Determine cursor grid cell
    const { visW, visH } = getVisibleSize();
    const viewW = this.hudCanvas.width - SIDEBAR_W;
    const mx = this.camX + ((this._mouseScreen.x - SIDEBAR_W) / viewW) * visW;
    const my = this.camY + (this._mouseScreen.y / this.hudCanvas.height) * visH;
    const col = Math.floor(mx / TILE_SIZE);
    const row = Math.floor(my / TILE_SIZE);

    // Hide if cursor is outside world or on sidebar/top bar
    if (this._mouseScreen.x <= SIDEBAR_W || this._mouseScreen.y <= TOP_BAR_H ||
        col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      this._hideGhost();
      return;
    }

    // Rebuild ghost model if tile type changed
    if (this._ghostTileId !== this.selectedTile) {
      this._buildGhost();
    }

    if (!this._ghostGroup) return;

    // Position ghost at grid cell (Three.js Y is flipped)
    // Ground entities snap to tile bottom instead of center
    const wx = col * TILE_SIZE + TILE_SIZE / 2;
    const wy = row * TILE_SIZE + (GROUND_ENTITY_IDS.has(this.selectedTile) ? TILE_SIZE : TILE_SIZE / 2);
    this._ghostGroup.position.set(wx, -wy, 0);
    this._ghostGroup.visible = true;
    this._ghostCol = col;
    this._ghostRow = row;
  }

  _hideGhost() {
    if (this._ghostGroup) this._ghostGroup.visible = false;
  }

  _removeGhost() {
    if (this._ghostGroup && this._scene) {
      this._scene.remove(this._ghostGroup);
      this._ghostGroup = null;
    }
    this._ghostTileId = -1;
  }

  _buildGhost() {
    this._removeGhost();
    this._ghostTileId = this.selectedTile;

    const THREE = this._three;
    const vr = this._voxelRenderer;
    if (!THREE || !vr) return;

    // Erase tile — no ghost
    if (this.selectedTile === 0) return;

    let group = null;

    // Terrain blocks — build a single cube
    if (!ENTITY_IDS.has(this.selectedTile)) {
      const texture = vr._generateTileTexture(this.selectedTile);
      const geo = new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE, TILE_SIZE);
      const mat = new THREE.MeshStandardMaterial({
        map: texture, roughness: 0.9, metalness: 0.0,
        transparent: true, opacity: 0.5,
      });
      const mesh = new THREE.Mesh(geo, mat);
      group = new THREE.Group();
      group.add(mesh);
    } else {
      // Entity models — build using VoxelRenderer methods
      const tempScene = new THREE.Scene();
      const tempVr = { ...vr, scene: tempScene };
      // We use a fresh VoxelRenderer-like build by calling the build method
      // and extracting the group before it gets attached to the main scene
      group = this._buildEntityModel(this.selectedTile);
    }

    if (!group) return;

    // Make all materials transparent for ghost effect
    if (ENTITY_IDS.has(this.selectedTile)) {
      group.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material = child.material.clone();
          child.material.transparent = true;
          child.material.opacity = 0.5;
        }
      });
    }

    this._ghostGroup = group;
    this._ghostGroup.visible = false;
    this._scene.add(this._ghostGroup);
  }

  _buildEntityModel(tileId) {
    const THREE = this._three;
    const vr = this._voxelRenderer;

    // Swap scene temporarily so build methods add to tempScene
    const tempScene = new THREE.Scene();
    const origScene = vr.scene;
    vr.scene = tempScene;

    // Save VR internal state that build methods mutate
    const origFishGroup = vr.fishGroup;
    const enemyCount = vr.enemyGroups ? vr.enemyGroups.length : 0;
    const enemyTailCount = vr.enemyTailPivots ? vr.enemyTailPivots.length : 0;

    let result = null;
    try {
      switch (tileId) {
        case 5: { // Pearl
          const fakeBody = { position: { x: 0, y: 0 } };
          vr.buildPearlAt(fakeBody);
          const mesh = vr.pearlMeshes.pop();
          if (mesh) { tempScene.remove(mesh.mesh); result = mesh.mesh; }
          break;
        }
        case 6: { // Piranha
          result = vr.buildEnemyFish();
          tempScene.remove(result);
          // Remove the pushed enemy state
          if (vr.enemyGroups && vr.enemyGroups.length > enemyCount) vr.enemyGroups.pop();
          if (vr.enemyTailPivots && vr.enemyTailPivots.length > enemyTailCount) vr.enemyTailPivots.pop();
          break;
        }
        case 7: // Player spawn
          result = vr.buildFish();
          tempScene.remove(result);
          vr.fishGroup = origFishGroup;
          break;
        case 9: { // Buoy
          const fakeBody = { position: { x: 0, y: 0 } };
          vr.buildBuoys([fakeBody]);
          const entry = vr.buoyMeshes.pop();
          if (entry) { tempScene.remove(entry.mesh); result = entry.mesh; }
          break;
        }
        case 10: { // Boulder
          const fakeBody = { position: { x: 0, y: 0 } };
          vr.buildBoulders([fakeBody]);
          const entry = vr.boulderMeshes.pop();
          if (entry) { tempScene.remove(entry.mesh); result = entry.mesh; }
          break;
        }
        case 11: { // Raft
          const fakeBody = { position: { x: 0, y: 0 } };
          vr.buildRafts([fakeBody]);
          const entry = vr.raftMeshes.pop();
          if (entry) { tempScene.remove(entry.mesh); result = entry.mesh; }
          break;
        }
        case 12: // Shark
          result = vr.buildShark();
          tempScene.remove(result);
          if (vr.sharkGroups) vr.sharkGroups.pop();
          if (vr.sharkTailPivots) vr.sharkTailPivots.pop();
          break;
        case 13: // Pufferfish
          result = vr.buildPufferfish();
          tempScene.remove(result);
          if (vr.pufferfishGroups) vr.pufferfishGroups.pop();
          break;
        case 14: // Crab
          result = vr.buildCrab();
          tempScene.remove(result);
          if (vr.crabGroups) vr.crabGroups.pop();
          break;
        case 15: // Toxic Fish
          result = vr.buildToxicFish();
          tempScene.remove(result);
          if (vr.toxicFishGroups) vr.toxicFishGroups.pop();
          if (vr.toxicFishTailPivots) vr.toxicFishTailPivots.pop();
          break;
        case 16: case 17: case 18: case 19: case 20: { // Keys
          const colorIndex = tileId - 16;
          const fakeBody = { position: { x: 0, y: 0 } };
          vr.buildKeys([{ body: fakeBody, colorIndex }]);
          const entry = vr.keyMeshes.pop();
          if (entry) { tempScene.remove(entry.mesh); result = entry.mesh; }
          break;
        }
        case 21: case 22: case 23: case 24: case 25: { // Chests
          const colorIndex = tileId - 21;
          const fakeBody = { position: { x: 0, y: 0 } };
          vr.buildChests([{ body: fakeBody, colorIndex }]);
          const entry = vr.chestMeshes.pop();
          if (entry) { tempScene.remove(entry.mesh); result = entry.mesh; }
          break;
        }
        case 26: { // Crate
          const fakeBody = { position: { x: 0, y: 0 } };
          vr.buildCrates([fakeBody]);
          const entry = vr.crateMeshes.pop();
          if (entry) { tempScene.remove(entry.mesh); result = entry.mesh; }
          break;
        }
        case 27: { // Breakable Wall — rendered as terrain block
          const texture = vr._generateTileTexture(27);
          const geo = new this._three.BoxGeometry(TILE_SIZE, TILE_SIZE, TILE_SIZE);
          const mat = new this._three.MeshStandardMaterial({
            map: texture, roughness: 0.9, metalness: 0.0,
            transparent: true, opacity: 0.5,
          });
          const mesh = new this._three.Mesh(geo, mat);
          result = new this._three.Group();
          result.add(mesh);
          break;
        }
        case 28: // Armored Fish
          result = vr.buildArmoredFish();
          tempScene.remove(result);
          if (vr.armoredFishGroups) vr.armoredFishGroups.pop();
          if (vr.armoredFishTailPivots) vr.armoredFishTailPivots.pop();
          break;
        case 29: // Spitting Coral
          result = vr.buildSpittingCoral();
          tempScene.remove(result);
          if (vr.spittingCoralGroups) vr.spittingCoralGroups.pop();
          break;
        case 30: case 31: case 32: { // Switches
          const swType = tileId === 30 ? 'toggle' : tileId === 31 ? 'pressure' : 'timed';
          const fakeBody = { position: { x: 0, y: 0 } };
          const fakeSw = { body: fakeBody, type: swType, group: 0, active: false, timer: 0 };
          vr.buildSwitches([fakeSw]);
          const entry = vr.switchMeshes.pop();
          if (entry) { tempScene.remove(entry.mesh); result = entry.mesh; }
          break;
        }
        case 33: { // Gate
          const fakeBody = { position: { x: 0, y: 0 } };
          const fakeGate = { body: fakeBody, group: 0, open: false, angle: 0 };
          vr.buildGates([fakeGate]);
          const entry = vr.gateMeshes.pop();
          if (entry) { tempScene.remove(entry.mesh); result = entry.mesh; }
          break;
        }
        case 34: { // Floating Log
          const fakeBody = { position: { x: 0, y: 0 } };
          vr.buildFloatingLogs([fakeBody]);
          const entry = vr.floatingLogMeshes.pop();
          if (entry) { tempScene.remove(entry.mesh); result = entry.mesh; }
          break;
        }
        case 35: { // Swinging Anchor
          const fakeBody = { position: { x: 0, y: 0 } };
          const fakeData = { body: fakeBody, pivotX: 0, pivotY: 0, chainLength: 96 };
          vr.buildSwingingAnchors([fakeData]);
          const entry = vr.swingingAnchorMeshes.pop();
          if (entry) { tempScene.remove(entry.mesh); result = entry.mesh; }
          break;
        }
        case 36: { // Bottle Message
          const fakeBody = { position: { x: 0, y: 0 } };
          vr.buildBottles([{ body: fakeBody, text: '...', collected: false }]);
          const entry = vr.bottleMeshes.pop();
          if (entry) { tempScene.remove(entry.mesh); result = entry.mesh; }
          break;
        }
        case 37: { // Hint Stone
          const fakeBody = { position: { x: 0, y: 0 } };
          vr.buildHintStones([{ body: fakeBody, text: '...' }]);
          const entry = vr.hintStoneMeshes.pop();
          if (entry) { tempScene.remove(entry.mesh); result = entry.mesh; }
          break;
        }
      }
    } finally {
      vr.scene = origScene;
    }

    return result;
  }
}

// ── Generate editor preview thumbnails ──
// Call once with THREE + VoxelRenderer refs. Returns { key: dataURL } map.
// Reuses codex previews and adds missing terrain block previews (e.g. stone).
export function generateEditorPreviews(THREE, VoxelRendererClass, existingCodexPreviews) {
  const previews = existingCodexPreviews ? { ...existingCodexPreviews } : {};

  const offRenderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  offRenderer.setPixelRatio(1);
  offRenderer.setSize(96, 96);
  offRenderer.setClearColor(0x0a1e30, 0);

  const tempScene = new THREE.Scene();
  const vr = new VoxelRendererClass(THREE, tempScene);

  // Stone block (not in codex)
  if (!previews.stone) previews.stone = _renderBlockPreview(THREE, offRenderer, vr, 1);
  // Ensure all terrain types are covered
  if (!previews.sand) previews.sand = _renderBlockPreview(THREE, offRenderer, vr, 2);
  if (!previews.coral) previews.coral = _renderBlockPreview(THREE, offRenderer, vr, 3);
  if (!previews.hazard) previews.hazard = _renderBlockPreview(THREE, offRenderer, vr, 4);
  if (!previews.seagrass) previews.seagrass = _renderBlockPreview(THREE, offRenderer, vr, 8);
  if (!previews.breakableWall) previews.breakableWall = _renderBlockPreview(THREE, offRenderer, vr, 27);

  // Per-color key previews
  const colorNames = ['Red', 'Blue', 'Green', 'Yellow', 'Purple'];
  const fakeBody = { position: { x: 0, y: 0 } };
  for (let ci = 0; ci < 5; ci++) {
    const key = 'key' + colorNames[ci];
    if (!previews[key]) {
      vr.buildKeys([{ body: fakeBody, colorIndex: ci }]);
      const entry = vr.keyMeshes.pop();
      if (entry) {
        tempScene.remove(entry.mesh);
        entry.mesh.position.set(0, 0, 0);
        previews[key] = _renderGroupPreview(THREE, offRenderer, entry.mesh, 40);
      }
    }
  }

  // Per-color chest previews
  for (let ci = 0; ci < 5; ci++) {
    const key = 'chest' + colorNames[ci];
    if (!previews[key]) {
      vr.buildChests([{ body: fakeBody, colorIndex: ci }]);
      const entry = vr.chestMeshes.pop();
      if (entry) {
        tempScene.remove(entry.mesh);
        entry.mesh.position.set(0, 0, 0);
        previews[key] = _renderGroupPreview(THREE, offRenderer, entry.mesh, 50);
      }
    }
  }

  // Armored fish preview
  if (!previews.armoredFish) {
    vr.buildArmoredFish();
    const entry = vr.armoredFishGroups.pop();
    if (entry) {
      tempScene.remove(entry);
      entry.position.set(0, 0, 0);
      previews.armoredFish = _renderGroupPreview(THREE, offRenderer, entry, 40);
    }
  }

  // Spitting coral preview
  if (!previews.spittingCoral) {
    vr.buildSpittingCoral();
    const entry = vr.spittingCoralGroups.pop();
    if (entry) {
      tempScene.remove(entry);
      entry.position.set(0, 0, 0);
      previews.spittingCoral = _renderGroupPreview(THREE, offRenderer, entry, 40);
    }
  }

  // Crate preview
  if (!previews.crate) {
    vr.buildCrates([{ position: { x: 0, y: 0 } }]);
    const entry = vr.crateMeshes.pop();
    if (entry) {
      tempScene.remove(entry.mesh);
      entry.mesh.position.set(0, 0, 0);
      previews.crate = _renderGroupPreview(THREE, offRenderer, entry.mesh, 30);
    }
  }

  // Switch previews
  for (const [type, key] of [['toggle', 'switchToggle'], ['pressure', 'switchPressure'], ['timed', 'switchTimed']]) {
    if (!previews[key]) {
      const fakeBody = { position: { x: 0, y: 0 } };
      const fakeSw = { body: fakeBody, type, group: 0, active: false, timer: 0 };
      vr.buildSwitches([fakeSw]);
      const entry = vr.switchMeshes.pop();
      if (entry) {
        tempScene.remove(entry.mesh);
        entry.mesh.position.set(0, 0, 0);
        previews[key] = _renderGroupPreview(THREE, offRenderer, entry.mesh, 30);
      }
    }
  }

  // Gate preview
  if (!previews.gate) {
    const fakeBody = { position: { x: 0, y: 0 } };
    const fakeGate = { body: fakeBody, group: 0, open: false, angle: 0 };
    vr.buildGates([fakeGate]);
    const entry = vr.gateMeshes.pop();
    if (entry) {
      tempScene.remove(entry.mesh);
      entry.mesh.position.set(0, 0, 0);
      previews.gate = _renderGroupPreview(THREE, offRenderer, entry.mesh, 50);
    }
  }

  // Floating Log preview
  if (!previews.floatingLog) {
    const fakeBody = { position: { x: 0, y: 0 } };
    vr.buildFloatingLogs([fakeBody]);
    const entry = vr.floatingLogMeshes.pop();
    if (entry) {
      tempScene.remove(entry.mesh);
      entry.mesh.position.set(0, 0, 0);
      previews.floatingLog = _renderGroupPreview(THREE, offRenderer, entry.mesh, 40);
    }
  }

  // Swinging Anchor preview
  if (!previews.swingingAnchor) {
    const fakeBody = { position: { x: 0, y: 0 } };
    const fakeData = { body: fakeBody, pivotX: 0, pivotY: 0, chainLength: 96 };
    vr.buildSwingingAnchors([fakeData]);
    const entry = vr.swingingAnchorMeshes.pop();
    if (entry) {
      tempScene.remove(entry.mesh);
      entry.mesh.position.set(0, 0, 0);
      previews.swingingAnchor = _renderGroupPreview(THREE, offRenderer, entry.mesh, 80);
    }
  }

  // Bottle preview
  if (!previews.bottle) {
    const fakeBody = { position: { x: 0, y: 0 } };
    vr.buildBottles([{ body: fakeBody, text: '...', collected: false }]);
    const entry = vr.bottleMeshes.pop();
    if (entry) {
      tempScene.remove(entry.mesh);
      entry.mesh.position.set(0, 0, 0);
      previews.bottle = _renderGroupPreview(THREE, offRenderer, entry.mesh, 30);
    }
  }

  // Hint Stone preview
  if (!previews.hintStone) {
    const fakeBody = { position: { x: 0, y: 0 } };
    vr.buildHintStones([{ body: fakeBody, text: '...' }]);
    const entry = vr.hintStoneMeshes.pop();
    if (entry) {
      tempScene.remove(entry.mesh);
      entry.mesh.position.set(0, 0, 0);
      previews.hintStone = _renderGroupPreview(THREE, offRenderer, entry.mesh, 30);
    }
  }

  offRenderer.dispose();

  return previews;
}

function _renderBlockPreview(THREE, offRenderer, vr, tileType) {
  const texture = vr._generateTileTexture(tileType);
  const geo = new THREE.BoxGeometry(16, 16, 16);
  const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0.0 });
  const mesh = new THREE.Mesh(geo, mat);
  const group = new THREE.Group();
  group.add(mesh);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0x88aacc, 1.4));
  const sun = new THREE.DirectionalLight(0xffeedd, 1.6);
  sun.position.set(50, 40, 60);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x88ccff, 0x886644, 0.3));
  scene.add(group);

  const camera = new THREE.PerspectiveCamera(30, 1, 1, 500);
  camera.position.set(6, 18, 30);
  camera.lookAt(0, 0, 0);

  offRenderer.render(scene, camera);
  const url = offRenderer.domElement.toDataURL('image/png');

  scene.remove(group);
  geo.dispose();
  mat.dispose();
  if (texture.dispose) texture.dispose();

  return url;
}

function _renderGroupPreview(THREE, offRenderer, group, camDist) {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0x88aacc, 1.4));
  const sun = new THREE.DirectionalLight(0xffeedd, 1.6);
  sun.position.set(50, 40, 60);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x88bbdd, 0.5);
  fill.position.set(-30, 10, 40);
  scene.add(fill);
  scene.add(new THREE.HemisphereLight(0x88ccff, 0x886644, 0.3));

  // Center the group
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.sub(center);
  scene.add(group);

  const camera = new THREE.PerspectiveCamera(30, 1, 1, 500);
  const dist = camDist || 40;
  camera.position.set(dist * 0.15, dist * 0.3, dist);
  camera.lookAt(0, 0, 0);

  offRenderer.render(scene, camera);
  const url = offRenderer.domElement.toDataURL('image/png');

  scene.remove(group);
  return url;
}

// ── Date formatter for slot display ──
function _formatDate(isoStr) {
  try {
    const d = new Date(isoStr);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return isoStr; }
}
