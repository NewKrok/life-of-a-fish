// ── Menu Scene ──────────────────────────────────────────────────────────────
// Self-contained menu background: renders a dedicated aquarium level with
// AI fish swimming around. Used as the backdrop for the main menu.

import {
  Space, Body, BodyType, Vec2, Capsule, Circle,
  FluidProperties, Polygon,
} from "@newkrok/nape-js";

import { TILE_SIZE } from './level-data.js';
import {
  MENU_COLS, MENU_ROWS, MENU_WORLD_W, MENU_WORLD_H, MENU_WATER_SURFACE_Y,
  MENU_TILES, getMenuFish, getMenuMergedBodies, getMenuWaterZones,
} from './menu-level-data.js';

import { VoxelRenderer } from './voxel-renderer.js';

// ── Constants ──
const DT = 1 / 60;
const ENEMY_SPEED = 55;              // px/s — gentle patrol
const SHARK_PATROL_SPEED = 40;       // px/s
const PUFFER_SPEED = 25;             // px/s
const PUFFER_RANGE = 50;             // px

// ── Camera ──
const CAM_FOV = 45;
const CAM_PITCH = -0.26;
const CAM_DISTANCE = 550;

export class MenuScene {
  constructor(THREE, renderer) {
    this.THREE = THREE;
    this.renderer = renderer;
    this._running = false;
    this._animId = null;

    // Aquarium mode state
    this._aquariumMode = false;
    this._aquariumCamDir = 1;       // 1 = moving right, -1 = moving left
    this._aquariumCamSpeed = 24;    // px/s (20% slower than original 30)

    // Easing back to center when leaving aquarium
    this._easingBack = false;
    this._easeStartX = 0;
    this._easeStartY = 0;
    this._easeTargetX = 0;
    this._easeTargetY = 0;
    this._easeElapsed = 0;
    this._easeDuration = 0.5;       // seconds

    // ── Editor reference ──
    this._editor = null;

    // ── Scene ──
    this.scene = new THREE.Scene();

    // ── Camera ──
    const camZOffset = Math.cos(CAM_PITCH) * CAM_DISTANCE;
    const camYOffset = Math.sin(CAM_PITCH) * CAM_DISTANCE;
    this._camZOffset = camZOffset;
    this._camYOffset = camYOffset;

    this.camera = new THREE.PerspectiveCamera(
      CAM_FOV, window.innerWidth / window.innerHeight, 1, 3000
    );
    this.camX = 0;
    this.camY = 0;

    // ── Voxel Renderer (uses the main level-data imports by default,
    //    but we'll override terrain with our own build) ──
    this.voxelRenderer = new VoxelRenderer(THREE, this.scene);
    this.voxelRenderer.setupLighting();
    this._buildMenuBackground();
    this._buildMenuTerrain();
    this.voxelRenderer.buildWater(MENU_WORLD_W);
    this.voxelRenderer.buildBackgroundWaves();
    this.voxelRenderer.buildAmbientBubbles();
    this.voxelRenderer.buildGodRays();
    this.voxelRenderer.buildCurrents();

    // ── Physics ──
    this.space = new Space();
    this.space.gravity = new Vec2(0, 200);

    // Terrain bodies
    const merged = getMenuMergedBodies();
    for (const mb of merged) {
      const b = new Body(BodyType.STATIC, new Vec2(mb.x, mb.y));
      b.shapes.add(new Polygon(Polygon.box(mb.w, mb.h)));
      b.space = this.space;
    }

    // Water zones
    const waterZones = getMenuWaterZones();
    for (const wz of waterZones) {
      const b = new Body(BodyType.STATIC, new Vec2(wz.x, wz.y));
      const shape = new Polygon(Polygon.box(wz.w, wz.h));
      shape.fluidEnabled = true;
      shape.fluidProperties = new FluidProperties(1.0, 3);
      b.shapes.add(shape);
      b.space = this.space;
    }

    // ── Fish entities ──
    const fish = getMenuFish();

    this.enemyBodies = [];
    for (const en of fish.enemies) {
      const b = new Body(BodyType.KINEMATIC, new Vec2(en.x, en.y));
      b.shapes.add(new Capsule(24, 12));
      b.space = this.space;
      b._patrol = {
        minX: Math.max(TILE_SIZE * 2, en.x - 120 - Math.random() * 80),
        maxX: Math.min(MENU_WORLD_W - TILE_SIZE * 2, en.x + 120 + Math.random() * 80),
        speed: ENEMY_SPEED + (Math.random() - 0.5) * 20,
        _dir: Math.random() < 0.5 ? 1 : -1,
      };
      this.enemyBodies.push(b);
      this.voxelRenderer.buildEnemyFish();
    }

    this.sharkBodies = [];
    for (const sh of fish.sharks) {
      const b = new Body(BodyType.KINEMATIC, new Vec2(sh.x, sh.y));
      b.shapes.add(new Capsule(28, 14));
      b.space = this.space;
      b._patrol = {
        minX: Math.max(TILE_SIZE * 2, sh.x - 150 - Math.random() * 100),
        maxX: Math.min(MENU_WORLD_W - TILE_SIZE * 2, sh.x + 150 + Math.random() * 100),
        speed: SHARK_PATROL_SPEED + (Math.random() - 0.5) * 10,
        _dir: Math.random() < 0.5 ? 1 : -1,
      };
      this.sharkBodies.push(b);
      this.voxelRenderer.buildShark();
    }

    this.pufferfishBodies = [];
    for (const pf of fish.pufferfish) {
      const b = new Body(BodyType.KINEMATIC, new Vec2(pf.x, pf.y));
      b.shapes.add(new Circle(17));
      b.space = this.space;
      b._patrol = {
        minY: pf.y - PUFFER_RANGE,
        maxY: pf.y + PUFFER_RANGE,
        speed: PUFFER_SPEED,
        _dir: 1,
      };
      this.pufferfishBodies.push(b);
      this.voxelRenderer.buildPufferfish();
    }

    this.crabBodies = [];
    for (const cr of (fish.crabs || [])) {
      const b = new Body(BodyType.KINEMATIC, new Vec2(cr.x, cr.y));
      b.shapes.add(new Capsule(16, 10));
      b.space = this.space;
      b._patrol = {
        minX: Math.max(TILE_SIZE * 2, cr.x - 50 - Math.random() * 30),
        maxX: Math.min(MENU_WORLD_W - TILE_SIZE * 2, cr.x + 50 + Math.random() * 30),
        speed: 25 + (Math.random() - 0.5) * 10,
        _dir: Math.random() < 0.5 ? 1 : -1,
      };
      this.crabBodies.push(b);
      this.voxelRenderer.buildCrab();
    }

    // ── Center camera on aquarium ──
    this._centerCamera();
  }

  // ── Build menu-specific background (adapted from VoxelRenderer) ──
  _buildMenuBackground() {
    const THREE = this.THREE;
    const WORLD_W = MENU_WORLD_W;
    const WORLD_H = MENU_WORLD_H;
    const WATER_SURF = MENU_WATER_SURFACE_Y;

    // Sky
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 2; skyCanvas.height = 256;
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

    const skyH = WATER_SURF + 100;
    const skyGeo = new THREE.PlaneGeometry(WORLD_W + 2000, skyH);
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture, depthWrite: false });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.position.set(WORLD_W / 2, -WATER_SURF + skyH / 2, -399);
    skyMesh.renderOrder = -100;
    this.scene.add(skyMesh);

    // Underwater background
    const groundY = WORLD_H - TILE_SIZE;
    const waterBgH = groundY - WATER_SURF;
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = 2; bgCanvas.height = 256;
    const bgCtx = bgCanvas.getContext('2d');
    const grad = bgCtx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1a7aaa');
    grad.addColorStop(0.15, '#146090');
    grad.addColorStop(0.3, '#0e4a72');
    grad.addColorStop(0.5, '#0a3558');
    grad.addColorStop(0.7, '#072845');
    grad.addColorStop(1.0, '#061e35');
    bgCtx.fillStyle = grad;
    bgCtx.fillRect(0, 0, 2, 256);
    const bgTexture = new THREE.CanvasTexture(bgCanvas);

    const bgGeo = new THREE.PlaneGeometry(WORLD_W + 2000, waterBgH);
    const bgMat = new THREE.MeshBasicMaterial({ map: bgTexture, depthWrite: false });
    const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    bgMesh.position.set(WORLD_W / 2, -(WATER_SURF + waterBgH / 2), -399);
    bgMesh.renderOrder = -100;
    this.scene.add(bgMesh);

    // Ground plane
    const groundTexture = this.voxelRenderer._generateGroundTexture();
    const groundRepeatX = WORLD_W / TILE_SIZE;
    const groundDepthSize = 600;
    const groundRepeatZ = groundDepthSize / TILE_SIZE;
    groundTexture.repeat.set(groundRepeatX, groundRepeatZ);

    const groundGeo = new THREE.PlaneGeometry(WORLD_W + 400, groundDepthSize);
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTexture, roughness: 1.0, metalness: 0.0,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.set(WORLD_W / 2, -WORLD_H + TILE_SIZE / 2, -groundDepthSize / 2);
    groundMesh.renderOrder = -50;
    this.scene.add(groundMesh);

    // Ground fog overlay
    const groundFogCanvas = document.createElement('canvas');
    groundFogCanvas.width = 2; groundFogCanvas.height = 128;
    const gfCtx = groundFogCanvas.getContext('2d');
    const gfGrad = gfCtx.createLinearGradient(0, 0, 0, 128);
    gfGrad.addColorStop(0, 'rgba(6, 30, 53, 1.0)');
    gfGrad.addColorStop(0.25, 'rgba(6, 30, 53, 0.5)');
    gfGrad.addColorStop(0.5, 'rgba(6, 30, 53, 0)');
    gfGrad.addColorStop(1.0, 'rgba(6, 30, 53, 0)');
    gfCtx.fillStyle = gfGrad;
    gfCtx.fillRect(0, 0, 2, 128);
    const groundFogTexture = new THREE.CanvasTexture(groundFogCanvas);

    const groundFogGeo = new THREE.PlaneGeometry(WORLD_W + 400, groundDepthSize);
    const groundFogMat = new THREE.MeshBasicMaterial({
      map: groundFogTexture, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const groundFogMesh = new THREE.Mesh(groundFogGeo, groundFogMat);
    groundFogMesh.rotation.x = -Math.PI / 2;
    groundFogMesh.position.set(WORLD_W / 2, -WORLD_H + TILE_SIZE / 2 + 1, -groundDepthSize / 2);
    groundFogMesh.renderOrder = -49;
    this.scene.add(groundFogMesh);

    // Parallax layers
    for (let i = 0; i < 3; i++) {
      const depth = -150 - i * 100;
      const alpha = 0.08 - i * 0.02;
      const scale = 1.1 + i * 0.2;
      const color = new THREE.Color().setHSL(0.58, 0.4, 0.15 - i * 0.03);

      const layerGeo = new THREE.PlaneGeometry(WORLD_W * scale, WORLD_H * scale);
      const layerMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: alpha, depthWrite: false,
      });
      const layerMesh = new THREE.Mesh(layerGeo, layerMat);
      layerMesh.position.set(WORLD_W / 2, -WORLD_H / 2, depth);
      layerMesh.renderOrder = -90 + i;
      this.scene.add(layerMesh);
    }
  }

  // ── Build terrain from menu tile data ──
  _buildMenuTerrain() {
    const THREE = this.THREE;
    const VOXEL_DEPTH = TILE_SIZE;

    // Count tiles per type
    const tileCounts = {};
    for (let row = 0; row < MENU_ROWS; row++) {
      for (let col = 0; col < MENU_COLS; col++) {
        const t = MENU_TILES[row][col];
        if ((t >= 1 && t <= 4) || t === 8) {
          tileCounts[t] = (tileCounts[t] || 0) + 1;
        }
      }
    }

    const boxGeo = new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE, VOXEL_DEPTH);
    const dummy = new THREE.Object3D();

    for (const [typeStr, count] of Object.entries(tileCounts)) {
      const type = parseInt(typeStr);
      const texture = this.voxelRenderer._generateTileTexture(type);
      const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0.0 });
      const mesh = new THREE.InstancedMesh(boxGeo, mat, count);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);

      let idx = 0;
      const color = new THREE.Color();
      for (let row = 0; row < MENU_ROWS; row++) {
        for (let col = 0; col < MENU_COLS; col++) {
          if (MENU_TILES[row][col] !== type) continue;
          const x = col * TILE_SIZE + TILE_SIZE / 2;
          const y = -(row * TILE_SIZE + TILE_SIZE / 2);
          dummy.position.set(x, y, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx, dummy.matrix);

          const worldY = row * TILE_SIZE + TILE_SIZE / 2;
          const depthBelow = Math.max(0, worldY - MENU_WATER_SURFACE_Y);
          const maxDepth = MENU_WORLD_H - MENU_WATER_SURFACE_Y;
          const depthFactor = 1.0 - (depthBelow / maxDepth) * 0.55;
          color.setRGB(depthFactor, depthFactor, depthFactor);
          mesh.setColorAt(idx, color);
          idx++;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      this.scene.add(mesh);
      this.voxelRenderer.terrainMeshes.push(mesh);
    }

    // Cave background layer
    const SOLID_TYPES = new Set([1, 2, 3]);
    const NON_EMPTY = new Set([1, 2, 3, 4, 8]);
    const caveBg = Array.from({ length: MENU_ROWS }, () => new Array(MENU_COLS).fill(false));
    const radius = 2;
    for (let row = 0; row < MENU_ROWS; row++) {
      for (let col = 0; col < MENU_COLS; col++) {
        if (NON_EMPTY.has(MENU_TILES[row][col])) continue;
        let nearSolid = false;
        for (let dr = -radius; dr <= radius && !nearSolid; dr++) {
          for (let dc = -radius; dc <= radius && !nearSolid; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr, nc = col + dc;
            if (nr >= 0 && nr < MENU_ROWS && nc >= 0 && nc < MENU_COLS) {
              if (SOLID_TYPES.has(MENU_TILES[nr][nc])) nearSolid = true;
            }
          }
        }
        caveBg[row][col] = nearSolid;
      }
    }

    let caveCount = 0;
    for (let row = 0; row < MENU_ROWS; row++)
      for (let col = 0; col < MENU_COLS; col++)
        if (caveBg[row][col]) caveCount++;

    if (caveCount > 0) {
      const caveTexture = this.voxelRenderer._generateTileTexture('cave_bg');
      const caveMat = new THREE.MeshStandardMaterial({ map: caveTexture, roughness: 1.0, metalness: 0.0 });
      const caveMesh = new THREE.InstancedMesh(boxGeo, caveMat, caveCount);
      caveMesh.receiveShadow = true;
      caveMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(caveCount * 3), 3);

      let caveIdx = 0;
      const caveColor = new THREE.Color();
      for (let row = 0; row < MENU_ROWS; row++) {
        for (let col = 0; col < MENU_COLS; col++) {
          if (!caveBg[row][col]) continue;
          dummy.position.set(col * TILE_SIZE + TILE_SIZE / 2, -(row * TILE_SIZE + TILE_SIZE / 2), -TILE_SIZE);
          dummy.updateMatrix();
          caveMesh.setMatrixAt(caveIdx, dummy.matrix);

          const worldY = row * TILE_SIZE + TILE_SIZE / 2;
          const depthBelow = Math.max(0, worldY - MENU_WATER_SURFACE_Y);
          const maxDepth = MENU_WORLD_H - MENU_WATER_SURFACE_Y;
          const depthFactor = 0.35 - (depthBelow / maxDepth) * 0.15;
          caveColor.setRGB(depthFactor, depthFactor, depthFactor);
          caveMesh.setColorAt(caveIdx, caveColor);
          caveIdx++;
        }
      }
      caveMesh.instanceMatrix.needsUpdate = true;
      caveMesh.instanceColor.needsUpdate = true;
      this.scene.add(caveMesh);
      this.voxelRenderer.terrainMeshes.push(caveMesh);
    }
  }

  // ── Entity data for level editor ──
  getEntityData() {
    const data = { enemies: [], sharks: [], pufferfish: [], crabs: [] };
    for (const eb of this.enemyBodies) {
      data.enemies.push({ x: eb.position.x, y: eb.position.y });
    }
    for (const sb of this.sharkBodies) {
      data.sharks.push({ x: sb.position.x, y: sb.position.y });
    }
    for (const pf of this.pufferfishBodies) {
      data.pufferfish.push({ x: pf.position.x, y: pf.position.y });
    }
    for (const cb of this.crabBodies) {
      data.crabs.push({ x: cb.position.x, y: cb.position.y });
    }
    return data;
  }

  // ── Camera helpers ──
  _getVisibleSize() {
    const vFov = CAM_FOV * Math.PI / 180;
    const visH = 2 * Math.tan(vFov / 2) * this._camZOffset;
    const visW = visH * this.camera.aspect;
    return { visW, visH };
  }

  _centerCamera() {
    const { visW, visH } = this._getVisibleSize();
    const inset = TILE_SIZE * 2;
    // Center on the middle of the aquarium
    this.camX = Math.max(inset, Math.min(MENU_WORLD_W / 2 - visW / 2, MENU_WORLD_W - visW - inset));
    this.camY = Math.max(inset, Math.min(MENU_WORLD_H / 2 - visH / 2 - 30, MENU_WORLD_H - visH - inset));
  }

  // ── Editor integration ──
  setEditor(editor) {
    this._editor = editor;
  }

  // ── Aquarium mode: slow pan ──
  setAquariumMode(enabled) {
    this._aquariumMode = enabled;
    if (enabled) {
      this._aquariumCamDir = 1;
      this._easingBack = false;
    } else {
      // Start easing back to center
      const { visW, visH } = this._getVisibleSize();
      this._easingBack = true;
      this._easeStartX = this.camX;
      this._easeStartY = this.camY;
      const inset = TILE_SIZE * 2;
      this._easeTargetX = Math.max(inset, Math.min(MENU_WORLD_W / 2 - visW / 2, MENU_WORLD_W - visW - inset));
      this._easeTargetY = Math.max(inset, Math.min(MENU_WORLD_H / 2 - visH / 2 - 30, MENU_WORLD_H - visH - inset));
      this._easeElapsed = 0;
    }
  }

  // ── Resize ──
  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ── Start / Stop ──
  start() {
    if (this._running) return;
    this._running = true;
    this._loop();
  }

  stop() {
    this._running = false;
    if (this._animId) {
      cancelAnimationFrame(this._animId);
      this._animId = null;
    }
  }

  // ── Game loop ──
  _loop() {
    if (!this._running) return;

    const editorMode = this._editor && this._editor.active;

    // Skip AI + physics when editor is active
    if (!editorMode) {
      // Update enemy patrol AI
      for (const eb of this.enemyBodies) {
        if (!eb.space) continue;
        const p = eb._patrol;
        const px = eb.position.x;
        if (px >= p.maxX) p._dir = -1;
        if (px <= p.minX) p._dir = 1;
        eb.velocity = new Vec2(p._dir * p.speed, 0);
      }

      for (const sb of this.sharkBodies) {
        if (!sb.space) continue;
        const p = sb._patrol;
        const px = sb.position.x;
        if (px >= p.maxX) p._dir = -1;
        if (px <= p.minX) p._dir = 1;
        sb.velocity = new Vec2(p._dir * p.speed, 0);
      }

      for (const pf of this.pufferfishBodies) {
        if (!pf.space) continue;
        const p = pf._patrol;
        const py = pf.position.y;
        if (py >= p.maxY) p._dir = -1;
        if (py <= p.minY) p._dir = 1;
        pf.velocity = new Vec2(0, p._dir * p.speed);
      }

      for (const cb of this.crabBodies) {
        if (!cb.space) continue;
        const p = cb._patrol;
        const px = cb.position.x;
        if (px >= p.maxX) p._dir = -1;
        if (px <= p.minX) p._dir = 1;
        cb.velocity = new Vec2(p._dir * p.speed, 0);
      }

      // Physics step
      this.space.step(DT, 8, 3);
    }

    // Camera update
    const getVis = () => this._getVisibleSize();
    // Editor uses flat camera (no pitch) with viewport offset for sidebar
    const sidebarPx = 216;  // matches SIDEBAR_W in level-editor.js
    const canvasW = this.renderer.domElement.clientWidth;
    const canvasH = this.renderer.domElement.clientHeight;
    const editorViewW = canvasW - sidebarPx;
    const editorAspect = editorViewW / canvasH;
    const getEditorVis = () => {
      const vFov = CAM_FOV * Math.PI / 180;
      const visH = 2 * Math.tan(vFov / 2) * CAM_DISTANCE;
      const visW = visH * editorAspect;
      return { visW, visH };
    };
    const { visW, visH } = editorMode ? getEditorVis() : getVis();

    if (editorMode) {
      // Editor controls the camera — flat (no pitch)
      this._editor.update(DT, getEditorVis);
      this._editor.processPendingActions(getEditorVis);
      this.camX = this._editor.camX;
      this.camY = this._editor.camY;
    } else if (this._aquariumMode) {
      // Slow pan left/right with 10% margin on each side
      const margin = MENU_WORLD_W * 0.10;
      const minCamX = margin;
      const maxCamX = MENU_WORLD_W - visW - margin;
      this.camX += this._aquariumCamDir * this._aquariumCamSpeed * DT;
      if (this.camX >= maxCamX) { this.camX = maxCamX; this._aquariumCamDir = -1; }
      if (this.camX <= minCamX) { this.camX = minCamX; this._aquariumCamDir = 1; }
    } else if (this._easingBack) {
      // Ease back to center with smooth easeInOut
      this._easeElapsed += DT;
      const t = Math.min(this._easeElapsed / this._easeDuration, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.camX = this._easeStartX + (this._easeTargetX - this._easeStartX) * ease;
      this.camY = this._easeStartY + (this._easeTargetY - this._easeStartY) * ease;
      if (t >= 1) this._easingBack = false;
    } else {
      // Static: centered
      this._centerCamera();
    }

    // Clamp camera (1 tile inset to avoid seeing behind level edges)
    const camInset = TILE_SIZE * 2;
    this.camX = Math.max(camInset, Math.min(this.camX, MENU_WORLD_W - visW - camInset));
    this.camY = Math.max(camInset, Math.min(this.camY, MENU_WORLD_H - visH - camInset));

    // Sync editor cam back so 2D overlay matches 3D camera
    if (editorMode && this._editor) {
      this._editor.camX = this.camX;
      this._editor.camY = this.camY;
    }

    // Position Three.js camera (editor = flat, normal = pitched)
    const lookX = this.camX + visW / 2;
    const lookY = -(this.camY + visH / 2);
    if (editorMode) {
      this.camera.aspect = editorAspect;
      this.camera.updateProjectionMatrix();
      this.camera.position.set(lookX, lookY, CAM_DISTANCE);
    } else {
      this.camera.position.set(lookX, lookY - this._camYOffset, this._camZOffset);
    }
    this.camera.lookAt(lookX, lookY, 0);

    // Sync voxel renderer (skip in editor mode — entities positioned by editor callbacks)
    if (!editorMode) {
      const fakeFishState = { inWater: true, swimSpeed: 0, facingRight: true, dashing: false };
      const fakeFishBody = { position: { x: lookX, y: this.camY + visH / 2 } };
      this.voxelRenderer.syncFrame(fakeFishBody, fakeFishState, this.enemyBodies, DT, {
        sharkBodies: this.sharkBodies,
        pufferfishBodies: this.pufferfishBodies,
        crabBodies: this.crabBodies,
        toxicFishBodies: [],
        projectileBodies: [],
      });
    } else {
      this.voxelRenderer._time += DT;
    }

    // Render — editor mode uses viewport/scissor to render right of sidebar
    if (editorMode) {
      this.renderer.setViewport(sidebarPx, 0, editorViewW, canvasH);
      this.renderer.setScissor(sidebarPx, 0, editorViewW, canvasH);
      this.renderer.setScissorTest(true);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, canvasW, canvasH);
      // Restore camera aspect
      this.camera.aspect = canvasW / canvasH;
      this.camera.updateProjectionMatrix();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // Editor overlay (drawn on shared HUD canvas)
    if (editorMode && this._editor.hudCtx) {
      const hud = this._editor.hudCanvas;
      this._editor.hudCtx.clearRect(0, 0, hud.width, hud.height);
      this._editor.render(getEditorVis);
      this._editor.renderToast(DT);
    }

    this._animId = requestAnimationFrame(() => this._loop());
  }
}
