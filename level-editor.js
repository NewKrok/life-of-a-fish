// ── Level Editor ────────────────────────────────────────────────────────────
// In-game tile editor activated with F4. Provides free camera, left sidebar
// palette with categories + preview thumbnails, entity placement/removal,
// patrol editing, move mode, and right-click camera drag.
// Works with both game level (level-data.js) and menu level (menu-level-data.js).

import { TILE_SIZE } from './level-data.js';

// ── Tile palette definition ──
// Each entry: { id, char, label, color, category, previewKey? }
// previewKey maps to the key in the previews object passed via setPreviews()
const PALETTE = [
  { id: 0,  char: '.', label: 'Erase',      color: '#222',    category: 'tools',   previewKey: null },
  { id: 1,  char: '#', label: 'Stone',       color: '#666',    category: 'terrain', previewKey: 'stone' },
  { id: 2,  char: 's', label: 'Sand',        color: '#c8a86e', category: 'terrain', previewKey: 'sand' },
  { id: 3,  char: 'c', label: 'Coral',       color: '#e06080', category: 'terrain', previewKey: 'coral' },
  { id: 4,  char: 'x', label: 'Hazard',      color: '#40c040', category: 'terrain', previewKey: 'hazard' },
  { id: 8,  char: 'd', label: 'Seagrass',    color: '#2d8040', category: 'terrain', previewKey: 'seagrass' },
  { id: 5,  char: 'p', label: 'Pearl',       color: '#ffd93d', category: 'items',   previewKey: 'pearl' },
  { id: 7,  char: '@', label: 'Spawn',       color: '#00e5ff', category: 'items',   previewKey: 'player' },
  { id: 9,  char: 'B', label: 'Buoy',        color: '#ff4444', category: 'items',   previewKey: 'buoy' },
  { id: 10, char: 'R', label: 'Boulder',     color: '#888',    category: 'items',   previewKey: 'boulder' },
  { id: 11, char: 'T', label: 'Raft',        color: '#8b5a2b', category: 'items',   previewKey: 'raft' },
  { id: 6,  char: 'e', label: 'Piranha',     color: '#ff6060', category: 'enemies', previewKey: 'piranha' },
  { id: 12, char: 'S', label: 'Shark',       color: '#6080c0', category: 'enemies', previewKey: 'shark' },
  { id: 13, char: 'U', label: 'Pufferfish',  color: '#c0a060', category: 'enemies', previewKey: 'pufferfish' },
  { id: 14, char: 'C', label: 'Crab',        color: '#d04020', category: 'enemies', previewKey: 'crab' },
  { id: 15, char: 'F', label: 'Toxic Fish',  color: '#50c050', category: 'enemies', previewKey: 'toxicFish' },
  { id: 16, char: '1', label: 'Key Red',     color: '#ff4444', category: 'keys',    previewKey: 'key' },
  { id: 17, char: '2', label: 'Key Blue',    color: '#4488ff', category: 'keys',    previewKey: 'key' },
  { id: 18, char: '3', label: 'Key Green',   color: '#44cc44', category: 'keys',    previewKey: 'key' },
  { id: 19, char: '4', label: 'Key Yellow',  color: '#ffcc00', category: 'keys',    previewKey: 'key' },
  { id: 20, char: '5', label: 'Key Purple',  color: '#aa44ff', category: 'keys',    previewKey: 'key' },
  { id: 21, char: 'a', label: 'Chest Red',   color: '#cc2222', category: 'chests',  previewKey: 'chest' },
  { id: 22, char: 'b', label: 'Chest Blue',  color: '#2266cc', category: 'chests',  previewKey: 'chest' },
  { id: 23, char: 'g', label: 'Chest Green', color: '#22aa22', category: 'chests',  previewKey: 'chest' },
  { id: 24, char: 'y', label: 'Chest Yellow',color: '#ccaa00', category: 'chests',  previewKey: 'chest' },
  { id: 25, char: 'q', label: 'Chest Purple',color: '#8822cc', category: 'chests',  previewKey: 'chest' },
];

// Category definitions in display order
const CATEGORIES = [
  { key: 'tools',   label: 'Tools' },
  { key: 'terrain', label: 'Terrain' },
  { key: 'items',   label: 'Items' },
  { key: 'enemies', label: 'Enemies' },
  { key: 'keys',    label: 'Keys' },
  { key: 'chests',  label: 'Chests' },
];

// Reverse lookup: tileId -> char
const ID_TO_CHAR = {};
for (const p of PALETTE) ID_TO_CHAR[p.id] = p.char;

// Entity tile IDs (non-terrain — stored as entity positions)
const ENTITY_IDS = new Set([5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]);

// Enemies with patrol ranges
const PATROL_DEFAULTS = {
  6:  { axis: 'x', range: 80 },   // piranha
  12: { axis: 'x', range: 100 },  // shark
  13: { axis: 'y', range: 60 },   // pufferfish
  14: { axis: 'x', range: 50 },   // crab
  15: { axis: 'x', range: 60 },   // toxic fish
};

// ── Camera scroll speed ──
const CAM_SPEED = 400;          // px/s
const CAM_FAST_MULTIPLIER = 2;  // shift held

// ── Sidebar layout constants ──
const SIDEBAR_W = 180;          // px width
const SIDEBAR_PAD = 8;          // px inner padding
const CATEGORY_HEADER_H = 24;   // px height for category headers
const TILE_ITEM_H = 32;         // px height per tile item row (room for preview icon)
const TILE_ICON_SIZE = 24;      // px preview icon size in list
const PREVIEW_H = 80;           // px height for large preview area at top
const TOP_BAR_H = 32;           // px top info bar
const MOVE_BTN_H = 30;          // px move button height

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

    // Move mode
    this.moveMode = false;
    this._movingEntity = null;    // { entityIdx }

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

    // Dirty flag for export
    this.dirty = false;

    // Editor wants flat camera (no pitch) — game.js reads this
    this.flatCamera = true;

    // Rebuild callback — called when terrain or entities change
    this.onTerrainChange = null;
    this.onEntityChange = null;

    // Throttle terrain rebuilds
    this._terrainDirty = false;
    this._terrainRebuildTimer = 0;
    this._terrainRebuildInterval = 0.3; // seconds

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
      img.src = url;
      this._previewImgs[key] = img;
    }
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
    this.moveMode = false;
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
      const addGroup = (arr, tileId) => {
        for (const e of arr) {
          const entry = { x: e.x, y: e.y, tileId };
          const pDef = PATROL_DEFAULTS[tileId];
          if (pDef) {
            if (pDef.axis === 'x') {
              entry.patrol = { axis: 'x', min: e.x - pDef.range, max: e.x + pDef.range };
            } else {
              entry.patrol = { axis: 'y', min: e.y - pDef.range, max: e.y + pDef.range };
            }
          }
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
              if (pDef.axis === 'x') {
                entry.patrol = { axis: 'x', min: cx - pDef.range, max: cx + pDef.range };
              } else {
                entry.patrol = { axis: 'y', min: cy - pDef.range, max: cy + pDef.range };
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
          ent.patrol.min += ent.patrol.axis === 'x' ? dx : dy;
          ent.patrol.max += ent.patrol.axis === 'x' ? dx : dy;
        }
        ent.x = newX;
        ent.y = newY;
        this.dirty = true;
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

    // Drag patrol handle (snapped to tile edges)
    if (this._draggingPatrol && this._mouseDown) {
      const ent = this.entities[this._draggingPatrol.entityIdx];
      if (ent && ent.patrol) {
        const { visW: vw, visH: vh } = getVisibleSize();
        const rawX = this.camX + ((this._mouseScreen.x - SIDEBAR_W) / (this.hudCanvas.width - SIDEBAR_W)) * vw;
        const rawY = this.camY + (this._mouseScreen.y / this.hudCanvas.height) * vh;
        // Snap to nearest tile edge
        const snapX = Math.round(rawX / TILE_SIZE) * TILE_SIZE;
        const snapY = Math.round(rawY / TILE_SIZE) * TILE_SIZE;
        if (ent.patrol.axis === 'x') {
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

    // Right-click camera drag
    if (this._rightDragStart) {
      const dx = this._mouseScreen.x - this._rightDragStart.screenX;
      const dy = this._mouseScreen.y - this._rightDragStart.screenY;
      const viewW = this.hudCanvas.width - SIDEBAR_W;
      const scaleX = visW / viewW;
      const scaleY = visH / this.hudCanvas.height;
      this.camX = this._rightDragStart.camX - dx * scaleX;
      this.camY = this._rightDragStart.camY - dy * scaleY;
      this.camX = Math.max(0, Math.min(this.camX, this.worldW - visW));
      this.camY = Math.max(0, Math.min(this.camY, this.worldH - visH));
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

    for (let i = 0; i < this.entities.length; i++) {
      const ent = this.entities[i];
      const pal = PALETTE.find(p => p.id === ent.tileId);
      const color = pal ? pal.color : '#fff';

      // Entity marker — fill the whole tile cell
      const ex = ent.x - TILE_SIZE / 2;
      const ey = ent.y - TILE_SIZE / 2;
      ctx.fillStyle = color + '55';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 / sx;
      ctx.fillRect(ex, ey, TILE_SIZE, TILE_SIZE);
      ctx.strokeRect(ex, ey, TILE_SIZE, TILE_SIZE);

      // Inner icon circle
      ctx.fillStyle = color + '99';
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
      ctx.font = `${Math.max(8, 10 / sx)}px 'Silkscreen', monospace`;
      ctx.textAlign = 'center';
      const label = pal ? pal.label : '?';
      ctx.fillText(label, ent.x, ent.y - TILE_SIZE / 2 - 3 / sx);

      // ── Patrol visualization ──
      if (ent.patrol) {
        const pColor = color;
        ctx.strokeStyle = pColor + 'aa';
        ctx.lineWidth = 1.5 / sx;
        ctx.setLineDash([4 / sx, 4 / sx]);

        if (ent.patrol.axis === 'x') {
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
    }

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

        const pal = PALETTE.find(p => p.id === this.selectedTile);
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
    ctx.fillText('LEVEL EDITOR (F4)', SIDEBAR_W + 10, 21);

    const mx = this.camX + ((this._mouseScreen.x - SIDEBAR_W) / viewW) * visW;
    const my = this.camY + (this._mouseScreen.y / H) * visH;
    const mCol = Math.floor(mx / TILE_SIZE);
    const mRow = Math.floor(my / TILE_SIZE);
    ctx.fillStyle = 'rgba(200,230,255,0.7)';
    ctx.font = "10px 'Silkscreen', monospace";
    const modeLabel = this.moveMode ? '  MOVE' : '';
    ctx.fillText(`Col:${mCol} Row:${mRow}${modeLabel}  |  G=grid  Ctrl+C=copy  M=move  RClick=pan`, SIDEBAR_W + 170, 21);

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

  // ── Left sidebar ──
  _renderSidebar(W, H) {
    const ctx = this.hudCtx;
    const sw = SIDEBAR_W;

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
    const previewW = sw - SIDEBAR_PAD * 2;
    this._renderPreview(ctx, SIDEBAR_PAD, previewY, previewW, PREVIEW_H);

    // ── Move mode button ──
    const moveBtnY = previewY + PREVIEW_H + SIDEBAR_PAD;
    this._moveBtnRect = { x: SIDEBAR_PAD, y: moveBtnY, w: previewW, h: MOVE_BTN_H };
    ctx.fillStyle = this.moveMode ? 'rgba(0, 229, 255, 0.3)' : 'rgba(30, 50, 70, 0.6)';
    ctx.strokeStyle = this.moveMode ? 'rgba(0, 229, 255, 0.8)' : 'rgba(100, 180, 255, 0.2)';
    ctx.lineWidth = this.moveMode ? 2 : 1;
    ctx.fillRect(this._moveBtnRect.x, moveBtnY, previewW, MOVE_BTN_H);
    ctx.strokeRect(this._moveBtnRect.x, moveBtnY, previewW, MOVE_BTN_H);
    ctx.fillStyle = this.moveMode ? '#00e5ff' : 'rgba(200,230,255,0.7)';
    ctx.font = "bold 10px 'Silkscreen', monospace";
    ctx.textAlign = 'center';
    ctx.fillText(this.moveMode ? 'MOVE ON' : 'MOVE (M)', sw / 2, moveBtnY + 20);

    // ── Category list (scrollable) ──
    const listTop = moveBtnY + MOVE_BTN_H + SIDEBAR_PAD;
    const listH = H - listTop - SIDEBAR_PAD;

    // Clip to list area
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, listTop, sw, listH);
    ctx.clip();

    let curY = listTop - this._sidebarScrollY;

    for (const cat of CATEGORIES) {
      const items = PALETTE.filter(p => p.category === cat.key);
      if (items.length === 0) continue;

      const isCollapsed = this._collapsed[cat.key];

      // Category header
      ctx.fillStyle = 'rgba(100, 180, 255, 0.15)';
      ctx.fillRect(SIDEBAR_PAD, curY, previewW, CATEGORY_HEADER_H);
      ctx.fillStyle = 'rgba(100, 200, 255, 0.9)';
      ctx.font = "bold 9px 'Silkscreen', monospace";
      ctx.textAlign = 'left';
      const arrow = isCollapsed ? '\u25B6' : '\u25BC';
      ctx.fillText(`${arrow} ${cat.label}`, SIDEBAR_PAD + 6, curY + 16);
      curY += CATEGORY_HEADER_H + 2;

      if (!isCollapsed) {
        for (const p of items) {
          const selected = p.id === this.selectedTile && !this.moveMode;
          const iy = curY;

          // Item background
          if (selected) {
            ctx.fillStyle = 'rgba(100, 200, 255, 0.25)';
            ctx.strokeStyle = 'rgba(100, 200, 255, 0.8)';
            ctx.lineWidth = 1.5;
            ctx.fillRect(SIDEBAR_PAD, iy, previewW, TILE_ITEM_H);
            ctx.strokeRect(SIDEBAR_PAD, iy, previewW, TILE_ITEM_H);
          }

          // Preview icon or color swatch
          const iconX = SIDEBAR_PAD + 4;
          const iconY = iy + (TILE_ITEM_H - TILE_ICON_SIZE) / 2;
          const img = p.previewKey ? this._previewImgs[p.previewKey] : null;
          if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, iconX, iconY, TILE_ICON_SIZE, TILE_ICON_SIZE);
          } else {
            // Fallback: color swatch
            ctx.fillStyle = p.color;
            ctx.fillRect(iconX, iconY, TILE_ICON_SIZE, TILE_ICON_SIZE);
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(iconX, iconY, TILE_ICON_SIZE, TILE_ICON_SIZE);
          }

          // Label
          ctx.fillStyle = selected ? '#fff' : 'rgba(200,230,255,0.7)';
          ctx.font = "9px 'Silkscreen', monospace";
          ctx.textAlign = 'left';
          ctx.fillText(p.label, iconX + TILE_ICON_SIZE + 6, iy + TILE_ITEM_H / 2 + 3);

          curY += TILE_ITEM_H;
        }
      }

      curY += 4; // gap between categories
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
    const pal = PALETTE.find(p => p.id === this.selectedTile);
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
    ctx.fillText(pal.label, x + w / 2, y + h - 8);
  }

  // ── Get sidebar item hit at screen position ──
  _hitTestSidebar(screenX, screenY) {
    if (screenX > SIDEBAR_W) return null;

    const sw = SIDEBAR_W;
    const previewW = sw - SIDEBAR_PAD * 2;

    // Move button
    if (this._moveBtnRect) {
      const b = this._moveBtnRect;
      if (screenX >= b.x && screenX <= b.x + b.w && screenY >= b.y && screenY <= b.y + b.h) {
        return { type: 'move_btn' };
      }
    }

    // Category list area
    const listTop = (this._moveBtnRect ? this._moveBtnRect.y + MOVE_BTN_H : PREVIEW_H + MOVE_BTN_H) + SIDEBAR_PAD;
    if (screenY < listTop) return null;

    let curY = listTop - this._sidebarScrollY;

    for (const cat of CATEGORIES) {
      const items = PALETTE.filter(p => p.category === cat.key);
      if (items.length === 0) continue;

      // Category header hit
      if (screenY >= curY && screenY < curY + CATEGORY_HEADER_H) {
        return { type: 'category', key: cat.key };
      }
      curY += CATEGORY_HEADER_H + 2;

      if (!this._collapsed[cat.key]) {
        for (const p of items) {
          if (screenY >= curY && screenY < curY + TILE_ITEM_H) {
            return { type: 'tile', id: p.id };
          }
          curY += TILE_ITEM_H;
        }
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

    const cx = col * TILE_SIZE + TILE_SIZE / 2;
    const cy = row * TILE_SIZE + TILE_SIZE / 2;
    const tileId = this.selectedTile;

    if (tileId === 0) {
      // Erase
      const hadTile = this.tiles[row][col] !== 0;
      this.tiles[row][col] = 0;
      const removedEntity = this._removeEntityAt(cx, cy);
      if (hadTile) this._terrainDirty = true;
      if (removedEntity && this.onEntityChange) this.onEntityChange(this.entities);
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
        if (pDef.axis === 'x') {
          entry.patrol = { axis: 'x', min: cx - pDef.range, max: cx + pDef.range };
        } else {
          entry.patrol = { axis: 'y', min: cy - pDef.range, max: cy + pDef.range };
        }
      }
      if (tileId === 7) {
        this.entities = this.entities.filter(e => e.tileId !== 7);
      }
      this.entities.push(entry);
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
      if (this.onEntityChange) this.onEntityChange(this.entities);
      return;
    }

    const col = Math.floor(wx / TILE_SIZE);
    const row = Math.floor(wy / TILE_SIZE);
    if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
      if (this.tiles[row][col] !== 0) {
        this.tiles[row][col] = 0;
        this.dirty = true;
        this._terrainDirty = true;
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

  // ── Check if mouse is near a patrol handle ──
  _findPatrolHandle(wx, wy, sx) {
    const threshold = Math.max(12, 18 / sx);
    for (let i = 0; i < this.entities.length; i++) {
      const ent = this.entities[i];
      if (!ent.patrol) continue;
      if (ent.patrol.axis === 'x') {
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
        const pal = PALETTE.find(pl => pl.id === p.tileId);
        const name = pal ? pal.label : 'unknown';
        if (p.patrol.axis === 'x') {
          const range = Math.round((p.patrol.max - p.patrol.min) / 2);
          output += `// ${name} at (${Math.round(p.x)}, ${Math.round(p.y)}): patrol range ±${range}px\n`;
        } else {
          const range = Math.round((p.patrol.max - p.patrol.min) / 2);
          output += `// ${name} at (${Math.round(p.x)}, ${Math.round(p.y)}): patrol range ±${range}px (vertical)\n`;
        }
      }
    }

    navigator.clipboard.writeText(output).then(() => {
      this._showToast('Level data copied to clipboard!');
    }).catch(() => {
      this._showToast('Copy failed — check clipboard permissions');
    });
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
    this._keys[e.code] = true;

    // Number keys 0-9 to select palette
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.replace('Digit', ''));
      if (n >= 0 && n < PALETTE.length) {
        this.selectedTile = PALETTE[n].id;
        this.moveMode = false;
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
      this.moveMode = !this.moveMode;
      this._movingEntity = null;
      e.preventDefault();
    }

    // Ctrl+C = copy level data
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
      this.copyToClipboard();
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
          if (hit.type === 'move_btn') {
            this.moveMode = !this.moveMode;
            this._movingEntity = null;
          } else if (hit.type === 'category') {
            this._collapsed[hit.key] = !this._collapsed[hit.key];
          } else if (hit.type === 'tile') {
            this.selectedTile = hit.id;
            this.moveMode = false;
          }
        }
        return;
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
      this._mouseDown = false;
      this._draggingPatrol = null;
      this._movingEntity = null;
    } else if (e.button === 2) {
      this._rightMouseDown = false;
      this._rightDragStart = null;
    }
  }

  _handleWheel(e) {
    if (!this.active) return;
    e.preventDefault();

    // Sidebar scroll
    if (this._mouseScreen.x <= SIDEBAR_W) {
      const listTop = (this._moveBtnRect ? this._moveBtnRect.y + MOVE_BTN_H : PREVIEW_H + MOVE_BTN_H) + SIDEBAR_PAD;
      const listH = this.hudCanvas.height - listTop - SIDEBAR_PAD;
      const maxScroll = Math.max(0, this._sidebarContentH - listH);
      this._sidebarScrollY = Math.max(0, Math.min(maxScroll, this._sidebarScrollY + e.deltaY));
      return;
    }

    // Scroll through palette on world area
    const dir = e.deltaY > 0 ? 1 : -1;
    const idx = PALETTE.findIndex(p => p.id === this.selectedTile);
    const newIdx = Math.max(0, Math.min(PALETTE.length - 1, idx + dir));
    this.selectedTile = PALETTE[newIdx].id;
    this.moveMode = false;
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
        const listTop = (this._moveBtnRect ? this._moveBtnRect.y + MOVE_BTN_H : PREVIEW_H + MOVE_BTN_H) + SIDEBAR_PAD;
        const listH = this.hudCanvas.height - listTop - SIDEBAR_PAD;
        const maxScroll = Math.max(0, this._sidebarContentH - listH);
        this._sidebarScrollY = Math.max(0, Math.min(maxScroll, this._sidebarScrollStart + dy));
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
            if (hit.type === 'move_btn') {
              this.moveMode = !this.moveMode;
              this._movingEntity = null;
            } else if (hit.type === 'category') {
              this._collapsed[hit.key] = !this._collapsed[hit.key];
            } else if (hit.type === 'tile') {
              this.selectedTile = hit.id;
              this.moveMode = false;
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
  }

  // ── Process pending actions (needs getVisibleSize from game loop) ──
  processPendingActions(getVisibleSize) {
    // Double-click delete
    if (this._pendingDblClick) {
      const { visW, visH } = getVisibleSize();
      const viewW = this.hudCanvas.width - SIDEBAR_W;
      const wx = this.camX + ((this._pendingDblClick.screenX - SIDEBAR_W) / viewW) * visW;
      const wy = this.camY + (this._pendingDblClick.screenY / this.hudCanvas.height) * visH;
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
    const wx = col * TILE_SIZE + TILE_SIZE / 2;
    const wy = row * TILE_SIZE + TILE_SIZE / 2;
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
