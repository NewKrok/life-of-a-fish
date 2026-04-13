// ── Level Editor ────────────────────────────────────────────────────────────
// In-game tile editor activated with F4. Provides free camera, tile palette,
// entity placement/removal, and patrol point editing.
// Works with both game level (level-data.js) and menu level (menu-level-data.js).

import { TILE_SIZE } from './level-data.js';

// ── Tile palette definition ──
// Each entry: { id, char, label, color }
const PALETTE = [
  { id: 0,  char: '.', label: 'Erase',      color: '#222' },
  { id: 1,  char: '#', label: 'Stone',       color: '#666' },
  { id: 2,  char: 's', label: 'Sand',        color: '#c8a86e' },
  { id: 3,  char: 'c', label: 'Coral',       color: '#e06080' },
  { id: 4,  char: 'x', label: 'Hazard',      color: '#40c040' },
  { id: 5,  char: 'p', label: 'Pearl',       color: '#ffd93d' },
  { id: 6,  char: 'e', label: 'Piranha',     color: '#ff6060' },
  { id: 7,  char: '@', label: 'Spawn',       color: '#00e5ff' },
  { id: 8,  char: 'd', label: 'Seagrass',    color: '#2d8040' },
  { id: 9,  char: 'B', label: 'Buoy',        color: '#ff4444' },
  { id: 10, char: 'R', label: 'Boulder',     color: '#888' },
  { id: 11, char: 'T', label: 'Raft',        color: '#8b5a2b' },
  { id: 12, char: 'S', label: 'Shark',       color: '#6080c0' },
  { id: 13, char: 'U', label: 'Pufferfish',  color: '#c0a060' },
  { id: 14, char: 'C', label: 'Crab',        color: '#d04020' },
  { id: 15, char: 'F', label: 'Toxic Fish',  color: '#50c050' },
  { id: 16, char: '1', label: 'Key Red',     color: '#ff4444' },
  { id: 17, char: '2', label: 'Key Blue',    color: '#4488ff' },
  { id: 18, char: '3', label: 'Key Green',   color: '#44cc44' },
  { id: 19, char: '4', label: 'Key Yellow',  color: '#ffcc00' },
  { id: 20, char: '5', label: 'Key Purple',  color: '#aa44ff' },
  { id: 21, char: 'a', label: 'Chest Red',   color: '#cc2222' },
  { id: 22, char: 'b', label: 'Chest Blue',  color: '#2266cc' },
  { id: 23, char: 'g', label: 'Chest Green', color: '#22aa22' },
  { id: 24, char: 'y', label: 'Chest Yellow',color: '#ccaa00' },
  { id: 25, char: 'q', label: 'Chest Purple',color: '#8822cc' },
];

// Reverse lookup: tileId -> char
const ID_TO_CHAR = {};
for (const p of PALETTE) ID_TO_CHAR[p.id] = p.char;

// Entity tile IDs (non-terrain — stored as entity positions)
const ENTITY_IDS = new Set([5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]);

// Enemies with patrol ranges
const PATROL_DEFAULTS = {
  6:  { axis: 'x', range: 80 },   // enemy
  12: { axis: 'x', range: 100 },  // shark
  13: { axis: 'y', range: 60 },   // pufferfish
  14: { axis: 'x', range: 50 },   // crab
  15: { axis: 'x', range: 60 },   // toxic fish
};

// ── Camera scroll speed ──
const CAM_SPEED = 400;          // px/s
const CAM_FAST_MULTIPLIER = 2;  // shift held

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
    // Populated from the LEVEL_STRINGS on activation so we can track entities
    // that were already extracted from tiles
    this.entities = [];

    // Patrol editing
    this._draggingPatrol = null;  // { entityIdx, handle: 'min'|'max' }

    // Input state
    this._keys = {};
    this._mouseWorld = { x: 0, y: 0 };
    this._mouseScreen = { x: 0, y: 0 };
    this._mouseDown = false;
    this._rightMouseDown = false;
    this._lastPlacedCell = null;  // { col, row } to avoid repeat placement
    this._dblClickTimer = 0;
    this._dblClickPos = null;

    // Grid visibility
    this.showGrid = true;

    // Palette UI dimensions
    this._paletteH = 77;
    this._paletteY = hudCanvas.height - 77; // updated on render

    // Dirty flag for export
    this.dirty = false;

    // Rebuild callback — called when terrain or entities change
    // Set by game.js to trigger VoxelRenderer rebuild
    this.onTerrainChange = null;   // () => void
    this.onEntityChange = null;    // (entities) => void

    // Throttle terrain rebuilds
    this._terrainDirty = false;
    this._terrainRebuildTimer = 0;
    this._terrainRebuildInterval = 0.3; // seconds — rebuild at most every 300ms

    // Bound handlers (for cleanup)
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onContextMenu = (e) => { if (this.active) e.preventDefault(); };
    this._onWheel = this._handleWheel.bind(this);
  }

  // ── Activate / Deactivate ──

  activate(camX, camY, entityList) {
    this.active = true;
    this.camX = camX;
    this.camY = camY;
    this.entities = entityList || [];
    this._draggingPatrol = null;
    this.hudCanvas.style.pointerEvents = 'auto';

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.hudCanvas.addEventListener('mousemove', this._onMouseMove);
    this.hudCanvas.addEventListener('mousedown', this._onMouseDown);
    this.hudCanvas.addEventListener('mouseup', this._onMouseUp);
    this.hudCanvas.addEventListener('contextmenu', this._onContextMenu);
    this.hudCanvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  deactivate() {
    this.active = false;
    this._draggingPatrol = null;
    this.hudCanvas.style.pointerEvents = 'none';

    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.hudCanvas.removeEventListener('mousemove', this._onMouseMove);
    this.hudCanvas.removeEventListener('mousedown', this._onMouseDown);
    this.hudCanvas.removeEventListener('mouseup', this._onMouseUp);
    this.hudCanvas.removeEventListener('contextmenu', this._onContextMenu);
    this.hudCanvas.removeEventListener('wheel', this._onWheel);
  }

  // ── Build entity list from current tiles + known entities ──
  // Call once when entering editor to populate overlay
  static buildEntityList(tiles, cols, rows, knownEntities) {
    const list = [];
    // Add entities from the known array (already extracted from tiles at init)
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
    // Also scan tiles for any remaining entities still in tile data
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = tiles[r][c];
        if (ENTITY_IDS.has(t)) {
          const cx = c * TILE_SIZE + TILE_SIZE / 2;
          const cy = r * TILE_SIZE + TILE_SIZE / 2;
          // Check if already in list
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

    // Check patrol handle drag BEFORE placement (so clicking a handle doesn't place a tile)
    if (this._mouseDown && !this._draggingPatrol && this._lastPlacedCell === null) {
      const { visW: hvw, visH: hvh } = getVisibleSize();
      const hsx = this.hudCanvas.width / hvw;
      const hwx = this.camX + (this._mouseScreen.x / this.hudCanvas.width) * hvw;
      const hwy = this.camY + (this._mouseScreen.y / this.hudCanvas.height) * hvh;
      const handle = this._findPatrolHandle(hwx, hwy, hsx);
      if (handle) {
        this._draggingPatrol = handle;
      }
    }

    // Continuous painting while mouse held (skip if dragging patrol handle)
    if (this._mouseDown && !this._draggingPatrol) {
      this._placeTileAtMouse(getVisibleSize);
    }

    // Drag patrol handle
    if (this._draggingPatrol && this._mouseDown) {
      const ent = this.entities[this._draggingPatrol.entityIdx];
      if (ent && ent.patrol) {
        const { visW: vw, visH: vh } = getVisibleSize();
        const wx = this.camX + (this._mouseScreen.x / this.hudCanvas.width) * vw;
        const wy = this.camY + (this._mouseScreen.y / this.hudCanvas.height) * vh;
        if (ent.patrol.axis === 'x') {
          if (this._draggingPatrol.handle === 'min') {
            ent.patrol.min = Math.min(wx, ent.x - TILE_SIZE);
          } else {
            ent.patrol.max = Math.max(wx, ent.x + TILE_SIZE);
          }
        } else {
          if (this._draggingPatrol.handle === 'min') {
            ent.patrol.min = Math.min(wy, ent.y - TILE_SIZE);
          } else {
            ent.patrol.max = Math.max(wy, ent.y + TILE_SIZE);
          }
        }
        this.dirty = true;
      }
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
  }

  // ── Render editor overlay on HUD ──
  render(getVisibleSize) {
    if (!this.active) return;

    const ctx = this.hudCtx;
    const W = this.hudCanvas.width;
    const H = this.hudCanvas.height;
    const { visW, visH } = getVisibleSize();
    const sx = W / visW;
    const sy = H / visH;

    // ── Grid ──
    if (this.showGrid) {
      ctx.save();
      ctx.setTransform(sx, 0, 0, sy, -this.camX * sx, -this.camY * sy);
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
    ctx.setTransform(sx, 0, 0, sy, -this.camX * sx, -this.camY * sy);

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
          // Horizontal patrol line
          ctx.beginPath();
          ctx.moveTo(ent.patrol.min, ent.y);
          ctx.lineTo(ent.patrol.max, ent.y);
          ctx.stroke();

          // Min handle
          this._drawPatrolHandle(ctx, ent.patrol.min, ent.y, pColor, sx);
          // Max handle
          this._drawPatrolHandle(ctx, ent.patrol.max, ent.y, pColor, sx);
        } else {
          // Vertical patrol line
          ctx.beginPath();
          ctx.moveTo(ent.x, ent.patrol.min);
          ctx.lineTo(ent.x, ent.patrol.max);
          ctx.stroke();

          // Min handle
          this._drawPatrolHandle(ctx, ent.x, ent.patrol.min, pColor, sx);
          // Max handle
          this._drawPatrolHandle(ctx, ent.x, ent.patrol.max, pColor, sx);
        }

        ctx.setLineDash([]);
      }
    }

    ctx.restore();

    // ── Cursor highlight ──
    {
      const mx = this.camX + (this._mouseScreen.x / W) * visW;
      const my = this.camY + (this._mouseScreen.y / H) * visH;
      const col = Math.floor(mx / TILE_SIZE);
      const row = Math.floor(my / TILE_SIZE);
      if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
        // Don't show cursor over palette area
        if (this._mouseScreen.y < H - this._paletteH - 10) {
          ctx.save();
          ctx.setTransform(sx, 0, 0, sy, -this.camX * sx, -this.camY * sy);
          const pal = PALETTE.find(p => p.id === this.selectedTile);
          ctx.fillStyle = (pal ? pal.color : '#fff') + '40';
          ctx.strokeStyle = (pal ? pal.color : '#fff') + 'cc';
          ctx.lineWidth = 2 / sx;
          ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          ctx.strokeRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          ctx.restore();
        }
      }
    }

    // ── Palette bar ──
    this._renderPalette(W, H);

    // ── Top bar info ──
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, 32);

    ctx.fillStyle = '#ffd93d';
    ctx.font = "bold 11px 'Silkscreen', monospace";
    ctx.textAlign = 'left';
    ctx.fillText('LEVEL EDITOR (F4)', 10, 21);

    // Mouse position
    const mx = this.camX + (this._mouseScreen.x / W) * visW;
    const my = this.camY + (this._mouseScreen.y / H) * visH;
    const mCol = Math.floor(mx / TILE_SIZE);
    const mRow = Math.floor(my / TILE_SIZE);
    ctx.fillStyle = 'rgba(200,230,255,0.7)';
    ctx.font = "10px 'Silkscreen', monospace";
    ctx.fillText(`Col:${mCol} Row:${mRow}  |  WASD=move  Shift=fast  G=grid  Ctrl+C=copy  DblClick=delete`, 180, 21);

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

  // ── Palette bar at bottom ──
  _renderPalette(W, H) {
    const ctx = this.hudCtx;
    const ph = this._paletteH;
    const py = H - ph;
    this._paletteY = py;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Background
    ctx.fillStyle = 'rgba(6, 21, 32, 0.92)';
    ctx.fillRect(0, py, W, ph);
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(W, py);
    ctx.stroke();

    // Calculate item layout (20% larger)
    const itemW = 58;
    const itemH = 53;
    const gap = 5;
    const totalW = PALETTE.length * (itemW + gap) - gap;
    const startX = Math.max(8, (W - totalW) / 2);
    const itemY = py + (ph - itemH) / 2;

    for (let i = 0; i < PALETTE.length; i++) {
      const p = PALETTE[i];
      const ix = startX + i * (itemW + gap);
      const selected = p.id === this.selectedTile;

      // Item background
      if (selected) {
        ctx.fillStyle = 'rgba(100, 200, 255, 0.25)';
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.8)';
        ctx.lineWidth = 2;
      } else {
        ctx.fillStyle = 'rgba(30, 50, 70, 0.6)';
        ctx.strokeStyle = 'rgba(100, 180, 255, 0.15)';
        ctx.lineWidth = 1;
      }
      ctx.fillRect(ix, itemY, itemW, itemH);
      ctx.strokeRect(ix, itemY, itemW, itemH);

      // Color swatch
      ctx.fillStyle = p.color;
      ctx.fillRect(ix + 5, itemY + 5, itemW - 10, 22);

      // Label
      ctx.fillStyle = selected ? '#fff' : 'rgba(200,230,255,0.7)';
      ctx.font = "8px 'Silkscreen', monospace";
      ctx.textAlign = 'center';
      ctx.fillText(p.label, ix + itemW / 2, itemY + itemH - 6);

      // Hotkey number
      if (i < 10) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = "8px 'Silkscreen', monospace";
        ctx.fillText(i.toString(), ix + itemW / 2, itemY + 17);
      }
    }

    ctx.restore();
  }

  // ── Place tile or entity at current mouse position ──
  _placeTileAtMouse(getVisibleSize) {
    const { visW, visH } = getVisibleSize();
    const W = this.hudCanvas.width;
    const H = this.hudCanvas.height;

    // Don't place if mouse is on palette
    if (this._mouseScreen.y >= this._paletteY) return;
    // Don't place if mouse is on top bar
    if (this._mouseScreen.y < 32) return;

    const wx = this.camX + (this._mouseScreen.x / W) * visW;
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
      // Erase: clear tile AND remove any entity at cell
      const hadTile = this.tiles[row][col] !== 0;
      this.tiles[row][col] = 0;
      const removedEntity = this._removeEntityAt(cx, cy);
      if (hadTile) this._terrainDirty = true;
      if (removedEntity && this.onEntityChange) this.onEntityChange(this.entities);
    } else if (ENTITY_IDS.has(tileId)) {
      // Entity placement — add to overlay
      this._removeEntityAt(cx, cy);

      // Hazard tiles also stay in the tile array for terrain rendering
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
      // If placing player spawn, remove existing
      if (tileId === 7) {
        this.entities = this.entities.filter(e => e.tileId !== 7);
      }
      this.entities.push(entry);
      if (this.onEntityChange) this.onEntityChange(this.entities);
    } else {
      // Terrain tile placement
      this.tiles[row][col] = tileId;
      this._terrainDirty = true;
      // Also remove any entity at this cell (replaced by terrain)
      this._removeEntityAt(cx, cy);
    }
    this.dirty = true;
  }

  // ── Remove entity at world position — returns true if something was removed ──
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
    // Check entities first (within TILE_SIZE distance)
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

    // Erase terrain tile
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

  // ── Check if mouse is near a patrol handle ──
  _findPatrolHandle(wx, wy, sx) {
    const threshold = Math.max(12, 18 / sx); // generous hit area for patrol handles
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

  // ── Export level as string array (for copy to clipboard) ──
  exportLevelStrings() {
    // Start from current tile array
    const lines = [];
    for (let r = 0; r < this.rows; r++) {
      let line = '';
      for (let c = 0; c < this.cols; c++) {
        const t = this.tiles[r][c];
        line += ID_TO_CHAR[t] || '.';
      }
      lines.push(line);
    }

    // Overlay entities onto the string grid
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

  // ── Export patrol data as JSON ──
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
    this._toastTimer = 2000; // ms
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
    const tx = (W - tw) / 2;
    ctx.fillRect(tx, 50, tw, 30);
    ctx.strokeRect(tx, 50, tw, 30);
    ctx.fillStyle = `rgba(200, 230, 255, ${alpha})`;
    ctx.font = "11px 'Silkscreen', monospace";
    ctx.textAlign = 'center';
    ctx.fillText(this._toastMsg, W / 2, 70);
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
        e.preventDefault();
      }
    }

    // G = toggle grid
    if (e.code === 'KeyG' && !e.ctrlKey && !e.metaKey) {
      this.showGrid = !this.showGrid;
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
      // Check palette click first
      if (this._mouseScreen.y >= this._paletteY) {
        this._handlePaletteClick(e.clientX);
        return;
      }

      // Check double-click
      const now = performance.now();
      if (this._dblClickPos &&
          Math.abs(e.clientX - this._dblClickPos.x) < 10 &&
          Math.abs(e.clientY - this._dblClickPos.y) < 10 &&
          now - this._dblClickTimer < 400) {
        // Double click — delete
        const visW = this.hudCanvas.width;
        const visH = this.hudCanvas.height;
        // Need visible size — approximate from canvas
        this._dblClickTimer = 0;
        this._dblClickPos = null;
        // Store for processing in next frame
        this._pendingDblClick = { screenX: e.clientX, screenY: e.clientY };
        return;
      }
      this._dblClickTimer = now;
      this._dblClickPos = { x: e.clientX, y: e.clientY };

      // Check patrol handle drag
      this._mouseDown = true;
      this._lastPlacedCell = null;
    } else if (e.button === 2) {
      this._rightMouseDown = true;
    }
  }

  _handleMouseUp(e) {
    if (e.button === 0) {
      this._mouseDown = false;
      this._draggingPatrol = null;
    } else if (e.button === 2) {
      this._rightMouseDown = false;
    }
  }

  _handleWheel(e) {
    if (!this.active) return;
    e.preventDefault();
    // Scroll through palette
    const dir = e.deltaY > 0 ? 1 : -1;
    const idx = PALETTE.findIndex(p => p.id === this.selectedTile);
    const newIdx = Math.max(0, Math.min(PALETTE.length - 1, idx + dir));
    this.selectedTile = PALETTE[newIdx].id;
  }

  _handlePaletteClick(screenX) {
    const W = this.hudCanvas.width;
    const itemW = 58;
    const gap = 5;
    const totalW = PALETTE.length * (itemW + gap) - gap;
    const startX = Math.max(8, (W - totalW) / 2);

    for (let i = 0; i < PALETTE.length; i++) {
      const ix = startX + i * (itemW + gap);
      if (screenX >= ix && screenX <= ix + itemW) {
        this.selectedTile = PALETTE[i].id;
        break;
      }
    }
  }

  // Process pending double-click (needs getVisibleSize from game loop)
  processPendingActions(getVisibleSize) {
    if (this._pendingDblClick) {
      const { visW, visH } = getVisibleSize();
      const W = this.hudCanvas.width;
      const H = this.hudCanvas.height;
      const wx = this.camX + (this._pendingDblClick.screenX / W) * visW;
      const wy = this.camY + (this._pendingDblClick.screenY / H) * visH;
      this._deleteAtWorldPos(wx, wy);
      this._pendingDblClick = null;
    }
  }
}
