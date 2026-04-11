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
    this.surfaceSparkles = [];
    this.bgLayers = [];
    this._textureCache = {};
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
      // ── Seaweed/hazard: bright green Minecraft leaf style ──
      ctx.fillStyle = '#4aad62';
      ctx.fillRect(0, 0, size, size);

      for (let py = 0; py < 16; py++) {
        for (let px2 = 0; px2 < 16; px2++) {
          const r = rng(py * 16 + px2 + 3000);
          const red = 40 + r * 40;
          const green = 130 + r * 80;   // 130-210 bright green
          const blue = 50 + r * 40;
          ctx.fillStyle = `rgb(${red}, ${Math.min(220, green)}, ${blue})`;
          ctx.fillRect(px2 * px, py * px, px, px);
        }
      }

      // Vein pattern — darker pixels in cross
      ctx.fillStyle = 'rgba(25, 80, 40, 0.5)';
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
      ctx.fillStyle = 'rgba(120, 200, 130, 0.3)';
      ctx.fillRect(0, 0, size, px);
      ctx.fillRect(0, 0, px, size);
      ctx.fillStyle = 'rgba(15, 60, 25, 0.4)';
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
        if (t >= 1 && t <= 4) {
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
      mesh.castShadow = false;
      mesh.receiveShadow = true;

      let idx = 0;
      for (let row = 0; row < LEVEL_ROWS; row++) {
        for (let col = 0; col < LEVEL_COLS; col++) {
          if (TILES[row][col] !== type) continue;
          const x = col * TILE_SIZE + TILE_SIZE / 2;
          const y = -(row * TILE_SIZE + TILE_SIZE / 2); // Y flipped for Three.js
          dummy.position.set(x, y, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx, dummy.matrix);
          idx++;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
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
    const pearlGeo = new THREE.SphereGeometry(6, 8, 8);
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

    // Deep underwater gradient background plane (far behind everything)
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = 2;
    bgCanvas.height = 512;
    const bgCtx = bgCanvas.getContext('2d');
    const grad = bgCtx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#1a6aaa');
    grad.addColorStop(0.15, '#155d90');
    grad.addColorStop(0.4, '#0f4a75');
    grad.addColorStop(0.7, '#08304d');
    grad.addColorStop(1.0, '#041a2a');
    bgCtx.fillStyle = grad;
    bgCtx.fillRect(0, 0, 2, 512);
    const bgTexture = new THREE.CanvasTexture(bgCanvas);

    const bgGeo = new THREE.PlaneGeometry(WORLD_W + 2000, WORLD_H + 600);
    const bgMat = new THREE.MeshBasicMaterial({
      map: bgTexture,
      depthWrite: false,
    });
    const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    bgMesh.position.set(WORLD_W / 2, -WORLD_H / 2, -400);
    bgMesh.renderOrder = -100;
    this.scene.add(bgMesh);

    // ── Ground plane — Minecraft-style textured floor lying flat (XZ plane) ──
    // Visible from the angled perspective camera as a receding floor
    const groundTexture = this._generateGroundTexture();
    const groundRepeatX = WORLD_W / TILE_SIZE;
    const groundDepthSize = 600; // how far the floor extends in Z behind the blocks
    const groundRepeatZ = groundDepthSize / TILE_SIZE;
    groundTexture.repeat.set(groundRepeatX, groundRepeatZ);

    const groundGeo = new THREE.PlaneGeometry(WORLD_W + 400, groundDepthSize);
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTexture,
      roughness: 1.0,
      metalness: 0.0,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    // Rotate -90° around X so it lies flat in XZ
    groundMesh.rotation.x = -Math.PI / 2;
    // Y = bottom of blocks minus half tile, Z = centered behind
    groundMesh.position.set(
      WORLD_W / 2,
      -WORLD_H + TILE_SIZE / 2,
      -groundDepthSize / 2
    );
    groundMesh.renderOrder = -50;
    this.scene.add(groundMesh);

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

  // ── Build god rays (volumetric light beams from above) ──
  buildGodRays() {
    const THREE = this.THREE;

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
      const mat = new THREE.MeshBasicMaterial({
        color: 0x6ec8f5,
        transparent: true,
        opacity: GOD_RAY_OPACITY + Math.sin(i * 4.1) * 0.02,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(geo, mat);
      const waterSurfaceThreeY = -WATER_SURFACE_Y;
      mesh.position.set(x, waterSurfaceThreeY - h / 2 + 10, -50 + i * 2);
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

  // ── Build water volume ──
  buildWater(worldW, worldH) {
    const THREE = this.THREE;
    const waterTop = WATER_SURFACE_Y;
    const waterH = worldH - waterTop;

    // Water volume (translucent blue box with depth coloring)
    const waterCanvas = document.createElement('canvas');
    waterCanvas.width = 2;
    waterCanvas.height = 256;
    const wCtx = waterCanvas.getContext('2d');
    const wGrad = wCtx.createLinearGradient(0, 0, 0, 256);
    wGrad.addColorStop(0, 'rgba(30, 120, 180, 0.08)');
    wGrad.addColorStop(0.5, 'rgba(15, 70, 130, 0.15)');
    wGrad.addColorStop(1, 'rgba(5, 30, 60, 0.25)');
    wCtx.fillStyle = wGrad;
    wCtx.fillRect(0, 0, 2, 256);
    const waterTexture = new THREE.CanvasTexture(waterCanvas);

    const geo = new THREE.BoxGeometry(worldW + 100, waterH, VOXEL_DEPTH * 3);
    const mat = new THREE.MeshBasicMaterial({
      map: waterTexture,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(worldW / 2, -(waterTop + waterH / 2), 0);
    mesh.renderOrder = 999;
    this.scene.add(mesh);
    this.waterMesh = mesh;

    // Build the fancy water surface
    this._buildWaterSurface(worldW);

    // Build sparkles on water surface
    this._buildSurfaceSparkles(worldW);
  }

  // ── Animated wave mesh for water surface ──
  _buildWaterSurface(worldW) {
    const THREE = this.THREE;
    const surfaceY = -WATER_SURFACE_Y;

    // Create a wide strip of triangles for the wavy surface
    const segW = (worldW + 200) / SURFACE_WAVE_SEGMENTS;
    const positions = [];
    const indices = [];
    const uvs = [];

    for (let i = 0; i <= SURFACE_WAVE_SEGMENTS; i++) {
      const x = -100 + i * segW;
      // Top vertex
      positions.push(x, surfaceY + 8, 0);
      uvs.push(i / SURFACE_WAVE_SEGMENTS, 1);
      // Bottom vertex
      positions.push(x, surfaceY - 15, 0);
      uvs.push(i / SURFACE_WAVE_SEGMENTS, 0);
    }

    for (let i = 0; i < SURFACE_WAVE_SEGMENTS; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = i * 2 + 2;
      const d = i * 2 + 3;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);

    // Surface gradient texture
    const surfCanvas = document.createElement('canvas');
    surfCanvas.width = 256;
    surfCanvas.height = 32;
    const sCtx = surfCanvas.getContext('2d');
    const sGrad = sCtx.createLinearGradient(0, 0, 0, 32);
    sGrad.addColorStop(0, 'rgba(140, 220, 255, 0.0)');
    sGrad.addColorStop(0.3, 'rgba(140, 220, 255, 0.5)');
    sGrad.addColorStop(0.5, 'rgba(200, 240, 255, 0.8)');
    sGrad.addColorStop(0.7, 'rgba(140, 220, 255, 0.5)');
    sGrad.addColorStop(1, 'rgba(80, 160, 220, 0.0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 256, 32);

    // Add horizontal shimmer lines
    sCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    sCtx.lineWidth = 1;
    for (let x = 0; x < 256; x += 8) {
      const y = 14 + Math.sin(x * 0.1) * 3;
      sCtx.beginPath();
      sCtx.moveTo(x, y);
      sCtx.lineTo(x + 4, y + Math.sin(x * 0.2) * 2);
      sCtx.stroke();
    }

    const surfTexture = new THREE.CanvasTexture(surfCanvas);
    surfTexture.wrapS = THREE.RepeatWrapping;
    surfTexture.repeat.x = 20;

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
    sun.position.set(300, 400, 500);
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
    if (this.bubbles.length > 40) return; // limit

    const size = 1 + Math.random() * 3;
    const geo = new THREE.SphereGeometry(size, 6, 6);
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
      life: 1.5 + Math.random() * 2,
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
      // Splash bubbles when entering water
      if (fishState && fishState.justEnteredWater) {
        for (let i = 0; i < 8; i++) {
          this.spawnBubble(fishBody.position.x, fishBody.position.y);
        }
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
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.x += Math.sin(this._time * 3 + i) * 0.5;
      b.life -= dt;
      b.mesh.material.opacity = Math.max(0, b.life * 0.3);
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
        this.bubbles.splice(i, 1);
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

    // ── Animate water surface waves ──
    if (this.surfaceWaveMesh) {
      const positions = this.surfaceWaveMesh.geometry.attributes.position;
      const surfaceY = -WATER_SURFACE_Y;
      for (let i = 0; i <= SURFACE_WAVE_SEGMENTS; i++) {
        const topIdx = i * 2;
        const x = positions.getX(topIdx);
        // Multi-layered wave function for organic look
        const wave =
          Math.sin(x * 0.02 + this._time * SURFACE_WAVE_SPEED) * SURFACE_WAVE_AMPLITUDE +
          Math.sin(x * 0.05 + this._time * SURFACE_WAVE_SPEED * 1.3) * (SURFACE_WAVE_AMPLITUDE * 0.5) +
          Math.sin(x * 0.01 + this._time * SURFACE_WAVE_SPEED * 0.7) * (SURFACE_WAVE_AMPLITUDE * 0.3);
        positions.setY(topIdx, surfaceY + 8 + wave);
        positions.setY(topIdx + 1, surfaceY - 15 + wave * 0.3);
      }
      positions.needsUpdate = true;

      // Scroll surface texture for shimmer effect
      this.surfaceWaveMesh.material.map.offset.x = this._time * 0.02;
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

    // ── Animate water volume ──
    if (this.waterMesh) {
      this.waterMesh.position.y += Math.sin(this._time * 1.5) * 0.02;
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
    for (const texture of Object.values(this._textureCache)) {
      texture.dispose();
    }
  }
}
