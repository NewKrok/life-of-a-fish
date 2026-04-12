// ── Life of a Fish — Main Game ──────────────────────────────────────────────
// Nape-js physics + Three.js voxel renderer, underwater platformer.

import {
  Space, Body, BodyType, Vec2, Circle, Polygon, Capsule,
  Material, FluidProperties,
  CbType, CbEvent, InteractionType, InteractionListener, PreListener, PreFlag,
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
import { MenuScene } from './menu-scene.js';

// ── Three.js import ──
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

// ── Constants ──
const GRAVITY = 200;
const DT = 1 / 60;
const ENEMY_SPEED = 60;
const SHARK_PATROL_SPEED = 50;        // px/s — patrol speed
const SHARK_CHASE_SPEED = 110;        // px/s — chase speed
const SHARK_DETECT_RADIUS = 150;      // px — detection radius
const SHARK_LOSE_RADIUS = 220;        // px — stop chasing radius
const PUFFER_SPEED = 30;              // px/s — vertical movement speed
const PUFFER_RANGE = 60;              // px — vertical patrol range
const CRAB_SPEED = 25;                // px/s — ground patrol speed
const CRAB_PUSH_FORCE = 600;          // px/s — push velocity applied to player
const TOXIC_SHOOT_RANGE = 180;        // px — range to detect and shoot
const TOXIC_SHOOT_INTERVAL = 2000;    // ms — cooldown between shots
const TOXIC_PROJECTILE_SPEED = 150;   // px/s — projectile velocity
const TOXIC_PROJECTILE_LIFE = 2500;   // ms — projectile lifespan
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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ── App State ──
let appState = 'menu';  // 'menu' | 'game' | 'aquarium' | 'settings' | 'about'
let gameInitialized = false;
let gameAnimId = null;

// Menu scene (created immediately — runs as menu background)
const menuScene = new MenuScene(THREE, renderer);

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  menuScene.resize(w, h);
  if (gameInitialized) updateCamera(w, h);
});

// ── Menu UI Elements ──
const menuOverlay = document.getElementById('menuOverlay');
const aquariumCloseBtn = document.getElementById('aquariumClose');
const settingsPanel = document.getElementById('settingsPanel');
const aboutPanel = document.getElementById('aboutPanel');

function showMenu() {
  appState = 'menu';
  menuOverlay.classList.remove('hidden');
  aquariumCloseBtn.classList.remove('visible');
  settingsPanel.classList.remove('visible');
  aboutPanel.classList.remove('visible');
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  menuScene.setAquariumMode(false);
  if (!menuScene._running) menuScene.start();
}

function hideMenuUI() {
  menuOverlay.classList.add('hidden');
  settingsPanel.classList.remove('visible');
  aboutPanel.classList.remove('visible');
}

document.getElementById('btnStartGame').addEventListener('click', () => {
  hideMenuUI();
  aquariumCloseBtn.classList.remove('visible');
  menuScene.stop();
  appState = 'game';
  startGame();
});

document.getElementById('btnAquarium').addEventListener('click', () => {
  appState = 'aquarium';
  hideMenuUI();
  aquariumCloseBtn.classList.add('visible');
  menuScene.setAquariumMode(true);
});

aquariumCloseBtn.addEventListener('click', () => {
  showMenu();
});

document.getElementById('btnSettings').addEventListener('click', () => {
  appState = 'settings';
  menuOverlay.classList.add('hidden');
  settingsPanel.classList.add('visible');
});

document.getElementById('settingsBack').addEventListener('click', () => {
  showMenu();
});

document.getElementById('btnAbout').addEventListener('click', () => {
  appState = 'about';
  menuOverlay.classList.add('hidden');
  aboutPanel.classList.add('visible');
});

document.getElementById('aboutBack').addEventListener('click', () => {
  showMenu();
});

// Start the menu scene immediately
menuScene.start();

// ── Game Camera (shared constants, used inside startGame) ──
const CAM_FOV = 45;                    // field of view in degrees
const CAM_PITCH = -0.26;               // downward tilt in radians (~15°)
const CAM_DISTANCE = 550;              // distance from the look-at plane
const CAM_Z_OFFSET = Math.cos(CAM_PITCH) * CAM_DISTANCE;
const CAM_Y_OFFSET = Math.sin(CAM_PITCH) * CAM_DISTANCE;

let camera, scene, voxelRenderer;

function updateCamera(w, h) {
  if (!camera) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ── Start Game (called when player clicks Start Game) ──
function startGame() {
  if (gameInitialized) {
    // Resume existing game
    gameLoop();
    return;
  }
  gameInitialized = true;

  camera = new THREE.PerspectiveCamera(
    CAM_FOV, window.innerWidth / window.innerHeight, 1, 3000
  );

  scene = new THREE.Scene();

  voxelRenderer = new VoxelRenderer(THREE, scene);
  voxelRenderer.setupLighting();
  voxelRenderer.buildBackground();
  voxelRenderer.buildTerrain();
  voxelRenderer.buildWater(WORLD_W, WORLD_H);
  voxelRenderer.buildBackgroundWaves();
  voxelRenderer.buildAmbientBubbles();
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
const boulderTag = new CbType();
const buoyTag = new CbType();
const raftTag = new CbType();
const sharkTag = new CbType();
const pufferfishTag = new CbType();
const crabTag = new CbType();
const toxicFishTag = new CbType();
const projectileTag = new CbType();

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
voxelRenderer.buildPearls(pearlBodies);

// ── Enemy fish ──
const enemyBodies = [];
for (const en of entities.enemies) {
  const b = new Body(BodyType.KINEMATIC, new Vec2(en.x, en.y));
  const shape = new Capsule(24, 12);
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

// ── Shark enemies (patrol + chase player) ──
const sharkBodies = [];
for (const sh of entities.sharks) {
  const b = new Body(BodyType.KINEMATIC, new Vec2(sh.x, sh.y));
  const shape = new Capsule(28, 14);
  shape.sensorEnabled = true;
  shape.cbTypes.add(sharkTag);
  b.shapes.add(shape);
  b.space = space;
  b._patrol = {
    minX: sh.x - 100,
    maxX: sh.x + 100,
    speed: SHARK_PATROL_SPEED,
    _dir: 1,
  };
  b._chase = { chasing: false };
  sharkBodies.push(b);
  voxelRenderer.buildShark();
}

// ── Pufferfish enemies (vertical movement) ──
const pufferfishBodies = [];
for (const pf of entities.pufferfish) {
  const b = new Body(BodyType.KINEMATIC, new Vec2(pf.x, pf.y));
  const shape = new Circle(17);
  shape.sensorEnabled = true;
  shape.cbTypes.add(pufferfishTag);
  b.shapes.add(shape);
  b.space = space;
  b._patrol = {
    minY: pf.y - PUFFER_RANGE,
    maxY: pf.y + PUFFER_RANGE,
    speed: PUFFER_SPEED,
    _dir: 1,
  };
  pufferfishBodies.push(b);
  voxelRenderer.buildPufferfish();
}

// ── Crab enemies (ground patrol, pushes player) ──
const crabBodies = [];
for (const cr of entities.crabs) {
  const b = new Body(BodyType.KINEMATIC, new Vec2(cr.x, cr.y));
  const shape = new Polygon(Polygon.box(44, 28));
  shape.sensorEnabled = true;
  shape.cbTypes.add(crabTag);
  b.shapes.add(shape);
  b.space = space;
  b._patrol = {
    minX: cr.x - 50,
    maxX: cr.x + 50,
    speed: CRAB_SPEED,
    _dir: 1,
  };
  crabBodies.push(b);
  voxelRenderer.buildCrab();
}

// ── Toxic fish enemies (ranged attacker) ──
const toxicFishBodies = [];
const projectileBodies = [];  // active poison projectiles
for (const tf of entities.toxicFish) {
  const b = new Body(BodyType.KINEMATIC, new Vec2(tf.x, tf.y));
  const shape = new Capsule(24, 12);
  shape.sensorEnabled = true;
  shape.cbTypes.add(toxicFishTag);
  b.shapes.add(shape);
  b.space = space;
  b._patrol = {
    minX: tf.x - 60,
    maxX: tf.x + 60,
    speed: ENEMY_SPEED * 0.6,
    _dir: 1,
  };
  b._shoot = { cooldown: 0 };
  toxicFishBodies.push(b);
  voxelRenderer.buildToxicFish();
}

// ── Buoys (floating on water surface) ──
const buoyBodies = [];
for (const bu of entities.buoys) {
  const b = new Body(BodyType.DYNAMIC, new Vec2(bu.x, WATER_SURFACE_Y));
  const shape = new Polygon(Polygon.box(24, 20), undefined, new Material(0.3, 0.4, 0.4, 0.4));
  shape.cbTypes.add(buoyTag);
  b.shapes.add(shape);
  b.allowRotation = true;
  b.space = space;
  buoyBodies.push(b);
}

// ── Boulders (heavy rocks the fish can grab and carry) ──
const BOULDER_GRAB_DIST = 36;       // px — how close the fish must be to grab
const BOULDER_CARRY_OFFSET = 26;    // px — distance from fish center when carried
const BOULDER_SNAP_DIST = 55;       // px — auto-release if boulder stuck behind wall
const boulderBodies = [];
let grabbedBoulder = null;           // currently grabbed boulder body (or null)
let grabSide = 1;                    // 1 = right, -1 = left (locked when grabbed)
for (const br of entities.boulders) {
  const b = new Body(BodyType.DYNAMIC, new Vec2(br.x, br.y));
  const shape = new Polygon(Polygon.box(15, 15), undefined, new Material(0.6, 0.1, 0.1, 2.5));
  shape.cbTypes.add(boulderTag);
  b.shapes.add(shape);
  b.allowRotation = true;
  b.space = space;
  boulderBodies.push(b);
}

// ── Rafts (floating platforms) ──
const raftBodies = [];
for (const rf of entities.rafts) {
  const b = new Body(BodyType.DYNAMIC, new Vec2(rf.x, WATER_SURFACE_Y));
  const shape = new Polygon(Polygon.box(90, 12), undefined, new Material(0.6, 0.5, 0.5, 0.3));
  shape.cbTypes.add(raftTag);
  b.shapes.add(shape);
  b.allowRotation = true;
  b.space = space;
  raftBodies.push(b);
}

// Build dynamic object meshes
voxelRenderer.buildBuoys(buoyBodies);
voxelRenderer.buildBoulders(boulderBodies);
voxelRenderer.buildRafts(raftBodies);

// ── Player fish ──
const player = new Body(BodyType.DYNAMIC, new Vec2(entities.playerSpawn.x, entities.playerSpawn.y));
const playerShape = new Capsule(PLAYER_CAPSULE_W, PLAYER_CAPSULE_H, undefined, new Material(0, 0.1, 0.1, 1));
playerShape.cbTypes.add(playerTag);
player.shapes.add(playerShape);
player.allowRotation = false;
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

// Boulder hits enemy -> both die, spawn rock break effect
const boulderEnemyListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, boulderTag, enemyTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const boulderBody = boulderBodies.find(br => br === b1 || br === b2);
    // Only kill if boulder is thrown (not held by player)
    if (boulderBody === grabbedBoulder) return;
    const enemyBody = enemyBodies.find(e => e === b1 || e === b2);
    if (enemyBody && enemyBody.space) {
      const cx = enemyBody.position.x;
      const cy = enemyBody.position.y;
      enemyBody.space = null;
      if (boulderBody && boulderBody.space) {
        if (grabbedBoulder === boulderBody) grabbedBoulder = null;
        boulderBody.space = null;
        voxelRenderer.spawnBoulderBreak(cx, cy);
      }
    }
  },
);
boulderEnemyListener.space = space;

// Player-boulder collision: ignored only while carrying
const boulderPlayerPre = new PreListener(
  InteractionType.COLLISION, playerTag, boulderTag,
  () => grabbedBoulder ? PreFlag.IGNORE : PreFlag.ACCEPT,
);
boulderPlayerPre.space = space;

// Shark collision -> respawn (same as regular enemy)
const sharkListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, sharkTag,
  () => {
    fishCtrl.respawn(entities.playerSpawn.x, entities.playerSpawn.y);
  },
);
sharkListener.space = space;

// Pufferfish collision -> respawn
const pufferfishListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, pufferfishTag,
  () => {
    fishCtrl.respawn(entities.playerSpawn.x, entities.playerSpawn.y);
  },
);
pufferfishListener.space = space;

// Crab collision -> push player away (does NOT kill)
const crabListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, crabTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const crabBody = crabBodies.find(c => c === b1 || c === b2);
    if (crabBody) {
      const dx = player.position.x - crabBody.position.x;
      const pushDirX = dx >= 0 ? 1 : -1;
      fishCtrl.knockback(pushDirX * CRAB_PUSH_FORCE, -CRAB_PUSH_FORCE * 0.5);
    }
  },
);
crabListener.space = space;

// Poison projectile collision -> respawn
const projectileListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, projectileTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const projBody = projectileBodies.find(p => p === b1 || p === b2);
    if (projBody && projBody.space) {
      projBody.space = null;
      fishCtrl.respawn(entities.playerSpawn.x, entities.playerSpawn.y);
    }
  },
);
projectileListener.space = space;

// Toxic fish body collision -> respawn
const toxicFishListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, toxicFishTag,
  () => {
    fishCtrl.respawn(entities.playerSpawn.x, entities.playerSpawn.y);
  },
);
toxicFishListener.space = space;

// Boulder hits shark -> both die
const boulderSharkListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, boulderTag, sharkTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const boulderBody = boulderBodies.find(br => br === b1 || br === b2);
    if (boulderBody === grabbedBoulder) return;
    const sharkBody = sharkBodies.find(s => s === b1 || s === b2);
    if (sharkBody && sharkBody.space) {
      const cx = sharkBody.position.x;
      const cy = sharkBody.position.y;
      sharkBody.space = null;
      if (boulderBody && boulderBody.space) {
        if (grabbedBoulder === boulderBody) grabbedBoulder = null;
        boulderBody.space = null;
        voxelRenderer.spawnBoulderBreak(cx, cy);
      }
    }
  },
);
boulderSharkListener.space = space;

// Boulder hits pufferfish -> both die
const boulderPufferfishListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, boulderTag, pufferfishTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const boulderBody = boulderBodies.find(br => br === b1 || br === b2);
    if (boulderBody === grabbedBoulder) return;
    const pfBody = pufferfishBodies.find(p => p === b1 || p === b2);
    if (pfBody && pfBody.space) {
      const cx = pfBody.position.x;
      const cy = pfBody.position.y;
      pfBody.space = null;
      if (boulderBody && boulderBody.space) {
        if (grabbedBoulder === boulderBody) grabbedBoulder = null;
        boulderBody.space = null;
        voxelRenderer.spawnBoulderBreak(cx, cy);
      }
    }
  },
);
boulderPufferfishListener.space = space;

// Boulder hits crab -> both die
const boulderCrabListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, boulderTag, crabTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const boulderBody = boulderBodies.find(br => br === b1 || br === b2);
    if (boulderBody === grabbedBoulder) return;
    const crabBody = crabBodies.find(c => c === b1 || c === b2);
    if (crabBody && crabBody.space) {
      const cx = crabBody.position.x;
      const cy = crabBody.position.y;
      crabBody.space = null;
      if (boulderBody && boulderBody.space) {
        if (grabbedBoulder === boulderBody) grabbedBoulder = null;
        boulderBody.space = null;
        voxelRenderer.spawnBoulderBreak(cx, cy);
      }
    }
  },
);
boulderCrabListener.space = space;

// Boulder hits toxic fish -> both die
const boulderToxicListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, boulderTag, toxicFishTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const boulderBody = boulderBodies.find(br => br === b1 || br === b2);
    if (boulderBody === grabbedBoulder) return;
    const tfBody = toxicFishBodies.find(t => t === b1 || t === b2);
    if (tfBody && tfBody.space) {
      const cx = tfBody.position.x;
      const cy = tfBody.position.y;
      tfBody.space = null;
      if (boulderBody && boulderBody.space) {
        if (grabbedBoulder === boulderBody) grabbedBoulder = null;
        boulderBody.space = null;
        voxelRenderer.spawnBoulderBreak(cx, cy);
      }
    }
  },
);
boulderToxicListener.space = space;

// ── Touch Controls ──
const touchControls = new TouchControls();

// ── Keyboard Input ──
const keys = {};
let prevSpace = false;
let prevGrab = false;

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
  const grabDown = keys['KeyE'] || false;
  const grab = grabDown && !prevGrab;
  prevGrab = grabDown;
  return { dirX, dirY, dash, grab };
}

// ── Camera ──
let camX = 0;
let camY = 0;

// Calculate visible world size at z=0 for perspective camera
function getVisibleSize() {
  const vFov = CAM_FOV * Math.PI / 180;
  const visH = 2 * Math.tan(vFov / 2) * CAM_Z_OFFSET;
  const visW = visH * camera.aspect;
  return { visW, visH };
}

function updateGameCamera() {
  const { visW, visH } = getVisibleSize();
  const targetX = player.position.x - visW / 2;
  const targetY = player.position.y - visH / 2 - 30;

  // Clamp to world bounds
  const goalX = Math.max(0, Math.min(targetX, WORLD_W - visW));
  const goalY = Math.max(0, Math.min(targetY, WORLD_H - visH));

  // Smooth lerp
  camX += (goalX - camX) * 0.1;
  camY += (goalY - camY) * 0.1;
  camX = Math.max(0, Math.min(camX, WORLD_W - visW));
  camY = Math.max(0, Math.min(camY, WORLD_H - visH));
}

// Snap camera on first frame
{
  const { visW, visH } = getVisibleSize();
  camX = Math.max(0, Math.min(player.position.x - visW / 2, WORLD_W - visW));
  camY = Math.max(0, Math.min(player.position.y - visH / 2 - 30, WORLD_H - visH));
}

// ── Physics Debug Toggle (F3) ──
let debugPhysics = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'F3') { debugPhysics = !debugPhysics; e.preventDefault(); }
});

function renderPhysicsDebug() {
  if (!debugPhysics) return;
  const W = hudCanvas.width;
  const H = hudCanvas.height;
  const { visW, visH } = getVisibleSize();

  // Scale factor: world units -> screen pixels
  const sx = W / visW;
  const sy = H / visH;

  hudCtx.save();
  // Transform: translate by camera, then scale to screen
  hudCtx.setTransform(sx, 0, 0, sy, -camX * sx, -camY * sy);
  hudCtx.lineWidth = 1.5 / sx; // constant screen-space line width

  const drawShape = (shape, fillColor, strokeColor) => {
    hudCtx.strokeStyle = strokeColor;
    if (shape.isCircle()) {
      const r = shape.castCircle.radius;
      hudCtx.beginPath();
      hudCtx.arc(0, 0, r, 0, Math.PI * 2);
      if (fillColor) { hudCtx.fillStyle = fillColor; hudCtx.fill(); }
      hudCtx.stroke();
    } else if (shape.isCapsule()) {
      const cap = shape.castCapsule;
      const hl = cap.halfLength;
      const r = cap.radius;
      hudCtx.beginPath();
      hudCtx.moveTo(-hl, -r);
      hudCtx.lineTo(hl, -r);
      hudCtx.arc(hl, 0, r, -Math.PI / 2, Math.PI / 2);
      hudCtx.lineTo(-hl, r);
      hudCtx.arc(-hl, 0, r, Math.PI / 2, -Math.PI / 2);
      hudCtx.closePath();
      if (fillColor) { hudCtx.fillStyle = fillColor; hudCtx.fill(); }
      hudCtx.stroke();
    } else if (shape.isPolygon()) {
      const verts = shape.castPolygon.localVerts;
      if (verts.length < 3) return;
      hudCtx.beginPath();
      hudCtx.moveTo(verts.at(0).x, verts.at(0).y);
      for (let v = 1; v < verts.length; v++) {
        hudCtx.lineTo(verts.at(v).x, verts.at(v).y);
      }
      hudCtx.closePath();
      if (fillColor) { hudCtx.fillStyle = fillColor; hudCtx.fill(); }
      hudCtx.stroke();
    }
  };

  for (const body of space.bodies) {
    // Pick colors by body role
    let fill = null;
    let stroke = 'rgba(0,255,0,0.5)';

    const isDynamic = body.type === BodyType.DYNAMIC && body !== player;

    if (body === player) {
      fill = 'rgba(0,200,255,0.25)';
      stroke = 'rgba(0,200,255,0.9)';
    } else if (isDynamic) {
      fill = 'rgba(200,100,255,0.25)';
      stroke = 'rgba(200,100,255,0.9)';
    } else if (body.type === BodyType.KINEMATIC) {
      fill = 'rgba(255,165,0,0.2)';
      stroke = 'rgba(255,165,0,0.8)';
    } else {
      // Static: check fluid / sensor
      let isFluid = false;
      let isSensor = false;
      for (const shape of body.shapes) {
        if (shape.fluidEnabled) isFluid = true;
        if (shape.sensorEnabled) isSensor = true;
      }
      if (isFluid) {
        fill = 'rgba(50,100,255,0.12)';
        stroke = 'rgba(50,100,255,0.5)';
      } else if (isSensor) {
        stroke = 'rgba(255,255,0,0.6)';
      }
    }

    hudCtx.save();
    hudCtx.translate(body.position.x, body.position.y);
    hudCtx.rotate(body.rotation);
    for (const shape of body.shapes) {
      drawShape(shape, fill, stroke);
    }
    hudCtx.restore();
  }

  // Reset transform for label
  hudCtx.setTransform(1, 0, 0, 1, 0, 0);
  hudCtx.fillStyle = 'rgba(255,255,0,0.8)';
  hudCtx.font = 'bold 12px monospace';
  hudCtx.fillText('PHYSICS DEBUG (F3)', 10, H - 10);
  hudCtx.restore();
}

// ── HUD Rendering ──
function renderHUD() {
  const W = hudCanvas.width;
  const H = hudCanvas.height;
  hudCtx.clearRect(0, 0, W, H);

  const state = fishCtrl.getState();

  // Controls hint
  hudCtx.fillStyle = 'rgba(255,255,255,0.5)';
  hudCtx.font = '12px monospace';
  hudCtx.fillText('WASD / Arrows = swim, Space = dash, E = grab/throw rock', 10, 20);

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
    grab: kbInput.grab,
  };

  // ── Update enemy patrol ──
  for (const eb of enemyBodies) {
    if (!eb._patrol || !eb.space) continue;
    const p = eb._patrol;
    const px = eb.position.x;
    if (px >= p.maxX) p._dir = -1;
    if (px <= p.minX) p._dir = 1;
    eb.velocity = new Vec2(p._dir * p.speed, 0);
  }

  // ── Update shark AI (patrol + chase) ──
  for (const sb of sharkBodies) {
    if (!sb._patrol || !sb.space) continue;
    const p = sb._patrol;
    const ch = sb._chase;
    const dx = player.position.x - sb.position.x;
    const dy = player.position.y - sb.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!ch.chasing && dist < SHARK_DETECT_RADIUS) {
      ch.chasing = true;
    } else if (ch.chasing && dist > SHARK_LOSE_RADIUS) {
      ch.chasing = false;
    }

    if (ch.chasing) {
      const len = dist || 1;
      sb.velocity = new Vec2(
        (dx / len) * SHARK_CHASE_SPEED,
        (dy / len) * SHARK_CHASE_SPEED
      );
    } else {
      const px = sb.position.x;
      if (px >= p.maxX) p._dir = -1;
      if (px <= p.minX) p._dir = 1;
      sb.velocity = new Vec2(p._dir * p.speed, 0);
    }
  }

  // ── Update pufferfish AI (vertical patrol) ──
  for (const pf of pufferfishBodies) {
    if (!pf._patrol || !pf.space) continue;
    const p = pf._patrol;
    const py = pf.position.y;
    if (py >= p.maxY) p._dir = -1;
    if (py <= p.minY) p._dir = 1;
    pf.velocity = new Vec2(0, p._dir * p.speed);
  }

  // ── Update crab AI (horizontal ground patrol) ──
  for (const cb of crabBodies) {
    if (!cb._patrol || !cb.space) continue;
    const p = cb._patrol;
    const px = cb.position.x;
    if (px >= p.maxX) p._dir = -1;
    if (px <= p.minX) p._dir = 1;
    cb.velocity = new Vec2(p._dir * p.speed, 0);
  }

  // ── Update toxic fish AI (patrol + shoot) ──
  for (const tf of toxicFishBodies) {
    if (!tf._patrol || !tf.space) continue;
    const p = tf._patrol;
    const px = tf.position.x;
    if (px >= p.maxX) p._dir = -1;
    if (px <= p.minX) p._dir = 1;
    tf.velocity = new Vec2(p._dir * p.speed, 0);

    // Shooting logic
    tf._shoot.cooldown = Math.max(0, tf._shoot.cooldown - DT * 1000);
    const dx = player.position.x - tf.position.x;
    const dy = player.position.y - tf.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < TOXIC_SHOOT_RANGE && tf._shoot.cooldown <= 0) {
      tf._shoot.cooldown = TOXIC_SHOOT_INTERVAL;
      // Spawn projectile
      const len = dist || 1;
      const pb = new Body(BodyType.KINEMATIC, new Vec2(tf.position.x, tf.position.y));
      const ps = new Circle(5);
      ps.sensorEnabled = true;
      ps.cbTypes.add(projectileTag);
      pb.shapes.add(ps);
      pb.space = space;
      pb.velocity = new Vec2(
        (dx / len) * TOXIC_PROJECTILE_SPEED,
        (dy / len) * TOXIC_PROJECTILE_SPEED
      );
      pb._life = TOXIC_PROJECTILE_LIFE;
      projectileBodies.push(pb);
      voxelRenderer.buildProjectile(pb);
    }
  }

  // ── Update projectiles (lifetime) ──
  for (let i = projectileBodies.length - 1; i >= 0; i--) {
    const pb = projectileBodies[i];
    if (!pb.space) { projectileBodies.splice(i, 1); continue; }
    pb._life -= DT * 1000;
    if (pb._life <= 0) {
      pb.space = null;
      projectileBodies.splice(i, 1);
    }
  }

  // ── Update buoys (stabilize at water surface) ──
  for (const bb of buoyBodies) {
    // Extra damping so buoys don't bounce forever
    bb.velocity = new Vec2(bb.velocity.x * 0.98, bb.velocity.y * 0.97);
    bb.angularVel *= 0.97;
  }

  // ── Update rafts (stabilize at water surface) ──
  for (const rb of raftBodies) {
    // Extra damping — raft should feel heavy and steady
    rb.velocity = new Vec2(rb.velocity.x * 0.97, rb.velocity.y * 0.96);
    rb.angularVel *= 0.95;
  }

  // ── Boulder grab / carry / throw mechanic (E key) ──
  if (grabbedBoulder && !grabbedBoulder.space) {
    grabbedBoulder = null;
  }

  if (input.grab) {
    if (grabbedBoulder) {
      // ── Throw: fling boulder in facing direction ──
      const throwDirX = fishCtrl.facingRight ? 1 : -1;
      const throwDirY = Math.abs(input.dirY) > 0.1 ? input.dirY * 0.7 : 0;
      grabbedBoulder.velocity = new Vec2(throwDirX * 350, throwDirY * 350);
      grabbedBoulder = null;
    } else {
      // ── Grab: find nearest boulder within range ──
      let closest = null;
      let closestDist = BOULDER_GRAB_DIST;
      for (const br of boulderBodies) {
        if (!br.space) continue;
        const dx = br.position.x - player.position.x;
        const dy = br.position.y - player.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) {
          closestDist = dist;
          closest = br;
        }
      }
      if (closest) {
        grabbedBoulder = closest;
        grabSide = fishCtrl.facingRight ? 1 : -1;
      }
    }
  }

  // ── Carry: pull boulder toward fish via velocity (physics still collides with terrain) ──
  if (grabbedBoulder) {
    grabSide = fishCtrl.facingRight ? 1 : -1;
    const targetX = player.position.x + grabSide * BOULDER_CARRY_OFFSET;
    const targetY = player.position.y;
    const dx = targetX - grabbedBoulder.position.x;
    const dy = targetY - grabbedBoulder.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // If boulder is stuck behind a wall / too far away, release it
    if (dist > BOULDER_SNAP_DIST) {
      grabbedBoulder = null;
    } else {
      const pull = 12;
      grabbedBoulder.velocity = new Vec2(dx * pull, dy * pull);
      grabbedBoulder.angularVel = 0;
    }
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
  // Position perspective camera: follow player with pitch offset
  const { visW: camVisW, visH: camVisH } = getVisibleSize();
  const lookX = camX + camVisW / 2;
  const lookY = -(camY + camVisH / 2);
  camera.position.set(lookX, lookY - CAM_Y_OFFSET, CAM_Z_OFFSET);
  camera.lookAt(lookX, lookY, 0);

  // Sync voxel renderer
  const fishState = fishCtrl.getState();
  voxelRenderer.syncFrame(player, fishState, enemyBodies, DT, {
    sharkBodies, pufferfishBodies, crabBodies, toxicFishBodies, projectileBodies,
  });

  renderer.render(scene, camera);

  // ── HUD ──
  renderHUD();
  renderPhysicsDebug();

  gameAnimId = requestAnimationFrame(gameLoop);
}

// Kick off the game loop inside startGame
gameLoop();
} // end startGame
