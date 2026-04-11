// ── Life of a Fish — Main Game ──────────────────────────────────────────────
// Nape-js physics + Three.js voxel renderer, underwater platformer.

import {
  Space, Body, BodyType, Vec2, Circle, Polygon, Capsule,
  Material, FluidProperties,
  CbType, CbEvent, InteractionType, InteractionListener,
  CharacterController,
} from "https://cdn.jsdelivr.net/npm/@newkrok/nape-js@3.26.0/dist/index.js";

import {
  TILE_SIZE, LEVEL_COLS, LEVEL_ROWS, WORLD_W, WORLD_H,
  WATER_SURFACE_Y, TILES,
  getLevelEntities, getMergedSolidBodies, getWaterZones,
} from './level-data.js';

import { FishController } from './fish-controller.js';
import { VoxelRenderer } from './voxel-renderer.js';
import { TouchControls } from './touch-controls.js';

// ── Three.js import ──
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

// ── Constants ──
const GRAVITY = 200;
const DT = 1 / 60;
const ENEMY_SPEED = 60;
const PLAYER_CAPSULE_W = 24;
const PLAYER_CAPSULE_H = 12;

// ── Canvas setup ──
const canvas = document.getElementById('gameCanvas');
const hudCanvas = document.getElementById('hudCanvas');

function resizeCanvases() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  hudCanvas.width = w;
  hudCanvas.height = h;
}
resizeCanvases();
window.addEventListener('resize', resizeCanvases);

const hudCtx = hudCanvas.getContext('2d');

// ── Three.js setup ──
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x061520);

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  updateCamera(w, h);
});

// Orthographic camera for 2D side-scrolling
const viewW = window.innerWidth;
const viewH = window.innerHeight;
const camera = new THREE.OrthographicCamera(
  0, viewW,    // left, right
  0, -viewH,   // top, bottom
  -500, 500     // near, far
);
camera.position.set(0, 0, 100);
camera.lookAt(0, 0, 0);

function updateCamera(w, h) {
  camera.right = w;
  camera.bottom = -h;
  camera.updateProjectionMatrix();
}

const scene = new THREE.Scene();

// ── Voxel Renderer ──
const voxelRenderer = new VoxelRenderer(THREE, scene);
voxelRenderer.setupLighting();
voxelRenderer.buildBackground();
voxelRenderer.buildTerrain();
voxelRenderer.buildWater(WORLD_W, WORLD_H);
voxelRenderer.buildGodRays();
const playerFishMesh = voxelRenderer.buildFish();

// ── Nape-js Physics setup ──
const space = new Space();
space.gravity = new Vec2(0, GRAVITY);

// ── CbTypes for collision ──
const playerTag = new CbType();
const enemyTag = new CbType();
const hazardTag = new CbType();
const pearlTag = new CbType();

// ── Build terrain bodies from merged tiles ──
const mergedBodies = getMergedSolidBodies();
for (const mb of mergedBodies) {
  const b = new Body(BodyType.STATIC, new Vec2(mb.x, mb.y));
  b.shapes.add(new Polygon(Polygon.box(mb.w, mb.h)));
  b.space = space;
}

// ── Water zones ──
const waterZones = getWaterZones();
for (const wz of waterZones) {
  const b = new Body(BodyType.STATIC, new Vec2(wz.x, wz.y));
  const shape = new Polygon(Polygon.box(wz.w, wz.h));
  shape.fluidEnabled = true;
  shape.fluidProperties = new FluidProperties(1.0, 3);
  b.shapes.add(shape);
  b.space = space;
}

// ── Level entities ──
const entities = getLevelEntities();

// ── Hazard bodies (seaweed/spiky plants) ──
for (const hz of entities.hazards) {
  const b = new Body(BodyType.STATIC, new Vec2(hz.x, hz.y));
  const shape = new Polygon(Polygon.box(TILE_SIZE * 0.6, TILE_SIZE * 0.8));
  shape.sensorEnabled = true;
  shape.cbTypes.add(hazardTag);
  b.shapes.add(shape);
  b.space = space;
}

// ── Pearl collectibles ──
let pearlCount = 0;
let pearlPopups = [];
const pearlBodies = [];
for (const p of entities.pearls) {
  const b = new Body(BodyType.STATIC, new Vec2(p.x, p.y));
  const shape = new Circle(6);
  shape.sensorEnabled = true;
  shape.cbTypes.add(pearlTag);
  b.shapes.add(shape);
  b.space = space;
  pearlBodies.push(b);
}

// ── Enemy fish ──
const enemyBodies = [];
for (const en of entities.enemies) {
  const b = new Body(BodyType.KINEMATIC, new Vec2(en.x, en.y));
  const shape = new Capsule(20, 8);
  shape.sensorEnabled = true;
  shape.cbTypes.add(enemyTag);
  b.shapes.add(shape);
  b.space = space;
  b._patrol = {
    minX: en.x - 80,
    maxX: en.x + 80,
    speed: ENEMY_SPEED,
    _dir: 1,
  };
  enemyBodies.push(b);

  // Build enemy mesh
  voxelRenderer.buildEnemyFish();
}

// ── Player fish ──
const player = new Body(BodyType.DYNAMIC, new Vec2(entities.playerSpawn.x, entities.playerSpawn.y));
const playerShape = new Capsule(PLAYER_CAPSULE_W, PLAYER_CAPSULE_H, undefined, new Material(0, 0.1, 0.1, 1));
playerShape.cbTypes.add(playerTag);
player.shapes.add(playerShape);
player.allowRotation = true;
player.isBullet = true;
player.space = space;

const cc = new CharacterController(space, player, {
  maxSlopeAngle: Math.PI / 3,
  characterTag: playerTag,
});

const fishCtrl = new FishController(space, player, cc, GRAVITY);

// ── Collision listeners ──
// Pearl pickup
const pearlListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, pearlTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const pearlBody = (b1 && b1 !== player) ? b1 : (b2 && b2 !== player) ? b2 : null;
    if (pearlBody && pearlBody.space) {
      const cx = pearlBody.position.x;
      const cy = pearlBody.position.y;
      pearlBody.space = null;
      pearlCount++;
      pearlPopups.push({ x: cx, y: cy - 10, timer: 1.2 });
    }
  },
);
pearlListener.space = space;

// Enemy collision -> respawn
const enemyListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, enemyTag,
  () => {
    fishCtrl.respawn(entities.playerSpawn.x, entities.playerSpawn.y);
  },
);
enemyListener.space = space;

// Hazard collision -> respawn
const hazardListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, hazardTag,
  () => {
    fishCtrl.respawn(entities.playerSpawn.x, entities.playerSpawn.y);
  },
);
hazardListener.space = space;

// ── Touch Controls ──
const touchControls = new TouchControls();

// ── Keyboard Input ──
const keys = {};
let prevSpace = false;

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

function getKeyboardInput() {
  const dirX = (keys['ArrowRight'] || keys['KeyD'] ? 1 : 0) - (keys['ArrowLeft'] || keys['KeyA'] ? 1 : 0);
  const dirY = (keys['ArrowDown'] || keys['KeyS'] ? 1 : 0) - (keys['ArrowUp'] || keys['KeyW'] ? 1 : 0);
  const spaceDown = keys['Space'] || false;
  const dash = spaceDown && !prevSpace;
  prevSpace = spaceDown;
  return { dirX, dirY, dash };
}

// ── Camera ──
let camX = 0;
let camY = 0;

function updateGameCamera() {
  const W = canvas.width;
  const H = canvas.height;
  const targetX = player.position.x - W / 2;
  const targetY = player.position.y - H / 2 - 30;

  // Clamp to world bounds
  const goalX = Math.max(0, Math.min(targetX, WORLD_W - W));
  const goalY = Math.max(0, Math.min(targetY, WORLD_H - H));

  // Smooth lerp
  camX += (goalX - camX) * 0.1;
  camY += (goalY - camY) * 0.1;
  camX = Math.max(0, Math.min(camX, WORLD_W - W));
  camY = Math.max(0, Math.min(camY, WORLD_H - H));
}

// Snap camera on first frame
camX = Math.max(0, Math.min(player.position.x - canvas.width / 2, WORLD_W - canvas.width));
camY = Math.max(0, Math.min(player.position.y - canvas.height / 2 - 30, WORLD_H - canvas.height));

// ── HUD Rendering ──
function renderHUD() {
  const W = hudCanvas.width;
  const H = hudCanvas.height;
  hudCtx.clearRect(0, 0, W, H);

  const state = fishCtrl.getState();

  // Controls hint
  hudCtx.fillStyle = 'rgba(255,255,255,0.5)';
  hudCtx.font = '12px monospace';
  hudCtx.fillText('WASD / Arrows = swim, Space = dash', 10, 20);

  // Pearl counter
  hudCtx.fillStyle = '#ffd93d';
  hudCtx.font = 'bold 14px monospace';
  hudCtx.fillText(`Pearl: ${pearlCount}`, W - 120, 20);

  // State indicator
  let stateText = 'SWIMMING';
  let stateColor = '#4dc9f6';
  if (!state.inWater) { stateText = 'IN AIR'; stateColor = '#f85149'; }
  if (state.dashing) { stateText = 'DASH!'; stateColor = '#ff8c42'; }
  hudCtx.fillStyle = stateColor;
  hudCtx.font = 'bold 12px monospace';
  hudCtx.fillText(stateText, 10, 40);

  // Depth meter
  const depthPx = Math.max(0, player.position.y - WATER_SURFACE_Y);
  const depthM = (depthPx / TILE_SIZE).toFixed(1);
  if (state.inWater) {
    hudCtx.fillStyle = 'rgba(100,200,255,0.6)';
    hudCtx.font = '11px monospace';
    hudCtx.fillText(`Depth: ${depthM}m`, 10, 58);
  }

  // Pearl popup animations (world space -> screen space)
  for (let i = pearlPopups.length - 1; i >= 0; i--) {
    const p = pearlPopups[i];
    p.timer -= DT;
    p.y -= 25 * DT;
    if (p.timer <= 0) {
      pearlPopups.splice(i, 1);
      continue;
    }
    const sx = p.x - camX;
    const sy = p.y - camY;
    const alpha = Math.min(1, p.timer * 2);
    hudCtx.fillStyle = `rgba(255,217,61,${alpha})`;
    hudCtx.font = 'bold 16px monospace';
    hudCtx.textAlign = 'center';
    hudCtx.fillText('+1', sx, sy);
  }
  hudCtx.textAlign = 'left';
}

// ── Game Loop ──
function gameLoop() {
  // ── Input ──
  const kbInput = getKeyboardInput();
  const touchInput = touchControls.getInput();
  const input = {
    dirX: Math.abs(kbInput.dirX) > Math.abs(touchInput.dirX) ? kbInput.dirX : touchInput.dirX,
    dirY: Math.abs(kbInput.dirY) > Math.abs(touchInput.dirY) ? kbInput.dirY : touchInput.dirY,
    dash: kbInput.dash || touchInput.dash,
  };

  // ── Update enemy patrol ──
  for (const eb of enemyBodies) {
    if (!eb._patrol) continue;
    const p = eb._patrol;
    const px = eb.position.x;
    if (px >= p.maxX) p._dir = -1;
    if (px <= p.minX) p._dir = 1;
    eb.velocity = new Vec2(p._dir * p.speed, 0);
  }

  // ── Fish controller update ──
  fishCtrl.update(input, WATER_SURFACE_Y);

  // ── Clamp player to world bounds ──
  const px = player.position.x;
  const py = player.position.y;
  if (px < 10 || px > WORLD_W - 10 || py < -50 || py > WORLD_H + 50) {
    player.position = new Vec2(
      Math.max(10, Math.min(WORLD_W - 10, px)),
      Math.max(-50, Math.min(WORLD_H + 50, py)),
    );
  }

  // ── Physics step ──
  space.step(DT, 8, 3);

  // ── Camera ──
  updateGameCamera();

  // ── Render Three.js ──
  // Position camera based on game camera offset
  camera.left = camX;
  camera.right = camX + canvas.width;
  camera.top = -camY;
  camera.bottom = -(camY + canvas.height);
  camera.updateProjectionMatrix();

  // Sync voxel renderer
  const fishState = fishCtrl.getState();
  voxelRenderer.syncFrame(player, fishState, enemyBodies, DT);

  renderer.render(scene, camera);

  // ── HUD ──
  renderHUD();

  requestAnimationFrame(gameLoop);
}

gameLoop();
