// ── Voxel Renderer ─────────────────────────────────────────────────────────
// Three.js voxel-style renderer for the underwater platformer.
// Uses InstancedMesh for terrain, Group of boxes for fish/enemies.
// Enhanced with procedural textures, god rays, and underwater atmosphere.

import { TILE_SIZE, LEVEL_COLS, LEVEL_ROWS, TILES, WATER_SURFACE_Y, WORLD_W, WORLD_H } from './level-data.js';

const VOXEL_DEPTH = TILE_SIZE; // Z depth of each voxel

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
    this.waterMesh = null;
    this.bubbles = [];
    this._time = 0;
    this._fishFlipAngle = 0;       // current Y rotation for 3D flip (0 = right, π = left)
    this._enemyFlipAngles = [];    // per-enemy Y rotation for 3D flip

    // New visual elements
    this.godRays = [];
    this.surfaceWaveMesh = null;
    this.waterFillMesh = null;
    this.surfaceSparkles = [];
    this.bgLayers = [];
    this.bgWaves = [];
    this.ambientBubbles = [];
    this._textureCache = {};
    this._surfaceDisturbances = []; // { x, amplitude, age, decay, spread }
    this.splashDroplets = [];        // { mesh, vx, vy, life } — airborne water droplets
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
    const seed = type * 1337;
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
  }

  // ── Build the player fish model (voxel style, Magikarp-inspired) ──
  buildFish() {
    const THREE = this.THREE;
    const group = new THREE.Group();
    const V = 2; // smaller voxel for more detail

    const addVoxel = (x, y, z, color) => {
      const geo = new THREE.BoxGeometry(V, V, V);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x * V, y * V, z * V);
      return mesh;
    };

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

    // Helper: add a row of voxels along X for a given y, z, color
    const row = (xs, y, z, color) => {
      for (const x of xs) group.add(addVoxel(x, y, z, color));
    };

    // ── Body: round oval shape, 10 long × 8 tall × 6 deep ──
    // Build layer by layer in Z. Body is symmetric around z=2.5
    // Each Z-slice defines rows [y] -> x range

    // Z=0, Z=5 (outermost edges, small)
    const sliceOuter = () => {
      // Red upper body
      row([3, 4, 5, 6], 3, 0, RED);
      row([3, 4, 5, 6], 2, 0, RED);
      row([4, 5], 1, 0, RED_LIGHT);
      // White belly
      row([4, 5], 0, 0, WHITE);
      row([4, 5], -1, 0, WHITE);
    };

    // Z=1, Z=4 (mid-outer, bigger)
    const sliceMidOuter = () => {
      row([2, 3, 4, 5, 6, 7], 4, 1, RED);
      row([1, 2, 3, 4, 5, 6, 7, 8], 3, 1, RED);
      row([1, 2, 3, 4, 5, 6, 7, 8], 2, 1, RED_LIGHT);
      row([2, 3, 4, 5, 6, 7, 8], 1, 1, RED_LIGHT);
      // White belly
      row([2, 3, 4, 5, 6, 7, 8], 0, 1, WHITE);
      row([3, 4, 5, 6, 7], -1, 1, WHITE);
      row([4, 5, 6], -2, 1, WHITE_LIGHT);
    };

    // Z=2, Z=3 (center, biggest cross-section)
    const sliceCenter = () => {
      row([3, 4, 5, 6], 5, 2, RED_DARK);
      row([1, 2, 3, 4, 5, 6, 7, 8], 4, 2, RED);
      row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 3, 2, RED);
      row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 2, 2, RED_LIGHT);
      row([1, 2, 3, 4, 5, 6, 7, 8, 9], 1, 2, RED_LIGHT);
      // White belly
      row([1, 2, 3, 4, 5, 6, 7, 8, 9], 0, 2, WHITE);
      row([2, 3, 4, 5, 6, 7, 8], -1, 2, WHITE);
      row([3, 4, 5, 6, 7], -2, 2, WHITE_LIGHT);
    };

    // Place body slices symmetrically
    // Z=0 and Z=5
    sliceOuter();
    // Mirror Z=0 to Z=5
    for (const child of [...group.children]) {
      if (child.position.z === 0) {
        group.add(addVoxel(child.position.x / V, child.position.y / V, 5, child.material.color.getHex()));
      }
    }

    // Z=1 and Z=4
    const countBefore1 = group.children.length;
    sliceMidOuter();
    const addedSlice1 = group.children.slice(countBefore1);
    for (const child of addedSlice1) {
      group.add(addVoxel(child.position.x / V, child.position.y / V, 4, child.material.color.getHex()));
    }

    // Z=2 and Z=3
    const countBefore2 = group.children.length;
    sliceCenter();
    const addedSlice2 = group.children.slice(countBefore2);
    for (const child of addedSlice2) {
      group.add(addVoxel(child.position.x / V, child.position.y / V, 3, child.material.color.getHex()));
    }

    // ── Horizontal scale pattern (dark red stripes on body) ──
    for (const z of [1, 2, 3, 4]) {
      row([2, 4, 6, 8], 3, z, RED_DARK);
      row([3, 5, 7], 2, z, RED_DARK);
    }

    // ── Eyes (on outermost visible Z layers: z=0 and z=5) ──
    // Left eye (z=0 side) — 2 voxels tall
    group.add(addVoxel(8, 3, -0.2, EYE_WHITE));
    group.add(addVoxel(8, 2, -0.2, EYE_WHITE));
    const pupilL = addVoxel(8, 2.8, -0.5, EYE_BLACK);
    pupilL.scale.set(0.7, 0.7, 0.4);
    group.add(pupilL);
    // Right eye (z=5 side) — 2 voxels tall
    group.add(addVoxel(8, 3, 5.2, EYE_WHITE));
    group.add(addVoxel(8, 2, 5.2, EYE_WHITE));
    const pupilR = addVoxel(8, 2.8, 5.5, EYE_BLACK);
    pupilR.scale.set(0.7, 0.7, 0.4);
    group.add(pupilR);

    // ── Mouth (front, slightly open) ──
    group.add(addVoxel(9, 1, 2, MOUTH));
    group.add(addVoxel(9, 1, 3, MOUTH));

    // ── Whiskers / barbels (yellow, hanging down from mouth) ──
    group.add(addVoxel(10, 1, 1, WHISKER));
    group.add(addVoxel(10, 0, 1, WHISKER));
    group.add(addVoxel(10, 1, 4, WHISKER));
    group.add(addVoxel(10, 0, 4, WHISKER));

    // ── Dorsal crown / top fin (yellow crest) ──
    // Base row
    for (const x of [3, 4, 5, 6]) {
      for (const z of [2, 3]) {
        group.add(addVoxel(x, 6, z, YELLOW));
      }
    }
    // Tips (narrower)
    for (const x of [4, 5]) {
      for (const z of [2, 3]) {
        group.add(addVoxel(x, 7, z, YELLOW_DARK));
      }
    }

    // ── Pectoral fins (small yellow, on sides) ──
    // Left fin (z=-1)
    group.add(addVoxel(5, 0, -1, YELLOW));
    group.add(addVoxel(6, 0, -1, YELLOW));
    group.add(addVoxel(5, -1, -1, YELLOW_DARK));
    group.add(addVoxel(6, -1, -1, YELLOW_DARK));
    // Right fin (z=6)
    group.add(addVoxel(5, 0, 6, YELLOW));
    group.add(addVoxel(6, 0, 6, YELLOW));
    group.add(addVoxel(5, -1, 6, YELLOW_DARK));
    group.add(addVoxel(6, -1, 6, YELLOW_DARK));

    // ── Tail (separate group for animation) ──
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, V * 1.5, V * 2.5); // pivot at body rear center
    const TAIL_Y = 0xf0b010;
    const TAIL_Y_DARK = 0xd09000;

    // Tail fan shape — spreads out vertically
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
      tailPivot.add(addVoxel(x, y, z, color));
    }
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
    const group = new THREE.Group();
    const V = 2;

    const addVoxel = (x, y, z, color) => {
      const geo = new THREE.BoxGeometry(V, V, V);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x * V, y * V, z * V);
      return mesh;
    };

    // Colors
    const BODY = 0x662244;
    const BODY_DARK = 0x551133;
    const BODY_LIGHT = 0x773355;
    const BELLY = 0x998888;
    const BELLY_LIGHT = 0xaa9999;
    const FIN = 0x993366;
    const FIN_DARK = 0x772255;
    const EYE_RED = 0xff2222;

    const row = (xs, y, z, color) => {
      for (const x of xs) group.add(addVoxel(x, y, z, color));
    };

    // Z=0, Z=5 (outermost)
    const sliceOuter = (z) => {
      row([3, 4, 5, 6], 3, z, BODY);
      row([3, 4, 5, 6], 2, z, BODY_LIGHT);
      row([4, 5], 1, z, BODY_LIGHT);
      row([4, 5], 0, z, BELLY);
      row([4, 5], -1, z, BELLY);
    };

    // Z=1, Z=4 (mid)
    const sliceMid = (z) => {
      row([2, 3, 4, 5, 6, 7], 4, z, BODY);
      row([1, 2, 3, 4, 5, 6, 7, 8], 3, z, BODY);
      row([1, 2, 3, 4, 5, 6, 7, 8], 2, z, BODY_LIGHT);
      row([2, 3, 4, 5, 6, 7, 8], 1, z, BODY_LIGHT);
      row([2, 3, 4, 5, 6, 7, 8], 0, z, BELLY);
      row([3, 4, 5, 6, 7], -1, z, BELLY);
      row([4, 5, 6], -2, z, BELLY_LIGHT);
    };

    // Z=2, Z=3 (center)
    const sliceCenter = (z) => {
      row([3, 4, 5, 6], 5, z, BODY_DARK);
      row([1, 2, 3, 4, 5, 6, 7, 8], 4, z, BODY);
      row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 3, z, BODY);
      row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 2, z, BODY_LIGHT);
      row([1, 2, 3, 4, 5, 6, 7, 8, 9], 1, z, BODY_LIGHT);
      row([1, 2, 3, 4, 5, 6, 7, 8, 9], 0, z, BELLY);
      row([2, 3, 4, 5, 6, 7, 8], -1, z, BELLY);
      row([3, 4, 5, 6, 7], -2, z, BELLY_LIGHT);
    };

    sliceOuter(0); sliceOuter(5);
    sliceMid(1); sliceMid(4);
    sliceCenter(2); sliceCenter(3);

    // Scale pattern
    for (const z of [1, 2, 3, 4]) {
      row([2, 4, 6, 8], 3, z, BODY_DARK);
      row([3, 5, 7], 2, z, BODY_DARK);
    }

    // Eyes (angry red) — 2 voxels tall
    group.add(addVoxel(8, 3, -0.2, EYE_RED));
    group.add(addVoxel(8, 2, -0.2, EYE_RED));
    group.add(addVoxel(8, 3, 5.2, EYE_RED));
    group.add(addVoxel(8, 2, 5.2, EYE_RED));

    // Spiky dorsal fin (reduced height)
    for (const x of [2, 3, 4, 5, 6, 7]) {
      for (const z of [2, 3]) {
        group.add(addVoxel(x, 6, z, FIN));
      }
    }
    for (const x of [4, 5]) {
      for (const z of [2, 3]) {
        group.add(addVoxel(x, 7, z, FIN_DARK));
      }
    }

    // Tail (separate group for animation)
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
    for (const [x, y, z] of tailVoxels) tailPivot.add(addVoxel(x, y, z, FIN));
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

  // ── Build pearl collectible meshes ──
  buildPearls(pearlBodies) {
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
    if (this.bubbles.length > 60) return; // limit

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

  // ── Per-frame update ──
  syncFrame(fishBody, fishState, enemyBodies, dt) {
    this._time += dt;

    // ── Sync player fish ──
    if (this.fishGroup && fishBody) {
      this.fishGroup.position.set(
        fishBody.position.x,
        -fishBody.position.y,
        0
      );
      this.fishGroup.rotation.z = -(fishState?.visualRotation ?? 0);

      // 3D flip: lerp Y rotation for smooth turn-around
      const targetFlip = (fishState && !fishState.facingRight) ? Math.PI : 0;
      this._fishFlipAngle += (targetFlip - this._fishFlipAngle) * 0.12;
      this.fishGroup.rotation.y = this._fishFlipAngle;

      // Tail animation — wave based on swim speed
      if (this.fishTailPivot) {
        const speed = fishState ? fishState.swimSpeed : 0;
        const freq = fishState?.dashing ? 25 : 8 + speed * 0.05;
        const amp = fishState?.dashing ? 0.6 : 0.3 + Math.min(speed / 300, 0.4);
        this.fishTailPivot.rotation.y = Math.sin(this._time * freq) * amp;
      }

      // Spawn bubbles while swimming
      if (fishState && fishState.inWater && fishState.swimSpeed > 30 && Math.random() < 0.15) {
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
    }

    // ── Sync enemy fish ──
    for (let i = 0; i < enemyBodies.length && i < this.enemyGroups.length; i++) {
      const eb = enemyBodies[i];
      const eg = this.enemyGroups[i];
      eg.position.set(eb.position.x, -eb.position.y, 0);
      eg.rotation.z = -eb.rotation;
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
        // Pearl was collected — remove mesh
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

    // ── Update bubbles ──
    const waterSurfaceThreeY = -WATER_SURFACE_Y;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.x += (b.vx || 0) * dt + Math.sin(this._time * 3 + i) * 0.5;
      if (b.vx) b.vx *= 0.96; // horizontal splash drag
      b.life -= dt;
      // Fade out and remove when reaching water surface or lifetime ends
      if (b.mesh.position.y >= waterSurfaceThreeY - 5) {
        b.life = Math.min(b.life, 0.15); // quick fade near surface
        b.mesh.material.opacity *= 0.85;
      } else {
        b.mesh.material.opacity = Math.max(0, b.life * 0.3);
      }
      if (b.life <= 0 || b.mesh.position.y > waterSurfaceThreeY) {
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
