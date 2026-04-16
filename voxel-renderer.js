// ── Voxel Renderer ─────────────────────────────────────────────────────────
// Three.js voxel-style renderer for the underwater platformer.
// Uses InstancedMesh for terrain, Group of boxes for fish/enemies.
// Enhanced with procedural textures, god rays, and underwater atmosphere.

import { TILE_SIZE, LEVEL_COLS, LEVEL_ROWS, TILES, WATER_SURFACE_Y, WORLD_W, WORLD_H, KEY_CHEST_COLORS } from './level-data.js';

const VOXEL_DEPTH = TILE_SIZE; // Z depth of each voxel

// ── Shared geometry cache (one BoxGeometry per voxel size) ──
const _sharedGeoCache = {};

function _getSharedGeo(THREE, V) {
  if (!_sharedGeoCache[V]) {
    _sharedGeoCache[V] = new THREE.BoxGeometry(V, V, V);
  }
  return _sharedGeoCache[V];
}

// ── Merge voxel data into a Group with one Mesh per unique material key ──
// voxelData: [{ x, y, z, color, emissive? }]
// V: voxel size
// matProps: { roughness, metalness, ... } — shared properties for all voxels
// Returns a THREE.Group with merged meshes (one per color+emissive combo)
function _mergeVoxelGroup(THREE, voxelData, V, matProps = {}) {
  const group = new THREE.Group();
  if (voxelData.length === 0) return group;

  // Group voxels by material key (color + emissive combo)
  const buckets = new Map();
  for (const v of voxelData) {
    const key = v.emissive !== undefined ? `${v.color}_${v.emissive}` : `${v.color}`;
    if (!buckets.has(key)) {
      buckets.set(key, { color: v.color, emissive: v.emissive, positions: [] });
    }
    buckets.get(key).positions.push(v.x, v.y, v.z);
  }

  const baseGeo = _getSharedGeo(THREE, V);

  for (const [, bucket] of buckets) {
    const count = bucket.positions.length / 3;
    if (count === 0) continue;

    // Use InstancedMesh for each color bucket
    const matOpts = {
      color: bucket.color,
      roughness: matProps.roughness ?? 0.85,
      metalness: matProps.metalness ?? 0.0,
      ...( bucket.emissive !== undefined ? {
        emissive: bucket.emissive,
        emissiveIntensity: matProps.emissiveIntensity ?? 0.4,
      } : {}),
    };
    if (matProps.transparent) {
      matOpts.transparent = true;
      matOpts.opacity = matProps.opacity ?? 0.5;
    }
    const mat = new THREE.MeshStandardMaterial(matOpts);
    const mesh = new THREE.InstancedMesh(baseGeo, mat, count);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set(
        bucket.positions[i * 3],
        bucket.positions[i * 3 + 1],
        bucket.positions[i * 3 + 2]
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  return group;
}

// ── VoxelCollector: lightweight accumulator for voxel data ──
// Usage: const vc = new VoxelCollector(V);
//        vc.add(x, y, z, color);          // position in grid coords
//        vc.add(x, y, z, color, emissive); // with emissive
//        const group = vc.build(THREE, matProps);
class VoxelCollector {
  constructor(V) {
    this.V = V;
    this.data = [];
  }
  add(x, y, z, color, emissive) {
    const V = this.V;
    const entry = { x: x * V, y: y * V, z: z * V, color };
    if (emissive !== undefined) entry.emissive = emissive;
    this.data.push(entry);
  }
  row(xs, y, z, color) {
    for (const x of xs) this.add(x, y, z, color);
  }
  build(THREE, matProps = {}) {
    return _mergeVoxelGroup(THREE, this.data, this.V, matProps);
  }
}

// ── God Ray Constants ──
const GOD_RAY_COUNT = 12;           // number of light beams
const GOD_RAY_MAX_WIDTH = 80;       // px, widest beam at bottom
const GOD_RAY_MIN_WIDTH = 20;       // px, narrowest beam at top
const GOD_RAY_HEIGHT = 600;         // px, how tall each ray is
const GOD_RAY_OPACITY = 0.07;       // base opacity
const GOD_RAY_DRIFT_SPEED = 0.15;   // horizontal drift speed

// ── Water Surface Constants ──
const SURFACE_WAVE_SEGMENTS = 200;  // resolution of wave mesh
const SURFACE_WAVE_AMPLITUDE = 3;   // px, wave height
const SURFACE_WAVE_SPEED = 1.5;     // animation speed
const SURFACE_SPARKLE_COUNT = 60;   // number of sparkle particles

// ── Background Wave Constants ──
const BG_WAVE_COUNT = 5;            // number of background wave lines
const BG_WAVE_SEGMENTS = 80;        // vertices per wave line
const BG_WAVE_AMPLITUDE = 6;        // px, wave height

// ── Ambient Bubble Constants ──
const AMBIENT_BUBBLE_COUNT = 30;    // number of ambient bubbles in water

// ── Underwater Current Constants ──
const CURRENT_STREAK_COUNT = 48;    // number of flowing streaks
const CURRENT_MIN_SPEED = 15;       // px/s, slowest streak
const CURRENT_MAX_SPEED = 55;       // px/s, fastest streak
const CURRENT_MIN_LENGTH = 40;      // px, shortest streak
const CURRENT_MAX_LENGTH = 160;     // px, longest streak
const CURRENT_MIN_HEIGHT = 2;       // px, thinnest streak
const CURRENT_MAX_HEIGHT = 5;       // px, thickest streak
const CURRENT_OPACITY = 0.15;       // base opacity

// ── Cave Background Constants ──
const CAVE_BG_Z_OFFSET = -TILE_SIZE;       // how far behind terrain the cave layer sits
const CAVE_BG_DARKEN = 0.35;               // base brightness multiplier (0 = black, 1 = full)
const CAVE_BG_NEIGHBOR_RADIUS = 2;         // how many tiles away from solid to generate cave bg

// ── Background Constants ──
const BG_LAYER_COUNT = 3;           // parallax background layers

export class VoxelRenderer {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;

    this.terrainMeshes = [];
    this.fishGroup = null;
    this.fishTailPivot = null;
    this.enemyGroups = [];
    this.enemyTailPivots = [];
    this.pearlMeshes = [];  // { mesh, body } pairs
    this.buoyMeshes = [];   // { mesh, body } pairs
    this.boulderMeshes = []; // { mesh, body } pairs
    this.keyMeshes = [];     // { mesh, body, colorIndex } pairs
    this.chestMeshes = [];   // { mesh, body, colorIndex, opened } pairs
    this.raftMeshes = [];   // { mesh, body } pairs
    this.crateMeshes = [];  // { mesh, body } pairs
    this.floatingLogMeshes = [];  // { mesh, body } pairs
    this.swingingAnchorMeshes = [];  // { mesh, body, pivotX, pivotY, chainLength } pairs
    this.bottleMeshes = [];          // { mesh, body } pairs
    this.hintStoneMeshes = [];       // { mesh, body } pairs
    this.breakableWallMeshes = [];  // { mesh, body } pairs
    this.waterMesh = null;
    this.bubbles = [];
    this._time = 0;
    this._fishFlipAngle = 0;       // current Y rotation for 3D flip (0 = right, π = left)
    this._dashSpinReturn = 0;      // easing multiplier after dash spin ends
    this._enemyFlipAngles = [];    // per-enemy Y rotation for 3D flip

    // New enemy types
    this.sharkGroups = [];
    this.sharkTailPivots = [];
    this._sharkFlipAngles = [];
    this.pufferfishGroups = [];
    this._pufferfishFlipAngles = [];
    this.crabGroups = [];
    this._crabFlipAngles = [];
    this.toxicFishGroups = [];
    this.toxicFishTailPivots = [];
    this._toxicFlipAngles = [];
    this.armoredFishGroups = [];
    this.armoredFishTailPivots = [];
    this._armoredFlipAngles = [];
    this.spittingCoralGroups = [];
    this.projectileMeshes = [];    // { mesh, body } pairs for poison projectiles
    this.switchMeshes = [];        // { mesh, body, type, padMesh } pairs
    this.gateMeshes = [];          // { mesh, body, pivotGroup } pairs

    // New visual elements
    this.godRays = [];
    this.surfaceWaveMesh = null;
    this.waterFillMesh = null;
    this.surfaceSparkles = [];
    this.bgLayers = [];
    this.bgWaves = [];
    this.ambientBubbles = [];
    this.currentStreaks = [];
    this._textureCache = {};
    this._surfaceDisturbances = []; // { x, amplitude, age, decay, spread }
    this.splashDroplets = [];        // { mesh, vx, vy, life } — airborne water droplets
  }

  // ── Remove all enemy/entity visuals (used by editor rebuild) ──
  clearEntityVisuals() {
    const remove = (arr) => {
      for (const g of arr) this.scene.remove(g);
      arr.length = 0;
    };
    remove(this.enemyGroups);
    this.enemyTailPivots.length = 0;
    this._enemyFlipAngles.length = 0;
    remove(this.sharkGroups);
    this.sharkTailPivots.length = 0;
    this._sharkFlipAngles.length = 0;
    remove(this.pufferfishGroups);
    this._pufferfishFlipAngles.length = 0;
    remove(this.crabGroups);
    this._crabFlipAngles.length = 0;
    remove(this.toxicFishGroups);
    this.toxicFishTailPivots.length = 0;
    this._toxicFlipAngles.length = 0;
    remove(this.armoredFishGroups);
    this.armoredFishTailPivots.length = 0;
    this._armoredFlipAngles.length = 0;
    remove(this.spittingCoralGroups);
    // Pearls
    for (const p of this.pearlMeshes) {
      this.scene.remove(p.mesh);
      if (p.mesh.geometry) p.mesh.geometry.dispose();
      if (p.mesh.material) p.mesh.material.dispose();
    }
    this.pearlMeshes.length = 0;
    // Buoys
    for (const b of this.buoyMeshes) this.scene.remove(b.mesh);
    this.buoyMeshes.length = 0;
    // Boulders
    for (const b of this.boulderMeshes) this.scene.remove(b.mesh);
    this.boulderMeshes.length = 0;
    // Keys
    for (const k of this.keyMeshes) this.scene.remove(k.mesh);
    this.keyMeshes.length = 0;
    // Chests
    for (const c of this.chestMeshes) this.scene.remove(c.mesh);
    this.chestMeshes.length = 0;
    // Rafts
    for (const r of this.raftMeshes) this.scene.remove(r.mesh);
    this.raftMeshes.length = 0;
    // Crates
    for (const c of this.crateMeshes) this.scene.remove(c.mesh);
    this.crateMeshes.length = 0;
    // Floating Logs
    for (const f of this.floatingLogMeshes) this.scene.remove(f.mesh);
    this.floatingLogMeshes.length = 0;
    // Swinging Anchors
    for (const s of this.swingingAnchorMeshes) this.scene.remove(s.mesh);
    this.swingingAnchorMeshes.length = 0;
    // Bottles
    for (const b of this.bottleMeshes) this.scene.remove(b.mesh);
    this.bottleMeshes.length = 0;
    // Hint Stones
    for (const h of this.hintStoneMeshes) this.scene.remove(h.mesh);
    this.hintStoneMeshes.length = 0;
    // Breakable walls
    for (const w of this.breakableWallMeshes) this.scene.remove(w.mesh);
    this.breakableWallMeshes.length = 0;
    // Switches
    for (const s of this.switchMeshes) this.scene.remove(s.mesh);
    this.switchMeshes.length = 0;
    // Gates
    for (const g of this.gateMeshes) this.scene.remove(g.mesh);
    this.gateMeshes.length = 0;
  }

  // ── Generate procedural Minecraft-style texture for a tile type ──
  _generateTileTexture(type) {
    if (this._textureCache[type]) return this._textureCache[type];

    const THREE = this.THREE;
    const size = 64; // texture resolution
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Seeded random for consistent textures
    const seed = (typeof type === 'string' ? 99 : type) * 1337;
    const rng = (i) => {
      const x = Math.sin(seed + i * 9871) * 43758.5453;
      return x - Math.floor(x);
    };

    // Pixel size for Minecraft-style chunky pixels
    const px = size / 16; // 4px per "pixel" at 64x64 — gives 16x16 pixel grid

    if (type === 1) {
      // ── Stone: Minecraft cobblestone style — bright grays with visible pixels ──
      // Base fill
      ctx.fillStyle = '#8a8a9a';
      ctx.fillRect(0, 0, size, size);

      // Random stone pixel patches — varying gray tones
      for (let py = 0; py < 16; py++) {
        for (let px2 = 0; px2 < 16; px2++) {
          const r = rng(py * 16 + px2);
          const brightness = 100 + r * 80; // 100-180 range (bright)
          const blueShift = 5 + r * 10;
          ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness + blueShift})`;
          ctx.fillRect(px2 * px, py * px, px, px);
        }
      }

      // Darker crack lines between "stones"
      ctx.fillStyle = 'rgba(50, 50, 65, 0.7)';
      for (let i = 0; i < 8; i++) {
        const x = Math.floor(rng(i + 400) * 16) * px;
        const y = Math.floor(rng(i + 500) * 16) * px;
        const horizontal = rng(i + 600) > 0.5;
        if (horizontal) {
          ctx.fillRect(x, y, px * 3, px);
        } else {
          ctx.fillRect(x, y, px, px * 3);
        }
      }

      // Block edge highlight (top/left light, bottom/right dark)
      ctx.fillStyle = 'rgba(180, 180, 200, 0.3)';
      ctx.fillRect(0, 0, size, px);
      ctx.fillRect(0, 0, px, size);
      ctx.fillStyle = 'rgba(30, 30, 45, 0.4)';
      ctx.fillRect(0, size - px, size, px);
      ctx.fillRect(size - px, 0, px, size);

    } else if (type === 2) {
      // ── Sand: Minecraft sand style — warm yellow with grain pixels ──
      ctx.fillStyle = '#dbce8e';
      ctx.fillRect(0, 0, size, size);

      for (let py = 0; py < 16; py++) {
        for (let px2 = 0; px2 < 16; px2++) {
          const r = rng(py * 16 + px2 + 1000);
          const base = 180 + r * 55; // 180-235, bright warm
          const g = base - 15;
          const b = base - 70;
          ctx.fillStyle = `rgb(${Math.min(255, base + 10)}, ${Math.min(255, g)}, ${Math.max(80, b)})`;
          ctx.fillRect(px2 * px, py * px, px, px);
        }
      }

      // Scattered darker sand grains
      for (let i = 0; i < 12; i++) {
        const gx = Math.floor(rng(i + 100) * 16) * px;
        const gy = Math.floor(rng(i + 150) * 16) * px;
        ctx.fillStyle = 'rgba(170, 145, 75, 0.6)';
        ctx.fillRect(gx, gy, px, px);
      }

      // Block edge
      ctx.fillStyle = 'rgba(230, 215, 150, 0.35)';
      ctx.fillRect(0, 0, size, px);
      ctx.fillRect(0, 0, px, size);
      ctx.fillStyle = 'rgba(120, 100, 50, 0.3)';
      ctx.fillRect(0, size - px, size, px);
      ctx.fillRect(size - px, 0, px, size);

    } else if (type === 3) {
      // ── Coral: vibrant red/orange Minecraft style ──
      ctx.fillStyle = '#e06050';
      ctx.fillRect(0, 0, size, size);

      for (let py = 0; py < 16; py++) {
        for (let px2 = 0; px2 < 16; px2++) {
          const r = rng(py * 16 + px2 + 2000);
          const red = 180 + r * 70;     // 180-250
          const green = 60 + r * 50;    // 60-110
          const blue = 50 + r * 40;     // 50-90
          ctx.fillStyle = `rgb(${Math.min(255, red)}, ${green}, ${blue})`;
          ctx.fillRect(px2 * px, py * px, px, px);
        }
      }

      // Bright coral polyp spots
      for (let i = 0; i < 8; i++) {
        const gx = Math.floor(rng(i + 300) * 16) * px;
        const gy = Math.floor(rng(i + 350) * 16) * px;
        ctx.fillStyle = 'rgba(255, 180, 150, 0.7)';
        ctx.fillRect(gx, gy, px, px);
      }

      // Block edge
      ctx.fillStyle = 'rgba(255, 160, 140, 0.3)';
      ctx.fillRect(0, 0, size, px);
      ctx.fillRect(0, 0, px, size);
      ctx.fillStyle = 'rgba(100, 30, 20, 0.4)';
      ctx.fillRect(0, size - px, size, px);
      ctx.fillRect(size - px, 0, px, size);

    } else if (type === 4) {
      // ── Hazard: red spiky Minecraft-style danger block ──
      ctx.fillStyle = '#aa2020';
      ctx.fillRect(0, 0, size, size);

      for (let py = 0; py < 16; py++) {
        for (let px2 = 0; px2 < 16; px2++) {
          const r = rng(py * 16 + px2 + 3000);
          const red = 140 + r * 90;     // 140-230 bright red
          const green = 20 + r * 30;    // 20-50 low green
          const blue = 15 + r * 25;     // 15-40 low blue
          ctx.fillStyle = `rgb(${Math.min(230, red)}, ${green}, ${blue})`;
          ctx.fillRect(px2 * px, py * px, px, px);
        }
      }

      // Spike/cross pattern — darker pixels
      ctx.fillStyle = 'rgba(80, 10, 10, 0.5)';
      for (let i = 0; i < 16; i++) {
        ctx.fillRect(7 * px, i * px, px * 2, px); // vertical center
      }
      for (let i = 0; i < 6; i++) {
        const y = Math.floor(2 + i * 2.5);
        const dir = i % 2 === 0 ? 1 : -1;
        for (let j = 0; j < 4; j++) {
          ctx.fillRect((8 + dir * j) * px, (y + j) * px, px, px);
        }
      }

      // Block edge
      ctx.fillStyle = 'rgba(255, 100, 100, 0.3)';
      ctx.fillRect(0, 0, size, px);
      ctx.fillRect(0, 0, px, size);
      ctx.fillStyle = 'rgba(60, 5, 5, 0.4)';
      ctx.fillRect(0, size - px, size, px);
      ctx.fillRect(size - px, 0, px, size);

    } else if (type === 'cave_bg') {
      // ── Cave background: very dark stone, visible behind terrain ──
      ctx.fillStyle = '#2a2a35';
      ctx.fillRect(0, 0, size, size);

      for (let py = 0; py < 16; py++) {
        for (let px2 = 0; px2 < 16; px2++) {
          const r = rng(py * 16 + px2 + 9000);
          const brightness = 30 + r * 35; // 30-65, very dark
          const blueShift = 3 + r * 8;
          ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness + blueShift})`;
          ctx.fillRect(px2 * px, py * px, px, px);
        }
      }

      // Subtle crack lines
      ctx.fillStyle = 'rgba(15, 15, 20, 0.6)';
      for (let i = 0; i < 6; i++) {
        const x = Math.floor(rng(i + 900) * 16) * px;
        const y = Math.floor(rng(i + 950) * 16) * px;
        const horizontal = rng(i + 960) > 0.5;
        if (horizontal) {
          ctx.fillRect(x, y, px * 3, px);
        } else {
          ctx.fillRect(x, y, px, px * 3);
        }
      }

      // Block edge — very subtle
      ctx.fillStyle = 'rgba(60, 60, 75, 0.2)';
      ctx.fillRect(0, 0, size, px);
      ctx.fillRect(0, 0, px, size);
      ctx.fillStyle = 'rgba(10, 10, 15, 0.3)';
      ctx.fillRect(0, size - px, size, px);
      ctx.fillRect(size - px, 0, px, size);

    } else if (type === 8) {
      // ── Seagrass: green kelp/grass blades, non-solid decoration ──
      // Transparent background — only the blade pixels are visible
      ctx.fillStyle = '#1a5c2a';
      ctx.fillRect(0, 0, size, size);

      for (let py = 0; py < 16; py++) {
        for (let px2 = 0; px2 < 16; px2++) {
          const r = rng(py * 16 + px2 + 8000);
          // Green tones with variation
          const shade = rng(py * 16 + px2 + 8500);
          let red, green, blue;
          if (shade < 0.5) {
            // Dark green
            red = 25 + r * 30;
            green = 100 + r * 60;
            blue = 30 + r * 30;
          } else if (shade < 0.8) {
            // Bright green
            red = 40 + r * 30;
            green = 140 + r * 70;
            blue = 40 + r * 30;
          } else {
            // Yellow-green highlight
            red = 70 + r * 50;
            green = 160 + r * 60;
            blue = 30 + r * 25;
          }
          ctx.fillStyle = `rgb(${Math.min(255, red)}, ${Math.min(220, green)}, ${Math.min(200, blue)})`;
          ctx.fillRect(px2 * px, py * px, px, px);
        }
      }

      // Vertical blade streaks — lighter green lines
      for (let i = 0; i < 5; i++) {
        const bx = Math.floor(rng(i + 800) * 14 + 1) * px;
        ctx.fillStyle = 'rgba(100, 210, 80, 0.4)';
        for (let j = 0; j < 16; j++) {
          ctx.fillRect(bx, j * px, px, px);
        }
      }

      // Block edge
      ctx.fillStyle = 'rgba(80, 180, 90, 0.25)';
      ctx.fillRect(0, 0, size, px);
      ctx.fillRect(0, 0, px, size);
      ctx.fillStyle = 'rgba(10, 40, 15, 0.4)';
      ctx.fillRect(0, size - px, size, px);
      ctx.fillRect(size - px, 0, px, size);

    } else if (type === 27) {
      // ── Breakable Wall: cracked stone — stone base with prominent crack lines ──
      ctx.fillStyle = '#7a7a8a';
      ctx.fillRect(0, 0, size, size);

      // Random stone pixel patches (similar to stone but slightly darker)
      for (let py = 0; py < 16; py++) {
        for (let px2 = 0; px2 < 16; px2++) {
          const r = rng(py * 16 + px2);
          const brightness = 85 + r * 70; // 85-155 range (slightly darker than stone)
          const blueShift = 3 + r * 8;
          ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness + blueShift})`;
          ctx.fillRect(px2 * px, py * px, px, px);
        }
      }

      // Prominent crack lines (thicker and darker than stone's subtle cracks)
      ctx.strokeStyle = 'rgba(20, 20, 30, 0.9)';
      ctx.lineWidth = 2;
      // Main diagonal crack from top-left area to bottom-right
      ctx.beginPath();
      ctx.moveTo(rng(700) * size * 0.3, rng(701) * size * 0.2);
      ctx.lineTo(size * 0.4 + rng(702) * size * 0.2, size * 0.5 + rng(703) * size * 0.1);
      ctx.lineTo(size * 0.7 + rng(704) * size * 0.2, size * 0.85 + rng(705) * size * 0.1);
      ctx.stroke();
      // Secondary crack branching off
      ctx.beginPath();
      ctx.moveTo(size * 0.4 + rng(706) * size * 0.1, size * 0.5 + rng(707) * size * 0.1);
      ctx.lineTo(size * 0.8 + rng(708) * size * 0.15, size * 0.3 + rng(709) * size * 0.2);
      ctx.stroke();
      // Small crack from bottom
      ctx.beginPath();
      ctx.moveTo(size * 0.15 + rng(710) * size * 0.2, size * 0.9);
      ctx.lineTo(size * 0.3 + rng(711) * size * 0.15, size * 0.65 + rng(712) * size * 0.1);
      ctx.stroke();

      // Crack fill pixels along fractures (lighter — exposed interior)
      for (let i = 0; i < 10; i++) {
        const gx = Math.floor(rng(i + 720) * 16) * px;
        const gy = Math.floor(rng(i + 730) * 16) * px;
        ctx.fillStyle = 'rgba(40, 40, 55, 0.8)';
        ctx.fillRect(gx, gy, px, px);
      }

      // Block edge highlight (dimmer than regular stone)
      ctx.fillStyle = 'rgba(140, 140, 160, 0.25)';
      ctx.fillRect(0, 0, size, px);
      ctx.fillRect(0, 0, px, size);
      ctx.fillStyle = 'rgba(25, 25, 40, 0.5)';
      ctx.fillRect(0, size - px, size, px);
      ctx.fillRect(size - px, 0, px, size);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    this._textureCache[type] = texture;
    return texture;
  }

  // ── Build static terrain from tile data ──
  buildTerrain() {
    const THREE = this.THREE;

    // Count tiles per type
    const tileCounts = {};
    for (let row = 0; row < LEVEL_ROWS; row++) {
      for (let col = 0; col < LEVEL_COLS; col++) {
        const t = TILES[row][col];
        if ((t >= 1 && t <= 4) || t === 8) {
          tileCounts[t] = (tileCounts[t] || 0) + 1;
        }
      }
    }

    // Create one InstancedMesh per tile type
    const boxGeo = new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE, VOXEL_DEPTH);
    const dummy = new THREE.Object3D();

    for (const [typeStr, count] of Object.entries(tileCounts)) {
      const type = parseInt(typeStr);
      const texture = this._generateTileTexture(type);
      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.9,
        metalness: 0.0,
      });
      const mesh = new THREE.InstancedMesh(boxGeo, mat, count);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(count * 3), 3
      );

      let idx = 0;
      const color = new THREE.Color();
      for (let row = 0; row < LEVEL_ROWS; row++) {
        for (let col = 0; col < LEVEL_COLS; col++) {
          if (TILES[row][col] !== type) continue;
          const x = col * TILE_SIZE + TILE_SIZE / 2;
          const y = -(row * TILE_SIZE + TILE_SIZE / 2); // Y flipped for Three.js
          dummy.position.set(x, y, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx, dummy.matrix);

          // Depth-based darkening: tiles deeper underwater get darker
          const worldY = row * TILE_SIZE + TILE_SIZE / 2;
          const depthBelow = Math.max(0, worldY - WATER_SURFACE_Y);
          const maxDepth = WORLD_H - WATER_SURFACE_Y;
          const depthFactor = 1.0 - (depthBelow / maxDepth) * 0.55; // darken up to 55%
          color.setRGB(depthFactor, depthFactor, depthFactor);
          mesh.setColorAt(idx, color);

          idx++;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      this.scene.add(mesh);
      this.terrainMeshes.push(mesh);
    }

    // ── Cave background layer: darker blocks behind terrain ──
    const caveBg = this._buildCaveBackgroundMap();
    let caveCount = 0;
    for (let row = 0; row < LEVEL_ROWS; row++) {
      for (let col = 0; col < LEVEL_COLS; col++) {
        if (caveBg[row][col]) caveCount++;
      }
    }

    if (caveCount > 0) {
      const caveTexture = this._generateTileTexture('cave_bg');
      const caveMat = new THREE.MeshStandardMaterial({
        map: caveTexture,
        roughness: 1.0,
        metalness: 0.0,
      });
      const caveMesh = new THREE.InstancedMesh(boxGeo, caveMat, caveCount);
      caveMesh.receiveShadow = true;
      caveMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(caveCount * 3), 3
      );

      let caveIdx = 0;
      const caveColor = new THREE.Color();
      for (let row = 0; row < LEVEL_ROWS; row++) {
        for (let col = 0; col < LEVEL_COLS; col++) {
          if (!caveBg[row][col]) continue;
          const x = col * TILE_SIZE + TILE_SIZE / 2;
          const y = -(row * TILE_SIZE + TILE_SIZE / 2);
          dummy.position.set(x, y, CAVE_BG_Z_OFFSET);
          dummy.updateMatrix();
          caveMesh.setMatrixAt(caveIdx, dummy.matrix);

          // Depth-based darkening on top of already dark base
          const worldY = row * TILE_SIZE + TILE_SIZE / 2;
          const depthBelow = Math.max(0, worldY - WATER_SURFACE_Y);
          const maxDepth = WORLD_H - WATER_SURFACE_Y;
          const depthFactor = CAVE_BG_DARKEN - (depthBelow / maxDepth) * 0.15;
          caveColor.setRGB(depthFactor, depthFactor, depthFactor);
          caveMesh.setColorAt(caveIdx, caveColor);

          caveIdx++;
        }
      }
      caveMesh.instanceMatrix.needsUpdate = true;
      caveMesh.instanceColor.needsUpdate = true;
      this.scene.add(caveMesh);
      this.terrainMeshes.push(caveMesh);
    }
  }

  // ── Dispose terrain meshes (keep texture cache intact for reuse) ──
  _disposeTerrainMeshes() {
    for (const mesh of this.terrainMeshes) {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose(); // don't dispose .map — it's cached
    }
    this.terrainMeshes = [];
  }

  // ── Rebuild terrain from current TILES array (used by level editor) ──
  rebuildTerrain() {
    this._disposeTerrainMeshes();
    this.buildTerrain();
  }

  // ── Rebuild terrain from custom tile data (used by menu editor) ──
  rebuildTerrainFrom(tiles, cols, rows, worldH, waterSurfaceY) {
    this._disposeTerrainMeshes();

    const THREE = this.THREE;
    const boxGeo = new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE, VOXEL_DEPTH);
    const dummy = new THREE.Object3D();

    // Count tiles per type
    const tileCounts = {};
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const t = tiles[row][col];
        if ((t >= 1 && t <= 4) || t === 8) {
          tileCounts[t] = (tileCounts[t] || 0) + 1;
        }
      }
    }

    for (const [typeStr, count] of Object.entries(tileCounts)) {
      const type = parseInt(typeStr);
      const texture = this._generateTileTexture(type);
      const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0.0 });
      const mesh = new THREE.InstancedMesh(boxGeo, mat, count);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);

      let idx = 0;
      const color = new THREE.Color();
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (tiles[row][col] !== type) continue;
          const x = col * TILE_SIZE + TILE_SIZE / 2;
          const y = -(row * TILE_SIZE + TILE_SIZE / 2);
          dummy.position.set(x, y, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx, dummy.matrix);
          const worldY = row * TILE_SIZE + TILE_SIZE / 2;
          const depthBelow = Math.max(0, worldY - waterSurfaceY);
          const maxDepth = worldH - waterSurfaceY;
          const depthFactor = 1.0 - (depthBelow / maxDepth) * 0.55;
          color.setRGB(depthFactor, depthFactor, depthFactor);
          mesh.setColorAt(idx, color);
          idx++;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      this.scene.add(mesh);
      this.terrainMeshes.push(mesh);
    }

    // Cave background
    const SOLID_TYPES = new Set([1, 2, 3]);
    const NON_EMPTY = new Set([1, 2, 3, 4, 8]);
    const caveBg = Array.from({ length: rows }, () => new Array(cols).fill(false));
    const radius = CAVE_BG_NEIGHBOR_RADIUS;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (NON_EMPTY.has(tiles[row][col])) continue;
        let nearSolid = false;
        for (let dr = -radius; dr <= radius && !nearSolid; dr++) {
          for (let dc = -radius; dc <= radius && !nearSolid; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr, nc = col + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              if (SOLID_TYPES.has(tiles[nr][nc])) nearSolid = true;
            }
          }
        }
        caveBg[row][col] = nearSolid;
      }
    }
    let caveCount = 0;
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++)
        if (caveBg[row][col]) caveCount++;
    if (caveCount > 0) {
      const caveTexture = this._generateTileTexture('cave_bg');
      const caveMat = new THREE.MeshStandardMaterial({ map: caveTexture, roughness: 1.0, metalness: 0.0 });
      const caveMesh = new THREE.InstancedMesh(boxGeo, caveMat, caveCount);
      caveMesh.receiveShadow = true;
      caveMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(caveCount * 3), 3);
      let caveIdx = 0;
      const caveColor = new THREE.Color();
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (!caveBg[row][col]) continue;
          dummy.position.set(col * TILE_SIZE + TILE_SIZE / 2, -(row * TILE_SIZE + TILE_SIZE / 2), CAVE_BG_Z_OFFSET);
          dummy.updateMatrix();
          caveMesh.setMatrixAt(caveIdx, dummy.matrix);
          const worldY = row * TILE_SIZE + TILE_SIZE / 2;
          const depthBelow = Math.max(0, worldY - waterSurfaceY);
          const maxDepth = worldH - waterSurfaceY;
          const depthFactor = CAVE_BG_DARKEN - (depthBelow / maxDepth) * 0.15;
          caveColor.setRGB(depthFactor, depthFactor, depthFactor);
          caveMesh.setColorAt(caveIdx, caveColor);
          caveIdx++;
        }
      }
      caveMesh.instanceMatrix.needsUpdate = true;
      caveMesh.instanceColor.needsUpdate = true;
      this.scene.add(caveMesh);
      this.terrainMeshes.push(caveMesh);
    }
  }

  // ── Generate cave background map ──
  // Returns a 2D boolean array: true where a cave background block should appear.
  // An empty cell gets a cave bg if it's within CAVE_BG_NEIGHBOR_RADIUS of a solid tile.
  _buildCaveBackgroundMap() {
    const SOLID_TYPES = new Set([1, 2, 3]); // stone, sand, coral
    const NON_EMPTY_TYPES = new Set([1, 2, 3, 4, 8]); // all rendered tile types
    const caveBg = Array.from({ length: LEVEL_ROWS }, () => new Array(LEVEL_COLS).fill(false));
    const radius = CAVE_BG_NEIGHBOR_RADIUS;

    for (let row = 0; row < LEVEL_ROWS; row++) {
      for (let col = 0; col < LEVEL_COLS; col++) {
        // Skip cells that already have a visible tile
        if (NON_EMPTY_TYPES.has(TILES[row][col])) continue;

        // Check if any solid tile is within radius
        let nearSolid = false;
        for (let dr = -radius; dr <= radius && !nearSolid; dr++) {
          for (let dc = -radius; dc <= radius && !nearSolid; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= 0 && nr < LEVEL_ROWS && nc >= 0 && nc < LEVEL_COLS) {
              if (SOLID_TYPES.has(TILES[nr][nc])) {
                nearSolid = true;
              }
            }
          }
        }
        caveBg[row][col] = nearSolid;
      }
    }
    return caveBg;
  }

  // ── Build the player fish model (voxel style, Magikarp-inspired) ──
  buildFish() {
    const THREE = this.THREE;
    const V = 2; // smaller voxel for more detail
    const vc = new VoxelCollector(V);
    const matProps = { roughness: 0.85, metalness: 0.0 };

    // Colors
    const RED = 0xcc2222;
    const RED_DARK = 0xa01818;
    const RED_LIGHT = 0xdd3333;
    const WHITE = 0xe8e0d0;
    const WHITE_LIGHT = 0xf5f0e8;
    const YELLOW = 0xf0c020;
    const YELLOW_DARK = 0xd4a010;
    const EYE_WHITE = 0xffffff;
    const EYE_BLACK = 0x111111;
    const WHISKER = 0xd4a010;
    const MOUTH = 0xc87830;

    // ── Body: round oval shape, 10 long × 8 tall × 6 deep ──
    // Build layer by layer in Z. Body is symmetric around z=2.5
    // Each Z-slice defines rows [y] -> x range

    // Z=0, Z=5 (outermost edges, small)
    const sliceOuter = () => {
      // Red upper body
      vc.row([3, 4, 5, 6], 3, 0, RED);
      vc.row([3, 4, 5, 6], 2, 0, RED);
      vc.row([4, 5], 1, 0, RED_LIGHT);
      // White belly
      vc.row([4, 5], 0, 0, WHITE);
      vc.row([4, 5], -1, 0, WHITE);
    };

    // Z=1, Z=4 (mid-outer, bigger)
    const sliceMidOuter = () => {
      vc.row([2, 3, 4, 5, 6, 7], 4, 1, RED);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8], 3, 1, RED);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8], 2, 1, RED_LIGHT);
      vc.row([2, 3, 4, 5, 6, 7, 8], 1, 1, RED_LIGHT);
      // White belly
      vc.row([2, 3, 4, 5, 6, 7, 8], 0, 1, WHITE);
      vc.row([3, 4, 5, 6, 7], -1, 1, WHITE);
      vc.row([4, 5, 6], -2, 1, WHITE_LIGHT);
    };

    // Z=2, Z=3 (center, biggest cross-section)
    const sliceCenter = () => {
      vc.row([3, 4, 5, 6], 5, 2, RED_DARK);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8], 4, 2, RED);
      vc.row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 3, 2, RED);
      vc.row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 2, 2, RED_LIGHT);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8, 9], 1, 2, RED_LIGHT);
      // White belly
      vc.row([1, 2, 3, 4, 5, 6, 7, 8, 9], 0, 2, WHITE);
      vc.row([2, 3, 4, 5, 6, 7, 8], -1, 2, WHITE);
      vc.row([3, 4, 5, 6, 7], -2, 2, WHITE_LIGHT);
    };

    // Place body slices symmetrically
    // Z=0 and Z=5
    sliceOuter();
    // Mirror Z=0 to Z=5
    const snap0 = vc.data.length;
    for (let i = 0; i < snap0; i++) {
      const d = vc.data[i];
      if (d.z === 0) {
        vc.add(d.x / V, d.y / V, 5, d.color);
      }
    }

    // Z=1 and Z=4
    const snap1 = vc.data.length;
    sliceMidOuter();
    const added1 = vc.data.length;
    for (let i = snap1; i < added1; i++) {
      const d = vc.data[i];
      vc.add(d.x / V, d.y / V, 4, d.color);
    }

    // Z=2 and Z=3
    const snap2 = vc.data.length;
    sliceCenter();
    const added2 = vc.data.length;
    for (let i = snap2; i < added2; i++) {
      const d = vc.data[i];
      vc.add(d.x / V, d.y / V, 3, d.color);
    }

    // ── Horizontal scale pattern (dark red stripes on body) ──
    for (const z of [1, 2, 3, 4]) {
      vc.row([2, 4, 6, 8], 3, z, RED_DARK);
      vc.row([3, 5, 7], 2, z, RED_DARK);
    }

    // ── Eyes (on outermost visible Z layers: z=0 and z=5) ──
    // Left eye (z=0 side) — 2 voxels tall
    vc.add(8, 3, -0.2, EYE_WHITE);
    vc.add(8, 2, -0.2, EYE_WHITE);
    // Right eye (z=5 side) — 2 voxels tall
    vc.add(8, 3, 5.2, EYE_WHITE);
    vc.add(8, 2, 5.2, EYE_WHITE);

    // ── Mouth (front, slightly open) ──
    vc.add(9, 1, 2, MOUTH);
    vc.add(9, 1, 3, MOUTH);

    // ── Whiskers / barbels (yellow, hanging down from mouth) ──
    vc.add(10, 1, 1, WHISKER);
    vc.add(10, 0, 1, WHISKER);
    vc.add(10, 1, 4, WHISKER);
    vc.add(10, 0, 4, WHISKER);

    // ── Dorsal crown / top fin (yellow crest) ──
    // Base row
    for (const x of [3, 4, 5, 6]) {
      for (const z of [2, 3]) {
        vc.add(x, 6, z, YELLOW);
      }
    }
    // Tips (narrower)
    for (const x of [4, 5]) {
      for (const z of [2, 3]) {
        vc.add(x, 7, z, YELLOW_DARK);
      }
    }

    // ── Pectoral fins (small yellow, on sides) ──
    // Left fin (z=-1)
    vc.add(5, 0, -1, YELLOW);
    vc.add(6, 0, -1, YELLOW);
    vc.add(5, -1, -1, YELLOW_DARK);
    vc.add(6, -1, -1, YELLOW_DARK);
    // Right fin (z=6)
    vc.add(5, 0, 6, YELLOW);
    vc.add(6, 0, 6, YELLOW);
    vc.add(5, -1, 6, YELLOW_DARK);
    vc.add(6, -1, 6, YELLOW_DARK);

    const group = vc.build(THREE, matProps);

    // Pupils (custom scale — added as individual meshes)
    const geo = _getSharedGeo(THREE, V);
    const pupilMat = new THREE.MeshStandardMaterial({ color: EYE_BLACK, roughness: 0.85, metalness: 0.0 });
    const pupilL = new THREE.Mesh(geo, pupilMat);
    pupilL.position.set(8 * V, 2.8 * V, -0.5 * V);
    pupilL.scale.set(0.7, 0.7, 0.4);
    group.add(pupilL);
    const pupilR = new THREE.Mesh(geo, pupilMat);
    pupilR.position.set(8 * V, 2.8 * V, 5.5 * V);
    pupilR.scale.set(0.7, 0.7, 0.4);
    group.add(pupilR);

    // ── Tail (separate group for animation) ──
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, V * 1.5, V * 2.5); // pivot at body rear center
    const TAIL_Y = 0xf0b010;
    const TAIL_Y_DARK = 0xd09000;

    // Tail fan shape — spreads out vertically
    const tailVc = new VoxelCollector(V);
    const tailVoxels = [
      // Connecting segment
      [-1, 2, 0, TAIL_Y], [-1, 1, 0, TAIL_Y], [-1, 0, 0, TAIL_Y], [-1, -1, 0, TAIL_Y],
      [-1, 2, 1, TAIL_Y], [-1, 1, 1, TAIL_Y], [-1, 0, 1, TAIL_Y], [-1, -1, 1, TAIL_Y],
      // Fan part (wider)
      [-2, 3, 0, TAIL_Y], [-2, 2, 0, TAIL_Y], [-2, 1, 0, TAIL_Y],
      [-2, 0, 0, TAIL_Y], [-2, -1, 0, TAIL_Y], [-2, -2, 0, TAIL_Y],
      [-2, 3, 1, TAIL_Y], [-2, 2, 1, TAIL_Y], [-2, 1, 1, TAIL_Y],
      [-2, 0, 1, TAIL_Y], [-2, -1, 1, TAIL_Y], [-2, -2, 1, TAIL_Y],
      // Outer tips
      [-3, 3, 0, TAIL_Y_DARK], [-3, -2, 0, TAIL_Y_DARK],
      [-3, 3, 1, TAIL_Y_DARK], [-3, -2, 1, TAIL_Y_DARK],
      [-3, 4, 0, TAIL_Y_DARK], [-3, -3, 0, TAIL_Y_DARK],
      [-3, 4, 1, TAIL_Y_DARK], [-3, -3, 1, TAIL_Y_DARK],
    ];
    for (const [x, y, z, color] of tailVoxels) {
      tailVc.add(x, y, z, color);
    }
    tailPivot.add(tailVc.build(THREE, matProps));
    group.add(tailPivot);
    this.fishTailPivot = tailPivot;

    // Center the voxel group so (0,0,0) aligns with the physics capsule center
    // Body voxels span roughly x:0..9, y:-2..5 -> center at ~(4.5, 1.5)
    group.position.set(-4.5 * V, -1.5 * V, -2.5 * V);
    group.scale.set(1.15, 1.15, 1.15);

    // Wrapper group: positioned at physics body, Y-rotated for 3D flip
    const wrapper = new this.THREE.Group();
    wrapper.add(group);

    this.fishGroup = wrapper;
    this.scene.add(wrapper);
    return wrapper;
  }

  // ── Build an enemy fish (dark/purple, Magikarp-style) ──
  buildEnemyFish() {
    const THREE = this.THREE;
    const V = 2;
    const vc = new VoxelCollector(V);

    // Colors
    const BODY = 0x662244;
    const BODY_DARK = 0x551133;
    const BODY_LIGHT = 0x773355;
    const BELLY = 0x998888;
    const BELLY_LIGHT = 0xaa9999;
    const FIN = 0x993366;
    const FIN_DARK = 0x772255;
    const EYE_RED = 0xff2222;

    // Z=0, Z=5 (outermost)
    const sliceOuter = (z) => {
      vc.row([3, 4, 5, 6], 3, z, BODY);
      vc.row([3, 4, 5, 6], 2, z, BODY_LIGHT);
      vc.row([4, 5], 1, z, BODY_LIGHT);
      vc.row([4, 5], 0, z, BELLY);
      vc.row([4, 5], -1, z, BELLY);
    };

    // Z=1, Z=4 (mid)
    const sliceMid = (z) => {
      vc.row([2, 3, 4, 5, 6, 7], 4, z, BODY);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8], 3, z, BODY);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8], 2, z, BODY_LIGHT);
      vc.row([2, 3, 4, 5, 6, 7, 8], 1, z, BODY_LIGHT);
      vc.row([2, 3, 4, 5, 6, 7, 8], 0, z, BELLY);
      vc.row([3, 4, 5, 6, 7], -1, z, BELLY);
      vc.row([4, 5, 6], -2, z, BELLY_LIGHT);
    };

    // Z=2, Z=3 (center)
    const sliceCenter = (z) => {
      vc.row([3, 4, 5, 6], 5, z, BODY_DARK);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8], 4, z, BODY);
      vc.row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 3, z, BODY);
      vc.row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 2, z, BODY_LIGHT);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8, 9], 1, z, BODY_LIGHT);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8, 9], 0, z, BELLY);
      vc.row([2, 3, 4, 5, 6, 7, 8], -1, z, BELLY);
      vc.row([3, 4, 5, 6, 7], -2, z, BELLY_LIGHT);
    };

    sliceOuter(0); sliceOuter(5);
    sliceMid(1); sliceMid(4);
    sliceCenter(2); sliceCenter(3);

    // Scale pattern
    for (const z of [1, 2, 3, 4]) {
      vc.row([2, 4, 6, 8], 3, z, BODY_DARK);
      vc.row([3, 5, 7], 2, z, BODY_DARK);
    }

    // Eyes (angry red) — 2 voxels tall
    vc.add(8, 3, -0.2, EYE_RED);
    vc.add(8, 2, -0.2, EYE_RED);
    vc.add(8, 3, 5.2, EYE_RED);
    vc.add(8, 2, 5.2, EYE_RED);

    // Spiky dorsal fin (reduced height)
    for (const x of [2, 3, 4, 5, 6, 7]) {
      for (const z of [2, 3]) {
        vc.add(x, 6, z, FIN);
      }
    }
    for (const x of [4, 5]) {
      for (const z of [2, 3]) {
        vc.add(x, 7, z, FIN_DARK);
      }
    }

    // Build merged body group
    const group = vc.build(THREE, { roughness: 0.85, metalness: 0.0 });

    // Tail (separate group for animation — also merged)
    const tailVc = new VoxelCollector(V);
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, V * 1.5, V * 2.5);
    const tailVoxels = [
      [-1, 2, 0], [-1, 1, 0], [-1, 0, 0], [-1, -1, 0],
      [-1, 2, 1], [-1, 1, 1], [-1, 0, 1], [-1, -1, 1],
      [-2, 3, 0], [-2, 2, 0], [-2, 1, 0], [-2, 0, 0], [-2, -1, 0], [-2, -2, 0],
      [-2, 3, 1], [-2, 2, 1], [-2, 1, 1], [-2, 0, 1], [-2, -1, 1], [-2, -2, 1],
      [-3, 3, 0], [-3, -2, 0], [-3, 4, 0], [-3, -3, 0],
      [-3, 3, 1], [-3, -2, 1], [-3, 4, 1], [-3, -3, 1],
    ];
    for (const [x, y, z] of tailVoxels) tailVc.add(x, y, z, FIN);
    const tailMerged = tailVc.build(THREE, { roughness: 0.85, metalness: 0.0 });
    tailPivot.add(tailMerged);
    group.add(tailPivot);

    // Center the voxel group on physics capsule center
    group.position.set(-4.5 * V, -1.5 * V, -2.5 * V);
    group.scale.set(1.15, 1.15, 1.15);

    // Wrapper group for Y-rotation (3D flip)
    const wrapper = new this.THREE.Group();
    wrapper.add(group);

    this.scene.add(wrapper);
    this.enemyGroups.push(wrapper);
    this.enemyTailPivots.push(tailPivot);
    return wrapper;
  }

  // ── Build shark enemy (chase fish — similar shape to enemy but blue-grey) ──
  buildShark() {
    const THREE = this.THREE;
    const V = 2;
    const vc = new VoxelCollector(V);

    const BODY = 0x445566;
    const BODY_DARK = 0x334455;
    const BODY_LIGHT = 0x556677;
    const BELLY = 0xcccccc;
    const BELLY_LIGHT = 0xdddddd;
    const FIN = 0x3a4f5f;
    const FIN_DARK = 0x2a3f4f;
    const EYE = 0x111111;
    const TEETH = 0xffffff;

    const sliceOuter = (z) => {
      vc.row([3, 4, 5, 6, 7], 3, z, BODY);
      vc.row([3, 4, 5, 6, 7], 2, z, BODY_LIGHT);
      vc.row([4, 5, 6], 1, z, BODY_LIGHT);
      vc.row([5, 6], 0, z, BELLY);
      vc.row([5, 6], -1, z, BELLY);
    };

    const sliceMid = (z) => {
      vc.row([2, 3, 4, 5, 6, 7, 8], 4, z, BODY);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8, 9], 3, z, BODY);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8, 9], 2, z, BODY_LIGHT);
      vc.row([2, 3, 4, 5, 6, 7, 8, 9], 1, z, BODY_LIGHT);
      vc.row([3, 4, 5, 6, 7, 8, 9], 0, z, BELLY);
      vc.row([4, 5, 6, 7, 8], -1, z, BELLY);
      vc.row([5, 6, 7], -2, z, BELLY_LIGHT);
    };

    const sliceCenter = (z) => {
      vc.row([3, 4, 5, 6, 7], 5, z, BODY_DARK);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8, 9], 4, z, BODY);
      vc.row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, z, BODY);
      vc.row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2, z, BODY_LIGHT);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1, z, BODY_LIGHT);
      vc.row([2, 3, 4, 5, 6, 7, 8, 9, 10], 0, z, BELLY);
      vc.row([3, 4, 5, 6, 7, 8], -1, z, BELLY);
      vc.row([4, 5, 6, 7], -2, z, BELLY_LIGHT);
    };

    sliceOuter(0); sliceOuter(5);
    sliceMid(1); sliceMid(4);
    sliceCenter(2); sliceCenter(3);

    // Pointed snout
    for (const z of [2, 3]) {
      vc.add(11, 2, z, BODY_LIGHT);
      vc.add(11, 1, z, BELLY);
    }

    // Teeth at front
    for (const z of [2, 3]) {
      vc.add(10, -1, z, TEETH);
      vc.add(11, 0, z, TEETH);
    }

    // Eyes
    vc.add(9, 3, -0.2, EYE);
    vc.add(9, 2, -0.2, EYE);
    vc.add(9, 3, 5.2, EYE);
    vc.add(9, 2, 5.2, EYE);

    // Tall dorsal fin
    for (const x of [3, 4, 5, 6]) {
      for (const z of [2, 3]) {
        vc.add(x, 6, z, FIN);
        vc.add(x, 7, z, FIN_DARK);
      }
    }
    for (const z of [2, 3]) {
      vc.add(4, 8, z, FIN_DARK);
      vc.add(5, 8, z, FIN_DARK);
    }

    const group = vc.build(THREE, { roughness: 0.8, metalness: 0.1 });

    // Tail (merged)
    const tailVc = new VoxelCollector(V);
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, V * 1.5, V * 2.5);
    const tailVoxels = [
      [-1, 2, 0], [-1, 1, 0], [-1, 0, 0], [-1, -1, 0],
      [-1, 2, 1], [-1, 1, 1], [-1, 0, 1], [-1, -1, 1],
      [-2, 3, 0], [-2, 2, 0], [-2, 1, 0], [-2, 0, 0], [-2, -1, 0], [-2, -2, 0],
      [-2, 3, 1], [-2, 2, 1], [-2, 1, 1], [-2, 0, 1], [-2, -1, 1], [-2, -2, 1],
      [-3, 4, 0], [-3, 3, 0], [-3, -2, 0], [-3, -3, 0],
      [-3, 4, 1], [-3, 3, 1], [-3, -2, 1], [-3, -3, 1],
    ];
    for (const [x, y, z] of tailVoxels) tailVc.add(x, y, z, FIN);
    tailPivot.add(tailVc.build(THREE, { roughness: 0.8, metalness: 0.1 }));
    group.add(tailPivot);

    group.position.set(-5 * V, -1.5 * V, -2.5 * V);
    group.scale.set(1.2, 1.2, 1.2);

    const wrapper = new this.THREE.Group();
    wrapper.add(group);
    this.scene.add(wrapper);
    this.sharkGroups.push(wrapper);
    this.sharkTailPivots.push(tailPivot);
    return wrapper;
  }

  // ── Build pufferfish enemy (round, spiky, moves up-down) ──
  buildPufferfish() {
    const THREE = this.THREE;
    const V = 2;
    const vc = new VoxelCollector(V);

    const BODY = 0xccaa44;
    const BODY_LIGHT = 0xddbb55;
    const BELLY = 0xeedd88;
    const SPIKE = 0xddcc66;
    const EYE = 0x222222;
    const EYE_WHITE = 0xffffff;

    const sliceOuter = (z) => {
      vc.row([2, 3, 4], 3, z, BODY);
      vc.row([1, 2, 3, 4, 5], 2, z, BODY);
      vc.row([1, 2, 3, 4, 5], 1, z, BODY_LIGHT);
      vc.row([2, 3, 4], 0, z, BELLY);
    };

    const sliceMid = (z) => {
      vc.row([1, 2, 3, 4, 5], 4, z, BODY);
      vc.row([0, 1, 2, 3, 4, 5, 6], 3, z, BODY);
      vc.row([0, 1, 2, 3, 4, 5, 6], 2, z, BODY);
      vc.row([0, 1, 2, 3, 4, 5, 6], 1, z, BODY_LIGHT);
      vc.row([1, 2, 3, 4, 5], 0, z, BELLY);
      vc.row([2, 3, 4], -1, z, BELLY);
    };

    const sliceCenter = (z) => {
      vc.row([2, 3, 4], 5, z, BODY);
      vc.row([1, 2, 3, 4, 5], 4, z, BODY);
      vc.row([0, 1, 2, 3, 4, 5, 6], 3, z, BODY);
      vc.row([0, 1, 2, 3, 4, 5, 6], 2, z, BODY);
      vc.row([0, 1, 2, 3, 4, 5, 6], 1, z, BODY_LIGHT);
      vc.row([1, 2, 3, 4, 5], 0, z, BELLY);
      vc.row([2, 3, 4], -1, z, BELLY);
    };

    sliceOuter(0); sliceOuter(5);
    sliceMid(1); sliceMid(4);
    sliceCenter(2); sliceCenter(3);

    // Spikes
    const spikePositions = [
      [3, 6, 2], [3, 6, 3], [3, -2, 2], [3, -2, 3],
      [-1, 2, 2], [-1, 2, 3], [7, 2, 2], [7, 2, 3],
      [5, 5, 1], [1, 5, 4], [5, -1, 1], [1, -1, 4],
      [-1, 3, 1], [-1, 1, 4], [7, 3, 4], [7, 1, 1],
      [3, 5, -1], [3, 5, 6], [3, -1, -1], [3, -1, 6],
    ];
    for (const [x, y, z] of spikePositions) vc.add(x, y, z, SPIKE);

    // Eyes
    vc.add(5, 3, -0.3, EYE_WHITE);
    vc.add(5, 2, -0.3, EYE_WHITE);
    vc.add(5, 3, -0.6, EYE);
    vc.add(5, 3, 5.3, EYE_WHITE);
    vc.add(5, 2, 5.3, EYE_WHITE);
    vc.add(5, 3, 5.6, EYE);

    // Small tail fin
    vc.add(-1, 3, 2, BODY); vc.add(-1, 3, 3, BODY);
    vc.add(-1, 2, 2, BODY); vc.add(-1, 2, 3, BODY);
    vc.add(-2, 3, 2, BODY); vc.add(-2, 2, 3, BODY);

    const group = vc.build(THREE, { roughness: 0.9, metalness: 0.0 });
    group.position.set(-3 * V, -2 * V, -2.5 * V);
    group.scale.set(1.32, 1.32, 1.32);

    const wrapper = new this.THREE.Group();
    wrapper.add(group);
    this.scene.add(wrapper);
    this.pufferfishGroups.push(wrapper);
    return wrapper;
  }

  // ── Build crab enemy (walks on ground, pushes player) ──
  buildCrab() {
    const THREE = this.THREE;
    const V = 2;
    const vc = new VoxelCollector(V);

    const SHELL = 0xcc3322;
    const SHELL_DARK = 0xaa2211;
    const SHELL_LIGHT = 0xdd4433;
    const BELLY = 0xeeaa77;
    const CLAW = 0xdd4433;
    const CLAW_TIP = 0xffccaa;
    const EYE = 0x111111;
    const EYE_STALK = 0xcc4422;

    const sliceOuter = (z) => {
      vc.row([2, 3, 4, 5], 2, z, SHELL);
      vc.row([2, 3, 4, 5], 1, z, SHELL_LIGHT);
      vc.row([3, 4], 0, z, BELLY);
    };

    const sliceMid = (z) => {
      vc.row([1, 2, 3, 4, 5, 6], 3, z, SHELL);
      vc.row([1, 2, 3, 4, 5, 6], 2, z, SHELL);
      vc.row([1, 2, 3, 4, 5, 6], 1, z, SHELL_LIGHT);
      vc.row([2, 3, 4, 5], 0, z, BELLY);
    };

    const sliceCenter = (z) => {
      vc.row([1, 2, 3, 4, 5, 6], 3, z, SHELL_DARK);
      vc.row([0, 1, 2, 3, 4, 5, 6, 7], 2, z, SHELL);
      vc.row([0, 1, 2, 3, 4, 5, 6, 7], 1, z, SHELL_LIGHT);
      vc.row([1, 2, 3, 4, 5, 6], 0, z, BELLY);
    };

    sliceOuter(0); sliceOuter(5);
    sliceMid(1); sliceMid(4);
    sliceCenter(2); sliceCenter(3);

    // Eye stalks
    vc.add(5, 4, 1, EYE_STALK); vc.add(5, 5, 1, EYE);
    vc.add(5, 4, 4, EYE_STALK); vc.add(5, 5, 4, EYE);

    // Claws — left
    vc.add(6, 2, -1, CLAW); vc.add(7, 2, -1, CLAW); vc.add(7, 3, -1, CLAW);
    vc.add(8, 2, -1, CLAW_TIP); vc.add(8, 3, -1, CLAW_TIP);

    // Claws — right
    vc.add(6, 2, 6, CLAW); vc.add(7, 2, 6, CLAW); vc.add(7, 3, 6, CLAW);
    vc.add(8, 2, 6, CLAW_TIP); vc.add(8, 3, 6, CLAW_TIP);

    // Legs
    for (const z of [1, 2, 3, 4]) {
      vc.add(0, -1, z, SHELL_DARK);
      vc.add(7, -1, z, SHELL_DARK);
    }

    const group = vc.build(THREE, { roughness: 0.85, metalness: 0.05 });
    group.position.set(-3.5 * V, -1 * V, -2.5 * V);
    group.scale.set(1.1, 1.1, 1.1);

    const wrapper = new this.THREE.Group();
    wrapper.add(group);
    this.scene.add(wrapper);
    this.crabGroups.push(wrapper);
    return wrapper;
  }

  // ── Build toxic fish enemy (ranged attacker — green/purple fish) ──
  buildToxicFish() {
    const THREE = this.THREE;
    const V = 2;
    const vc = new VoxelCollector(V);

    const BODY = 0x336644;
    const BODY_DARK = 0x225533;
    const BODY_LIGHT = 0x447755;
    const BELLY = 0x88aa77;
    const BELLY_LIGHT = 0x99bb88;
    const FIN = 0x664488;
    const FIN_DARK = 0x553377;
    const EYE = 0xcc33ff;
    const SPOT = 0x9944cc;

    const sliceOuter = (z) => {
      vc.row([3, 4, 5, 6], 3, z, BODY);
      vc.row([3, 4, 5, 6], 2, z, BODY_LIGHT);
      vc.row([4, 5], 1, z, BODY_LIGHT);
      vc.row([4, 5], 0, z, BELLY);
      vc.row([4, 5], -1, z, BELLY);
    };

    const sliceMid = (z) => {
      vc.row([2, 3, 4, 5, 6, 7], 4, z, BODY);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8], 3, z, BODY);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8], 2, z, BODY_LIGHT);
      vc.row([2, 3, 4, 5, 6, 7, 8], 1, z, BODY_LIGHT);
      vc.row([2, 3, 4, 5, 6, 7, 8], 0, z, BELLY);
      vc.row([3, 4, 5, 6, 7], -1, z, BELLY);
      vc.row([4, 5, 6], -2, z, BELLY_LIGHT);
    };

    const sliceCenter = (z) => {
      vc.row([3, 4, 5, 6], 5, z, BODY_DARK);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8], 4, z, BODY);
      vc.row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 3, z, BODY);
      vc.row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 2, z, BODY_LIGHT);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8, 9], 1, z, BODY_LIGHT);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8, 9], 0, z, BELLY);
      vc.row([2, 3, 4, 5, 6, 7, 8], -1, z, BELLY);
      vc.row([3, 4, 5, 6, 7], -2, z, BELLY_LIGHT);
    };

    sliceOuter(0); sliceOuter(5);
    sliceMid(1); sliceMid(4);
    sliceCenter(2); sliceCenter(3);

    // Purple toxic spots
    for (const z of [1, 2, 3, 4]) {
      vc.row([3, 5, 7], 3, z, SPOT);
      vc.row([2, 6], 2, z, SPOT);
    }

    // Glowing purple eyes
    vc.add(8, 3, -0.2, EYE); vc.add(8, 2, -0.2, EYE);
    vc.add(8, 3, 5.2, EYE); vc.add(8, 2, 5.2, EYE);

    // Spiny dorsal fin
    for (const x of [2, 3, 4, 5, 6, 7]) {
      for (const z of [2, 3]) vc.add(x, 6, z, FIN);
    }
    for (const x of [4, 5]) {
      for (const z of [2, 3]) vc.add(x, 7, z, FIN_DARK);
    }

    const group = vc.build(THREE, { roughness: 0.85, metalness: 0.0 });

    // Tail (merged)
    const tailVc = new VoxelCollector(V);
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, V * 1.5, V * 2.5);
    const tailVoxels = [
      [-1, 2, 0], [-1, 1, 0], [-1, 0, 0], [-1, -1, 0],
      [-1, 2, 1], [-1, 1, 1], [-1, 0, 1], [-1, -1, 1],
      [-2, 3, 0], [-2, 2, 0], [-2, 1, 0], [-2, 0, 0], [-2, -1, 0], [-2, -2, 0],
      [-2, 3, 1], [-2, 2, 1], [-2, 1, 1], [-2, 0, 1], [-2, -1, 1], [-2, -2, 1],
      [-3, 3, 0], [-3, -2, 0], [-3, 4, 0], [-3, -3, 0],
      [-3, 3, 1], [-3, -2, 1], [-3, 4, 1], [-3, -3, 1],
    ];
    for (const [x, y, z] of tailVoxels) tailVc.add(x, y, z, FIN);
    tailPivot.add(tailVc.build(THREE, { roughness: 0.85, metalness: 0.0 }));
    group.add(tailPivot);

    group.position.set(-4.5 * V, -1.5 * V, -2.5 * V);
    group.scale.set(1.15, 1.15, 1.15);

    const wrapper = new this.THREE.Group();
    wrapper.add(group);
    this.scene.add(wrapper);
    this.toxicFishGroups.push(wrapper);
    this.toxicFishTailPivots.push(tailPivot);
    return wrapper;
  }

  // ── Build armored fish enemy (dark metallic, thicker body, smaller fins) ──
  buildArmoredFish() {
    const THREE = this.THREE;
    const V = 2;
    const vc = new VoxelCollector(V);
    const matProps = { roughness: 0.4, metalness: 0.5 };

    const ARMOR = 0x556677;
    const ARMOR_DARK = 0x3a4a5a;
    const ARMOR_LIGHT = 0x6a7a8a;
    const BELLY = 0x778888;
    const BELLY_LIGHT = 0x8a9a9a;
    const FIN = 0x445566;
    const FIN_DARK = 0x334455;
    const EYE_WHITE = 0xccdddd;
    const EYE_DARK = 0x881111;

    // Thicker body slices (wider than piranha)
    const sliceOuter = (z) => {
      vc.row([3, 4, 5, 6, 7], 3, z, ARMOR);
      vc.row([3, 4, 5, 6, 7], 2, z, ARMOR_LIGHT);
      vc.row([4, 5, 6], 1, z, ARMOR_LIGHT);
      vc.row([4, 5, 6], 0, z, BELLY);
      vc.row([4, 5], -1, z, BELLY);
    };

    const sliceMid = (z) => {
      vc.row([2, 3, 4, 5, 6, 7, 8], 4, z, ARMOR);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8, 9], 3, z, ARMOR);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8, 9], 2, z, ARMOR_LIGHT);
      vc.row([2, 3, 4, 5, 6, 7, 8, 9], 1, z, ARMOR_LIGHT);
      vc.row([2, 3, 4, 5, 6, 7, 8], 0, z, BELLY);
      vc.row([3, 4, 5, 6, 7], -1, z, BELLY);
      vc.row([4, 5, 6], -2, z, BELLY_LIGHT);
    };

    const sliceCenter = (z) => {
      vc.row([3, 4, 5, 6, 7], 5, z, ARMOR_DARK);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8, 9], 4, z, ARMOR);
      vc.row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, z, ARMOR);
      vc.row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2, z, ARMOR_LIGHT);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1, z, ARMOR_LIGHT);
      vc.row([1, 2, 3, 4, 5, 6, 7, 8, 9], 0, z, BELLY);
      vc.row([2, 3, 4, 5, 6, 7, 8], -1, z, BELLY);
      vc.row([3, 4, 5, 6, 7], -2, z, BELLY_LIGHT);
    };

    // Build body — 6 slices deep for thicker profile
    sliceOuter(-1); sliceOuter(6);
    sliceMid(0); sliceMid(5);
    sliceCenter(1); sliceCenter(2); sliceCenter(3); sliceCenter(4);

    // Armored scale plates (darker patches on top)
    for (const z of [0, 1, 2, 3, 4, 5]) {
      vc.row([3, 5, 7, 9], 4, z, ARMOR_DARK);
      vc.row([2, 4, 6, 8], 3, z, ARMOR_DARK);
    }

    // Small eyes (menacing, set deeper)
    vc.add(9, 3, -0.5, EYE_WHITE);
    vc.add(9, 2, -0.5, EYE_DARK);
    vc.add(9, 3, 5.5, EYE_WHITE);
    vc.add(9, 2, 5.5, EYE_DARK);

    // Small dorsal fin (shorter than piranha — armored fish has compact build)
    for (const x of [4, 5, 6]) {
      for (const z of [2, 3]) {
        vc.add(x, 6, z, FIN);
      }
    }

    const group = vc.build(THREE, matProps);

    // Tail (compact)
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, V * 1.5, V * 2.5);
    const tailVc = new VoxelCollector(V);
    const tailVoxels = [
      [-1, 2, 0], [-1, 1, 0], [-1, 0, 0], [-1, -1, 0],
      [-1, 2, 1], [-1, 1, 1], [-1, 0, 1], [-1, -1, 1],
      [-2, 3, 0], [-2, 2, 0], [-2, 1, 0], [-2, 0, 0], [-2, -1, 0], [-2, -2, 0],
      [-2, 3, 1], [-2, 2, 1], [-2, 1, 1], [-2, 0, 1], [-2, -1, 1], [-2, -2, 1],
      [-3, 3, 0], [-3, -2, 0],
      [-3, 3, 1], [-3, -2, 1],
    ];
    for (const [x, y, z] of tailVoxels) tailVc.add(x, y, z, FIN_DARK);
    tailPivot.add(tailVc.build(THREE, matProps));
    group.add(tailPivot);

    group.position.set(-5 * V, -1.5 * V, -2.5 * V);
    group.scale.set(1.2, 1.2, 1.2);

    const wrapper = new this.THREE.Group();
    wrapper.add(group);
    this.scene.add(wrapper);
    this.armoredFishGroups.push(wrapper);
    this.armoredFishTailPivots.push(tailPivot);
    return wrapper;
  }

  // ── Build spitting coral (ground-fixed polyp enemy) ──
  buildSpittingCoral() {
    const THREE = this.THREE;
    const V = 2;
    const vc = new VoxelCollector(V);
    const matProps = { roughness: 0.7, metalness: 0.1 };

    const BASE = 0x554433;
    const BASE_DARK = 0x443322;
    const TUBE = 0x884466;
    const TUBE_DARK = 0x663355;
    const TUBE_LIGHT = 0xaa5577;
    const TIP = 0xdd77aa;
    const TIP_GLOW = 0xff99cc;
    const SPOT = 0x55aa66;

    // Rocky base (wide, flat)
    for (const z of [0, 1, 2, 3, 4]) {
      vc.row([1, 2, 3, 4, 5, 6, 7, 8], 0, z, BASE);
      vc.row([2, 3, 4, 5, 6, 7], -1, z, BASE_DARK);
    }

    // Left tube (x=2-3, z=1-3)
    for (const z of [1, 2, 3]) {
      vc.row([2, 3], 1, z, TUBE);
      vc.row([2, 3], 2, z, TUBE);
      vc.row([2, 3], 3, z, TUBE_LIGHT);
      vc.row([2, 3], 4, z, TIP);
    }
    // Left tube tip
    for (const z of [1, 2, 3]) {
      vc.row([2, 3], 5, z, TIP_GLOW);
    }

    // Center tube (x=4-5, z=1-3) — tallest
    for (const z of [1, 2, 3]) {
      vc.row([4, 5], 1, z, TUBE);
      vc.row([4, 5], 2, z, TUBE);
      vc.row([4, 5], 3, z, TUBE_DARK);
      vc.row([4, 5], 4, z, TUBE);
      vc.row([4, 5], 5, z, TUBE_LIGHT);
      vc.row([4, 5], 6, z, TIP);
    }
    // Center tube tip (the "mouth")
    for (const z of [1, 2, 3]) {
      vc.row([4, 5], 7, z, TIP_GLOW);
    }

    // Right tube (x=6-7, z=1-3)
    for (const z of [1, 2, 3]) {
      vc.row([6, 7], 1, z, TUBE);
      vc.row([6, 7], 2, z, TUBE);
      vc.row([6, 7], 3, z, TUBE_LIGHT);
      vc.row([6, 7], 4, z, TIP);
    }
    // Right tube tip
    for (const z of [1, 2, 3]) {
      vc.row([6, 7], 5, z, TIP_GLOW);
    }

    // Green toxic spots on tubes
    for (const z of [2]) {
      vc.add(3, 2, z, SPOT);
      vc.add(5, 3, z, SPOT);
      vc.add(7, 2, z, SPOT);
    }

    const group = vc.build(THREE, matProps);
    group.position.set(-4.5 * V, -1 * V, -2 * V);

    const wrapper = new this.THREE.Group();
    wrapper.add(group);
    this.scene.add(wrapper);
    this.spittingCoralGroups.push(wrapper);
    return wrapper;
  }

  // ── Build poison projectile mesh ──
  buildProjectile(body, isCoral = false) {
    const THREE = this.THREE;
    const geo = new THREE.BoxGeometry(6, 6, 6);
    const color = isCoral ? 0xcc44ff : 0x88ff00;
    const emissive = isCoral ? 0x8822cc : 0x44cc00;
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: 0.6,
      roughness: 0.4,
      metalness: 0.0,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(body.position.x, -body.position.y, 0);
    this.scene.add(mesh);
    this.projectileMeshes.push({ mesh, body });
    return mesh;
  }

  // ── Build pearl collectible meshes ──
  buildPearls(pearlBodies) {
    // Clean up existing pearl meshes before rebuilding
    for (const p of this.pearlMeshes) {
      this.scene.remove(p.mesh);
      if (p.mesh.geometry) p.mesh.geometry.dispose();
      if (p.mesh.material) p.mesh.material.dispose();
    }
    this.pearlMeshes.length = 0;

    const THREE = this.THREE;
    const pearlGeo = new THREE.BoxGeometry(10, 10, 10);
    const pearlMat = new THREE.MeshStandardMaterial({
      color: 0xfff0c0,
      emissive: 0xffd93d,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.4,
    });

    for (const body of pearlBodies) {
      const mesh = new THREE.Mesh(pearlGeo, pearlMat.clone());
      mesh.position.set(body.position.x, -body.position.y, 0);
      this.scene.add(mesh);
      this.pearlMeshes.push({ mesh, body });
    }
  }

  // ── Build a single pearl at runtime (e.g. from opened chest) ──
  buildPearlAt(body) {
    const THREE = this.THREE;
    const pearlGeo = new THREE.BoxGeometry(10, 10, 10);
    const pearlMat = new THREE.MeshStandardMaterial({
      color: 0xfff0c0,
      emissive: 0xffd93d,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.4,
    });
    const mesh = new THREE.Mesh(pearlGeo, pearlMat);
    mesh.position.set(body.position.x, -body.position.y, 0);
    this.scene.add(mesh);
    this.pearlMeshes.push({ mesh, body });
  }

  // ── Build buoy meshes ──
  buildBuoys(buoyBodies) {
    const THREE = this.THREE;
    const V = 3; // voxel size

    for (const body of buoyBodies) {
      const vc = new VoxelCollector(V);

      // Buoy colors
      const RED = 0xcc2222;
      const RED_DARK = 0x991111;
      const WHITE = 0xeeeeee;
      const WHITE_DARK = 0xcccccc;
      const RING = 0xffcc00;

      // Bottom half (underwater, white)
      for (let z = -2; z <= 2; z++) {
        for (let x = -2; x <= 2; x++) {
          if (Math.abs(x) === 2 && Math.abs(z) === 2) continue; // round corners
          vc.add(x, -3, z, WHITE_DARK);
          vc.add(x, -2, z, WHITE);
        }
      }
      // Yellow ring at waterline
      for (let z = -3; z <= 3; z++) {
        for (let x = -3; x <= 3; x++) {
          if (Math.abs(x) === 3 && Math.abs(z) === 3) continue;
          if (Math.abs(x) <= 1 && Math.abs(z) <= 1) continue; // hollow center
          vc.add(x, -1, z, RING);
        }
      }
      // Top half (above water, red)
      for (let z = -2; z <= 2; z++) {
        for (let x = -2; x <= 2; x++) {
          if (Math.abs(x) === 2 && Math.abs(z) === 2) continue;
          vc.add(x, 0, z, RED);
          vc.add(x, 1, z, RED);
          vc.add(x, 2, z, RED_DARK);
        }
      }
      // Tip
      for (let z = -1; z <= 1; z++) {
        for (let x = -1; x <= 1; x++) {
          vc.add(x, 3, z, RED_DARK);
        }
      }
      vc.add(0, 4, 0, RED_DARK);

      const group = vc.build(THREE, { roughness: 0.7, metalness: 0.1 });
      group.position.set(body.position.x, -body.position.y, 0);
      this.scene.add(group);
      this.buoyMeshes.push({ mesh: group, body });
    }
  }

  // ── Restore visibility for all enemy/creature meshes after restart ──
  resetEnemyVisibility() {
    for (const g of this.enemyGroups) g.visible = true;
    for (const g of this.sharkGroups) g.visible = true;
    for (const g of this.pufferfishGroups) g.visible = true;
    for (const g of this.crabGroups) g.visible = true;
    for (const g of this.toxicFishGroups) g.visible = true;
    for (const g of this.armoredFishGroups) g.visible = true;
    for (const g of this.spittingCoralGroups) g.visible = true;
  }

  // ── Build boulder meshes ──
  buildBoulders(boulderBodies) {
    // Clean up existing boulder meshes before rebuilding
    for (const b of this.boulderMeshes) {
      this.scene.remove(b.mesh);
    }
    this.boulderMeshes.length = 0;

    const THREE = this.THREE;
    const V = 2;

    for (const body of boulderBodies) {
      const vc = new VoxelCollector(V);

      // Rock colors — mossy gray
      const ROCK = 0x666677;
      const ROCK_DARK = 0x555566;
      const ROCK_LIGHT = 0x778888;
      const MOSS = 0x556644;

      // Seed for this boulder
      const seed = body.position.x * 7 + body.position.y * 13;
      const rng = (i) => {
        const x = Math.sin(seed + i * 9871) * 43758.5453;
        return x - Math.floor(x);
      };

      // Roughly spherical boulder shape
      let idx = 0;
      for (let y = -3; y <= 3; y++) {
        const r = y === -3 || y === 3 ? 1.5 : y === -2 || y === 2 ? 3 : 3.5;
        for (let x = -4; x <= 4; x++) {
          for (let z = -3; z <= 3; z++) {
            const dist = Math.sqrt(x * x + z * z);
            if (dist > r + 0.5) continue;
            const rv = rng(idx++);
            let color = rv < 0.15 ? MOSS : rv < 0.4 ? ROCK_DARK : rv < 0.7 ? ROCK : ROCK_LIGHT;
            vc.add(x, y, z, color);
          }
        }
      }

      const group = vc.build(THREE, { roughness: 0.95, metalness: 0.0 });
      group.position.set(body.position.x, -body.position.y, 0);
      this.scene.add(group);
      this.boulderMeshes.push({ mesh: group, body });
    }
  }

  // ── Build crate meshes (wooden boxes) ──
  buildCrates(crateBodies) {
    for (const c of this.crateMeshes) this.scene.remove(c.mesh);
    this.crateMeshes.length = 0;

    const THREE = this.THREE;
    const V = 3; // voxel size — larger for chunkier crate

    for (const body of crateBodies) {
      const vc = new VoxelCollector(V);

      const WOOD = 0x8B6914;
      const WOOD_DARK = 0x6B4914;
      const WOOD_LIGHT = 0xA07828;
      const METAL = 0x888888;

      // Seed for variation
      const seed = body.position.x * 7 + body.position.y * 13;
      const rng = (i) => {
        const x = Math.sin(seed + i * 9871) * 43758.5453;
        return x - Math.floor(x);
      };

      // Box shape: 9×9×5 voxels (wider than deep for a chunky crate look)
      let idx = 0;
      for (let y = -4; y <= 4; y++) {
        for (let x = -4; x <= 4; x++) {
          for (let z = -2; z <= 2; z++) {
            // Only shell (faces of the box) + some interior for lid/bottom
            const isEdgeX = x === -4 || x === 4;
            const isEdgeY = y === -4 || y === 4;
            const isEdgeZ = z === -2 || z === 2;
            if (!isEdgeX && !isEdgeY && !isEdgeZ) continue;

            const rv = rng(idx++);
            let color;
            // Metal bands: horizontal stripes at y=0 and corners
            if (y === 0 && (isEdgeX || isEdgeZ)) {
              color = METAL;
            } else if (isEdgeX && isEdgeZ) {
              color = METAL;
            } else {
              color = rv < 0.3 ? WOOD_DARK : rv < 0.7 ? WOOD : WOOD_LIGHT;
            }
            vc.add(x, y, z, color);
          }
        }
      }

      const group = vc.build(THREE, { roughness: 0.8, metalness: 0.05 });
      group.position.set(body.position.x, -body.position.y, 0);
      this.scene.add(group);
      this.crateMeshes.push({ mesh: group, body });
    }
  }

  // ── Build breakable wall meshes (cracked stone blocks) ──
  buildBreakableWalls(breakableWallBodies) {
    for (const w of this.breakableWallMeshes) this.scene.remove(w.mesh);
    this.breakableWallMeshes.length = 0;

    const THREE = this.THREE;
    const V = 3; // voxel size

    for (const body of breakableWallBodies) {
      const vc = new VoxelCollector(V);

      const STONE_BASE = 0x8a8a9a;
      const STONE_DARK = 0x6a6a7a;
      const CRACK_COLOR = 0x3a3a4a;
      const STONE_LIGHT = 0x9a9aaa;

      // Seed for variation
      const seed = body.position.x * 7 + body.position.y * 13;
      const rng = (i) => {
        const x = Math.sin(seed + i * 9871) * 43758.5453;
        return x - Math.floor(x);
      };

      // Block shape: 11×11×5 voxels (fills ~32px tile, same as stone)
      let idx = 0;
      for (let y = -5; y <= 5; y++) {
        for (let x = -5; x <= 5; x++) {
          for (let z = -2; z <= 2; z++) {
            // Shell only
            const isEdgeX = x === -5 || x === 5;
            const isEdgeY = y === -5 || y === 5;
            const isEdgeZ = z === -2 || z === 2;
            if (!isEdgeX && !isEdgeY && !isEdgeZ) continue;

            const rv = rng(idx++);
            let color;
            // Crack lines: vertical and diagonal patterns
            const isCrack = (x === 0 && z === 0) ||
              (x === -3 && y === 2) ||
              (x === 3 && y === -2) ||
              (x === 1 && y === 4) ||
              (x === -1 && y === -3) ||
              (isEdgeX && isEdgeZ);
            if (isCrack) {
              color = CRACK_COLOR;
            } else {
              color = rv < 0.3 ? STONE_DARK : rv < 0.8 ? STONE_BASE : STONE_LIGHT;
            }
            vc.add(x, y, z, color);
          }
        }
      }

      const group = vc.build(THREE, { roughness: 0.95, metalness: 0.0 });
      group.position.set(body.position.x, -body.position.y, 0);
      this.scene.add(group);
      this.breakableWallMeshes.push({ mesh: group, body });
    }
  }

  // ── Build switch meshes ──
  // Toggle/Pressure: flat pad with rising center button
  // Timed: base block with lever arm that tilts
  buildSwitches(switchBodies) {
    for (const s of this.switchMeshes) this.scene.remove(s.mesh);
    this.switchMeshes.length = 0;

    const THREE = this.THREE;
    const V = 3;

    const COLORS = {
      toggle:   { base: 0x22aa44, glow: 0x44ff66, dark: 0x116622 },  // green
      pressure: { base: 0x3366cc, glow: 0x5588ff, dark: 0x224488 },  // blue
      timed:    { base: 0xcc8822, glow: 0xffaa44, dark: 0x885511 },  // orange
    };

    for (const sw of switchBodies) {
      const group = new THREE.Group();
      const c = COLORS[sw.type] || COLORS.pressure;

      if (sw.type === 'timed') {
        // ── Timed switch: same-size base as other switches, with lever arm ──
        // Base platform (same 8×6 as toggle/pressure)
        for (let x = -4; x <= 3; x++) {
          for (let z = -3; z <= 2; z++) {
            const isEdge = x === -4 || x === 3 || z === -3 || z === 2;
            const geo = new THREE.BoxGeometry(V, V * 1.5, V);
            const mat = new THREE.MeshStandardMaterial({
              color: isEdge ? c.dark : c.base,
              roughness: 0.5, metalness: 0.3,
            });
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x * V, 0, z * V);
            group.add(m);
          }
        }

        // Lever arm (pivot at base surface, arm extends upward after +90° Z rotation)
        const leverPivot = new THREE.Group();
        leverPivot.position.set(0, V * 0.75, 0); // at top surface of base

        const leverLen = V * 7;
        const leverGeo = new THREE.BoxGeometry(leverLen, V * 1, V * 1.5);
        const leverMat = new THREE.MeshStandardMaterial({
          color: c.glow, roughness: 0.3, metalness: 0.5,
          emissive: c.glow, emissiveIntensity: 0.3,
        });
        const leverMesh = new THREE.Mesh(leverGeo, leverMat);
        leverMesh.position.set(leverLen / 2, 0, 0); // bottom of arm at pivot, extends up
        leverPivot.add(leverMesh);

        // Handle ball at the tip of the lever arm
        const ballGeo = new THREE.BoxGeometry(V * 2, V * 2, V * 2);
        const ballMat = new THREE.MeshStandardMaterial({ color: c.glow, roughness: 0.2, metalness: 0.6 });
        const ballMesh = new THREE.Mesh(ballGeo, ballMat);
        ballMesh.position.set(leverLen, 0, 0); // at the very end of the arm
        leverPivot.add(ballMesh);

        // Start tilted right (inactive position), +PI/2 to orient arm upward on screen
        leverPivot.rotation.z = -0.5 + Math.PI / 2;

        group.add(leverPivot);

        group.position.set(sw.body.position.x, -sw.body.position.y, 0);
        this.scene.add(group);
        this.switchMeshes.push({
          mesh: group, body: sw.body, type: sw.type,
          padMesh: null, leverPivot, switchRef: sw,
        });
      } else {
        // ── Toggle / Pressure: flat pad with center button ──
        // Base platform (taller for visible press effect)
        for (let x = -4; x <= 3; x++) {
          for (let z = -3; z <= 2; z++) {
            const isEdge = x === -4 || x === 3 || z === -3 || z === 2;
            const geo = new THREE.BoxGeometry(V, V * 1.5, V);
            const mat = new THREE.MeshStandardMaterial({
              color: isEdge ? c.dark : c.base,
              roughness: 0.5, metalness: 0.3,
            });
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x * V, 0, z * V);
            group.add(m);
          }
        }

        // Center button (raised when inactive, sinks into base when active)
        const padGeo = new THREE.BoxGeometry(V * 4, V * 2, V * 3);
        const padMat = new THREE.MeshStandardMaterial({
          color: c.glow, roughness: 0.2, metalness: 0.5,
          emissive: c.glow, emissiveIntensity: 0.3,
        });
        const padMesh = new THREE.Mesh(padGeo, padMat);
        padMesh.position.set(-V * 0.5, V * 2, -V * 0.5); // raised by default
        group.add(padMesh);

        group.position.set(sw.body.position.x, -sw.body.position.y, 0);
        this.scene.add(group);
        this.switchMeshes.push({
          mesh: group, body: sw.body, type: sw.type,
          padMesh, leverPivot: null, switchRef: sw,
        });
      }
    }
  }

  // ── Build gate meshes (2-tile-tall metal grate, pivots at top) ──
  buildGates(gateBodies) {
    for (const g of this.gateMeshes) this.scene.remove(g.mesh);
    this.gateMeshes.length = 0;

    const THREE = this.THREE;
    const V = 3;
    const GATE_H = 64; // 2 tiles in px
    const BAR_COLOR = 0x888899;
    const BAR_DARK = 0x555566;
    const FRAME_COLOR = 0x666677;

    for (const gate of gateBodies) {
      // Outer group positioned at the gate body center
      const outerGroup = new THREE.Group();
      // Pivot group: rotation pivot at left edge (hinge side)
      const pivotGroup = new THREE.Group();
      pivotGroup.position.x = -16; // shift to left edge of 32px tile

      // Gate mesh group (offset so gate hangs right of the pivot)
      const gateGroup = new THREE.Group();
      gateGroup.position.x = 16; // center the gate right of the hinge

      const GATE_W = 32; // match tile width
      const BAR_THICK = V * 1.2;
      const FRAME_THICK = V * 1.5;
      const DEPTH = V * 3; // Z depth for visibility at camera angle

      // Horizontal frame bars (top and bottom)
      for (const yOff of [GATE_H / 2 - FRAME_THICK / 2, -GATE_H / 2 + FRAME_THICK / 2]) {
        const geo = new THREE.BoxGeometry(GATE_W, FRAME_THICK, DEPTH);
        const mat = new THREE.MeshStandardMaterial({ color: FRAME_COLOR, roughness: 0.4, metalness: 0.7 });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(0, yOff, 0);
        gateGroup.add(m);
      }

      // Vertical bars (5 evenly spaced)
      const barCount = 5;
      const innerW = GATE_W - FRAME_THICK;
      const barSpacing = innerW / (barCount + 1);
      for (let i = 1; i <= barCount; i++) {
        const geo = new THREE.BoxGeometry(BAR_THICK, GATE_H - FRAME_THICK * 2, DEPTH * 0.6);
        const mat = new THREE.MeshStandardMaterial({
          color: (i % 2 === 0) ? BAR_COLOR : BAR_DARK,
          roughness: 0.3, metalness: 0.8,
        });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(-innerW / 2 + i * barSpacing, 0, 0);
        gateGroup.add(m);
      }

      // Middle horizontal cross bar
      const crossGeo = new THREE.BoxGeometry(GATE_W, FRAME_THICK * 0.6, DEPTH * 0.6);
      const crossMat = new THREE.MeshStandardMaterial({ color: BAR_DARK, roughness: 0.4, metalness: 0.7 });
      const crossMesh = new THREE.Mesh(crossGeo, crossMat);
      crossMesh.position.set(0, 0, 0);
      gateGroup.add(crossMesh);

      pivotGroup.add(gateGroup);
      outerGroup.add(pivotGroup);

      outerGroup.position.set(gate.body.position.x, -gate.body.position.y, 0);
      this.scene.add(outerGroup);
      this.gateMeshes.push({ mesh: outerGroup, body: gate.body, pivotGroup, gateRef: gate });
    }
  }

  // ── Build key meshes (colored key shapes) ──
  buildKeys(keyBodies) {
    for (const k of this.keyMeshes) this.scene.remove(k.mesh);
    this.keyMeshes.length = 0;

    const THREE = this.THREE;
    const V = 2.16;

    for (const { body, colorIndex } of keyBodies) {
      const vc = new VoxelCollector(V);
      const baseColor = KEY_CHEST_COLORS[colorIndex].hex;
      const darkColor = this._darkenColor(baseColor, 0.6);
      const lightColor = this._lightenColor(baseColor, 1.4);

      // Key handle (ring) — top part
      for (const [x, y] of [[-1,4],[0,4],[1,4],[-2,3],[-2,2],[-1,1],[0,1],[1,1],[2,3],[2,2]]) {
        vc.add(x, y, 0, baseColor);
      }
      // Key shaft — vertical bar going down
      for (let y = 0; y >= -4; y--) {
        vc.add(0, y, 0, lightColor);
      }
      // Key teeth
      vc.add(1, -2, 0, darkColor);
      vc.add(1, -4, 0, darkColor);
      vc.add(2, -4, 0, darkColor);

      const group = vc.build(THREE, { roughness: 0.4, metalness: 0.6 });
      group.position.set(body.position.x, -body.position.y, 0);
      this.scene.add(group);
      this.keyMeshes.push({ mesh: group, body, colorIndex });
    }
  }

  // ── Build chest meshes (colored treasure chests, ~block-sized) ──
  buildChests(chestBodies) {
    for (const c of this.chestMeshes) this.scene.remove(c.mesh);
    this.chestMeshes.length = 0;

    const THREE = this.THREE;
    const V = 4.5; // voxel size — 6 wide × 4.5 = 27px, 5 tall × 4.5 = 22.5px ≈ block

    for (const { body, colorIndex } of chestBodies) {
      const vc = new VoxelCollector(V);
      const accentColor = KEY_CHEST_COLORS[colorIndex].hex;
      const WOOD = 0x8B5A2B;
      const WOOD_DARK = 0x6B3A1B;
      const WOOD_LIGHT = 0x9B6A3B;
      const METAL = 0xccccaa;

      // Chest body — 6 wide (-3..2), 4 tall (-2..1), 3 deep (-1..1)
      for (let x = -3; x <= 2; x++) {
        for (let z = -1; z <= 1; z++) {
          // Bottom two rows (base)
          vc.add(x, -2, z, WOOD_DARK);
          vc.add(x, -1, z, WOOD);
        }
      }
      // Lid (top two rows)
      for (let x = -3; x <= 2; x++) {
        for (let z = -1; z <= 1; z++) {
          vc.add(x, 0, z, WOOD_LIGHT);
          vc.add(x, 1, z, WOOD);
        }
      }
      // Accent band (colored stripe across front, middle height)
      for (let x = -3; x <= 2; x++) {
        vc.add(x, -1, 1, accentColor);
      }
      // Lock/clasp (front center)
      vc.add(0, 0, 1, accentColor);
      vc.add(-1, 0, 1, accentColor);
      // Metal corners (front face)
      vc.add(-3, -2, 1, METAL);
      vc.add(2, -2, 1, METAL);
      vc.add(-3, 1, 1, METAL);
      vc.add(2, 1, 1, METAL);

      const group = vc.build(THREE, { roughness: 0.7, metalness: 0.2 });
      group.position.set(body.position.x, -body.position.y, 0);
      this.scene.add(group);
      this.chestMeshes.push({ mesh: group, body, colorIndex, opened: false });
    }
  }

  // ── Color utility helpers ──
  _darkenColor(hex, factor) {
    const r = ((hex >> 16) & 0xff) * factor;
    const g = ((hex >> 8) & 0xff) * factor;
    const b = (hex & 0xff) * factor;
    return (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
  }

  _lightenColor(hex, factor) {
    const r = Math.min(255, ((hex >> 16) & 0xff) * factor);
    const g = Math.min(255, ((hex >> 8) & 0xff) * factor);
    const b = Math.min(255, (hex & 0xff) * factor);
    return (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
  }

  // ── Build raft meshes ──
  buildRafts(raftBodies) {
    const THREE = this.THREE;
    const V = 3;

    for (const body of raftBodies) {
      const vc = new VoxelCollector(V);

      // Wood colors
      const PLANK = 0x8B6914;
      const PLANK_DARK = 0x6B4914;
      const PLANK_LIGHT = 0xA07828;
      const ROPE = 0x99884C;

      // Flat plank deck: ~64px wide (32 voxels), ~10px tall
      for (let x = -15; x <= 15; x++) {
        for (let z = -3; z <= 3; z++) {
          // Plank pattern — alternate colors per row
          const color = (x + 20) % 4 < 2 ? PLANK : PLANK_DARK;
          vc.add(x, 0, z, color);
        }
        // Second layer for thickness
        for (let z = -2; z <= 2; z++) {
          vc.add(x, -1, z, PLANK_DARK);
        }
      }

      // Rope binding marks across the raft
      for (const rx of [-10, -3, 4, 11]) {
        for (let z = -3; z <= 3; z++) {
          vc.add(rx, 1, z, ROPE);
        }
      }

      // Raised edges / rails
      for (let x = -15; x <= 15; x += 2) {
        vc.add(x, 1, -3, PLANK_LIGHT);
        vc.add(x, 1, 3, PLANK_LIGHT);
      }

      const group = vc.build(THREE, { roughness: 0.85, metalness: 0.0 });
      group.position.set(body.position.x, -body.position.y, 0);
      this.scene.add(group);
      this.raftMeshes.push({ mesh: group, body });
    }
  }

  // ── Build floating log meshes (natural driftwood) ──
  buildFloatingLogs(floatingLogBodies) {
    for (const f of this.floatingLogMeshes) this.scene.remove(f.mesh);
    this.floatingLogMeshes.length = 0;

    const THREE = this.THREE;
    const V = 2.5; // voxel size

    for (const body of floatingLogBodies) {
      const vc = new VoxelCollector(V);

      // Natural log colors
      const BARK = 0x6B4A2A;
      const BARK_DARK = 0x4A3218;
      const BARK_LIGHT = 0x8B6B3A;
      const MOSS = 0x4A6B3A;
      const INNER = 0xA08050;

      // Seed for variation
      const seed = body.position.x * 7 + body.position.y * 13;
      const rng = (i) => {
        const x = Math.sin(seed + i * 9871) * 43758.5453;
        return x - Math.floor(x);
      };

      // Cylindrical log: ~11 voxels long (horizontal), ~3 voxels radius
      let idx = 0;
      for (let x = -5; x <= 5; x++) {
        for (let y = -2; y <= 2; y++) {
          for (let z = -2; z <= 2; z++) {
            // Roughly circular cross-section
            const dist = Math.sqrt(y * y + z * z);
            if (dist > 2.5) continue;
            // Taper at ends
            const endTaper = Math.abs(x) >= 5 ? 1.8 : Math.abs(x) >= 4 ? 2.2 : 2.5;
            if (dist > endTaper) continue;

            const rv = rng(idx++);
            let color;
            if (dist <= 1) {
              // Inner wood (visible at ends)
              color = (Math.abs(x) >= 4) ? INNER : (rv < 0.3 ? BARK_DARK : rv < 0.7 ? BARK : BARK_LIGHT);
            } else {
              // Bark surface, occasional moss
              color = rv < 0.1 ? MOSS : rv < 0.35 ? BARK_DARK : rv < 0.7 ? BARK : BARK_LIGHT;
            }
            vc.add(x, y, z, color);
          }
        }
      }

      // Stub branches (small bumps)
      vc.add(-3, 2, 0, BARK_DARK);
      vc.add(2, -2, 1, BARK_DARK);

      const group = vc.build(THREE, { roughness: 0.9, metalness: 0.05 });
      group.position.set(body.position.x, -body.position.y, 0);
      this.scene.add(group);
      this.floatingLogMeshes.push({ mesh: group, body });
    }
  }

  // ── Build swinging anchor meshes (metal anchor + chain) ──
  buildSwingingAnchors(anchorData) {
    for (const s of this.swingingAnchorMeshes) this.scene.remove(s.mesh);
    this.swingingAnchorMeshes.length = 0;

    const THREE = this.THREE;
    const V = 2; // voxel size

    for (const data of anchorData) {
      const body = data.body || data;
      const pivotX = data.pivotX ?? body.position.x;
      const pivotY = data.pivotY ?? body.position.y;
      const chainLength = data.chainLength ?? 96;

      const vc = new VoxelCollector(V);

      // Anchor colors
      const METAL = 0x5A5A6A;
      const METAL_DARK = 0x3A3A4A;
      const RUST = 0x7A4A2A;
      const CHAIN = 0x6A6A7A;

      const seed = pivotX * 7 + pivotY * 13;
      const rng = (i) => {
        const x = Math.sin(seed + i * 9871) * 43758.5453;
        return x - Math.floor(x);
      };

      // Build with pivot at origin (y=0), chain+anchor hanging downward (negative y)
      const chainVoxelLen = Math.floor(chainLength / V);
      // Total height in voxel units: pivot bracket(1) + chain(chainVoxelLen) + anchor ring(2) + shank(8) + flukes(1) = offset base
      // Pivot marker at y=0, chain goes down, anchor at bottom

      // Pivot marker (bracket at top, at origin)
      vc.add(-1, 0, 0, METAL_DARK);
      vc.add(0, 0, 0, METAL_DARK);
      vc.add(1, 0, 0, METAL_DARK);

      // Chain links (hanging down from pivot)
      let idx = 0;
      for (let i = 0; i < chainVoxelLen; i += 2) {
        const cy = -(1 + i);
        const rv = rng(idx + i);
        const cc = rv < 0.3 ? METAL_DARK : CHAIN;
        vc.add(0, cy, 0, cc);
        if (i + 1 < chainVoxelLen) {
          vc.add(0, cy - 1, 0, CHAIN);
        }
      }
      idx += chainVoxelLen;

      // Anchor shape — classic nautical anchor (hanging below chain)
      const anchorBaseY = -(1 + chainVoxelLen);
      // Ring at top of anchor
      vc.add(0, anchorBaseY, 0, METAL);
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && z === 0) continue;
          vc.add(x, anchorBaseY - 1, z, METAL);
        }
      }
      // Vertical shank (center post)
      for (let y = 0; y < 8; y++) {
        for (let z = -1; z <= 1; z++) {
          const rv = rng(idx++);
          vc.add(0, anchorBaseY - 2 - y, z, rv < 0.2 ? RUST : rv < 0.5 ? METAL_DARK : METAL);
        }
      }
      // Cross arm (fluke bar) at bottom of shank
      const flukeY = anchorBaseY - 2 - 7;
      for (let x = -4; x <= 4; x++) {
        for (let z = -1; z <= 1; z++) {
          const rv = rng(idx++);
          vc.add(x, flukeY, z, rv < 0.3 ? RUST : rv < 0.6 ? METAL_DARK : METAL);
        }
      }
      // Fluke tips (curved down at ends of cross arm)
      for (let z = -1; z <= 1; z++) {
        vc.add(-4, flukeY - 1, z, METAL_DARK);
        vc.add(-3, flukeY - 1, z, METAL_DARK);
        vc.add(4, flukeY - 1, z, METAL_DARK);
        vc.add(3, flukeY - 1, z, METAL_DARK);
      }

      // Position group at pivot point
      const group = vc.build(THREE, { roughness: 0.7, metalness: 0.5 });
      group.position.set(pivotX, -pivotY, 0);
      this.scene.add(group);
      this.swingingAnchorMeshes.push({
        mesh: group,
        body,
        pivotX,
        pivotY,
        chainLength,
      });
    }
  }

  // ── Build bottle message meshes (small corked bottle) ──
  buildBottles(bottleData) {
    for (const b of this.bottleMeshes) this.scene.remove(b.mesh);
    this.bottleMeshes.length = 0;

    const THREE = this.THREE;
    const V = 2;

    for (const data of bottleData) {
      const body = data.body || data;
      const vc = new VoxelCollector(V);

      const GLASS = 0x88ccaa;
      const GLASS_DARK = 0x668a7a;
      const CORK = 0xb08040;
      const CORK_DARK = 0x8a6030;
      const GLOW = 0xaaeedd;

      // Bottle body (rounded rectangle, 3 wide x 5 tall x 2 deep)
      for (let y = -2; y <= 2; y++) {
        for (let x = -1; x <= 1; x++) {
          for (let z = -1; z <= 1; z++) {
            if (Math.abs(x) === 1 && Math.abs(z) === 1) continue; // round corners
            const edge = Math.abs(x) === 1 || Math.abs(z) === 1;
            vc.add(x, y, z, edge ? GLASS_DARK : GLASS, GLOW);
          }
        }
      }
      // Neck (narrower)
      for (let y = 3; y <= 4; y++) {
        vc.add(0, y, 0, GLASS, GLOW);
      }
      // Cork
      vc.add(0, 5, 0, CORK);
      vc.add(0, 6, 0, CORK_DARK);

      // Tiny scroll inside (paper color)
      vc.add(0, 0, 0, 0xf0e8d0);

      const group = vc.build(THREE, { roughness: 0.3, metalness: 0.2, emissiveIntensity: 0.4 });
      group.position.set(body.position.x, -body.position.y, 0);
      this.scene.add(group);
      this.bottleMeshes.push({ mesh: group, body });
    }
  }

  // ── Build hint stone meshes (small stone tablet with seaweed) ──
  buildHintStones(hintData) {
    for (const h of this.hintStoneMeshes) this.scene.remove(h.mesh);
    this.hintStoneMeshes.length = 0;

    const THREE = this.THREE;
    const V = 3.2;

    for (const data of hintData) {
      const body = data.body || data;
      const vc = new VoxelCollector(V);

      const STONE = 0x7a8a7a;
      const STONE_DARK = 0x5a6a5a;
      const STONE_LIGHT = 0x8a9a8a;
      const MOSS = 0x4a7a3a;
      const SYMBOL = 0xddeedd;
      const SYMBOL_GLOW = 0xeeffee;

      const seed = body.position.x * 7 + body.position.y * 13;
      const rng = (i) => {
        const x = Math.sin(seed + i * 9871) * 43758.5453;
        return x - Math.floor(x);
      };

      // "i" symbol pattern on front face (within 7x9 grid, coords relative to center)
      const symbolPixels = new Set([
        '0,2',                                  // dot
        '0,0', '0,-1', '0,-2',                  // vertical bar
      ]);

      // Stone tablet: 7 wide x 9 tall x 2 deep
      let idx = 0;
      for (let y = -4; y <= 4; y++) {
        for (let x = -3; x <= 3; x++) {
          for (let z = 0; z <= 1; z++) {
            // Rounded top corners
            if (y === 4 && Math.abs(x) >= 3) continue;
            // Tapered base
            if (y === -4 && Math.abs(x) >= 3) continue;
            const rv = rng(idx++);
            let color;
            const isSymbol = z === 1 && symbolPixels.has(`${x},${y}`);
            if (isSymbol) {
              color = rv < 0.4 ? SYMBOL_GLOW : SYMBOL;
            } else if (z === 1 && Math.abs(x) <= 2 && y >= -3 && y <= 3) {
              // Flat front face — slightly lighter
              color = rv < 0.3 ? STONE_LIGHT : (rv < 0.6 ? STONE : STONE_DARK);
            } else {
              color = rv < 0.12 ? MOSS : (rv < 0.35 ? STONE_DARK : (rv < 0.65 ? STONE : STONE_LIGHT));
            }
            vc.add(x, y, z, color);
          }
        }
      }

      // Moss / seaweed on top
      vc.add(-2, 5, 0, MOSS);
      vc.add(-1, 5, 1, 0x3a6a2a);
      vc.add(0, 5, 0, MOSS);
      vc.add(1, 5, 0, 0x3a6a2a);
      vc.add(2, 5, 1, MOSS);
      vc.add(-1, 6, 0, 0x3a6a2a);

      const group = vc.build(THREE, { roughness: 0.95, metalness: 0.0 });
      group.position.set(body.position.x, -body.position.y, 0);
      this.scene.add(group);
      this.hintStoneMeshes.push({ mesh: group, body });
    }
  }

  // ── Bottle collect particle effect ──
  spawnBottleCollect(x, y) {
    const THREE = this.THREE;
    const colors = [0xaaeedd, 0x88ccaa, 0xf0e8d0, 0xffffff, 0x66aacc];
    for (let i = 0; i < 12; i++) {
      const size = 1.5 + Math.random() * 2.5;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        emissive: 0xaaeedd,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 60;
      mesh.position.set(x, -y, 0);
      this.scene.add(mesh);
      this.bubbles.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: -(Math.sin(angle) * speed + 20),
        life: 0.6 + Math.random() * 0.6,
        age: 0,
      });
    }
  }

  // ── Stun Pulse visual: expanding ring of particles ──
  spawnStunPulse(x, y) {
    const THREE = this.THREE;
    const ringCount = 16;
    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2;
      const speed = 120 + Math.random() * 40;
      const size = 2 + Math.random() * 2;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xcc88ff,
        emissive: 0xaa66ee,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, -y, 0);
      this.scene.add(mesh);
      this.bubbles.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: -(Math.sin(angle) * speed),
        life: 0.5 + Math.random() * 0.2,
        age: 0,
        _isPearlSparkle: true, // reuses sparkle fade behavior
      });
    }
    // Central flash — a larger particle that fades quickly
    const flashGeo = new THREE.SphereGeometry(6, 8, 8);
    const flashMat = new THREE.MeshStandardMaterial({
      color: 0xddaaff,
      emissive: 0xcc88ff,
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.85,
    });
    const flashMesh = new THREE.Mesh(flashGeo, flashMat);
    flashMesh.position.set(x, -y, 0);
    this.scene.add(flashMesh);
    this.bubbles.push({
      mesh: flashMesh,
      vx: 0,
      vy: 0,
      life: 0.35,
      age: 0,
      _isPearlSparkle: true,
    });
  }

  // ── Small "dizzy star" particle above a stunned enemy ──
  _spawnStunStar(x, y) {
    const THREE = this.THREE;
    const size = 1.5 + Math.random() * 1.5;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffdd44,
      emissive: 0xffcc00,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.8,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      x + (Math.random() - 0.5) * 16,
      -(y - 10 - Math.random() * 8),
      (Math.random() - 0.5) * 6
    );
    this.scene.add(mesh);
    this.bubbles.push({
      mesh,
      vx: (Math.random() - 0.5) * 20,
      vy: -(10 + Math.random() * 20),
      life: 0.3 + Math.random() * 0.3,
      age: 0,
      _isPearlSparkle: true,
    });
  }

  // ── Speed Surge trail particle ──
  spawnSpeedTrail(x, y) {
    const THREE = this.THREE;
    const colors = [0x66ffaa, 0x44ddcc, 0x88ffdd, 0xaaffee];
    const size = 1.5 + Math.random() * 2;
    const geo = new THREE.BoxGeometry(size, size * 0.5, size * 0.5);
    const mat = new THREE.MeshStandardMaterial({
      color: colors[Math.floor(Math.random() * colors.length)],
      emissive: 0x44cc88,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.7,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      x + (Math.random() - 0.5) * 12,
      -y + (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 6
    );
    this.scene.add(mesh);
    this.bubbles.push({
      mesh,
      vx: (Math.random() - 0.5) * 10,
      vy: -(Math.random() * 15 + 5),
      life: 0.3 + Math.random() * 0.3,
      age: 0,
      _isPearlSparkle: true,
    });
  }

  // ── Generate a Minecraft-style ground texture for the back plane ──
  _generateGroundTexture() {
    const THREE = this.THREE;
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const px = size / 16;

    const seed = 9999;
    const rng = (i) => {
      const x = Math.sin(seed + i * 9871) * 43758.5453;
      return x - Math.floor(x);
    };

    // Sandy/dirt ground — warm brown tones
    ctx.fillStyle = '#8b7355';
    ctx.fillRect(0, 0, size, size);

    for (let py = 0; py < 16; py++) {
      for (let px2 = 0; px2 < 16; px2++) {
        const r = rng(py * 16 + px2 + 5000);
        const base = 100 + r * 60;
        const red = Math.min(255, base + 30);
        const green = Math.min(200, base + 5);
        const blue = Math.max(40, base - 30);
        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        ctx.fillRect(px2 * px, py * px, px, px);
      }
    }

    // Scattered darker pebble pixels
    for (let i = 0; i < 15; i++) {
      const gx = Math.floor(rng(i + 800) * 16) * px;
      const gy = Math.floor(rng(i + 850) * 16) * px;
      ctx.fillStyle = 'rgba(70, 55, 35, 0.6)';
      ctx.fillRect(gx, gy, px, px);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  // ── Build underwater background with depth gradient ──
  buildBackground() {
    const THREE = this.THREE;

    // ── Sky background (above water) ──
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 2;
    skyCanvas.height = 256;
    const skyCtx = skyCanvas.getContext('2d');
    const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 256);
    skyGrad.addColorStop(0, '#3a8fd4');
    skyGrad.addColorStop(0.3, '#6bb5e8');
    skyGrad.addColorStop(0.6, '#9dd4f0');
    skyGrad.addColorStop(0.8, '#d4eef8');
    skyGrad.addColorStop(0.95, '#ffeebb');
    skyGrad.addColorStop(1.0, '#ffdd88');
    skyCtx.fillStyle = skyGrad;
    skyCtx.fillRect(0, 0, 2, 256);
    const skyTexture = new THREE.CanvasTexture(skyCanvas);

    const skyH = WATER_SURFACE_Y + 100;
    const skyGeo = new THREE.PlaneGeometry(WORLD_W + 2000, skyH);
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture, depthWrite: false });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.position.set(WORLD_W / 2, -WATER_SURFACE_Y + skyH / 2, -399);
    skyMesh.renderOrder = -100;
    this.scene.add(skyMesh);

    // ── Underwater background (water surface to ground level) ──
    const groundY = WORLD_H - TILE_SIZE; // top of bottom sand/stone row (row 23)
    const waterBgH = groundY - WATER_SURFACE_Y; // 800-32-128 = 640px
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = 2;
    bgCanvas.height = 256;
    const bgCtx = bgCanvas.getContext('2d');
    const grad = bgCtx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1a7aaa');       // bright blue at water surface
    grad.addColorStop(0.15, '#146090');
    grad.addColorStop(0.3, '#0e4a72');
    grad.addColorStop(0.5, '#0a3558');
    grad.addColorStop(0.7, '#072845');
    grad.addColorStop(1.0, '#061e35');     // dark blue at bottom — matches ground fog
    bgCtx.fillStyle = grad;
    bgCtx.fillRect(0, 0, 2, 256);
    const bgTexture = new THREE.CanvasTexture(bgCanvas);

    const bgGeo = new THREE.PlaneGeometry(WORLD_W + 2000, waterBgH);
    const bgMat = new THREE.MeshBasicMaterial({ map: bgTexture, depthWrite: false });
    const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    // Center exactly between water surface and world bottom
    bgMesh.position.set(WORLD_W / 2, -(WATER_SURFACE_Y + waterBgH / 2), -399);
    bgMesh.renderOrder = -100;
    this.scene.add(bgMesh);

    // ── Ground plane — textured floor lying flat (XZ plane) ──
    const groundTexture = this._generateGroundTexture();
    const groundRepeatX = WORLD_W / TILE_SIZE;
    const groundDepthSize = 600;
    const groundRepeatZ = groundDepthSize / TILE_SIZE;
    groundTexture.repeat.set(groundRepeatX, groundRepeatZ);

    const groundGeo = new THREE.PlaneGeometry(WORLD_W + 400, groundDepthSize);
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTexture,
      roughness: 1.0,
      metalness: 0.0,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.set(
      WORLD_W / 2,
      -WORLD_H + TILE_SIZE / 2,
      -groundDepthSize / 2
    );
    groundMesh.renderOrder = -50;
    this.scene.add(groundMesh);

    // Dark-blue fog overlay on the ground — fades from transparent (near) to dark blue (far)
    const groundFogCanvas = document.createElement('canvas');
    groundFogCanvas.width = 2;
    groundFogCanvas.height = 128;
    const gfCtx = groundFogCanvas.getContext('2d');
    const gfGrad = gfCtx.createLinearGradient(0, 0, 0, 128);
    gfGrad.addColorStop(0, 'rgba(6, 30, 53, 1.0)');     // back (far): dark blue matching water bg bottom
    gfGrad.addColorStop(0.25, 'rgba(6, 30, 53, 0.5)'); // starts to clear
    gfGrad.addColorStop(0.5, 'rgba(6, 30, 53, 0)');    // transparent
    gfGrad.addColorStop(1.0, 'rgba(6, 30, 53, 0)');    // front (near): fully transparent
    gfCtx.fillStyle = gfGrad;
    gfCtx.fillRect(0, 0, 2, 128);
    const groundFogTexture = new THREE.CanvasTexture(groundFogCanvas);

    const groundFogGeo = new THREE.PlaneGeometry(WORLD_W + 400, groundDepthSize);
    const groundFogMat = new THREE.MeshBasicMaterial({
      map: groundFogTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const groundFogMesh = new THREE.Mesh(groundFogGeo, groundFogMat);
    groundFogMesh.rotation.x = -Math.PI / 2;
    groundFogMesh.position.set(
      WORLD_W / 2,
      -WORLD_H + TILE_SIZE / 2 + 1,  // above ground to overlay
      -groundDepthSize / 2
    );
    groundFogMesh.renderOrder = -49;
    this.scene.add(groundFogMesh);

    // Parallax background layers with faint terrain silhouettes
    for (let i = 0; i < BG_LAYER_COUNT; i++) {
      const depth = -150 - i * 100;
      const alpha = 0.08 - i * 0.02;
      const scale = 1.1 + i * 0.2;
      const color = new THREE.Color().setHSL(0.58, 0.4, 0.15 - i * 0.03);

      const layerGeo = new THREE.PlaneGeometry(WORLD_W * scale, WORLD_H * scale);
      const layerMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: alpha,
        depthWrite: false,
      });
      const layerMesh = new THREE.Mesh(layerGeo, layerMat);
      layerMesh.position.set(WORLD_W / 2, -WORLD_H / 2, depth);
      layerMesh.renderOrder = -90 + i;
      this.scene.add(layerMesh);
      this.bgLayers.push(layerMesh);
    }
  }

  // ── Build background wave lines (subtle horizontal waves behind terrain) ──
  buildBackgroundWaves() {
    const THREE = this.THREE;
    const surfaceY = -WATER_SURFACE_Y;

    for (let i = 0; i < BG_WAVE_COUNT; i++) {
      const depth = -120 - i * 60;                          // z: -120 to -360
      const yOffset = -80 - i * 100;                         // spread vertically below surface
      const opacity = 0.06 - i * 0.008;                      // fainter further back
      const color = new THREE.Color().setHSL(0.55, 0.5, 0.4 + i * 0.05);

      // Build a line geometry with enough segments for smooth wave
      const points = [];
      for (let j = 0; j <= BG_WAVE_SEGMENTS; j++) {
        const x = (j / BG_WAVE_SEGMENTS) * (WORLD_W + 200) - 100;
        points.push(new THREE.Vector3(x, surfaceY + yOffset, depth));
      }

      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.renderOrder = -80;
      this.scene.add(line);

      this.bgWaves.push({
        line,
        baseY: surfaceY + yOffset,
        amplitude: BG_WAVE_AMPLITUDE + i * 2,
        speed: 0.8 - i * 0.1,
        frequency: 0.008 + i * 0.002,
        phase: i * 1.5,
      });
    }
  }

  // ── Spawn ambient bubbles around the player ──
  // Called once at init — creates the pool. Bubbles respawn around player in syncFrame.
  buildAmbientBubbles() {
    // Pool is pre-allocated; actual spawning happens in syncFrame
    this._ambientBubblePool = [];
    this._ambientSpawnTimer = 0;
  }

  _spawnAmbientBubble(playerX, playerY) {
    const THREE = this.THREE;
    if (this.ambientBubbles.length >= AMBIENT_BUBBLE_COUNT) return;

    const size = 0.6 + Math.random() * 2.5;
    const geo = new THREE.BoxGeometry(size, size, size);
    const maxOpacity = 0.1 + Math.random() * 0.15;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Spawn in a radius around the player, biased downward
    const spawnRadius = 250;
    const ox = (Math.random() - 0.5) * spawnRadius * 2;
    // Bias Y offset downward so bubbles appear below/around the player
    const oy = -Math.random() * spawnRadius * 1.2;
    let spawnY = -playerY + oy;
    // Clamp: never spawn above water surface
    const waterSurfaceThreeY = -WATER_SURFACE_Y;
    if (spawnY > waterSurfaceThreeY - 15) {
      spawnY = waterSurfaceThreeY - 15 - Math.random() * 100;
    }
    mesh.position.set(
      playerX + ox,
      spawnY,
      (Math.random() - 0.5) * 50
    );
    this.scene.add(mesh);

    this.ambientBubbles.push({
      mesh,
      maxOpacity,
      life: 3 + Math.random() * 5,               // 3-8 seconds lifetime
      age: 0,
      vy: 5 + Math.random() * 12,                // slow rise px/s
      phase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.8 + Math.random() * 2,
      wobbleAmount: 1.5 + Math.random() * 4,
      baseX: mesh.position.x,
    });
  }

  // ── Build underwater current streaks (purely visual flowing planes) ──
  buildCurrents() {
    const THREE = this.THREE;
    const waterTop = -WATER_SURFACE_Y;
    const waterBottom = -WORLD_H + TILE_SIZE;

    // Shared gradient texture — fades to transparent at both ends horizontally
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, 'rgba(140, 210, 255, 0.0)');
    grad.addColorStop(0.2, 'rgba(140, 210, 255, 1.0)');
    grad.addColorStop(0.5, 'rgba(180, 230, 255, 1.0)');
    grad.addColorStop(0.8, 'rgba(140, 210, 255, 1.0)');
    grad.addColorStop(1.0, 'rgba(140, 210, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 1);
    const streakTexture = new THREE.CanvasTexture(canvas);

    for (let i = 0; i < CURRENT_STREAK_COUNT; i++) {
      const len = CURRENT_MIN_LENGTH + Math.random() * (CURRENT_MAX_LENGTH - CURRENT_MIN_LENGTH);
      const h = CURRENT_MIN_HEIGHT + Math.random() * (CURRENT_MAX_HEIGHT - CURRENT_MIN_HEIGHT);
      const speed = CURRENT_MIN_SPEED + Math.random() * (CURRENT_MAX_SPEED - CURRENT_MIN_SPEED);
      const dir = 1; // all currents flow rightward
      // Random Y within water column
      const y = waterTop - 40 - Math.random() * (waterTop - waterBottom - 80);
      // Random start X spread across the world
      const x = Math.random() * (WORLD_W + len * 2) - len;
      const z = -10 - Math.random() * 40;

      const geo = new THREE.PlaneGeometry(len, h);

      // Deeper streaks are slightly dimmer
      const depthFactor = 1 - (waterTop - y) / (waterTop - waterBottom);
      const opacity = CURRENT_OPACITY * (0.5 + depthFactor * 0.5) + Math.random() * 0.03;

      const mat = new THREE.MeshBasicMaterial({
        map: streakTexture,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.renderOrder = -70;
      this.scene.add(mesh);

      this.currentStreaks.push({
        mesh,
        speed: speed * dir,
        baseY: y,
        waveMag: 2 + Math.random() * 6,       // px, vertical wave magnitude
        waveFreq: 0.3 + Math.random() * 0.8,   // wave frequency
        phase: Math.random() * Math.PI * 2,
        len,
        baseOpacity: opacity,
      });
    }
  }

  // ── Build god rays (volumetric light beams from above) ──
  buildGodRays() {
    const THREE = this.THREE;

    // Shared gradient texture for soft fade-out at bottom of rays
    const rayCanvas = document.createElement('canvas');
    rayCanvas.width = 1;
    rayCanvas.height = 64;
    const rCtx = rayCanvas.getContext('2d');
    const rayGrad = rCtx.createLinearGradient(0, 0, 0, 64);
    rayGrad.addColorStop(0, 'rgba(110, 200, 245, 0.0)');   // top (canvas): transparent — maps to ray bottom
    rayGrad.addColorStop(0.3, 'rgba(110, 200, 245, 0.4)'); // fading in
    rayGrad.addColorStop(0.6, 'rgba(110, 200, 245, 1.0)'); // bright core
    rayGrad.addColorStop(0.85, 'rgba(110, 200, 245, 0.6)'); // fading toward top of ray
    rayGrad.addColorStop(1.0, 'rgba(110, 200, 245, 0.0)'); // top (canvas): transparent — maps to ray top
    rCtx.fillStyle = rayGrad;
    rCtx.fillRect(0, 0, 1, 64);
    const rayTexture = new THREE.CanvasTexture(rayCanvas);

    for (let i = 0; i < GOD_RAY_COUNT; i++) {
      const x = (i / GOD_RAY_COUNT) * WORLD_W + (Math.sin(i * 7.3) * 200);

      // Tapered beam shape (trapezoid) — narrow at top, wider at bottom
      const topW = GOD_RAY_MIN_WIDTH + Math.sin(i * 3.7) * 10;
      const botW = GOD_RAY_MAX_WIDTH + Math.sin(i * 5.1) * 30;
      const h = GOD_RAY_HEIGHT + Math.sin(i * 2.3) * 150;

      const shape = new THREE.Shape();
      shape.moveTo(-topW / 2, h / 2);
      shape.lineTo(topW / 2, h / 2);
      shape.lineTo(botW / 2, -h / 2);
      shape.lineTo(-botW / 2, -h / 2);
      shape.closePath();

      const geo = new THREE.ShapeGeometry(shape);

      // Remap UVs: top of shape (y=h/2) → v=1 (canvas top), bottom (y=-h/2) → v=0 (canvas bottom)
      // Three.js CanvasTexture: v=0 is canvas bottom, v=1 is canvas top
      const uvAttr = geo.attributes.uv;
      const posAttr = geo.attributes.position;
      for (let j = 0; j < posAttr.count; j++) {
        const py = posAttr.getY(j);
        const v = (py + h / 2) / h; // map y: bottom(-h/2)=0, top(h/2)=1
        uvAttr.setXY(j, 0.5, v);
      }
      uvAttr.needsUpdate = true;

      const mat = new THREE.MeshBasicMaterial({
        map: rayTexture,
        transparent: true,
        opacity: GOD_RAY_OPACITY + Math.sin(i * 4.1) * 0.02,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(geo, mat);
      const waterSurfaceThreeY = -WATER_SURFACE_Y;
      mesh.position.set(x, waterSurfaceThreeY - h / 2 + 10, -50 + i * 2);
      // Tilt rays so light appears to come from the right (~15° lean)
      mesh.rotation.z = -0.26;
      mesh.renderOrder = 500;

      this.scene.add(mesh);
      this.godRays.push({
        mesh,
        baseX: x,
        baseOpacity: mat.opacity,
        phase: i * 1.7,
        speed: GOD_RAY_DRIFT_SPEED + Math.sin(i * 2.9) * 0.05,
        swayAmount: 15 + Math.sin(i * 3.3) * 10,
      });
    }
  }

  // ── Build water surface and sparkles ──
  buildWater(worldW) {
    this.waterMesh = null;

    // Build the fancy water surface
    this._buildWaterSurface(worldW);

    // Build sparkles on water surface
    this._buildSurfaceSparkles(worldW);
  }

  // ── Animated pixelated wave mesh for water surface ──
  _buildWaterSurface(worldW) {
    const THREE = this.THREE;
    const surfaceY = -WATER_SURFACE_Y;

    // Fewer segments for chunky pixel-art wave look (one segment per tile)
    const pixelSegments = Math.ceil(worldW / TILE_SIZE) + 4;
    const segW = TILE_SIZE;
    const positions = [];
    const indices = [];
    const uvs = [];

    // 3 rows of vertices: top, middle (surface line), bottom
    // Top is thin (8px), bottom extends further (30px) for a soft fade into water
    const SURFACE_TOP = 8;    // px above surface line
    const SURFACE_BOTTOM = 30; // px below surface line — room for gradient fade
    const rowCount = 3;
    for (let i = 0; i <= pixelSegments; i++) {
      const x = -2 * TILE_SIZE + i * segW;
      const u = i / pixelSegments;
      positions.push(x, surfaceY + SURFACE_TOP, 0);     // top
      uvs.push(u, 1);
      positions.push(x, surfaceY, 0);                    // middle (surface line)
      uvs.push(u, 0.5);
      positions.push(x, surfaceY - SURFACE_BOTTOM, 0);  // bottom (extended for fade)
      uvs.push(u, 0);
    }

    for (let i = 0; i < pixelSegments; i++) {
      const col = i * rowCount;
      const nextCol = (i + 1) * rowCount;
      // Top quad (top - middle)
      indices.push(col, col + 1, nextCol);
      indices.push(col + 1, nextCol + 1, nextCol);
      // Bottom quad (middle - bottom)
      indices.push(col + 1, col + 2, nextCol + 1);
      indices.push(col + 2, nextCol + 2, nextCol + 1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);

    // Pixelated surface texture — wider with visible wave bands
    const surfCanvas = document.createElement('canvas');
    surfCanvas.width = 32;
    surfCanvas.height = 32;
    const sCtx = surfCanvas.getContext('2d');
    const px = 2; // pixel size

    // 16 rows of pixels covering the full height
    // Row 0 = top (transparent above water), row 15 = bottom (transparent into water)
    for (let py = 0; py < 16; py++) {
      for (let px2 = 0; px2 < 16; px2++) {
        const seed = py * 16 + px2;
        const r = Math.sin(seed * 9871) * 43758.5453;
        const rng = r - Math.floor(r);

        // Fade: top rows fade in, middle rows bright, bottom rows long gentle fade out
        // Row 0-3: above surface (top edge), row 7-8: bright core, row 9-15: fade into water
        let alpha = 0;
        if (py < 4) {
          alpha = py / 4 * 0.3;           // gentle fade in from top
        } else if (py < 7) {
          alpha = 0.3 + (py - 4) / 3 * 0.5; // build up to brightest
        } else if (py < 9) {
          alpha = 0.8 - rng * 0.1;         // bright core band
        } else {
          // Long smooth fade out into water (rows 9-15)
          const t = (py - 9) / 7;          // 0..1 over 7 rows
          alpha = 0.5 * (1 - t * t);       // quadratic ease-out for smooth falloff
        }

        const blue = 190 + rng * 50;
        const green = 210 + rng * 40;
        const red = 160 + rng * 50;
        sCtx.fillStyle = `rgba(${red}, ${Math.min(255, green)}, ${Math.min(255, blue)}, ${alpha})`;
        sCtx.fillRect(px2 * px, py * px, px, px);
      }
    }
    // Bright highlight pixels in the core (rows 7-8)
    for (let px2 = 0; px2 < 16; px2++) {
      const rng2 = (Math.sin((px2 + 100) * 9871) * 43758.5453) % 1;
      if (rng2 > 0.25) {
        sCtx.fillStyle = 'rgba(230, 248, 255, 0.85)';
        sCtx.fillRect(px2 * px, 7 * px, px, px);
      }
      if (rng2 > 0.4) {
        sCtx.fillStyle = 'rgba(200, 235, 255, 0.6)';
        sCtx.fillRect(px2 * px, 8 * px, px, px);
      }
    }

    const surfTexture = new THREE.CanvasTexture(surfCanvas);
    surfTexture.magFilter = THREE.NearestFilter;
    surfTexture.minFilter = THREE.NearestFilter;
    surfTexture.wrapS = THREE.RepeatWrapping;
    surfTexture.repeat.x = Math.ceil(worldW / TILE_SIZE);

    const mat = new THREE.MeshBasicMaterial({
      map: surfTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = 30;
    mesh.renderOrder = 1000;
    this.scene.add(mesh);
    this.surfaceWaveMesh = mesh;
    this._surfacePixelSegments = pixelSegments;

    // ── Water fill plane — covers gap between wave mesh and background ──
    // Gradient texture: transparent at top (blends into surface), dark at bottom
    const waterDepth = WORLD_H - WATER_SURFACE_Y + 50;
    const fillCanvas = document.createElement('canvas');
    fillCanvas.width = 1;
    fillCanvas.height = 128;
    const fCtx = fillCanvas.getContext('2d');
    const fillGrad = fCtx.createLinearGradient(0, 0, 0, 128);
    fillGrad.addColorStop(0, 'rgba(8, 42, 74, 0.0)');    // top: transparent at surface
    fillGrad.addColorStop(0.08, 'rgba(8, 42, 74, 0.15)'); // gentle fade in
    fillGrad.addColorStop(0.25, 'rgba(8, 42, 74, 0.35)');
    fillGrad.addColorStop(0.5, 'rgba(8, 42, 74, 0.5)');
    fillGrad.addColorStop(1.0, 'rgba(6, 30, 53, 0.6)');  // bottom: darkest
    fCtx.fillStyle = fillGrad;
    fCtx.fillRect(0, 0, 1, 128);
    const fillTexture = new THREE.CanvasTexture(fillCanvas);

    const fillGeo = new THREE.PlaneGeometry(worldW + 400, waterDepth);
    const fillMat = new THREE.MeshBasicMaterial({
      map: fillTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
    fillMesh.position.set(worldW / 2, surfaceY - waterDepth / 2, -50);
    fillMesh.renderOrder = -60;
    this.scene.add(fillMesh);
    this.waterFillMesh = fillMesh;
  }

  // ── Sparkle particles floating on water surface ──
  _buildSurfaceSparkles(worldW) {
    const THREE = this.THREE;
    const surfaceY = -WATER_SURFACE_Y;

    for (let i = 0; i < SURFACE_SPARKLE_COUNT; i++) {
      const x = Math.random() * worldW;
      const geo = new THREE.PlaneGeometry(2 + Math.random() * 3, 2 + Math.random() * 3);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, surfaceY + Math.random() * 6 - 3, 35);
      mesh.renderOrder = 1001;
      this.scene.add(mesh);
      this.surfaceSparkles.push({
        mesh,
        baseX: x,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 2,
        maxOpacity: 0.3 + Math.random() * 0.5,
      });
    }
  }

  // ── Setup lighting ──
  setupLighting() {
    const THREE = this.THREE;

    // Ambient — bright enough to see block textures clearly
    const ambient = new THREE.AmbientLight(0x88aacc, 1.2);
    this.scene.add(ambient);

    // Sun from above-right — strong directional to illuminate block tops & right faces
    const sun = new THREE.DirectionalLight(0xffeedd, 1.4);
    sun.position.set(600, 400, 500);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.left = -WORLD_W / 2;
    sun.shadow.camera.right = WORLD_W / 2;
    sun.shadow.camera.top = WORLD_H / 2;
    sun.shadow.camera.bottom = -WORLD_H / 2;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 2000;
    sun.shadow.bias = -0.002;
    this.scene.add(sun);

    // Fill light from left-front — ensures left faces aren't too dark
    const fill = new THREE.DirectionalLight(0x88bbdd, 0.6);
    fill.position.set(-200, 100, 300);
    this.scene.add(fill);

    // Subtle warm uplight from sandy bottom
    const uplight = new THREE.DirectionalLight(0xccaa77, 0.3);
    uplight.position.set(0, -300, 200);
    this.scene.add(uplight);

    // Hemisphere light for natural sky/ground coloring
    const hemi = new THREE.HemisphereLight(0x88ccff, 0x886644, 0.4);
    this.scene.add(hemi);

    // Lighter underwater fog — don't obscure textures too much
    this.scene.fog = new THREE.FogExp2(0x0a2540, 0.0006);
    this.scene.background = new THREE.Color(0x061828);
  }

  // ── Spawn a bubble particle ──
  spawnBubble(x, y) {
    const THREE = this.THREE;
    if (this.bubbles.length > 90) return; // limit (raised for dash burst)

    const size = 1 + Math.random() * 3;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      x + (Math.random() - 0.5) * 10,
      -y,
      (Math.random() - 0.5) * 10
    );
    this.scene.add(mesh);
    this.bubbles.push({
      mesh,
      vy: 20 + Math.random() * 40,
      vx: 0,
      life: 1.5 + Math.random() * 2,
    });
  }

  // ── Spawn splash particles at water surface ──
  spawnSplash(x, speed) {
    const THREE = this.THREE;
    const surfaceY = -WATER_SURFACE_Y;
    const count = Math.min(25, 10 + Math.floor(speed / 20));
    const spread = 20 + speed * 0.15;

    for (let i = 0; i < count; i++) {
      if (this.bubbles.length > 80) break;

      const size = 2 + Math.random() * 4;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xcceeff,
        transparent: true,
        opacity: 0.5 + Math.random() * 0.3,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        x + (Math.random() - 0.5) * spread,
        surfaceY + Math.random() * 8,
        (Math.random() - 0.5) * 20
      );
      this.scene.add(mesh);
      this.bubbles.push({
        mesh,
        vy: 30 + Math.random() * 60,
        vx: (Math.random() - 0.5) * (40 + speed * 0.4),
        life: 0.6 + Math.random() * 0.8,
      });
    }

    // Spawn airborne splash droplets above the surface
    const dropCount = Math.min(18, 6 + Math.floor(speed / 25));
    for (let i = 0; i < dropCount; i++) {
      if (this.splashDroplets.length > 50) break;

      const size = 1.5 + Math.random() * 2.5;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xddeeff,
        transparent: true,
        opacity: 0.6 + Math.random() * 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        x + (Math.random() - 0.5) * 16,
        surfaceY,
        (Math.random() - 0.5) * 14
      );
      this.scene.add(mesh);
      this.splashDroplets.push({
        mesh,
        vx: (Math.random() - 0.5) * (60 + speed * 0.5),
        vy: 60 + Math.random() * (80 + speed * 0.6),
        life: 0.8 + Math.random() * 0.6,
      });
    }

    // Add surface wave disturbance
    this._surfaceDisturbances.push({
      x,                                    // world x where the fish hit
      amplitude: 6 + speed * 0.04,          // initial wave height (px)
      age: 0,                               // seconds since impact
      decay: 1.8 + speed * 0.005,           // seconds until fully faded
      spread: 40,                           // initial radius (px), grows over time
    });
  }

  // ── Spawn pearl collect particles (golden sparkles radiating outward) ──
  spawnPearlCollect(x, y) {
    const THREE = this.THREE;
    const colors = [0xffd93d, 0xffe066, 0xffcc00, 0xfff0c0, 0xffffff];
    const count = 14;

    for (let i = 0; i < count; i++) {
      const size = 2 + Math.random() * 3;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        emissive: 0xffd93d,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.5,
        transparent: true,
        opacity: 1.0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 40 + Math.random() * 60;
      mesh.position.set(
        x + (Math.random() - 0.5) * 8,
        -y + (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 10
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      this.scene.add(mesh);
      this.bubbles.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.7,
        life: 0.5 + Math.random() * 0.5,
        _isPearlSparkle: true,
      });
    }
  }

  // ── Spawn boulder break particles (rock-colored cubes flying outward) ──
  spawnBoulderBreak(x, y) {
    const THREE = this.THREE;
    const colors = [0x666677, 0x555566, 0x778888, 0x556644, 0x444455];
    const count = 20;

    for (let i = 0; i < count; i++) {
      const size = 3 + Math.random() * 5;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        roughness: 0.9,
        metalness: 0.0,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        x + (Math.random() - 0.5) * 20,
        -y + (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      this.scene.add(mesh);
      this.bubbles.push({
        mesh,
        vy: (Math.random() - 0.3) * 80,
        vx: (Math.random() - 0.5) * 120,
        life: 0.8 + Math.random() * 0.8,
        _isRock: true, // flag so bubble update knows not to fade near surface
      });
    }
  }

  // ── Spawn crate break particles (wood planks) ──
  spawnCrateBreak(x, y) {
    const THREE = this.THREE;
    const colors = [0x8B6914, 0x6B4914, 0xA07828, 0x9B7924, 0x5B3904];
    const count = 18;

    for (let i = 0; i < count; i++) {
      // Elongated plank shapes
      const w = 2 + Math.random() * 3;
      const h = w * (1.5 + Math.random());
      const d = 1.5 + Math.random() * 2;
      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshStandardMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        roughness: 0.85,
        metalness: 0.0,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        x + (Math.random() - 0.5) * 22,
        -y + (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 18
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      this.scene.add(mesh);
      this.bubbles.push({
        mesh,
        vy: (Math.random() - 0.2) * 90,
        vx: (Math.random() - 0.5) * 130,
        life: 0.7 + Math.random() * 0.7,
        _isRock: true, // uses gravity, no surface fade
      });
    }
  }

  // ── Spawn enemy death burst (voxel chunks + bubbles) ──
  spawnEnemyDeath(x, y, colors) {
    const THREE = this.THREE;
    if (!colors) colors = [0x662244, 0x551133, 0x773355, 0x993366, 0x998888];
    const count = 14;

    for (let i = 0; i < count; i++) {
      const size = 2 + Math.random() * 4;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        roughness: 0.7,
        metalness: 0.1,
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const dist = 4 + Math.random() * 8;
      mesh.position.set(
        x + Math.cos(angle) * dist,
        -y + Math.sin(angle) * dist,
        (Math.random() - 0.5) * 16
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      this.scene.add(mesh);
      const speed = 60 + Math.random() * 80;
      this.bubbles.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.6 + Math.random() * 0.5,
        _isRock: true,
      });
    }

    // A few bubbles rising from the death spot
    for (let i = 0; i < 6; i++) {
      const size = 2 + Math.random() * 3;
      const geo = new THREE.SphereGeometry(size, 6, 6);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.5,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        x + (Math.random() - 0.5) * 16,
        -y + (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 10
      );
      this.scene.add(mesh);
      this.bubbles.push({
        mesh,
        vx: (Math.random() - 0.5) * 20,
        vy: 40 + Math.random() * 40,
        life: 0.8 + Math.random() * 0.6,
      });
    }
  }

  // ── Spawn breakable wall debris (rock fragments) ──
  spawnBreakableWallDebris(x, y) {
    const THREE = this.THREE;
    const colors = [0x7a7a8a, 0x6a6a7a, 0x8a8a9a, 0x5a5a6a, 0x4a4a5a];
    const count = 24;

    for (let i = 0; i < count; i++) {
      // Jagged rock fragments (cubic)
      const size = 2 + Math.random() * 6;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        roughness: 0.95,
        metalness: 0.0,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        x + (Math.random() - 0.5) * 28,
        -y + (Math.random() - 0.5) * 28,
        (Math.random() - 0.5) * 24
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      this.scene.add(mesh);
      this.bubbles.push({
        mesh,
        vy: (Math.random() - 0.4) * 100,
        vx: (Math.random() - 0.5) * 150,
        life: 0.9 + Math.random() * 0.9,
        _isRock: true,
      });
    }
  }

  // ── Spawn chest open particles (colored sparkles + wood splinters) ──
  spawnChestOpen(x, y, colorIndex) {
    const THREE = this.THREE;
    const accentColor = KEY_CHEST_COLORS[colorIndex].hex;
    const colors = [accentColor, 0xffd700, 0xffee88, 0x8B5A2B, 0xffffff];
    const count = 25;

    for (let i = 0; i < count; i++) {
      const size = 2 + Math.random() * 4;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        roughness: 0.3,
        metalness: 0.5,
        transparent: true,
        opacity: 1.0,
        emissive: i < 10 ? 0xffd700 : 0x000000,
        emissiveIntensity: i < 10 ? 0.5 : 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        x + (Math.random() - 0.5) * 24,
        -y + (Math.random() - 0.5) * 24,
        (Math.random() - 0.5) * 24
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      this.scene.add(mesh);
      this.bubbles.push({
        mesh,
        vy: (Math.random() * 0.6 + 0.4) * 100, // mostly upward
        vx: (Math.random() - 0.5) * 100,
        life: 0.6 + Math.random() * 0.8,
        _isRock: true,
      });
    }
  }

  // ── Mark chest as opened (remove mesh) ──
  removeChest(body) {
    for (let i = this.chestMeshes.length - 1; i >= 0; i--) {
      if (this.chestMeshes[i].body === body) {
        this.scene.remove(this.chestMeshes[i].mesh);
        this.chestMeshes.splice(i, 1);
        break;
      }
    }
  }

  // ── Per-frame update ──
  syncFrame(fishBody, fishState, enemyBodies, dt, extras = {}) {
    this._time += dt;

    // ── Sync player fish ──
    if (this.fishGroup && fishBody) {
      this.fishGroup.position.set(
        fishBody.position.x,
        -fishBody.position.y,
        0
      );
      // 3D flip: lerp Y rotation for smooth turn-around
      const targetFlip = (fishState && !fishState.facingRight) ? Math.PI : 0;
      this._fishFlipAngle += (targetFlip - this._fishFlipAngle) * 0.12;

      // ── Dash spin: barrel roll around the fish's own forward axis ──
      let dashRoll = 0;
      if (fishState?.dashing) {
        dashRoll = fishState.dashProgress * Math.PI * 2; // full 360° over dash
      }

      // Build final orientation with quaternions so the roll is in local space
      const THREE = this.THREE;
      const qFlip  = this._qFlip  || (this._qFlip  = new THREE.Quaternion());
      const qPitch = this._qPitch || (this._qPitch = new THREE.Quaternion());
      const qRoll  = this._qRoll  || (this._qRoll  = new THREE.Quaternion());

      // Order: flip (Y) → pitch (Z) → barrel roll along local forward (X)
      qFlip.setFromAxisAngle(this._yAxis || (this._yAxis = new THREE.Vector3(0, 1, 0)), this._fishFlipAngle);
      qPitch.setFromAxisAngle(this._zAxis || (this._zAxis = new THREE.Vector3(0, 0, 1)), -(fishState?.visualRotation ?? 0));
      qRoll.setFromAxisAngle(this._xAxis || (this._xAxis = new THREE.Vector3(1, 0, 0)), dashRoll);

      // Combine: world = flip * pitch * roll (roll is innermost = local)
      this.fishGroup.quaternion.copy(qFlip).multiply(qPitch).multiply(qRoll);

      // Tail animation — wave based on swim speed
      if (this.fishTailPivot) {
        const speed = fishState ? fishState.swimSpeed : 0;
        const freq = fishState?.dashing ? 25 : 8 + speed * 0.05;
        const amp = fishState?.dashing ? 0.6 : 0.3 + Math.min(speed / 300, 0.4);
        this.fishTailPivot.rotation.y = Math.sin(this._time * freq) * amp;
      }

      // Spawn bubbles while swimming (extra burst during dash)
      if (fishState && fishState.inWater && fishState.dashing) {
        // Dash bubbles: spawn 2-3 per frame in a spread around the fish
        for (let i = 0; i < 3; i++) {
          this.spawnBubble(
            fishBody.position.x + (Math.random() - 0.5) * 20,
            fishBody.position.y + (Math.random() - 0.5) * 16
          );
        }
      } else if (fishState && fishState.inWater && fishState.swimSpeed > 30 && Math.random() < 0.15) {
        this.spawnBubble(fishBody.position.x, fishBody.position.y);
      }
      // Splash when entering water
      if (fishState && fishState.justEnteredWater) {
        this.spawnSplash(fishBody.position.x, fishState.swimSpeed);
      }
      // Splash when leaving water (jump out)
      if (fishState && fishState.justLeftWater) {
        this.spawnSplash(fishBody.position.x, fishState.swimSpeed);
      }
      // Speed Surge trail particles
      if (fishState && fishState.speedSurgeActive && fishState.inWater && Math.random() < 0.6) {
        this.spawnSpeedTrail(fishBody.position.x, fishBody.position.y);
      }
    }

    // ── Sync piranhas ──
    for (let i = 0; i < enemyBodies.length && i < this.enemyGroups.length; i++) {
      const eb = enemyBodies[i];
      const eg = this.enemyGroups[i];
      if (!eb.space) continue; // dead enemy
      eg.position.set(eb.position.x, -eb.position.y, 0);
      eg.rotation.z = -eb.rotation;
      // Stun wobble
      if (eb._stunTimer > 0) {
        eg.rotation.z += Math.sin(this._time * 15 + i) * 0.3;
        if (Math.random() < 0.15) this._spawnStunStar(eb.position.x, eb.position.y);
      }
      // 3D flip: lerp Y rotation for smooth turn-around
      if (this._enemyFlipAngles[i] === undefined) this._enemyFlipAngles[i] = 0;
      let targetFlip = this._enemyFlipAngles[i];
      if (eb.velocity.x < -1) targetFlip = Math.PI;
      else if (eb.velocity.x > 1) targetFlip = 0;
      this._enemyFlipAngles[i] += (targetFlip - this._enemyFlipAngles[i]) * 0.12;
      eg.rotation.y = this._enemyFlipAngles[i];
      // Tail animation
      if (this.enemyTailPivots[i]) {
        const speed = Math.abs(eb.velocity.x);
        const freq = 6 + speed * 0.04;
        const amp = 0.25 + Math.min(speed / 300, 0.35);
        this.enemyTailPivots[i].rotation.y = Math.sin(this._time * freq + i * 2) * amp;
      }

      // Spawn bubbles for enemies (less frequent than player)
      const enemySpeed = Math.abs(eb.velocity.x);
      const enemyInWater = eb.position.y > WATER_SURFACE_Y;
      if (enemyInWater && enemySpeed > 20 && Math.random() < 0.06) {
        this.spawnBubble(eb.position.x, eb.position.y);
      }
    }

    // ── Sync pearls (bob + spin, remove collected) ──
    for (let i = this.pearlMeshes.length - 1; i >= 0; i--) {
      const p = this.pearlMeshes[i];
      if (!p.body.space) {
        // Pearl was collected — spawn sparkle particles, then remove mesh
        this.spawnPearlCollect(p.mesh.position.x, -p.mesh.position.y);
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.pearlMeshes.splice(i, 1);
        continue;
      }
      // Gentle bob and spin
      const baseY = -p.body.position.y;
      p.mesh.position.y = baseY + Math.sin(this._time * 2.5 + i * 1.3) * 3;
      p.mesh.rotation.y = this._time * 1.5 + i;
    }

    // ── Sync buoys (position + rotation from physics) ──
    for (const b of this.buoyMeshes) {
      b.mesh.position.set(b.body.position.x, -b.body.position.y, 0);
      b.mesh.rotation.z = -b.body.rotation;
    }

    // ── Sync boulders (position + rotation, remove destroyed) ──
    for (let i = this.boulderMeshes.length - 1; i >= 0; i--) {
      const b = this.boulderMeshes[i];
      if (!b.body.space) {
        this.scene.remove(b.mesh);
        this.boulderMeshes.splice(i, 1);
        continue;
      }
      b.mesh.position.set(b.body.position.x, -b.body.position.y, 0);
      b.mesh.rotation.z = -b.body.rotation;
    }

    // ── Sync crates (position + rotation, remove destroyed) ──
    for (let i = this.crateMeshes.length - 1; i >= 0; i--) {
      const c = this.crateMeshes[i];
      if (!c.body.space) {
        this.scene.remove(c.mesh);
        this.crateMeshes.splice(i, 1);
        continue;
      }
      c.mesh.position.set(c.body.position.x, -c.body.position.y, 0);
      c.mesh.rotation.z = -c.body.rotation;
    }

    // ── Sync breakable walls (remove destroyed) ──
    for (let i = this.breakableWallMeshes.length - 1; i >= 0; i--) {
      const w = this.breakableWallMeshes[i];
      if (!w.body.space) {
        this.scene.remove(w.mesh);
        this.breakableWallMeshes.splice(i, 1);
      }
    }

    // ── Sync keys (position + rotation, remove destroyed) ──
    for (let i = this.keyMeshes.length - 1; i >= 0; i--) {
      const k = this.keyMeshes[i];
      if (!k.body.space) {
        this.scene.remove(k.mesh);
        this.keyMeshes.splice(i, 1);
        continue;
      }
      k.mesh.position.set(k.body.position.x, -k.body.position.y, 0);
      k.mesh.rotation.z = -k.body.rotation;
    }

    // ── Sync rafts (position + rotation from physics) ──
    for (const r of this.raftMeshes) {
      r.mesh.position.set(r.body.position.x, -r.body.position.y, 0);
      r.mesh.rotation.z = -r.body.rotation;
    }

    // ── Sync bottles (remove collected) ──
    for (let i = this.bottleMeshes.length - 1; i >= 0; i--) {
      const b = this.bottleMeshes[i];
      if (!b.body.space) {
        this.scene.remove(b.mesh);
        this.bottleMeshes.splice(i, 1);
        continue;
      }
      // Gentle bob animation
      b.mesh.position.y = -b.body.position.y + Math.sin(this._time * 2 + b.body.position.x) * 1.5;
    }

    // ── Sync floating logs (position + rotation from physics) ──
    for (const f of this.floatingLogMeshes) {
      f.mesh.position.set(f.body.position.x, -f.body.position.y, 0);
      f.mesh.rotation.z = -f.body.rotation;
    }

    // ── Sync swinging anchors (pendulum position from game loop) ──
    const { swingingAnchorBodies: _saB } = extras;
    if (_saB) {
      for (let i = 0; i < _saB.length && i < this.swingingAnchorMeshes.length; i++) {
        const sa = _saB[i];
        const mesh = this.swingingAnchorMeshes[i];
        // Group is built with pivot at origin, chain+anchor hanging down (negative y)
        // Position at pivot, rotate around z-axis by pendulum angle
        mesh.mesh.position.set(sa.pivotX, -sa.pivotY, 0);
        mesh.mesh.rotation.z = sa.angle;
      }
    }

    // ── Sync sharks ──
    const { sharkBodies, pufferfishBodies, crabBodies, toxicFishBodies, projectileBodies, armoredFishBodies, spittingCoralBodies, switchBodies: _swB, gateBodies: _gtB } = extras;
    if (sharkBodies) {
      for (let i = 0; i < sharkBodies.length && i < this.sharkGroups.length; i++) {
        const sb = sharkBodies[i];
        const sg = this.sharkGroups[i];
        if (!sb.space) { sg.visible = false; continue; }
        sg.position.set(sb.position.x, -sb.position.y, 0);
        sg.rotation.z = -sb.rotation;
        // Stun wobble
        if (sb._stunTimer > 0) {
          sg.rotation.z += Math.sin(this._time * 15 + i) * 0.3;
          if (Math.random() < 0.12) this._spawnStunStar(sb.position.x, sb.position.y);
        }
        if (this._sharkFlipAngles[i] === undefined) this._sharkFlipAngles[i] = 0;
        let targetFlip = this._sharkFlipAngles[i];
        if (sb.velocity.x < -1) targetFlip = Math.PI;
        else if (sb.velocity.x > 1) targetFlip = 0;
        this._sharkFlipAngles[i] += (targetFlip - this._sharkFlipAngles[i]) * 0.12;
        sg.rotation.y = this._sharkFlipAngles[i];
        // Tail animation
        if (this.sharkTailPivots[i]) {
          const speed = Math.sqrt(sb.velocity.x * sb.velocity.x + sb.velocity.y * sb.velocity.y);
          const freq = 6 + speed * 0.05;
          const amp = 0.3 + Math.min(speed / 200, 0.5);
          this.sharkTailPivots[i].rotation.y = Math.sin(this._time * freq + i * 2) * amp;
        }
        // Bubbles
        const sharkSpeed = Math.sqrt(sb.velocity.x * sb.velocity.x + sb.velocity.y * sb.velocity.y);
        if (sb.position.y > WATER_SURFACE_Y && sharkSpeed > 20 && Math.random() < 0.08) {
          this.spawnBubble(sb.position.x, sb.position.y);
        }
      }
    }

    // ── Sync pufferfish ──
    if (pufferfishBodies) {
      for (let i = 0; i < pufferfishBodies.length && i < this.pufferfishGroups.length; i++) {
        const pf = pufferfishBodies[i];
        const pg = this.pufferfishGroups[i];
        if (!pf.space) { pg.visible = false; continue; }
        pg.position.set(pf.position.x, -pf.position.y, 0);
        // Gentle wobble animation (enhanced when stunned)
        if (pf._stunTimer > 0) {
          pg.rotation.z = Math.sin(this._time * 15 + i) * 0.3;
          if (Math.random() < 0.12) this._spawnStunStar(pf.position.x, pf.position.y);
        } else {
          pg.rotation.z = Math.sin(this._time * 2 + i * 3) * 0.1;
        }
        // Puff inflate/deflate animation (subtle scale pulse)
        const pulse = 1 + Math.sin(this._time * 3 + i) * 0.05;
        pg.scale.set(pulse, pulse, pulse);
      }
    }

    // ── Sync crabs ──
    if (crabBodies) {
      for (let i = 0; i < crabBodies.length && i < this.crabGroups.length; i++) {
        const cb = crabBodies[i];
        const cg = this.crabGroups[i];
        if (!cb.space) { cg.visible = false; continue; }
        cg.position.set(cb.position.x, -cb.position.y, 0);
        // Stun wobble
        if (cb._stunTimer > 0) {
          cg.rotation.z = Math.sin(this._time * 15 + i) * 0.3;
          if (Math.random() < 0.12) this._spawnStunStar(cb.position.x, cb.position.y);
        }
        // Flip based on direction
        if (this._crabFlipAngles[i] === undefined) this._crabFlipAngles[i] = 0;
        let targetFlip = this._crabFlipAngles[i];
        if (cb.velocity.x < -0.5) targetFlip = Math.PI;
        else if (cb.velocity.x > 0.5) targetFlip = 0;
        this._crabFlipAngles[i] += (targetFlip - this._crabFlipAngles[i]) * 0.1;
        cg.rotation.y = this._crabFlipAngles[i];
        // Scuttle animation — slight vertical bob
        const scuttle = Math.abs(Math.sin(this._time * 12 + i * 4)) * 1.5;
        cg.position.y += scuttle;
      }
    }

    // ── Sync toxic fish ──
    if (toxicFishBodies) {
      for (let i = 0; i < toxicFishBodies.length && i < this.toxicFishGroups.length; i++) {
        const tf = toxicFishBodies[i];
        const tg = this.toxicFishGroups[i];
        if (!tf.space) { tg.visible = false; continue; }
        tg.position.set(tf.position.x, -tf.position.y, 0);
        tg.rotation.z = -tf.rotation;
        // Stun wobble
        if (tf._stunTimer > 0) {
          tg.rotation.z += Math.sin(this._time * 15 + i) * 0.3;
          if (Math.random() < 0.12) this._spawnStunStar(tf.position.x, tf.position.y);
        }
        if (this._toxicFlipAngles[i] === undefined) this._toxicFlipAngles[i] = 0;
        let targetFlip = this._toxicFlipAngles[i];
        if (tf.velocity.x < -1) targetFlip = Math.PI;
        else if (tf.velocity.x > 1) targetFlip = 0;
        this._toxicFlipAngles[i] += (targetFlip - this._toxicFlipAngles[i]) * 0.12;
        tg.rotation.y = this._toxicFlipAngles[i];
        // Tail animation
        if (this.toxicFishTailPivots[i]) {
          const speed = Math.abs(tf.velocity.x);
          const freq = 6 + speed * 0.04;
          const amp = 0.25 + Math.min(speed / 300, 0.35);
          this.toxicFishTailPivots[i].rotation.y = Math.sin(this._time * freq + i * 2) * amp;
        }
      }
    }

    // ── Sync armored fish ──
    if (armoredFishBodies) {
      for (let i = 0; i < armoredFishBodies.length && i < this.armoredFishGroups.length; i++) {
        const af = armoredFishBodies[i];
        const ag = this.armoredFishGroups[i];
        if (!af.space) { ag.visible = false; continue; }
        ag.position.set(af.position.x, -af.position.y, 0);
        ag.rotation.z = -af.rotation;
        // Stun wobble
        if (af._stunTimer > 0) {
          ag.rotation.z += Math.sin(this._time * 15 + i) * 0.3;
          if (Math.random() < 0.12) this._spawnStunStar(af.position.x, af.position.y);
        }
        if (this._armoredFlipAngles[i] === undefined) this._armoredFlipAngles[i] = 0;
        let targetFlip = this._armoredFlipAngles[i];
        const vx = af.velocity.x;
        const vy = af.velocity.y;
        // Flip based on primary movement direction
        if (Math.abs(vx) > 1 || Math.abs(vy) > 1) {
          targetFlip = vx < -1 ? Math.PI : vx > 1 ? 0 : targetFlip;
        }
        this._armoredFlipAngles[i] += (targetFlip - this._armoredFlipAngles[i]) * 0.12;
        ag.rotation.y = this._armoredFlipAngles[i];
        // Tail animation (slower wag for heavy armored fish)
        if (this.armoredFishTailPivots[i]) {
          const speed = Math.sqrt(vx * vx + vy * vy);
          const freq = 4 + speed * 0.03;
          const amp = 0.2 + Math.min(speed / 300, 0.25);
          this.armoredFishTailPivots[i].rotation.y = Math.sin(this._time * freq + i * 2) * amp;
        }
      }
    }

    // ── Sync spitting coral (static, hide dead) ──
    if (spittingCoralBodies) {
      for (let i = 0; i < spittingCoralBodies.length && i < this.spittingCoralGroups.length; i++) {
        const sc = spittingCoralBodies[i];
        const sg = this.spittingCoralGroups[i];
        if (!sc.space) { sg.visible = false; continue; }
        sg.position.set(sc.position.x, -sc.position.y, 0);
      }
    }

    // ── Sync switches (type-specific animation) ──
    if (_swB) {
      for (const sm of this.switchMeshes) {
        const sw = sm.switchRef;
        if (!sw) continue;

        if (sw.type === 'timed' && sm.leverPivot) {
          // Lever: tilted right when inactive (-0.5 rad), tilted left when active (+0.5 rad)
          // When timer is running, lerp back gradually toward inactive
          const LEVER_OFFSET = Math.PI / 2; // 90° offset to orient arm on screen
          let targetZ;
          if (sw.active) {
            const pct = sw.timer / 5000; // 1 at start → 0 at end
            targetZ = -0.5 + pct * 1.0;  // starts at +0.5 (left), drifts to -0.5 (right)
          } else {
            targetZ = -0.5; // inactive: tilted right
          }
          sm.leverPivot.rotation.z += ((targetZ + LEVER_OFFSET) - sm.leverPivot.rotation.z) * 0.1;
        } else if (sm.padMesh) {
          // Toggle / Pressure: button sticks up when inactive, sinks into base when active
          const V = 3;
          const targetY = sw.active ? V * 0.2 : V * 2;
          sm.padMesh.position.y += (targetY - sm.padMesh.position.y) * 0.15;
          sm.padMesh.material.emissiveIntensity = sw.active ? 0.8 + Math.sin(this._time * 6) * 0.2 : 0.3;
        }
      }
    }

    // ── Sync gates (swing rotation animation) ──
    if (_gtB) {
      for (const gm of this.gateMeshes) {
        const gate = gm.gateRef;
        if (!gate) continue;
        // Rotate pivotGroup around Y axis (swing open sideways like a door)
        gm.pivotGroup.rotation.y = gate.angle;
      }
    }

    // ── Sync projectiles (position, spin, remove dead) ──
    for (let i = this.projectileMeshes.length - 1; i >= 0; i--) {
      const p = this.projectileMeshes[i];
      if (!p.body.space) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.projectileMeshes.splice(i, 1);
        continue;
      }
      p.mesh.position.set(p.body.position.x, -p.body.position.y, 0);
      p.mesh.rotation.x = this._time * 5;
      p.mesh.rotation.z = this._time * 3;
      // Pulsing glow
      p.mesh.material.emissiveIntensity = 0.4 + Math.sin(this._time * 8) * 0.3;
    }

    // ── Hide dead piranhas ──
    for (let i = 0; i < this.enemyGroups.length && i < (enemyBodies?.length ?? 0); i++) {
      if (enemyBodies[i] && !enemyBodies[i].space && this.enemyGroups[i].visible) {
        this.enemyGroups[i].visible = false;
      }
    }

    // ── Frustum culling: hide off-screen entities ──
    const { camX: _cx, camY: _cy, camVisW: _cw, camVisH: _ch } = extras;
    if (_cx !== undefined) {
      const CULL_MARGIN = 120; // px margin to prevent pop-in
      const cullLeft = _cx - CULL_MARGIN;
      const cullRight = _cx + _cw + CULL_MARGIN;
      const cullTop = _cy - CULL_MARGIN;
      const cullBottom = _cy + _ch + CULL_MARGIN;

      const cullBody = (meshEntry) => {
        if (!meshEntry.body.space) return; // already hidden by death logic
        const bx = meshEntry.body.position.x;
        const by = meshEntry.body.position.y;
        meshEntry.mesh.visible = bx >= cullLeft && bx <= cullRight && by >= cullTop && by <= cullBottom;
      };

      const cullGroup = (groups, bodies) => {
        if (!bodies) return;
        for (let i = 0; i < bodies.length && i < groups.length; i++) {
          if (!bodies[i].space) continue; // already hidden
          const bx = bodies[i].position.x;
          const by = bodies[i].position.y;
          groups[i].visible = bx >= cullLeft && bx <= cullRight && by >= cullTop && by <= cullBottom;
        }
      };

      // Cull enemies
      cullGroup(this.enemyGroups, enemyBodies);
      cullGroup(this.sharkGroups, sharkBodies);
      cullGroup(this.pufferfishGroups, pufferfishBodies);
      cullGroup(this.crabGroups, crabBodies);
      cullGroup(this.toxicFishGroups, toxicFishBodies);
      cullGroup(this.armoredFishGroups, armoredFishBodies);
      cullGroup(this.spittingCoralGroups, spittingCoralBodies);

      // Cull items
      for (const b of this.buoyMeshes) cullBody(b);
      for (const b of this.boulderMeshes) cullBody(b);
      for (const r of this.raftMeshes) cullBody(r);
      for (const c of this.crateMeshes) cullBody(c);
      for (const f of this.floatingLogMeshes) cullBody(f);
      for (const k of this.keyMeshes) cullBody(k);
      for (const b of this.bottleMeshes) cullBody(b);
      for (const h of this.hintStoneMeshes) cullBody(h);
      for (const w of this.breakableWallMeshes) cullBody(w);
    }

    // ── Update bubbles ──
    const waterSurfaceThreeY = -WATER_SURFACE_Y;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.mesh.position.y += b.vy * dt;
      const wobble = (b._isRock || b._isPearlSparkle) ? 0 : Math.sin(this._time * 3 + i) * 0.5;
      b.mesh.position.x += (b.vx || 0) * dt + wobble;
      if (b.vx && !b._isPearlSparkle) b.vx *= 0.96;
      b.life -= dt;

      if (b._isPearlSparkle) {
        // Pearl sparkle: shrink + fade, slight drag, no gravity
        b.vx *= 0.93;
        b.vy *= 0.93;
        const t = Math.max(0, b.life);
        b.mesh.material.opacity = t * 1.5;
        const s = 0.3 + t * 0.7;
        b.mesh.scale.set(s, s, s);
        b.mesh.rotation.x += 5 * dt;
        b.mesh.rotation.z += 4 * dt;
      } else if (b._isRock) {
        // Rock debris: fade by lifetime, gravity pulls down, no surface kill
        b.vy -= 150 * dt;
        b.mesh.material.opacity = Math.max(0, b.life * 0.9);
        b.mesh.rotation.x += 3 * dt;
        b.mesh.rotation.z += 2 * dt;
      } else {
        // Normal bubbles: fade near surface
        if (b.mesh.position.y >= waterSurfaceThreeY - 5) {
          b.life = Math.min(b.life, 0.15);
          b.mesh.material.opacity *= 0.85;
        } else {
          b.mesh.material.opacity = Math.max(0, b.life * 0.3);
        }
      }

      if (b.life <= 0 || (!b._isRock && !b._isPearlSparkle && b.mesh.position.y > waterSurfaceThreeY)) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
        this.bubbles.splice(i, 1);
      }
    }

    // ── Update splash droplets (airborne water drops above surface) ──
    const DROPLET_GRAVITY = 220; // px/s²
    for (let i = this.splashDroplets.length - 1; i >= 0; i--) {
      const d = this.splashDroplets[i];
      d.vy -= DROPLET_GRAVITY * dt; // gravity pulls down
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.x += d.vx * dt;
      d.vx *= 0.99;
      d.life -= dt;
      // Fade as life runs out
      d.mesh.material.opacity = Math.max(0, d.life * 0.9);
      // Remove when fallen back below surface or expired
      if (d.life <= 0 || d.mesh.position.y <= waterSurfaceThreeY) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        d.mesh.material.dispose();
        this.splashDroplets.splice(i, 1);
      }
    }

    // ── Animate god rays ──
    for (const ray of this.godRays) {
      const t = this._time * ray.speed + ray.phase;
      // Gentle horizontal sway
      ray.mesh.position.x = ray.baseX + Math.sin(t) * ray.swayAmount;
      // Pulsing opacity
      ray.mesh.material.opacity = ray.baseOpacity * (0.5 + 0.5 * Math.sin(t * 0.7 + ray.phase * 0.5));
    }

    // ── Update surface disturbances ──
    for (let i = this._surfaceDisturbances.length - 1; i >= 0; i--) {
      const d = this._surfaceDisturbances[i];
      d.age += dt;
      d.spread += 120 * dt; // ripple expands outward
      if (d.age >= d.decay) {
        this._surfaceDisturbances.splice(i, 1);
      }
    }

    // ── Animate water surface waves (pixelated look from tile-sized segments) ──
    if (this.surfaceWaveMesh) {
      const positions = this.surfaceWaveMesh.geometry.attributes.position;
      const surfaceY = -WATER_SURFACE_Y;
      const segs = this._surfacePixelSegments || SURFACE_WAVE_SEGMENTS;
      for (let i = 0; i <= segs; i++) {
        const base = i * 3; // 3 vertices per column: top, middle, bottom
        const x = positions.getX(base);
        // Smooth wave — the pixelated look comes from tile-width segments + NearestFilter texture
        let wave =
          Math.sin(x * 0.015 + this._time * SURFACE_WAVE_SPEED) * SURFACE_WAVE_AMPLITUDE * 1.5 +
          Math.sin(x * 0.04 + this._time * SURFACE_WAVE_SPEED * 1.3) * SURFACE_WAVE_AMPLITUDE;

        // Add disturbance ripples from splash impacts
        for (const d of this._surfaceDisturbances) {
          const dist = Math.abs(x - d.x);
          if (dist > d.spread) continue;
          const life = 1 - d.age / d.decay;          // 1 → 0 over lifetime
          const envelope = life * life;               // quadratic fade
          // Ripple: outward-traveling sine wave that decays with distance
          const ripple = Math.sin(dist * 0.12 - d.age * 8) *
            Math.exp(-dist / (d.spread * 0.6)) *
            d.amplitude * envelope;
          wave += ripple;
        }

        positions.setY(base, surfaceY + 8 + wave);         // top
        positions.setY(base + 1, surfaceY + wave);          // middle
        positions.setY(base + 2, surfaceY - 30 + wave * 0.1); // bottom (extended fade)
      }
      positions.needsUpdate = true;

      // Slow texture scroll for subtle shimmer
      this.surfaceWaveMesh.material.map.offset.x = this._time * 0.015;
    }

    // ── Animate surface sparkles ──
    for (const sp of this.surfaceSparkles) {
      const t = this._time * sp.speed + sp.phase;
      // Sparkle on/off pattern
      const sparkle = Math.pow(Math.max(0, Math.sin(t)), 8);
      sp.mesh.material.opacity = sparkle * sp.maxOpacity;
      // Gentle bob
      sp.mesh.position.y = -WATER_SURFACE_Y + Math.sin(t * 0.5) * 3;
    }

    // ── Animate background waves ──
    for (const bw of this.bgWaves) {
      const positions = bw.line.geometry.attributes.position;
      for (let j = 0; j <= BG_WAVE_SEGMENTS; j++) {
        const x = positions.getX(j);
        const wave = Math.sin(x * bw.frequency + this._time * bw.speed + bw.phase) * bw.amplitude;
        positions.setY(j, bw.baseY + wave);
      }
      positions.needsUpdate = true;
    }

    // ── Animate underwater current streaks ──
    for (const cs of this.currentStreaks) {
      // Drift horizontally
      cs.mesh.position.x += cs.speed * dt;
      // Gentle vertical wave
      cs.mesh.position.y = cs.baseY + Math.sin(this._time * cs.waveFreq + cs.phase) * cs.waveMag;

      // Wrap around when streak fully exits the world
      if (cs.speed > 0 && cs.mesh.position.x > WORLD_W + cs.len) {
        cs.mesh.position.x = -cs.len;
      } else if (cs.speed < 0 && cs.mesh.position.x < -cs.len) {
        cs.mesh.position.x = WORLD_W + cs.len;
      }

      // Subtle opacity pulse
      cs.mesh.material.opacity = cs.baseOpacity * (0.6 + 0.4 * Math.sin(this._time * 0.5 + cs.phase));
    }

    // ── Ambient bubbles around the player ──
    if (fishBody && fishBody.position.y > WATER_SURFACE_Y) {
      // Spawn new bubbles periodically
      this._ambientSpawnTimer = (this._ambientSpawnTimer || 0) + dt;
      const spawnInterval = 0.15; // spawn a bubble every ~150ms
      while (this._ambientSpawnTimer >= spawnInterval) {
        this._ambientSpawnTimer -= spawnInterval;
        this._spawnAmbientBubble(fishBody.position.x, fishBody.position.y);
      }
    }

    const abWaterLimit = -WATER_SURFACE_Y - 10; // stop bubbles below surface
    for (let i = this.ambientBubbles.length - 1; i >= 0; i--) {
      const ab = this.ambientBubbles[i];
      ab.age += dt;
      ab.mesh.position.y += ab.vy * dt;
      // Clamp to water surface — never go above
      if (ab.mesh.position.y > abWaterLimit) {
        ab.mesh.position.y = abWaterLimit;
      }
      ab.mesh.position.x = ab.baseX + Math.sin(this._time * ab.wobbleSpeed + ab.phase) * ab.wobbleAmount;

      // Fade in, hold, fade out over lifetime
      const fadeIn = Math.min(1, ab.age / 0.5);          // 0.5s fade in
      const fadeOut = Math.max(0, (ab.life - ab.age) / 1); // 1s fade out
      ab.mesh.material.opacity = ab.maxOpacity * fadeIn * fadeOut;

      // Remove when expired
      if (ab.age >= ab.life) {
        this.scene.remove(ab.mesh);
        ab.mesh.geometry.dispose();
        ab.mesh.material.dispose();
        this.ambientBubbles.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const mesh of this.terrainMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    if (this.fishGroup) this.scene.remove(this.fishGroup);
    for (const eg of this.enemyGroups) this.scene.remove(eg);
    for (const p of this.pearlMeshes) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    if (this.waterMesh) this.scene.remove(this.waterMesh);
    for (const b of this.bubbles) {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
    }
    for (const ray of this.godRays) {
      this.scene.remove(ray.mesh);
      ray.mesh.geometry.dispose();
      ray.mesh.material.dispose();
    }
    if (this.surfaceWaveMesh) {
      this.scene.remove(this.surfaceWaveMesh);
      this.surfaceWaveMesh.geometry.dispose();
      this.surfaceWaveMesh.material.dispose();
    }
    for (const sp of this.surfaceSparkles) {
      this.scene.remove(sp.mesh);
      sp.mesh.geometry.dispose();
      sp.mesh.material.dispose();
    }
    if (this.waterFillMesh) {
      this.scene.remove(this.waterFillMesh);
      this.waterFillMesh.geometry.dispose();
      this.waterFillMesh.material.dispose();
    }
    for (const bw of this.bgWaves) {
      this.scene.remove(bw.line);
      bw.line.geometry.dispose();
      bw.line.material.dispose();
    }
    for (const ab of this.ambientBubbles) {
      this.scene.remove(ab.mesh);
      ab.mesh.geometry.dispose();
      ab.mesh.material.dispose();
    }
    for (const cs of this.currentStreaks) {
      this.scene.remove(cs.mesh);
      cs.mesh.geometry.dispose();
      cs.mesh.material.dispose();
    }
    for (const d of this.splashDroplets) {
      this.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      d.mesh.material.dispose();
    }
    for (const texture of Object.values(this._textureCache)) {
      texture.dispose();
    }
  }
}
