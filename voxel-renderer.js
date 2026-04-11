// ── Voxel Renderer ─────────────────────────────────────────────────────────
// Three.js voxel-style renderer for the underwater platformer.
// Uses InstancedMesh for terrain, Group of boxes for fish/enemies.
// Enhanced with procedural textures, god rays, and underwater atmosphere.

import { TILE_SIZE, LEVEL_COLS, LEVEL_ROWS, TILES, WATER_SURFACE_Y, WORLD_W, WORLD_H } from './level-data.js';

// Tile type -> base color
const TILE_COLORS = {
  1: 0x5a5a6e, // stone
  2: 0xc2a86e, // sand
  3: 0xe05555, // coral
  4: 0x2d8a4e, // seaweed/hazard (green)
};

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
    this.waterMesh = null;
    this.bubbles = [];
    this._time = 0;

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

    if (type === 1) {
      // ── Stone: gray with cracks and variation ──
      ctx.fillStyle = '#5a5a6e';
      ctx.fillRect(0, 0, size, size);

      // Random stone patches
      for (let i = 0; i < 20; i++) {
        const x = rng(i) * size;
        const y = rng(i + 100) * size;
        const s = 4 + rng(i + 200) * 10;
        const brightness = 70 + rng(i + 300) * 40;
        ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness + 10})`;
        ctx.fillRect(x, y, s, s);
      }

      // Dark cracks
      ctx.strokeStyle = 'rgba(30, 30, 40, 0.4)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(rng(i + 400) * size, rng(i + 500) * size);
        ctx.lineTo(rng(i + 600) * size, rng(i + 700) * size);
        ctx.stroke();
      }

      // Subtle grid lines (Minecraft-style block edges)
      ctx.strokeStyle = 'rgba(40, 40, 55, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

    } else if (type === 2) {
      // ── Sand: warm with grain texture ──
      ctx.fillStyle = '#c2a86e';
      ctx.fillRect(0, 0, size, size);

      // Sand grains
      for (let i = 0; i < 80; i++) {
        const x = rng(i) * size;
        const y = rng(i + 50) * size;
        const r = 0.5 + rng(i + 100) * 1.5;
        const light = rng(i + 150) > 0.5;
        ctx.fillStyle = light ? 'rgba(210, 190, 130, 0.6)' : 'rgba(160, 140, 80, 0.4)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Subtle wave lines in sand
      ctx.strokeStyle = 'rgba(180, 155, 90, 0.3)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const y = 15 + i * 18;
        ctx.beginPath();
        for (let x = 0; x < size; x += 2) {
          ctx.lineTo(x, y + Math.sin(x * 0.3 + i) * 2);
        }
        ctx.stroke();
      }

      // Block edge
      ctx.strokeStyle = 'rgba(150, 130, 70, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

    } else if (type === 3) {
      // ── Coral: vibrant red/pink with organic texture ──
      ctx.fillStyle = '#d04848';
      ctx.fillRect(0, 0, size, size);

      // Coral polyp bumps
      for (let i = 0; i < 15; i++) {
        const x = rng(i) * size;
        const y = rng(i + 50) * size;
        const r = 3 + rng(i + 100) * 6;
        const hue = 350 + rng(i + 150) * 20;
        const lightness = 45 + rng(i + 200) * 20;
        ctx.fillStyle = `hsl(${hue}, 70%, ${lightness}%)`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Light spots
      for (let i = 0; i < 8; i++) {
        const x = rng(i + 300) * size;
        const y = rng(i + 350) * size;
        ctx.fillStyle = 'rgba(255, 150, 150, 0.3)';
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(120, 30, 30, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

    } else if (type === 4) {
      // ── Seaweed/hazard: dark green with leafy pattern ──
      ctx.fillStyle = '#2d8a4e';
      ctx.fillRect(0, 0, size, size);

      // Leaf veins
      ctx.strokeStyle = 'rgba(20, 100, 50, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(size / 2, 0);
      ctx.lineTo(size / 2, size);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const y = 5 + i * 10;
        const dir = i % 2 === 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(size / 2, y);
        ctx.lineTo(size / 2 + dir * 20, y + 8);
        ctx.stroke();
      }

      // Spots
      for (let i = 0; i < 10; i++) {
        const x = rng(i + 500) * size;
        const y = rng(i + 550) * size;
        ctx.fillStyle = rng(i + 600) > 0.5 ? 'rgba(60, 160, 80, 0.4)' : 'rgba(20, 60, 30, 0.3)';
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(15, 60, 30, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
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
      const color = TILE_COLORS[type] || 0x888888;
      const texture = this._generateTileTexture(type);
      const mat = new THREE.MeshLambertMaterial({
        map: texture,
        color,
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

  // ── Build the player fish model (voxel style) ──
  buildFish() {
    const THREE = this.THREE;
    const group = new THREE.Group();
    const V = 4; // voxel unit size (smaller than tile for detail)

    const addVoxel = (x, y, z, color) => {
      const geo = new THREE.BoxGeometry(V, V, V);
      const mat = new THREE.MeshLambertMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x * V, y * V, z * V);
      return mesh;
    };

    // Body (orange) - 5 voxels long, 3 tall, 2 deep
    const bodyColor = 0xff8c42;
    const bodyVoxels = [
      // Main body
      [0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0],
      [0, 1, 0], [1, 1, 0], [2, 1, 0], [3, 1, 0],
      [0, -1, 0], [1, -1, 0], [2, -1, 0],
      // Depth layer
      [0, 0, 1], [1, 0, 1], [2, 0, 1], [3, 0, 1],
      [0, 1, 1], [1, 1, 1], [2, 1, 1], [3, 1, 1],
      [0, -1, 1], [1, -1, 1], [2, -1, 1],
      // Head (front)
      [4, 0, 0], [4, 1, 0], [4, 0, 1], [4, 1, 1],
    ];
    for (const [x, y, z] of bodyVoxels) {
      group.add(addVoxel(x, y, z, bodyColor));
    }

    // Eye (white + black pupil)
    group.add(addVoxel(4, 1, 0, 0xffffff)); // white
    const pupil = addVoxel(4, 1, -0.3, 0x111111);
    pupil.scale.set(0.5, 0.5, 0.5);
    group.add(pupil);

    // Top fin (yellow)
    group.add(addVoxel(1, 2, 0, 0xffd93d));
    group.add(addVoxel(2, 2, 0, 0xffd93d));
    group.add(addVoxel(1, 2, 1, 0xffd93d));
    group.add(addVoxel(2, 2, 1, 0xffd93d));

    // Tail (separate group for animation)
    const tailPivot = new THREE.Group();
    tailPivot.position.set(-1 * V, 0, 0.5 * V);
    const tailColor = 0xff6b35;
    const tailVoxels = [
      [-1, 0, 0], [-1, 1, 0], [-1, -1, 0],
      [-2, 1, 0], [-2, 0, 0], [-2, -1, 0],
      [-1, 0, 1], [-1, 1, 1], [-1, -1, 1],
      [-2, 1, 1], [-2, 0, 1], [-2, -1, 1],
    ];
    for (const [x, y, z] of tailVoxels) {
      const v = addVoxel(x + 1, y, z, tailColor);
      // Offset relative to pivot
      tailPivot.add(v);
    }
    group.add(tailPivot);
    this.fishTailPivot = tailPivot;

    // Center the fish model
    group.position.set(0, 0, -0.5 * V);

    this.fishGroup = group;
    this.scene.add(group);
    return group;
  }

  // ── Build an enemy fish (red/dark) ──
  buildEnemyFish() {
    const THREE = this.THREE;
    const group = new THREE.Group();
    const V = 4;

    const addVoxel = (x, y, z, color) => {
      const geo = new THREE.BoxGeometry(V, V, V);
      const mat = new THREE.MeshLambertMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x * V, y * V, z * V);
      return mesh;
    };

    // Body (dark red)
    const bodyColor = 0x992222;
    const coords = [
      [0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0],
      [0, 1, 0], [1, 1, 0], [2, 1, 0], [3, 1, 0],
      [0, -1, 0], [1, -1, 0], [2, -1, 0],
      [0, 0, 1], [1, 0, 1], [2, 0, 1], [3, 0, 1],
      [0, 1, 1], [1, 1, 1], [2, 1, 1], [3, 1, 1],
      [0, -1, 1], [1, -1, 1], [2, -1, 1],
      [4, 0, 0], [4, 1, 0], [4, 0, 1], [4, 1, 1],
    ];
    for (const [x, y, z] of coords) group.add(addVoxel(x, y, z, bodyColor));

    // Eye
    group.add(addVoxel(4, 1, 0, 0xff4444));

    // Spiky fin
    group.add(addVoxel(1, 2, 0, 0x661111));
    group.add(addVoxel(2, 2, 0, 0x661111));
    group.add(addVoxel(3, 2, 0, 0x661111));

    // Tail
    const tailVoxels = [
      [-1, 0, 0], [-1, 1, 0], [-1, -1, 0],
      [-2, 1, 0], [-2, -1, 0],
      [-1, 0, 1], [-1, 1, 1], [-1, -1, 1],
      [-2, 1, 1], [-2, -1, 1],
    ];
    for (const [x, y, z] of tailVoxels) group.add(addVoxel(x, y, z, 0x771111));

    group.position.set(0, 0, -2);
    this.scene.add(group);
    this.enemyGroups.push(group);
    return group;
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
    // Top: bright blue near surface
    grad.addColorStop(0, '#0a4a7a');
    grad.addColorStop(0.15, '#0b3d6a');
    grad.addColorStop(0.4, '#072a4d');
    grad.addColorStop(0.7, '#041a33');
    grad.addColorStop(1.0, '#020d1a');
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

    // Parallax background layers with faint terrain silhouettes
    for (let i = 0; i < BG_LAYER_COUNT; i++) {
      const depth = -150 - i * 100; // z position (further back)
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

    // Ambient (underwater mood — slightly brighter for textured blocks)
    const ambient = new THREE.AmbientLight(0x5577aa, 0.8);
    this.scene.add(ambient);

    // Sun from above — strong directional to mimic light penetrating water
    const sun = new THREE.DirectionalLight(0xaaddff, 1.0);
    sun.position.set(200, 500, 400);
    this.scene.add(sun);

    // Soft fill from the side
    const fill = new THREE.DirectionalLight(0x6699bb, 0.4);
    fill.position.set(-200, 0, 200);
    this.scene.add(fill);

    // Subtle warm uplight from sandy bottom
    const uplight = new THREE.DirectionalLight(0xaa9966, 0.15);
    uplight.position.set(0, -300, 100);
    this.scene.add(uplight);

    // Underwater fog — deeper blue, longer range for better depth feel
    this.scene.fog = new THREE.FogExp2(0x05192d, 0.0012);
    this.scene.background = new THREE.Color(0x030e1a);
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
    const THREE = this.THREE;
    this._time += dt;

    // ── Sync player fish ──
    if (this.fishGroup && fishBody) {
      this.fishGroup.position.set(
        fishBody.position.x,
        -fishBody.position.y,
        0
      );
      this.fishGroup.rotation.z = -fishBody.rotation;

      // Flip fish when facing left (mirror on Y axis)
      if (fishState && !fishState.facingRight) {
        this.fishGroup.scale.x = -1;
      } else {
        this.fishGroup.scale.x = 1;
      }

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
      // Face movement direction
      if (eb.velocity.x < -1) eg.scale.x = -1;
      else if (eb.velocity.x > 1) eg.scale.x = 1;
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
