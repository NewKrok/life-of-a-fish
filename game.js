// ── Life of a Fish — Main Game ──────────────────────────────────────────────
// Nape-js physics + Three.js voxel renderer, underwater platformer.

import {
  Space, Body, BodyType, Vec2, Circle, Polygon, Capsule,
  Material, FluidProperties,
  CbType, CbEvent, InteractionType, InteractionListener, PreListener, PreFlag,
  CharacterController,
} from "@newkrok/nape-js";

import {
  TILE_SIZE, LEVEL_COLS, LEVEL_ROWS, WORLD_W, WORLD_H,
  WATER_SURFACE_Y, TILES,
  getLevelEntities, getMergedSolidBodies, getWaterZones, resetTiles,
  getLevels, setCurrentLevel, getCurrentLevelIndex, getCurrentLevelMeta,
  KEY_CHEST_COLORS,
} from './level-data.js';

import {
  MENU_COLS, MENU_ROWS, MENU_WORLD_W, MENU_WORLD_H, MENU_WATER_SURFACE_Y,
  MENU_TILES,
} from './menu-level-data.js';

import { FishController } from './fish-controller.js';
import { VoxelRenderer } from './voxel-renderer.js';
import { TouchControls } from './touch-controls.js';
import { MenuScene } from './menu-scene.js';
import { MusicSystem } from './music-system.js';
import { SfxSystem } from './sfx-system.js';
import { LevelEditor, generateEditorPreviews } from './level-editor.js';
import { GameStateMachine, STATE } from './game-state.js';
import { generateCodexPreviews } from './codex-renderer.js';
import { initI18n, t, translateDOM, setLocale, getLocale, onLocaleChange } from './i18n.js';
import { installFirebaseBackend } from './services/firebase-backend.js';
import { initBackend } from './services/backend.js';

// ── Three.js import ──
import * as THREE from "three";

// ── i18n init (must resolve before any text rendering) ──
await initI18n();
translateDOM();

// ── Backend bootstrap ──
// Install Firebase impl and kick off anonymous sign-in in the background.
// We don't await here — the game works offline and features that need the
// backend (Publish, Import-by-code, My Levels) check for readiness themselves.
installFirebaseBackend();
initBackend().catch((err) => {
  console.warn('[backend] init failed (community features disabled):', err);
});

// Sync language selector to current locale
const _langSelect = document.getElementById('langSelect');
if (_langSelect) {
  _langSelect.value = getLocale();
  _langSelect.addEventListener('change', async () => {
    await setLocale(_langSelect.value);
  });
}

onLocaleChange(() => {
  translateDOM();
  _buildLevelCards();
  // Rebuild codex if open
  const codexPanel = document.getElementById('codexPanel');
  if (codexPanel && codexPanel.classList.contains('visible')) {
    const activeTab = document.querySelector('.codex-tab.active');
    _buildCodexEntries(activeTab?.dataset.category || 'all');
  }
});

// ── Constants ──
const GRAVITY = 200;
const FIXED_DT = 1 / 60;        // s — fixed physics/logic timestep
const MAX_STEPS_PER_FRAME = 5;   // cap to prevent spiral of death on slow machines
let _accumulator = 0;            // s — time debt for fixed-step loop
let _lastFrameTime = 0;          // ms — last rAF timestamp
const ENEMY_SPEED = 60;
const ARMORED_FISH_SPEED = 50;         // px/s — slightly slower than piranha
const ARMORED_KNOCKBACK = 300;         // px/s — half of crab push force
const SHARK_PATROL_SPEED = 50;        // px/s — patrol speed
const SHARK_CHASE_SPEED = 110;        // px/s — chase speed
const SHARK_DETECT_RADIUS = 150;      // px — detection radius
const SHARK_LOSE_RADIUS = 220;        // px — stop chasing radius
const PUFFER_SPEED = 30;              // px/s — vertical movement speed
const PUFFER_RANGE = 60;              // px — vertical patrol range
const CRAB_SPEED = 25;                // px/s — ground patrol speed
const CRAB_PUSH_FORCE = 600;          // px/s — push velocity applied to player

// ── Boss: Giant Crab (roadmap #13) ──
const BOSS_CRAB_HP = 5;               // hits to defeat
const BOSS_CRAB_PATROL_SPEED = 30;    // px/s — slow wandering
const BOSS_CRAB_CHARGE_SPEED = 200;   // px/s — charge lunge speed
const BOSS_CRAB_CHARGE_INTERVAL = 7000;  // ms — cooldown between charges
const BOSS_CRAB_CHARGE_WINDUP = 1000; // ms — telegraph time before dash
const BOSS_CRAB_CHARGE_DURATION = 3500; // ms — max charge duration (+40% longer rush)
const BOSS_CRAB_PUSH_FORCE = 1200;    // px/s — stronger than regular crab push (bigger boss)
const BOSS_CRAB_THROW_INTERVAL = 5500; // ms — time between rock throws
const BOSS_CRAB_THROW_SPEED = 52;     // px/s — initial rock velocity (+15%)
const BOSS_CRAB_THROW_GRAVITY = 85;   // px/s² — gravity applied to thrown rocks (+15%)
const BOSS_CRAB_THROW_LIFE = 6000;    // ms — rock auto-despawns after this (longer for slower arc)
const BOSS_CRAB_HIT_INVULN = 1200;    // ms — invulnerability window after hit
const BOSS_CRAB_JUMP_SPEED_X = 180;   // px/s — horizontal speed during jump
const BOSS_CRAB_JUMP_SPEED_Y = -525;  // px/s — upward launch velocity (50% higher jump)
const BOSS_CRAB_JUMP_GRAVITY = 400;   // px/s² — gravity during jump arc (20% slower fall)
const BOSS_CRAB_JUMP_INTERVAL = 9000; // ms — cooldown between jumps
const BOSS_CRAB_JUMP_DAMAGE = true;   // landing deals damage (death)
const BOSS_CRAB_JUMP_WINDUP = 800;    // ms — crouch telegraph before jump
const BOSS_CRAB_THROW_WINDUP = 600;   // ms — arm-raise telegraph before throw
const BOSS_CRAB_SLAM_INTERVAL = 12000; // ms — cooldown between ground slams
const BOSS_CRAB_SLAM_WINDUP = 900;    // ms — telegraph before slam
const BOSS_CRAB_SLAM_ROCKS = 8;       // number of rocks falling from above
const BOSS_CRAB_SLAM_ROCK_SPREAD = 450; // px — horizontal spread of falling rocks (~one screen width)
const BOSS_CRAB_RETREAT_INTERVAL = 12000; // ms — cooldown between retreats
const BOSS_CRAB_RETREAT_SPEED = 60;    // px/s — backing-off speed
const BOSS_CRAB_RETREAT_DURATION = 2000; // ms — how long the retreat lasts
const BOSS_CRAB_WIDTH = 112;          // px — physics body width (matches visual ~14 voxels × V=8.4)
const BOSS_CRAB_HEIGHT = 77;          // px — physics body height (matches visual ~9 voxels × V=8.4)
const TOXIC_SHOOT_RANGE = 180;        // px — range to detect and shoot
const TOXIC_SHOOT_INTERVAL = 2000;    // ms — cooldown between shots
const TOXIC_PROJECTILE_SPEED = 150;   // px/s — projectile velocity
const TOXIC_PROJECTILE_LIFE = 2500;   // ms — projectile lifespan
const CORAL_SHOOT_INTERVAL = 3000;    // ms — volley every 3s
const CORAL_PROJECTILE_SPEED = 100;   // px/s — slower than toxic fish
const CORAL_PROJECTILE_LIFE = 2000;   // ms — shorter range
const CORAL_FAN_ANGLE = Math.PI / 6;  // 30° spread on each side
const TIMED_SWITCH_DURATION = 5000;   // ms — how long a timed switch stays open
const GATE_OPEN_SPEED = 3.0;          // rad/s — gate swing rotation speed
const GATE_HEIGHT = 2 * 32;           // px — gate is 2 tiles tall
const GATE_WIDTH = 32;                // px — one tile wide to match visual
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
let appState = 'menu';  // 'menu' | 'game' | 'aquarium' | 'settings' | 'about' | 'codex'
let gameInitialized = false;
let gameAnimId = null;

// ── State Machine (central source of truth for transitions) ──
const gsm = new GameStateMachine();

// Menu scene (created immediately — runs as menu background)
const menuScene = new MenuScene(THREE, renderer);

// ── Level Editor ──
let editorActive = false;
let gameEditor = null;    // LevelEditor for game level
let menuEditor = null;    // LevelEditor for menu level
let _capturedEntities = null;  // snapshot of game entities for editor init
let _gameCamX = 0;       // exposed camera X from game loop
let _gameCamY = 0;       // exposed camera Y from game loop
let _editorPlayTest = false;   // true when play-testing from editor
let _editorPlayTestTiles = null;  // saved tile state (terrain only) for returning to editor
let _editorPlayTestTilesWithEntities = null;  // saved tile state (with entities) for restart
let _editorPlayTestEntities = null;  // saved entity state for editor play test
let _editorPlayTestUndoStack = null; // saved undo/redo stacks for editor play test
let _editorPlayTestRedoStack = null;

// ── Music & SFX ──
const music = new MusicSystem();
const sfx = new SfxSystem();
window._music = music; // exposed for settings panel volume control
window._sfx = sfx;

// Start menu music on first user interaction (browser autoplay policy)
function initMenuMusic() {
  music.play('menu');
  document.removeEventListener('click', initMenuMusic);
  document.removeEventListener('keydown', initMenuMusic);
  document.removeEventListener('touchstart', initMenuMusic);
}
document.addEventListener('click', initMenuMusic);
document.addEventListener('keydown', initMenuMusic);
document.addEventListener('touchstart', initMenuMusic);

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
const codexPanel = document.getElementById('codexPanel');

// ── Game Over / Victory UI Elements ──
const gameOverPanel = document.getElementById('gameOverPanel');
const victoryPanel = document.getElementById('victoryPanel');

// ── Pause UI Elements ──
const pauseBtn = document.getElementById('pauseBtn');
const pausePanel = document.getElementById('pausePanel');
const pauseMusicSlider = document.getElementById('pauseMusicVol');
const pauseMusicLabel = document.getElementById('pauseMusicVolVal');
const pauseSfxSlider = document.getElementById('pauseSfxVol');
const pauseSfxLabel = document.getElementById('pauseSfxVolVal');

// ── Editor Play Test Controls ──
const editorTestControls = document.getElementById('editorTestControls');
const editorTestRestart = document.getElementById('editorTestRestart');
const editorTestExit = document.getElementById('editorTestExit');

// ── Touch Controls (module-level so menu/pause helpers can access) ──
const touchControls = new TouchControls();

function showMenu() {
  gsm.forceState(STATE.MENU);
  menuOverlay.classList.remove('hidden');
  // Ensure main menu buttons are visible, level select is hidden
  document.getElementById('menuMain').classList.remove('hidden');
  document.getElementById('levelSelect').classList.add('hidden');
  aquariumCloseBtn.classList.remove('visible');
  settingsPanel.classList.remove('visible');
  aboutPanel.classList.remove('visible');
  codexPanel.classList.remove('visible');
  pauseBtn.classList.remove('visible');
  touchControls.hide();
  pausePanel.classList.remove('visible');
  gameOverPanel.classList.remove('visible');
  victoryPanel.classList.remove('visible');
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  menuScene.setAquariumMode(false);
  if (!menuScene._running) menuScene.start();
  music.play('menu');
}

function hideMenuUI() {
  menuOverlay.classList.add('hidden');
  settingsPanel.classList.remove('visible');
  aboutPanel.classList.remove('visible');
  codexPanel.classList.remove('visible');
}

// ── Iris Transition System ──
// Unified circle-wipe for all scene transitions (menu load, start game, death, restart, exit).
// Phases: close_fast → close_linger → close_final → black → open_small → open_linger → open_full
// Can run standalone (own rAF loop) or be driven by game loop.
const IRIS_R = 100;                     // px — linger radius
const IRIS_CLOSE_FAST = 0.4;            // s — full → IRIS_R
const IRIS_CLOSE_LINGER = 0.5;          // s — hold at IRIS_R
const IRIS_CLOSE_FINAL = 0.3;           // s — IRIS_R → 0
const IRIS_BLACK = 0.2;                 // s — full black
const IRIS_OPEN_SMALL = 0.3;            // s — 0 → IRIS_R
const IRIS_OPEN_LINGER = 0.5;           // s — hold at IRIS_R
const IRIS_OPEN_FULL = 0.4;             // s — IRIS_R → full

// Shared iris state (used by both standalone loop and game loop)
let irisState = 'none';
let irisTimer = 0;
let irisCx = 0;                         // close center
let irisCy = 0;
let irisOpenCx = 0;                     // open center (may differ from close)
let irisOpenCy = 0;
let _irisOnBlack = null;                // callback when black phase starts
let _irisHoldBlack = false;             // true = stay black, don't open
let _irisAnimId = null;                 // rAF id for standalone loop

function _irisMaxRadius() {
  const W = hudCanvas.width;
  const H = hudCanvas.height;
  return Math.sqrt(W * W + H * H);
}

// Compute current iris radius (returns null if no overlay should be drawn)
function _irisRadius() {
  const maxR = _irisMaxRadius();
  if (irisState === 'close_fast') {
    const t = Math.min(irisTimer / IRIS_CLOSE_FAST, 1);
    const e = t * (2 - t);
    return IRIS_R + (maxR - IRIS_R) * (1 - e);
  }
  if (irisState === 'close_linger') return IRIS_R;
  if (irisState === 'close_final') {
    const t = Math.min(irisTimer / IRIS_CLOSE_FINAL, 1);
    return IRIS_R * (1 - t);
  }
  if (irisState === 'black') return 0;
  if (irisState === 'open_small') {
    const t = Math.min(irisTimer / IRIS_OPEN_SMALL, 1);
    return IRIS_R * t;
  }
  if (irisState === 'open_linger') return IRIS_R;
  if (irisState === 'open_full') {
    const t = Math.min(irisTimer / IRIS_OPEN_FULL, 1);
    const e = t * (2 - t);
    return IRIS_R + (maxR - IRIS_R) * e;
  }
  return null;
}

// Current center for the iris circle
function _irisCenter() {
  if (irisState === 'close_fast' || irisState === 'close_linger' || irisState === 'close_final' || irisState === 'black') {
    return { x: irisCx, y: irisCy };
  }
  return { x: irisOpenCx, y: irisOpenCy };
}

// Advance iris state machine by dt seconds. Returns true if game should freeze.
function _irisStep(dt) {
  if (irisState === 'none') return false;
  irisTimer += dt;

  if (irisState === 'close_fast') {
    if (irisTimer >= IRIS_CLOSE_FAST) { irisState = 'close_linger'; irisTimer = 0; }
    return true;
  }
  if (irisState === 'close_linger') {
    if (irisTimer >= IRIS_CLOSE_LINGER) { irisState = 'close_final'; irisTimer = 0; }
    return true;
  }
  if (irisState === 'close_final') {
    if (irisTimer >= IRIS_CLOSE_FINAL) {
      irisState = 'black';
      irisTimer = 0;
      if (_irisOnBlack) { _irisOnBlack(); _irisOnBlack = null; }
    }
    return true;
  }
  if (irisState === 'black') {
    if (_irisHoldBlack) return true; // stay black indefinitely
    if (irisTimer >= IRIS_BLACK) { irisState = 'open_small'; irisTimer = 0; }
    return true;
  }
  if (irisState === 'open_small') {
    if (irisTimer >= IRIS_OPEN_SMALL) { irisState = 'open_linger'; irisTimer = 0; }
    return false;
  }
  if (irisState === 'open_linger') {
    if (irisTimer >= IRIS_OPEN_LINGER) { irisState = 'open_full'; irisTimer = 0; }
    return false;
  }
  if (irisState === 'open_full') {
    if (irisTimer >= IRIS_OPEN_FULL) {
      irisState = 'none'; irisTimer = 0;
      if (appState === 'game') touchControls.show();
    }
    return false;
  }
  return false;
}

// Draw the iris mask onto hudCtx
function _irisDraw() {
  if (irisState === 'none') return;
  const r = _irisRadius();
  if (r === null) return;
  const c = _irisCenter();
  const W = hudCanvas.width;
  const H = hudCanvas.height;
  hudCtx.save();
  hudCtx.fillStyle = '#000000';
  hudCtx.beginPath();
  hudCtx.rect(0, 0, W, H);
  hudCtx.arc(c.x, c.y, Math.max(0, r), 0, Math.PI * 2, true);
  hudCtx.fill();
  hudCtx.restore();
}

// Start an "open-only" iris (from black → open). Used for menu load-in.
function irisOpenFrom(cx, cy) {
  irisState = 'open_small';
  irisTimer = 0;
  irisOpenCx = cx;
  irisOpenCy = cy;
  _irisOnBlack = null;
}

// Start a full close→open iris. onBlack is called when fully black.
function irisCloseOpen(closeCx, closeCy, openCx, openCy, onBlack) {
  irisState = 'close_fast';
  irisTimer = 0;
  irisCx = closeCx;
  irisCy = closeCy;
  irisOpenCx = openCx;
  irisOpenCy = openCy;
  _irisHoldBlack = false;
  _irisOnBlack = onBlack;
}

// Close-only iris: zoom into center, stay black, call onBlack when done.
function irisCloseOnly(closeCx, closeCy, onBlack) {
  irisState = 'close_fast';
  irisTimer = 0;
  irisCx = closeCx;
  irisCy = closeCy;
  _irisHoldBlack = true;
  _irisOnBlack = onBlack;
}

// Standalone rAF loop for iris outside game loop (menu transitions)
let _irisLastFrame = 0;
let _irisAccum = 0;
function _irisStandaloneLoop(timestamp) {
  if (!timestamp) timestamp = performance.now();
  if (_irisLastFrame === 0) _irisLastFrame = timestamp;
  const rawDt = (timestamp - _irisLastFrame) / 1000;
  _irisLastFrame = timestamp;
  _irisAccum += Math.min(rawDt, MAX_STEPS_PER_FRAME * FIXED_DT);
  while (_irisAccum >= FIXED_DT) {
    _irisAccum -= FIXED_DT;
    _irisStep(FIXED_DT);
  }

  // During black phase: if start-game is pending, init the game and hand off
  if (_startGamePending && irisState === 'black') {
    _startGamePending = false;
    _irisAnimId = null;
    // Init game — its game loop will drive the remaining open phases
    menuScene.stop();
    gsm.forceState(STATE.GAME_PLAYING);
    music.play('game');
    _startWithExpand = true;
    startGame();
    return;
  }

  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  _irisDraw();

  if (irisState === 'none') {
    _irisAnimId = null;
    return;
  }
  _irisAnimId = requestAnimationFrame(_irisStandaloneLoop);
}

function _irisStartStandalone() {
  if (_irisAnimId) cancelAnimationFrame(_irisAnimId);
  _irisLastFrame = 0;
  _irisAccum = 0;
  _irisAnimId = requestAnimationFrame(_irisStandaloneLoop);
}

function _irisStopStandalone() {
  if (_irisAnimId) { cancelAnimationFrame(_irisAnimId); _irisAnimId = null; }
}

// ── Menu load-in: black → open from Start button ──
{
  const btn = document.getElementById('btnStartGame');
  const rect = btn.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  irisOpenFrom(cx, cy);
  _irisStartStandalone();
}

// ── Level Select UI ──
const menuMain = document.getElementById('menuMain');
const levelSelect = document.getElementById('levelSelect');
const levelCards = document.getElementById('levelCards');

// Populate level cards from level-data
function _buildLevelCards() {
  levelCards.innerHTML = '';
  const levels = getLevels();
  for (const lv of levels) {
    const card = document.createElement('div');
    card.className = 'level-card';
    card.innerHTML =
      `<div class="level-card-number">${t('levelSelect.levelNumber', { n: lv.index + 1 })}</div>` +
      `<div class="level-card-name">${t(`level.${lv.id}.name`)}</div>` +
      `<div class="level-card-desc">${t(`level.${lv.id}.desc`)}</div>`;
    card.addEventListener('click', () => _startLevel(lv.index, card));
    levelCards.appendChild(card);
  }
}
_buildLevelCards();

function _showLevelSelect() {
  menuMain.classList.add('hidden');
  levelSelect.classList.remove('hidden');
}

function _hideLevelSelect() {
  levelSelect.classList.add('hidden');
  menuMain.classList.remove('hidden');
}

// ── Start Game: close to Start button → black → game inits → open from player spawn ──
let _startGamePending = false;

// "Start Game" opens level select
document.getElementById('btnStartGame').addEventListener('click', () => {
  if (irisState !== 'none') return;
  sfx.buttonClick();
  _showLevelSelect();
});

// "Back" from level select returns to main menu
document.getElementById('levelSelectBack').addEventListener('click', () => {
  sfx.buttonClick();
  _hideLevelSelect();
});

// Start a specific level
function _startLevel(index, cardEl) {
  if (irisState !== 'none') return;
  sfx.gameStart();
  setCurrentLevel(index);
  // Get card rect BEFORE hiding
  const rect = cardEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  hideMenuUI();
  _hideLevelSelect();
  aquariumCloseBtn.classList.remove('visible');
  _startGamePending = true;
  irisCloseOpen(cx, cy, cx, cy, () => { /* standalone loop handles init */ });
  _irisStartStandalone();
}

// Signal: startGame should set iris open center to player spawn
let _startWithExpand = true; // true on first load too

document.getElementById('btnAquarium').addEventListener('click', () => {
  sfx.buttonClick();
  gsm.transition(STATE.AQUARIUM);
  hideMenuUI();
  aquariumCloseBtn.classList.add('visible');
  menuScene.setAquariumMode(true);
});

aquariumCloseBtn.addEventListener('click', () => {
  sfx.buttonClick();
  showMenu();
});

document.getElementById('btnSettings').addEventListener('click', () => {
  sfx.buttonClick();
  gsm.transition(STATE.SETTINGS);
  menuOverlay.classList.add('hidden');
  settingsPanel.classList.add('visible');
});

document.getElementById('settingsBack').addEventListener('click', () => {
  sfx.buttonClick();
  showMenu();
});

document.getElementById('btnAbout').addEventListener('click', () => {
  sfx.buttonClick();
  gsm.transition(STATE.ABOUT);
  menuOverlay.classList.add('hidden');
  aboutPanel.classList.add('visible');
});

document.getElementById('aboutBack').addEventListener('click', () => {
  sfx.buttonClick();
  showMenu();
});

// ── Codex (Encyclopedia) ──
const CODEX_DATA = [
  // ── Player ──
  { category: 'player', preview: 'player', i18nKey: 'player', tag: 'friendly' },
  // ── Enemies ──
  { category: 'enemies', preview: 'piranha', i18nKey: 'piranha', tag: 'danger' },
  { category: 'enemies', preview: 'shark', i18nKey: 'shark', tag: 'danger' },
  { category: 'enemies', preview: 'pufferfish', i18nKey: 'pufferfish', tag: 'danger' },
  { category: 'enemies', preview: 'crab', i18nKey: 'crab', tag: 'danger' },
  { category: 'enemies', preview: 'toxicFish', i18nKey: 'toxicFish', tag: 'danger' },
  { category: 'enemies', preview: 'armoredFish', i18nKey: 'armoredFish', tag: 'danger' },
  { category: 'enemies', preview: 'spittingCoral', i18nKey: 'spittingCoral', tag: 'danger' },
  { category: 'enemies', preview: 'giantCrabBoss', i18nKey: 'giantCrabBoss', tag: 'danger' },
  // ── Items ──
  { category: 'items', preview: 'pearl', i18nKey: 'pearl', tag: 'item' },
  { category: 'items', preview: 'key', i18nKey: 'key', tag: 'item' },
  { category: 'items', preview: 'chest', i18nKey: 'chest', tag: 'item' },
  { category: 'items', preview: 'boulder', i18nKey: 'boulder', tag: 'item' },
  { category: 'items', preview: 'crate', i18nKey: 'crate', tag: 'item' },
  // ── Terrain ──
  { category: 'terrain', preview: 'breakableWall', i18nKey: 'breakableWall', tag: 'terrain' },
  { category: 'terrain', preview: 'switchToggle', i18nKey: 'switchToggle', tag: 'terrain' },
  { category: 'terrain', preview: 'switchPressure', i18nKey: 'switchPressure', tag: 'terrain' },
  { category: 'terrain', preview: 'switchTimed', i18nKey: 'switchTimed', tag: 'terrain' },
  { category: 'terrain', preview: 'gate', i18nKey: 'gate', tag: 'terrain' },
  { category: 'terrain', preview: 'coral', i18nKey: 'coral', tag: 'terrain' },
  { category: 'terrain', preview: 'sand', i18nKey: 'sand', tag: 'terrain' },
  { category: 'terrain', preview: 'seagrass', i18nKey: 'seagrass', tag: 'terrain' },
  { category: 'terrain', preview: 'hazard', i18nKey: 'hazard', tag: 'danger' },
  { category: 'terrain', preview: 'buoy', i18nKey: 'buoy', tag: 'terrain' },
  { category: 'terrain', preview: 'raft', i18nKey: 'raft', tag: 'terrain' },
  { category: 'items', preview: 'floatingLog', i18nKey: 'floatingLog', tag: 'item' },
  { category: 'items', preview: 'swingingAnchor', i18nKey: 'swingingAnchor', tag: 'terrain' },
  { category: 'items', preview: 'bottle', i18nKey: 'bottle', tag: 'item' },
  { category: 'terrain', preview: 'hintStone', i18nKey: 'hintStone', tag: 'terrain' },
  { category: 'terrain', preview: 'water', i18nKey: 'water', tag: 'terrain' },
  // ── Skills ──
  { category: 'player', preview: 'stunPulse', i18nKey: 'stunPulse', tag: 'friendly' },
  { category: 'player', preview: 'speedSurge', i18nKey: 'speedSurge', tag: 'friendly' },
];

// Lazy-generated preview images (rendered on first Codex open)
let _codexPreviews = null;
let _editorPreviews = null;

function _buildCodexEntries(category) {
  if (!_codexPreviews) _codexPreviews = generateCodexPreviews(THREE);

  const container = document.getElementById('codexEntries');
  container.innerHTML = '';
  const entries = category === 'all'
    ? CODEX_DATA
    : CODEX_DATA.filter(e => e.category === category);

  for (const entry of entries) {
    const k = entry.i18nKey;
    const name = t(`codex.${k}.name`);
    const tagLabel = t(`codex.${k}.tagLabel`);
    const desc = t(`codex.${k}.desc`);
    const tip = t(`codex.${k}.tip`);

    const tagClass = {
      danger: 'codex-tag-danger',
      friendly: 'codex-tag-friendly',
      item: 'codex-tag-item',
      terrain: 'codex-tag-terrain',
    }[entry.tag] || 'codex-tag-terrain';

    const tipHtml = tip && tip !== `codex.${k}.tip`
      ? `<div class="codex-entry-tip">${tip}</div>`
      : '';

    const previewSrc = _codexPreviews[entry.preview] || '';
    const iconHtml = previewSrc
      ? `<img class="codex-entry-icon" src="${previewSrc}" alt="${name}">`
      : `<span class="codex-entry-icon">?</span>`;

    const el = document.createElement('div');
    el.className = 'codex-entry';
    el.innerHTML =
      `<div class="codex-entry-header">` +
        iconHtml +
        `<span class="codex-entry-name">${name}</span>` +
        `<span class="codex-entry-tag ${tagClass}">${tagLabel}</span>` +
      `</div>` +
      `<div class="codex-entry-desc">${desc}</div>` +
      tipHtml;
    container.appendChild(el);
  }
}

// Tab switching
document.getElementById('codexTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.codex-tab');
  if (!tab) return;
  sfx.buttonClick();
  document.querySelectorAll('.codex-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  _buildCodexEntries(tab.dataset.category);
});

document.getElementById('btnCodex').addEventListener('click', () => {
  sfx.buttonClick();
  gsm.transition(STATE.CODEX);
  menuOverlay.classList.add('hidden');
  codexPanel.classList.add('visible');
  // Reset to "All" tab
  document.querySelectorAll('.codex-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.codex-tab[data-category="all"]').classList.add('active');
  _buildCodexEntries('all');
});

document.getElementById('codexBack').addEventListener('click', () => {
  sfx.buttonClick();
  showMenu();
});

// ── Pause UI Handlers ──
function _syncPauseSliders() {
  // Sync pause modal sliders with current settings
  const stored = JSON.parse(localStorage.getItem('loaf_settings') || '{}');
  const mv = stored.musicVol ?? 60;
  const sv = stored.sfxVol ?? 40;
  pauseMusicSlider.value = mv;
  pauseMusicLabel.textContent = mv + '%';
  pauseSfxSlider.value = sv;
  pauseSfxLabel.textContent = sv + '%';
}

function _showPauseModal() {
  _syncPauseSliders();
  pausePanel.classList.add('visible');
  pauseBtn.classList.remove('visible');
  touchControls.hide();
}

function _hidePauseModal() {
  pausePanel.classList.remove('visible');
  if (appState === 'game' && !_editorPlayTest) pauseBtn.classList.add('visible');
}

pauseBtn.addEventListener('click', () => {
  sfx.buttonClick();
  if (window._pauseGame) window._pauseGame();
});

document.getElementById('pauseResume').addEventListener('click', () => {
  sfx.buttonClick();
  if (window._resumeGame) window._resumeGame();
});

document.getElementById('pauseRestart').addEventListener('click', () => {
  sfx.buttonClick();
  if (window._restartGame) window._restartGame();
});

document.getElementById('pauseExit').addEventListener('click', () => {
  sfx.buttonClick();
  if (window._exitToMenu) window._exitToMenu();
});

// ── Game Over buttons ──
document.getElementById('goRestart').addEventListener('click', () => {
  sfx.buttonClick();
  if (window._restartGame) window._restartGame();
});
document.getElementById('goExit').addEventListener('click', () => {
  sfx.buttonClick();
  if (window._exitToMenu) window._exitToMenu();
});

// ── Victory buttons ──
document.getElementById('vicRestart').addEventListener('click', () => {
  sfx.buttonClick();
  if (window._restartGame) window._restartGame();
});
document.getElementById('vicExit').addEventListener('click', () => {
  sfx.buttonClick();
  if (window._exitToMenu) window._exitToMenu();
});

pauseMusicSlider.addEventListener('input', () => {
  const v = parseInt(pauseMusicSlider.value);
  pauseMusicLabel.textContent = v + '%';
  const stored = JSON.parse(localStorage.getItem('loaf_settings') || '{}');
  stored.musicVol = v;
  localStorage.setItem('loaf_settings', JSON.stringify(stored));
  if (window._music) window._music.setVolume(v / 100);
  // Sync main settings slider too
  const mainSlider = document.getElementById('musicVolume');
  const mainLabel = document.getElementById('musicVolumeVal');
  if (mainSlider) mainSlider.value = v;
  if (mainLabel) mainLabel.textContent = v + '%';
});

pauseSfxSlider.addEventListener('input', () => {
  const v = parseInt(pauseSfxSlider.value);
  pauseSfxLabel.textContent = v + '%';
  const stored = JSON.parse(localStorage.getItem('loaf_settings') || '{}');
  stored.sfxVol = v;
  localStorage.setItem('loaf_settings', JSON.stringify(stored));
  if (window._sfx) window._sfx.setVolume(v / 100);
  // Sync main settings slider too
  const mainSlider = document.getElementById('sfxVolume');
  const mainLabel = document.getElementById('sfxVolumeVal');
  if (mainSlider) mainSlider.value = v;
  if (mainLabel) mainLabel.textContent = v + '%';
});

// ── Level Editor Toggle (F4) ──
window.addEventListener('keydown', (e) => {
  if (e.code === 'F4') {
    e.preventDefault();
    if (editorActive) {
      _deactivateEditor();
      // Transition back: GAME_EDITOR→GAME_PLAYING or MENU_EDITOR→MENU
      if (gsm.is(STATE.GAME_EDITOR)) gsm.transition(STATE.GAME_PLAYING);
      else if (gsm.is(STATE.MENU_EDITOR)) gsm.transition(STATE.MENU);
    } else {
      // Transition to editor: GAME_PLAYING→GAME_EDITOR or MENU→MENU_EDITOR
      if (gsm.is(STATE.GAME_PLAYING) || (gsm.is(STATE.MENU) && appState === 'game' && gameInitialized)) {
        gsm.transition(STATE.GAME_EDITOR);
      } else if (gsm.is(STATE.MENU)) {
        gsm.transition(STATE.MENU_EDITOR);
      }
      _activateEditor();
    }
  }
});

function _activateEditor() {
  editorActive = true;

  // Generate editor preview thumbnails once (lazy, reuses codex previews)
  if (!_editorPreviews) {
    if (!_codexPreviews) _codexPreviews = generateCodexPreviews(THREE);
    _editorPreviews = generateEditorPreviews(THREE, VoxelRenderer, _codexPreviews);
  }

  // Hide game UI elements while in editor
  pauseBtn.classList.remove('visible');
  touchControls.hide();

  if (appState === 'game' && gameInitialized) {
    // Game level editor
    if (!gameEditor) {
      const entityList = LevelEditor.buildEntityList(
        TILES, LEVEL_COLS, LEVEL_ROWS, _capturedEntities
      );
      gameEditor = new LevelEditor(
        hudCtx, hudCanvas, TILES, LEVEL_COLS, LEVEL_ROWS, WORLD_W, WORLD_H
      );
      gameEditor.setPreviews(_editorPreviews);
      gameEditor.setScene(THREE, scene, voxelRenderer);
      gameEditor.setLevelMeta(getCurrentLevelMeta());
      // Wire up 3D rebuild callbacks
      gameEditor.onTerrainChange = () => {
        if (voxelRenderer) voxelRenderer.rebuildTerrain();
      };
      gameEditor.onEntityChange = (entities) => {
        _rebuildGameEntityVisuals(entities);
      };
      gameEditor.onLevelResize = (cols, rows, worldW, worldH, waterRow) => {
        if (voxelRenderer) voxelRenderer.rebuildTerrainFrom(TILES, cols, rows, worldH, waterRow * TILE_SIZE);
        _rebuildGameEntityVisuals(gameEditor.entities);
      };
      gameEditor.onPlayTest = () => _startEditorPlayTest();
      gameEditor.activate(_gameCamX, _gameCamY, entityList);
    } else {
      gameEditor.onPlayTest = () => _startEditorPlayTest();
      gameEditor.activate(_gameCamX, _gameCamY, gameEditor.entities);
    }
    // Detach from menu
    menuScene.setEditor(null);
  } else {
    // Menu level editor
    if (!menuEditor) {
      const menuEntities = LevelEditor.buildEntityList(
        MENU_TILES, MENU_COLS, MENU_ROWS, menuScene.getEntityData()
      );
      menuEditor = new LevelEditor(
        hudCtx, hudCanvas, MENU_TILES, MENU_COLS, MENU_ROWS, MENU_WORLD_W, MENU_WORLD_H
      );
      menuEditor.setPreviews(_editorPreviews);
      menuEditor.setScene(THREE, menuScene.scene, menuScene.voxelRenderer);
      menuEditor.setLevelMeta({ name: 'Menu Aquarium', waterRow: 4 });
      // Wire up 3D rebuild callbacks for menu
      menuEditor.onTerrainChange = () => {
        const mr = menuScene.voxelRenderer;
        if (mr) mr.rebuildTerrainFrom(MENU_TILES, MENU_COLS, MENU_ROWS, MENU_WORLD_H, MENU_WATER_SURFACE_Y);
      };
      menuEditor.onEntityChange = (entities) => {
        _rebuildMenuEntityVisuals(entities);
      };
      menuEditor.onLevelResize = (cols, rows, worldW, worldH, waterRow) => {
        // Rebuild terrain and entity visuals after load/import
        const mr = menuScene.voxelRenderer;
        if (mr) mr.rebuildTerrainFrom(MENU_TILES, cols, rows, worldH, waterRow * TILE_SIZE);
        _rebuildMenuEntityVisuals(menuEditor.entities);
      };
      menuEditor.activate(menuScene.camX, menuScene.camY, menuEntities);
    } else {
      menuEditor.activate(menuScene.camX, menuScene.camY, menuEditor.entities);
    }
    // Attach to menu scene for rendering in its loop
    menuScene.setEditor(menuEditor);
    // Hide menu UI while editing
    menuOverlay.classList.add('hidden');
    aquariumCloseBtn.classList.remove('visible');
    settingsPanel.classList.remove('visible');
    aboutPanel.classList.remove('visible');
    codexPanel.classList.remove('visible');
  }
}

// Rebuild entity visuals from editor entity list (game level)
function _rebuildGameEntityVisuals(entities) {
  if (!voxelRenderer) return;
  voxelRenderer.clearEntityVisuals();
  _buildEditorEntities(voxelRenderer, entities);
  _positionEditorEntities(voxelRenderer, entities);
}

// Rebuild entity visuals for menu level
function _rebuildMenuEntityVisuals(entities) {
  const mr = menuScene.voxelRenderer;
  if (!mr) return;
  mr.clearEntityVisuals();
  _buildEditorEntities(mr, entities);
  _positionEditorEntities(mr, entities);
}

// Build all entity visuals from editor entity list
function _buildEditorEntities(vr, entities) {
  // Collect entities by type for batch building
  const pearls = [], buoys = [], boulders = [], rafts = [], keys = [], chests = [];
  const crates = [], switches = [], gates = [];
  const bottles = [], hints = [], logs = [], anchors = [];

  // Ground-based entities — visual position shifted to tile bottom
  const GROUND_IDS = new Set([14, 29, 30, 31, 32, 33, 38]);

  for (const ent of entities) {
    const yOff = GROUND_IDS.has(ent.tileId) ? TILE_SIZE / 2 : 0;
    const fakeBody = { position: { x: ent.x, y: ent.y + yOff } };
    switch (ent.tileId) {
      case 5: pearls.push(fakeBody); break;
      case 6: vr.buildEnemyFish(); break;
      case 7: /* spawn — no 3D model needed */ break;
      case 9: buoys.push(fakeBody); break;
      case 10: boulders.push(fakeBody); break;
      case 11: rafts.push(fakeBody); break;
      case 12: vr.buildShark(); break;
      case 13: vr.buildPufferfish(); break;
      case 14: vr.buildCrab(); break;
      case 15: vr.buildToxicFish(); break;
      case 26: crates.push(fakeBody); break;
      case 28: vr.buildArmoredFish(); break;
      case 29: vr.buildSpittingCoral(); break;
      case 38: vr.buildGiantCrabBoss(); break;
      case 30: switches.push({ body: fakeBody, type: 'toggle', group: ent.group || 0, active: false, timer: 0 }); break;
      case 31: switches.push({ body: fakeBody, type: 'pressure', group: ent.group || 0, active: false, timer: 0 }); break;
      case 32: switches.push({ body: fakeBody, type: 'timed', group: ent.group || 0, active: false, timer: 0 }); break;
      case 33: gates.push({ body: fakeBody, group: ent.group || 0, open: false, angle: 0 }); break;
      case 34: logs.push(fakeBody); break;
      case 35: anchors.push({ body: fakeBody, pivotX: ent.x, pivotY: ent.y, chainLength: ent.chainLength || 96 }); break;
      case 36: bottles.push({ body: fakeBody, text: ent.text || '...', collected: false }); break;
      case 37: hints.push({ body: fakeBody, text: ent.text || '...' }); break;
      default:
        if (ent.tileId >= 16 && ent.tileId <= 20) {
          keys.push({ body: fakeBody, colorIndex: ent.tileId - 16 });
        } else if (ent.tileId >= 21 && ent.tileId <= 25) {
          chests.push({ body: fakeBody, colorIndex: ent.tileId - 21 });
        }
    }
  }

  if (pearls.length) for (const b of pearls) vr.buildPearlAt(b);
  if (buoys.length) vr.buildBuoys(buoys);
  if (boulders.length) vr.buildBoulders(boulders);
  if (rafts.length) vr.buildRafts(rafts);
  if (keys.length) vr.buildKeys(keys);
  if (chests.length) vr.buildChests(chests);
  if (crates.length) vr.buildCrates(crates);
  if (switches.length) vr.buildSwitches(switches);
  if (gates.length) vr.buildGates(gates);
  if (logs.length) vr.buildFloatingLogs(logs);
  if (anchors.length) vr.buildSwingingAnchors(anchors);
  if (bottles.length) vr.buildBottles(bottles);
  if (hints.length) vr.buildHintStones(hints);
}

// Position editor entity visuals at their world positions
function _positionEditorEntities(vr, entities) {
  // Ground-based entities get visual offset to tile bottom
  const GROUND_IDS = new Set([14, 29, 30, 31, 32, 33, 38]);
  let ei = 0, si = 0, pi = 0, ci = 0, ti = 0, ai = 0, sci = 0, bcbi = 0;
  for (const ent of entities) {
    const x = ent.x;
    const groundOff = GROUND_IDS.has(ent.tileId) ? TILE_SIZE / 2 : 0;
    const y = -(ent.y + groundOff); // Three.js Y is flipped
    if (ent.tileId === 6 && ei < vr.enemyGroups.length) {
      vr.enemyGroups[ei].position.set(x, y, 0);
      vr.enemyGroups[ei].visible = true;
      ei++;
    } else if (ent.tileId === 12 && si < vr.sharkGroups.length) {
      vr.sharkGroups[si].position.set(x, y, 0);
      vr.sharkGroups[si].visible = true;
      si++;
    } else if (ent.tileId === 13 && pi < vr.pufferfishGroups.length) {
      vr.pufferfishGroups[pi].position.set(x, y, 0);
      vr.pufferfishGroups[pi].visible = true;
      pi++;
    } else if (ent.tileId === 14 && ci < vr.crabGroups.length) {
      vr.crabGroups[ci].position.set(x, y, 0);
      vr.crabGroups[ci].visible = true;
      ci++;
    } else if (ent.tileId === 15 && ti < vr.toxicFishGroups.length) {
      vr.toxicFishGroups[ti].position.set(x, y, 0);
      vr.toxicFishGroups[ti].visible = true;
      ti++;
    } else if (ent.tileId === 28 && ai < vr.armoredFishGroups.length) {
      vr.armoredFishGroups[ai].position.set(x, y, 0);
      vr.armoredFishGroups[ai].visible = true;
      ai++;
    } else if (ent.tileId === 29 && sci < vr.spittingCoralGroups.length) {
      vr.spittingCoralGroups[sci].position.set(x, y, 0);
      vr.spittingCoralGroups[sci].visible = true;
      sci++;
    } else if (ent.tileId === 38 && bcbi < vr.bossCrabGroups.length) {
      vr.bossCrabGroups[bcbi].position.set(x, y, 0);
      vr.bossCrabGroups[bcbi].visible = true;
      bcbi++;
    }
    // Pearl, buoy, boulder, raft, key, chest, crate, switch, gate positions
    // are already set by the build methods via the fakeBody positions
  }
}

function _deactivateEditor() {
  editorActive = false;
  if (gameEditor) gameEditor.deactivate();
  if (menuEditor) menuEditor.deactivate();
  menuScene.setEditor(null);
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  // Restore menu UI if we were in menu state
  if (appState === 'menu') {
    menuOverlay.classList.remove('hidden');
  }
  // Restore game UI if we were in game state
  if (appState === 'game' && gameInitialized) {
    pauseBtn.classList.add('visible');
    touchControls.show();
  }
}

function _getActiveEditor() {
  if (!editorActive) return null;
  if (appState === 'game' && gameInitialized) return gameEditor;
  return menuEditor;
}

// ── Editor Play Test ──
function _startEditorPlayTest() {
  if (!gameEditor || !editorActive) return;

  // Save editor state for returning (terrain-only tiles, before writing entities)
  _editorPlayTestTiles = gameEditor.tiles.map(row => [...row]);
  _editorPlayTestEntities = JSON.parse(JSON.stringify(gameEditor.entities));
  _editorPlayTestUndoStack = gameEditor._undoStack;
  _editorPlayTestRedoStack = gameEditor._redoStack;

  // Write editor entities into TILES so getLevelEntities() can find them
  for (const ent of gameEditor.entities) {
    const col = Math.round((ent.x - TILE_SIZE / 2) / TILE_SIZE);
    const row = Math.round((ent.y - TILE_SIZE / 2) / TILE_SIZE);
    if (row >= 0 && row < LEVEL_ROWS && col >= 0 && col < LEVEL_COLS) {
      TILES[row][col] = ent.tileId;
    }
  }
  // Save tiles with entities for restart
  _editorPlayTestTilesWithEntities = TILES.map(row => [...row]);

  // Deactivate editor
  _deactivateEditor();

  // Transition state machine: GAME_EDITOR → EDITOR_PLAYTEST
  gsm.transition(STATE.EDITOR_PLAYTEST);

  // Reset game initialization so startGame rebuilds everything from current TILES
  gameInitialized = false;
  gameEditor = null; // force re-creation when editor is re-opened

  // Stop menu scene
  menuScene.stop();
  menuOverlay.classList.add('hidden');

  // Cancel existing game loop before starting a new one to prevent double-speed
  if (gameAnimId) {
    cancelAnimationFrame(gameAnimId);
    gameAnimId = null;
  }

  startGame();
}

function _exitEditorPlayTest() {
  // Transition state machine: EDITOR_PLAYTEST → GAME_EDITOR
  gsm.transition(STATE.GAME_EDITOR);

  // Restore tile state with entities (so getLevelEntities works on re-init)
  if (_editorPlayTestTilesWithEntities) {
    for (let r = 0; r < _editorPlayTestTilesWithEntities.length; r++) {
      for (let c = 0; c < _editorPlayTestTilesWithEntities[r].length; c++) {
        TILES[r][c] = _editorPlayTestTilesWithEntities[r][c];
      }
    }
  }

  // Stop game loop
  if (gameAnimId) {
    cancelAnimationFrame(gameAnimId);
    gameAnimId = null;
  }
  gameInitialized = false;
  gameEditor = null;

  // Re-start game with editor's tile state (skip resetTiles)
  _editorPlayTest = true; // temporarily to skip resetTiles
  startGame();
  _editorPlayTest = false;

  // Now open editor and restore entity list
  _activateEditor();
  if (gameEditor && _editorPlayTestEntities) {
    gameEditor.entities = _editorPlayTestEntities;
    // Restore undo/redo stacks from before play test
    if (_editorPlayTestUndoStack) gameEditor._undoStack = _editorPlayTestUndoStack;
    if (_editorPlayTestRedoStack) gameEditor._redoStack = _editorPlayTestRedoStack;
    // Restore terrain-only tiles for editor (entities tracked separately)
    if (_editorPlayTestTiles) {
      for (let r = 0; r < _editorPlayTestTiles.length; r++) {
        for (let c = 0; c < _editorPlayTestTiles[r].length; c++) {
          TILES[r][c] = _editorPlayTestTiles[r][c];
        }
      }
    }
    if (gameEditor.onEntityChange) gameEditor.onEntityChange(_editorPlayTestEntities);
    gameEditor.onTerrainChange?.();
  }
}

function _restartEditorPlayTest() {
  // Self-transition: EDITOR_PLAYTEST → EDITOR_PLAYTEST
  gsm.transition(STATE.EDITOR_PLAYTEST);

  // Restore tile state with entities for a fresh start
  if (_editorPlayTestTilesWithEntities) {
    for (let r = 0; r < _editorPlayTestTilesWithEntities.length; r++) {
      for (let c = 0; c < _editorPlayTestTilesWithEntities[r].length; c++) {
        TILES[r][c] = _editorPlayTestTilesWithEntities[r][c];
      }
    }
  }

  // Reset game initialization
  gameInitialized = false;
  gameEditor = null;
  if (gameAnimId) {
    cancelAnimationFrame(gameAnimId);
    gameAnimId = null;
  }

  // Show editor test controls
  editorTestControls.classList.add('visible');
  pauseBtn.classList.remove('visible');

  // Restart
  startGame();
}

editorTestExit.addEventListener('click', () => _exitEditorPlayTest());
editorTestRestart.addEventListener('click', () => _restartEditorPlayTest());

// ── State Machine Hook Registration ──
// Hooks sync legacy flags and manage UI visibility for each state.

gsm.registerHooks(STATE.MENU, {
  onEnter() {
    appState = 'menu';
    editorActive = false;
    _editorPlayTest = false;
    menuOverlay.classList.remove('hidden');
    pauseBtn.classList.remove('visible');
    editorTestControls.classList.remove('visible');
    touchControls.hide();
  },
  onExit() {
    menuOverlay.classList.add('hidden');
  },
});

gsm.registerHooks(STATE.MENU_EDITOR, {
  onEnter() {
    appState = 'menu';
    editorActive = true;
    menuOverlay.classList.add('hidden');
    aquariumCloseBtn.classList.remove('visible');
    settingsPanel.classList.remove('visible');
    aboutPanel.classList.remove('visible');
    codexPanel.classList.remove('visible');
    pauseBtn.classList.remove('visible');
    touchControls.hide();
  },
  onExit() {
    editorActive = false;
  },
});

gsm.registerHooks(STATE.GAME_PLAYING, {
  onEnter() {
    appState = 'game';
    editorActive = false;
    _editorPlayTest = false;
    pauseBtn.classList.add('visible');
    touchControls.show();
    editorTestControls.classList.remove('visible');
  },
});

gsm.registerHooks(STATE.GAME_PAUSED, {
  onEnter() {
    appState = 'game';
    touchControls.hide();
  },
  onExit() {
    touchControls.show();
  },
});

gsm.registerHooks(STATE.GAME_EDITOR, {
  onEnter() {
    appState = 'game';
    editorActive = true;
    pauseBtn.classList.remove('visible');
    touchControls.hide();
    editorTestControls.classList.remove('visible');
  },
  onExit() {
    editorActive = false;
  },
});

gsm.registerHooks(STATE.EDITOR_PLAYTEST, {
  onEnter() {
    appState = 'game';
    editorActive = false;
    _editorPlayTest = true;
    pauseBtn.classList.remove('visible');
    editorTestControls.classList.add('visible');
    touchControls.hide();
  },
  onExit() {
    _editorPlayTest = false;
    editorTestControls.classList.remove('visible');
  },
});

gsm.registerHooks(STATE.GAME_OVER, {
  onEnter() {
    touchControls.hide();
  },
});

gsm.registerHooks(STATE.VICTORY, {
  onEnter() {
    touchControls.hide();
  },
});

gsm.registerHooks(STATE.AQUARIUM, {
  onEnter() {
    appState = 'aquarium';
    menuOverlay.classList.add('hidden');
  },
  onExit() {
    appState = 'menu';
  },
});

gsm.registerHooks(STATE.SETTINGS, {
  onEnter() {
    appState = 'settings';
  },
  onExit() {
    appState = 'menu';
  },
});

gsm.registerHooks(STATE.ABOUT, {
  onEnter() {
    appState = 'about';
  },
  onExit() {
    appState = 'menu';
  },
});

gsm.registerHooks(STATE.CODEX, {
  onEnter() {
    appState = 'codex';
  },
  onExit() {
    appState = 'menu';
  },
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
    // Resume existing game — reset timestep to avoid delta spike
    _lastFrameTime = 0;
    _accumulator = 0;
    gameLoop();
    return;
  }
  gameInitialized = true;

  // Clean up previous game resources to prevent memory leaks on re-init
  if (voxelRenderer) {
    voxelRenderer.dispose();
    voxelRenderer = null;
  }
  if (scene) {
    scene = null;
  }
  camera = null;

  // Reset tile data so entities are re-extracted cleanly on re-start
  // Skip if play-testing from editor — tiles are already in the desired state
  if (!_editorPlayTest) resetTiles();

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
  voxelRenderer.buildCurrents();
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
const keyTag = new CbType();
const chestTag = new CbType();
const crateTag = new CbType();
const breakableWallTag = new CbType();
const armoredFishTag = new CbType();
const spittingCoralTag = new CbType();
const switchTag = new CbType();
const gateTag = new CbType();
const floatingLogTag = new CbType();
const swingingAnchorTag = new CbType();
const bottleTag = new CbType();
const hintStoneTag = new CbType();
const bossCrabTag = new CbType();
const bossRockTag = new CbType();

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

// Capture entity data for editor (before physics bodies consume them)
_capturedEntities = {
  playerSpawn: { ...entities.playerSpawn },
  enemies: entities.enemies.map(e => ({ ...e })),
  pearls: entities.pearls.map(e => ({ ...e })),
  hazards: entities.hazards.map(e => ({ ...e })),
  buoys: entities.buoys.map(e => ({ ...e })),
  boulders: entities.boulders.map(e => ({ ...e })),
  rafts: entities.rafts.map(e => ({ ...e })),
  sharks: entities.sharks.map(e => ({ ...e })),
  pufferfish: entities.pufferfish.map(e => ({ ...e })),
  crabs: entities.crabs.map(e => ({ ...e })),
  toxicFish: entities.toxicFish.map(e => ({ ...e })),
  crates: entities.crates.map(e => ({ ...e })),
  breakableWalls: entities.breakableWalls.map(e => ({ ...e })),
  armoredFish: entities.armoredFish.map(e => ({ ...e })),
  spittingCoral: entities.spittingCoral.map(e => ({ ...e })),
  toggleSwitches: entities.toggleSwitches.map(e => ({ ...e })),
  pressureSwitches: entities.pressureSwitches.map(e => ({ ...e })),
  timedSwitches: entities.timedSwitches.map(e => ({ ...e })),
  gates: entities.gates.map(e => ({ ...e })),
  floatingLogs: entities.floatingLogs.map(e => ({ ...e })),
  swingingAnchors: entities.swingingAnchors.map(e => ({ ...e })),
  bottleMessages: entities.bottleMessages.map(e => ({ ...e })),
  hintStones: entities.hintStones.map(e => ({ ...e })),
  giantCrabBosses: entities.giantCrabBosses.map(e => ({ ...e })),
};

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

// ── Piranha enemies ──
const enemyBodies = [];
for (const en of entities.enemies) {
  const b = new Body(BodyType.KINEMATIC, new Vec2(en.x, en.y));
  const shape = new Capsule(24, 12);
  shape.sensorEnabled = true;
  shape.cbTypes.add(enemyTag);
  b.shapes.add(shape);
  b.space = space;
  b._patrol = {
    x1: en.x - 80, y1: en.y,
    x2: en.x + 80, y2: en.y,
    speed: ENEMY_SPEED,
    _dir: 1,
  };
  enemyBodies.push(b);

  // Build piranha mesh
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

// ── Giant Crab Boss (world 1 boss — 5 HP, charge + rock throw) ──
const bossCrabBodies = [];     // array of boss bodies (usually 0 or 1 per level)
const bossRockBodies = [];     // active thrown rocks
for (const bc of entities.giantCrabBosses) {
  // Position body so its bottom edge sits on the floor (one tile below spawn)
  const spawnY = bc.y - BOSS_CRAB_HEIGHT / 2 + TILE_SIZE / 2;
  const b = new Body(BodyType.KINEMATIC, new Vec2(bc.x, spawnY));
  const shape = new Polygon(Polygon.box(BOSS_CRAB_WIDTH, BOSS_CRAB_HEIGHT));
  shape.sensorEnabled = true;
  shape.cbTypes.add(bossCrabTag);
  b.shapes.add(shape);
  b.space = space;
  // Arena bounds: patrol within 80% of the level width (10% margin each side)
  const levelMargin = WORLD_W * 0.10;
  const arenaMinX = Math.max(levelMargin, bc.x - 600);
  const arenaMaxX = Math.min(WORLD_W - levelMargin, bc.x + 600);
  b._boss = {
    hp: BOSS_CRAB_HP,
    maxHp: BOSS_CRAB_HP,
    spawnX: bc.x,
    spawnY: spawnY,
    minX: arenaMinX,
    maxX: arenaMaxX,
    dir: 1,
    state: 'patrol',        // 'patrol' | 'windup' | 'charge' | 'jumpWindup' | 'jump' | 'throwWindup' | 'slamWindup' | 'slam' | 'retreat'
    stateTimer: 0,
    throwTimer: BOSS_CRAB_THROW_INTERVAL * 0.6,  // stagger first throw
    throwing: false,                              // true while throw sequence is active
    chargeTimer: BOSS_CRAB_CHARGE_INTERVAL,
    jumpTimer: BOSS_CRAB_JUMP_INTERVAL * 0.8,   // stagger first jump
    jumpVy: 0,                                    // current vertical velocity during jump
    slamTimer: BOSS_CRAB_SLAM_INTERVAL,
    retreatTimer: BOSS_CRAB_RETREAT_INTERVAL * 0.7, // stagger first retreat
    invulnTimer: 0,
    flashTimer: 0,
  };
  bossCrabBodies.push(b);
  voxelRenderer.buildGiantCrabBoss();
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

// ── Armored fish enemies (dash-proof, killed by boulder only) ──
const armoredFishBodies = [];
for (const af of entities.armoredFish) {
  const b = new Body(BodyType.KINEMATIC, new Vec2(af.x, af.y));
  const shape = new Capsule(26, 14);
  shape.sensorEnabled = true;
  shape.cbTypes.add(armoredFishTag);
  b.shapes.add(shape);
  b.space = space;
  b._patrol = {
    x1: af.x - 70, y1: af.y,
    x2: af.x + 70, y2: af.y,
    speed: ARMORED_FISH_SPEED,
    _dir: 1,
  };
  armoredFishBodies.push(b);
  voxelRenderer.buildArmoredFish();
}

// ── Spitting coral (fixed on ground, fan projectiles) ──
const spittingCoralBodies = [];
for (const sc of entities.spittingCoral) {
  const b = new Body(BodyType.STATIC, new Vec2(sc.x, sc.y));
  const shape = new Polygon(Polygon.box(20, 24));
  shape.sensorEnabled = true;
  shape.cbTypes.add(spittingCoralTag);
  b.shapes.add(shape);
  b.space = space;
  b._shoot = { cooldown: Math.random() * CORAL_SHOOT_INTERVAL }; // stagger initial shots
  spittingCoralBodies.push(b);
  voxelRenderer.buildSpittingCoral();
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

// ── Keys (carriable colored keys, no damage) ──
const KEY_GRAB_DIST = 36;        // px — how close the fish must be to grab
const KEY_CARRY_OFFSET = 22;     // px — distance from fish center when carried
const KEY_SNAP_DIST = 55;        // px — auto-release if key stuck behind wall
const keyBodies = [];             // { body, colorIndex }
let grabbedKey = null;            // currently grabbed key body (or null)
let keyGrabSide = 1;             // 1 = right, -1 = left
for (const k of entities.keys) {
  const b = new Body(BodyType.DYNAMIC, new Vec2(k.x, k.y));
  const shape = new Polygon(Polygon.box(8, 22), undefined, new Material(0.6, 0.1, 0.1, 1.5));
  shape.cbTypes.add(keyTag);
  b.shapes.add(shape);
  b.allowRotation = false;
  b.space = space;
  b._colorIndex = k.colorIndex;
  keyBodies.push({ body: b, colorIndex: k.colorIndex });
}

// ── Chests (static, opened by matching key) ──
const chestBodies = [];           // { body, colorIndex }
for (const ch of entities.chests) {
  const b = new Body(BodyType.STATIC, new Vec2(ch.x, ch.y));
  // Solid shape — player and objects collide with the chest
  const solid = new Polygon(Polygon.box(27, 18));
  b.shapes.add(solid);
  // Sensor shape — detects key collision for unlocking
  const sensor = new Polygon(Polygon.box(30, 22));
  sensor.sensorEnabled = true;
  sensor.cbTypes.add(chestTag);
  b.shapes.add(sensor);
  b.space = space;
  b._colorIndex = ch.colorIndex;
  chestBodies.push({ body: b, colorIndex: ch.colorIndex });
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

// ── Crates (wooden boxes, destroyed by dashing) ──
const CRATE_PEARL_CHANCE = 0.3;          // ~30% chance to drop a pearl
const crateBodies = [];
for (const cr of entities.crates) {
  const b = new Body(BodyType.DYNAMIC, new Vec2(cr.x, cr.y));
  const solid = new Polygon(Polygon.box(26, 26), undefined, new Material(0.5, 0.3, 0.3, 2.0));
  b.shapes.add(solid);
  // Sensor overlay for dash detection
  const sensor = new Polygon(Polygon.box(28, 28));
  sensor.sensorEnabled = true;
  sensor.cbTypes.add(crateTag);
  b.shapes.add(sensor);
  b.allowRotation = true;
  b.space = space;
  crateBodies.push(b);
}

// ── Floating Logs (dynamic, float in water, pushable) ──
const floatingLogBodies = [];
for (const fl of entities.floatingLogs) {
  const b = new Body(BodyType.DYNAMIC, new Vec2(fl.x, fl.y));
  // Log shape — matches visual (~11 voxels wide, ~5 tall at V=2.5)
  const shape = new Polygon(Polygon.box(28, 12), undefined, new Material(0.4, 0.3, 0.3, 0.6));
  shape.cbTypes.add(floatingLogTag);
  b.shapes.add(shape);
  b.allowRotation = true;
  b.space = space;
  floatingLogBodies.push(b);
}

// ── Swinging Anchors (kinematic pendulum bodies) ──
const ANCHOR_DEFAULT_CHAIN = 96;  // px — default chain length (3 tiles)
const swingingAnchorBodies = [];  // { body, pivotX, pivotY, chainLength, angle, angularVel }
for (const sa of entities.swingingAnchors) {
  const chainLen = sa.chainLength || ANCHOR_DEFAULT_CHAIN;
  // Pivot is where the tile is placed; anchor body hangs below
  const ANCHOR_BODY_OFFSET = 12; // px — offset from chain end to anchor body center
  const startAngle = 0.4; // start slightly tilted so it swings immediately
  const totalLen = chainLen + ANCHOR_BODY_OFFSET;
  const anchorX = sa.x + totalLen * Math.sin(startAngle);
  const anchorY = sa.y + totalLen * Math.cos(startAngle);
  const b = new Body(BodyType.KINEMATIC, new Vec2(anchorX, anchorY));
  const shape = new Polygon(Polygon.box(24, 20), undefined, new Material(0.8, 0.1, 0.1, 3.0));
  shape.cbTypes.add(swingingAnchorTag);
  b.shapes.add(shape);
  b.allowRotation = false;
  b.space = space;
  swingingAnchorBodies.push({
    body: b,
    pivotX: sa.x,
    pivotY: sa.y,
    chainLength: chainLen,
    angle: startAngle,
    angularVel: 0,
  });
}

// ── Bottle Messages (collectible, sensor) ──
const BOTTLE_COLLECT_RANGE = 20;    // px — sensor radius
const BOTTLE_DISPLAY_TIME = 4000;   // ms — how long text stays visible
const bottleBodies = [];            // { body, text, collected }
for (const bm of entities.bottleMessages) {
  const b = new Body(BodyType.STATIC, new Vec2(bm.x, bm.y));
  const shape = new Circle(BOTTLE_COLLECT_RANGE);
  shape.sensorEnabled = true;
  shape.cbTypes.add(bottleTag);
  b.shapes.add(shape);
  b.space = space;
  bottleBodies.push({ body: b, text: bm.text, collected: false });
}

// ── Hint Stones (permanent, proximity-based) ──
const HINT_PROXIMITY = 48;         // px — detection radius (~1.5 tiles)
const hintStoneBodies = [];        // { body, text }
for (const hs of entities.hintStones) {
  const b = new Body(BodyType.STATIC, new Vec2(hs.x, hs.y));
  // Proximity sensor for hint text trigger
  const sensorShape = new Circle(HINT_PROXIMITY);
  sensorShape.sensorEnabled = true;
  sensorShape.cbTypes.add(hintStoneTag);
  b.shapes.add(sensorShape);
  // Solid collider matching visual stone tablet (~22x29 px from 7x9 voxels at V=3.2)
  const solidShape = new Polygon(Polygon.box(22, 29));
  b.shapes.add(solidShape);
  b.rotation = 0;
  b.allowRotation = false;
  b.space = space;
  hintStoneBodies.push({ body: b, text: hs.text });
}

// ── Message overlay state (shared by bottles and hints) ──
let _messageOverlay = null;  // { text, timer, fadeOut, x, y } or null
let _activeHint = null;      // index into hintStoneBodies or null

// ── Breakable walls (cracked stone, destroyed by dashing) ──
const breakableWallBodies = [];
for (const bw of entities.breakableWalls) {
  const b = new Body(BodyType.STATIC, new Vec2(bw.x, bw.y));
  const solid = new Polygon(Polygon.box(TILE_SIZE, TILE_SIZE), undefined, new Material(0.8, 0.1, 0.5, 2.0));
  b.shapes.add(solid);
  // Sensor overlay for dash detection
  const sensor = new Polygon(Polygon.box(TILE_SIZE + 2, TILE_SIZE + 2));
  sensor.sensorEnabled = true;
  sensor.cbTypes.add(breakableWallTag);
  b.shapes.add(sensor);
  b.space = space;
  breakableWallBodies.push(b);
}

// ── Switches (sensor pads on the floor) ──
// All switch types share physics shape & tag; behaviour differs in game loop
const switchBodies = [];  // { body, type, group, active, timer }
const allSwitchEntities = [
  ...entities.toggleSwitches.map(s => ({ ...s, type: 'toggle' })),
  ...entities.pressureSwitches.map(s => ({ ...s, type: 'pressure' })),
  ...entities.timedSwitches.map(s => ({ ...s, type: 'timed' })),
];
for (const sw of allSwitchEntities) {
  const b = new Body(BodyType.STATIC, new Vec2(sw.x, sw.y));
  // Timed lever is taller so needs a taller sensor; pad switches are flat
  const sW = sw.type === 'timed' ? TILE_SIZE * 0.4 : TILE_SIZE * 0.8;
  const sH = sw.type === 'timed' ? TILE_SIZE * 0.6 : TILE_SIZE * 0.3;
  const shape = new Polygon(Polygon.box(sW, sH));
  shape.sensorEnabled = true;
  shape.cbTypes.add(switchTag);
  b.shapes.add(shape);
  b.space = space;
  switchBodies.push({ body: b, type: sw.type, group: sw.group, active: false, timer: 0 });
}

// ── Gates (2-tile-tall barriers, linked to switches by group) ──
const gateBodies = [];  // { body, group, open, angle }
for (const g of entities.gates) {
  // Gate body: KINEMATIC so we can rotate it; pivot at top edge
  // Position is at the tile center, body shape extends downward 2 tiles
  const b = new Body(BodyType.KINEMATIC, new Vec2(g.x, g.y));
  // Solid shape blocks passage when closed — tagged so PreListener can IGNORE when open
  const shape = new Polygon(Polygon.box(GATE_WIDTH, GATE_HEIGHT));
  shape.cbTypes.add(gateTag);
  b.shapes.add(shape);
  b.allowRotation = false;  // we control rotation manually
  b.space = space;
  gateBodies.push({ body: b, group: g.group, open: false, angle: 0 });
}

// Build dynamic object meshes
voxelRenderer.buildBuoys(buoyBodies);
voxelRenderer.buildBoulders(boulderBodies);
voxelRenderer.buildKeys(keyBodies);
voxelRenderer.buildChests(chestBodies);
voxelRenderer.buildRafts(raftBodies);
voxelRenderer.buildCrates(crateBodies);
voxelRenderer.buildBreakableWalls(breakableWallBodies);
voxelRenderer.buildSwitches(switchBodies);
voxelRenderer.buildGates(gateBodies);
voxelRenderer.buildFloatingLogs(floatingLogBodies);
voxelRenderer.buildSwingingAnchors(swingingAnchorBodies);
voxelRenderer.buildBottles(bottleBodies);
voxelRenderer.buildHintStones(hintStoneBodies);

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

const fishCtrl = new FishController(space, player, cc, GRAVITY, sfx);

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
      sfx.pearlPickup();
    }
  },
);
pearlListener.space = space;

// Bottle message collection -> show text, remove bottle
const bottleListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, bottleTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const bottleEntry = bottleBodies.find(bb => bb.body === b1 || bb.body === b2);
    if (bottleEntry && !bottleEntry.collected && bottleEntry.body.space) {
      bottleEntry.collected = true;
      const cx = bottleEntry.body.position.x;
      const cy = bottleEntry.body.position.y;
      bottleEntry.body.space = null;
      voxelRenderer.spawnBottleCollect(cx, cy);
      sfx.pearlPickup(); // reuse pearl sound for now
      _messageOverlay = {
        text: bottleEntry.text,
        timer: BOTTLE_DISPLAY_TIME,
        fadeOut: false,
        x: cx,
        y: cy,
      };
    }
  },
);
bottleListener.space = space;

// Piranha collision -> kill if dashing, else death
const piranhaListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, enemyTag,
  (cb) => {
    if (fishCtrl.dashing) {
      const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
      const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
      const enemyBody = enemyBodies.find(e => e === b1 || e === b2);
      if (enemyBody && enemyBody.space) {
        const cx = enemyBody.position.x;
        const cy = enemyBody.position.y;
        enemyBody.space = null;
        sfx.enemyDeath();
        voxelRenderer.spawnEnemyDeath(cx, cy);
      }
    } else {
      triggerDeath();
    }
  },
);
piranhaListener.space = space;

// Armored fish collision -> dash bounces off (knockback), else death
const armoredFishListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, armoredFishTag,
  (cb) => {
    if (fishCtrl.dashing) {
      // Dash bounces off — knockback player, cancel dash
      const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
      const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
      const afBody = armoredFishBodies.find(a => a === b1 || a === b2);
      if (afBody) {
        const dx = player.position.x - afBody.position.x;
        const dy = player.position.y - afBody.position.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        fishCtrl.knockback(
          (dx / len) * ARMORED_KNOCKBACK,
          (dy / len) * ARMORED_KNOCKBACK,
        );
        sfx.crabPush();
      }
    } else {
      triggerDeath();
    }
  },
);
armoredFishListener.space = space;

// Hazard collision -> death
const hazardListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, hazardTag,
  () => { triggerDeath(); },
);
hazardListener.space = space;

// Boulder hits piranha -> both die, spawn rock break effect
const boulderPiranhaListener = new InteractionListener(
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
      sfx.enemyDeath();
      voxelRenderer.spawnEnemyDeath(cx, cy);
      if (boulderBody && boulderBody.space) {
        if (grabbedBoulder === boulderBody) grabbedBoulder = null;
        boulderBody.space = null;
        voxelRenderer.spawnBoulderBreak(cx, cy);
      }
    }
  },
);
boulderPiranhaListener.space = space;

// Player-boulder collision: ignored only while carrying
const boulderPlayerPre = new PreListener(
  InteractionType.COLLISION, playerTag, boulderTag,
  () => grabbedBoulder ? PreFlag.IGNORE : PreFlag.ACCEPT,
);
boulderPlayerPre.space = space;

// Shark collision -> death
const sharkListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, sharkTag,
  () => { triggerDeath(); },
);
sharkListener.space = space;

// Pufferfish collision -> death
const pufferfishListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, pufferfishTag,
  () => { triggerDeath(); },
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
      sfx.crabPush();
    }
  },
);
crabListener.space = space;

// ── Boss crab collision -> strong knockback (no damage directly) ──
const bossCrabListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, bossCrabTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const boss = bossCrabBodies.find(b => b === b1 || b === b2);
    if (!boss || !boss.space) return;
    const st = boss._boss;
    // Dying boss doesn't deal damage
    if (st && st.state === 'dying') return;
    // Jump and charge attacks kill the player on contact
    if (st && (st.state === 'jump' || st.state === 'charge')) {
      triggerDeath();
      sfx.crabPush();
      return;
    }
    const dx = player.position.x - boss.position.x;
    const dy = player.position.y - boss.position.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const pushDirX = dx >= 0 ? 1 : -1;
    fishCtrl.knockback(pushDirX * BOSS_CRAB_PUSH_FORCE, (dy / len) * BOSS_CRAB_PUSH_FORCE * 0.3 - BOSS_CRAB_PUSH_FORCE * 0.4);
    sfx.crabPush();
  },
);
bossCrabListener.space = space;

// ── Boulder hits boss crab -> decrement HP, flash, invulnerability ──
const boulderBossListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, boulderTag, bossCrabTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const boulderBody = boulderBodies.find(br => br === b1 || br === b2);
    // Only count thrown boulders with real velocity, not carried or resting ones
    if (!boulderBody || boulderBody === grabbedBoulder) return;
    const bvx = boulderBody.velocity.x, bvy = boulderBody.velocity.y;
    const boulderSpeed = Math.sqrt(bvx * bvx + bvy * bvy);
    if (boulderSpeed < 80) return; // ignore slow/resting boulders
    const boss = bossCrabBodies.find(b => b === b1 || b === b2);
    if (!boss || !boss.space || !boss._boss) return;
    const st = boss._boss;
    // Skip if in invulnerability window
    if (st.invulnTimer > 0) return;
    st.hp = Math.max(0, st.hp - 1);
    st.invulnTimer = BOSS_CRAB_HIT_INVULN;
    st.flashTimer = BOSS_CRAB_HIT_INVULN;
    // Break the boulder on impact (same as normal enemy)
    if (boulderBody.space) {
      if (grabbedBoulder === boulderBody) grabbedBoulder = null;
      boulderBody.space = null;
      voxelRenderer.spawnBoulderBreak(boss.position.x, boss.position.y);
    }
    sfx.crabPush();
    // Flee from player after getting hit (unless dying)
    if (st.hp > 0) {
      st.state = 'flee';
      st.throwing = false; // cancel any throw sequence
      st.stateTimer = BOSS_CRAB_HIT_INVULN + 1000; // flash duration + 1s flee
    }
    if (st.hp <= 0 && st.state !== 'dying') {
      // Enter dying state — boss collapses, then explodes into pearls
      st.state = 'dying';
      st.stateTimer = 3000; // 3s collapse animation
      st.throwing = false;
      st.dir = 0;
      boss.velocity = new Vec2(0, 0);
      sfx.enemyDeath();
    }
  },
);
boulderBossListener.space = space;

// ── Spawn a single rock from a specific claw side ──
function _spawnSingleRock(boss, side) {
  const dir = boss._boss ? boss._boss.dir : 1;
  // Left claw is on the "left" side of the crab (negative Z → screen-forward)
  // Right claw is on the "right" side (positive Z → screen-back)
  // The claw tip extends forward (in boss facing direction) ~60px from center
  const clawForward = dir * 60;
  const clawUp = -BOSS_CRAB_HEIGHT * 0.3;
  const originX = boss.position.x + clawForward;
  const originY = boss.position.y + clawUp;
  const targetX = player.position.x;
  const targetY = player.position.y;
  const dx = targetX - originX;
  const dy = targetY - originY;
  const flightT = Math.max(0.6, Math.min(2.2, Math.abs(dx) / BOSS_CRAB_THROW_SPEED + 0.4));
  const vx = dx / flightT;
  const vy = dy / flightT - 0.5 * BOSS_CRAB_THROW_GRAVITY * flightT;
  const b = new Body(BodyType.KINEMATIC, new Vec2(originX, originY));
  const shape = new Circle(14);
  shape.sensorEnabled = true;
  shape.cbTypes.add(bossRockTag);
  b.shapes.add(shape);
  b.space = space;
  b.velocity = new Vec2(vx, vy);
  b._life = BOSS_CRAB_THROW_LIFE;
  bossRockBodies.push(b);
  voxelRenderer.buildBossRock(b);
  sfx.stoneThrow();
}

// ── Spawn rocks from boss — 6 throws alternating left/right claws ──
function _spawnBossRock(boss) {
  const bossIdx = bossCrabBodies.indexOf(boss);
  const throwCount = 6;
  const stagger = 500; // ms between each throw
  const st = boss._boss;
  if (st) st.throwing = true;

  for (let i = 0; i < throwCount; i++) {
    const side = i % 2 === 0 ? 'left' : 'right';
    const isLast = i === throwCount - 1;
    const throwDelay = i * stagger;
    setTimeout(() => {
      if (!boss.space || !st || st.state === 'dying') { st.throwing = false; return; }
      if (bossIdx >= 0) voxelRenderer.startBossCrabThrow(bossIdx, side);
      setTimeout(() => {
        if (!boss.space || !st || st.state === 'dying') { st.throwing = false; return; }
        _spawnSingleRock(boss, side);
        if (isLast) st.throwing = false; // sequence complete
      }, 450); // sync with arm swing peak
    }, throwDelay);
  }
}

// ── Spawn falling rocks from above during ground slam ──
function _spawnFallingRocks(boss) {
  const cx = boss.position.x;
  const topY = 32; // near the top of the level (row 1)
  for (let i = 0; i < BOSS_CRAB_SLAM_ROCKS; i++) {
    const offsetX = (Math.random() - 0.5) * 2 * BOSS_CRAB_SLAM_ROCK_SPREAD;
    const delay = i * 120; // stagger rocks slightly
    setTimeout(() => {
      if (!boss.space) return;
      const rx = cx + offsetX;
      const b = new Body(BodyType.KINEMATIC, new Vec2(rx, topY));
      const shape = new Circle(14);
      shape.sensorEnabled = true;
      shape.cbTypes.add(bossRockTag);
      b.shapes.add(shape);
      b.space = space;
      b.velocity = new Vec2((Math.random() - 0.5) * 15, 30);
      b._life = BOSS_CRAB_THROW_LIFE;
      b._fallingRock = true; // flag for heavier gravity
      bossRockBodies.push(b);
      voxelRenderer.buildBossRock(b);
    }, delay);
  }
}

// ── Boss rock projectile hits player -> death ──
const bossRockListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, bossRockTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const rock = bossRockBodies.find(r => r === b1 || r === b2);
    if (rock && rock.space) {
      voxelRenderer.spawnBoulderBreak(rock.position.x, rock.position.y);
      rock.space = null;
      triggerDeath();
    }
  },
);
bossRockListener.space = space;

// Poison projectile collision -> death
const projectileListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, projectileTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const projBody = projectileBodies.find(p => p === b1 || p === b2);
    if (projBody && projBody.space) {
      projBody.space = null;
      triggerDeath();
    }
  },
);
projectileListener.space = space;

// Toxic fish body collision -> death
const toxicFishListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, toxicFishTag,
  () => { triggerDeath(); },
);
toxicFishListener.space = space;

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
      sfx.enemyDeath();
      voxelRenderer.spawnEnemyDeath(cx, cy, [0xccaa44, 0xbb9933, 0xddbb55, 0xaa8822, 0xeedd88]);
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
    // Only moving boulders kill crabs (not resting ones on the floor)
    if (boulderBody) {
      const bvx = boulderBody.velocity.x, bvy = boulderBody.velocity.y;
      if (Math.sqrt(bvx * bvx + bvy * bvy) < 80) return;
    }
    const crabBody = crabBodies.find(c => c === b1 || c === b2);
    if (crabBody && crabBody.space) {
      const cx = crabBody.position.x;
      const cy = crabBody.position.y;
      crabBody.space = null;
      sfx.enemyDeath();
      voxelRenderer.spawnEnemyDeath(cx, cy, [0xcc3322, 0xdd4433, 0xbb2211, 0xee5544, 0xff8866]);
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
      sfx.enemyDeath();
      voxelRenderer.spawnEnemyDeath(cx, cy, [0x336644, 0x225533, 0x447755, 0x558866, 0x66aa77]);
      if (boulderBody && boulderBody.space) {
        if (grabbedBoulder === boulderBody) grabbedBoulder = null;
        boulderBody.space = null;
        voxelRenderer.spawnBoulderBreak(cx, cy);
      }
    }
  },
);
boulderToxicListener.space = space;

// Boulder hits armored fish -> both die
const boulderArmoredListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, boulderTag, armoredFishTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const boulderBody = boulderBodies.find(br => br === b1 || br === b2);
    if (boulderBody === grabbedBoulder) return;
    const afBody = armoredFishBodies.find(a => a === b1 || a === b2);
    if (afBody && afBody.space) {
      const cx = afBody.position.x;
      const cy = afBody.position.y;
      afBody.space = null;
      sfx.enemyDeath();
      voxelRenderer.spawnEnemyDeath(cx, cy, [0x556677, 0x445566, 0x667788, 0x334455, 0x778899]);
      if (boulderBody && boulderBody.space) {
        if (grabbedBoulder === boulderBody) grabbedBoulder = null;
        boulderBody.space = null;
        voxelRenderer.spawnBoulderBreak(cx, cy);
      }
    }
  },
);
boulderArmoredListener.space = space;

// Spitting coral collision -> death
const spittingCoralListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, spittingCoralTag,
  () => { triggerDeath(); },
);
spittingCoralListener.space = space;

// Boulder hits spitting coral -> both die
const boulderCoralListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, boulderTag, spittingCoralTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const boulderBody = boulderBodies.find(br => br === b1 || br === b2);
    if (boulderBody === grabbedBoulder) return;
    const coralBody = spittingCoralBodies.find(c => c === b1 || c === b2);
    if (coralBody && coralBody.space) {
      const cx = coralBody.position.x;
      const cy = coralBody.position.y;
      coralBody.space = null;
      sfx.enemyDeath();
      voxelRenderer.spawnEnemyDeath(cx, cy, [0x554433, 0x664422, 0x775533, 0x886644, 0xcc6699]);
      if (boulderBody && boulderBody.space) {
        if (grabbedBoulder === boulderBody) grabbedBoulder = null;
        boulderBody.space = null;
        voxelRenderer.spawnBoulderBreak(cx, cy);
      }
    }
  },
);
boulderCoralListener.space = space;

// ── Key-Chest collision: matching color opens chest, spawns pearl ──
const keyChestListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, keyTag, chestTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const keyEntry = keyBodies.find(k => k.body === b1 || k.body === b2);
    const chestEntry = chestBodies.find(c => c.body === b1 || c.body === b2);
    if (!keyEntry || !chestEntry) return;
    // Only open if colors match and key is not currently held
    if (keyEntry.body === grabbedKey) return;
    if (keyEntry.colorIndex !== chestEntry.colorIndex) return;
    if (!keyEntry.body.space || !chestEntry.body.space) return;

    const cx = chestEntry.body.position.x;
    const cy = chestEntry.body.position.y;

    // Remove key and chest from physics
    keyEntry.body.space = null;
    chestEntry.body.space = null;

    // Particle effect
    voxelRenderer.spawnChestOpen(cx, cy, chestEntry.colorIndex);
    voxelRenderer.removeChest(chestEntry.body);
    sfx.chestOpen();

    // Spawn a pearl at chest location
    const pb = new Body(BodyType.STATIC, new Vec2(cx, cy));
    const ps = new Circle(6);
    ps.sensorEnabled = true;
    ps.cbTypes.add(pearlTag);
    pb.shapes.add(ps);
    pb.space = space;
    pearlBodies.push(pb);
    voxelRenderer.buildPearlAt(pb);
  },
);
keyChestListener.space = space;

// Dash into crate -> destroy crate, wood plank particles, ~30% pearl drop
const crateListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, crateTag,
  (cb) => {
    if (!fishCtrl.dashing) return;
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const crateBody = crateBodies.find(c => c === b1 || c === b2);
    if (crateBody && crateBody.space) {
      const cx = crateBody.position.x;
      const cy = crateBody.position.y;
      crateBody.space = null;
      voxelRenderer.spawnCrateBreak(cx, cy);
      sfx.crateBreak();
      // ~30% chance to drop a pearl
      if (Math.random() < CRATE_PEARL_CHANCE) {
        const pb = new Body(BodyType.STATIC, new Vec2(cx, cy));
        const ps = new Circle(6);
        ps.sensorEnabled = true;
        ps.cbTypes.add(pearlTag);
        pb.shapes.add(ps);
        pb.space = space;
        pearlBodies.push(pb);
        voxelRenderer.buildPearlAt(pb);
      }
    }
  },
);
crateListener.space = space;

// Dash into breakable wall -> destroy wall, rock debris particles
const breakableWallListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, breakableWallTag,
  (cb) => {
    if (!fishCtrl.dashing) return;
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const wallBody = breakableWallBodies.find(w => w === b1 || w === b2);
    if (wallBody && wallBody.space) {
      const cx = wallBody.position.x;
      const cy = wallBody.position.y;
      wallBody.space = null;
      voxelRenderer.spawnBreakableWallDebris(cx, cy);
      sfx.crateBreak();
    }
  },
);
breakableWallListener.space = space;

// Player-key collision: ignored while carrying
const keyPlayerPre = new PreListener(
  InteractionType.COLLISION, playerTag, keyTag,
  () => grabbedKey ? PreFlag.IGNORE : PreFlag.ACCEPT,
);
keyPlayerPre.space = space;

// ── Switch activation: player swims over switch ──
const switchPlayerListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, switchTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const sw = switchBodies.find(s => s.body === b1 || s.body === b2);
    if (!sw) return;
    _activateSwitch(sw);
  },
);
switchPlayerListener.space = space;

// ── Switch activation: boulder/key lands on switch ──
const switchBoulderListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, boulderTag, switchTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const sw = switchBodies.find(s => s.body === b1 || s.body === b2);
    if (!sw) return;
    _activateSwitch(sw);
  },
);
switchBoulderListener.space = space;

const switchKeyListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, keyTag, switchTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const sw = switchBodies.find(s => s.body === b1 || s.body === b2);
    if (!sw) return;
    _activateSwitch(sw);
  },
);
switchKeyListener.space = space;

// ── Pressure switch deactivation: player/boulder/key/crate leaves switch ──
const switchPlayerEndListener = new InteractionListener(
  CbEvent.END, InteractionType.SENSOR, playerTag, switchTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const sw = switchBodies.find(s => s.body === b1 || s.body === b2);
    if (sw && sw.type === 'pressure') _deactivateSwitch(sw);
  },
);
switchPlayerEndListener.space = space;

const switchBoulderEndListener = new InteractionListener(
  CbEvent.END, InteractionType.SENSOR, boulderTag, switchTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const sw = switchBodies.find(s => s.body === b1 || s.body === b2);
    if (sw && sw.type === 'pressure') _deactivateSwitch(sw);
  },
);
switchBoulderEndListener.space = space;

const switchKeyEndListener = new InteractionListener(
  CbEvent.END, InteractionType.SENSOR, keyTag, switchTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const sw = switchBodies.find(s => s.body === b1 || s.body === b2);
    if (sw && sw.type === 'pressure') _deactivateSwitch(sw);
  },
);
switchKeyEndListener.space = space;

const switchCrateListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, crateTag, switchTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const sw = switchBodies.find(s => s.body === b1 || s.body === b2);
    if (!sw) return;
    _activateSwitch(sw);
  },
);
switchCrateListener.space = space;

const switchCrateEndListener = new InteractionListener(
  CbEvent.END, InteractionType.SENSOR, crateTag, switchTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const sw = switchBodies.find(s => s.body === b1 || s.body === b2);
    if (sw && sw.type === 'pressure') _deactivateSwitch(sw);
  },
);
switchCrateEndListener.space = space;

// Player-gate collision: solid when closed, pass through when open
const gatePlayerPre = new PreListener(
  InteractionType.COLLISION, playerTag, gateTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const gate = gateBodies.find(g => g.body === b1 || g.body === b2);
    return (gate && gate.open) ? PreFlag.IGNORE : PreFlag.ACCEPT;
  },
);
gatePlayerPre.space = space;

// Boulder/key-gate collision: pass through when open
const gateBoulderPre = new PreListener(
  InteractionType.COLLISION, boulderTag, gateTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const gate = gateBodies.find(g => g.body === b1 || g.body === b2);
    return (gate && gate.open) ? PreFlag.IGNORE : PreFlag.ACCEPT;
  },
);
gateBoulderPre.space = space;

const gateKeyPre = new PreListener(
  InteractionType.COLLISION, keyTag, gateTag,
  (cb) => {
    const b1 = cb.int1.castBody ?? cb.int1.castShape?.body ?? null;
    const b2 = cb.int2.castBody ?? cb.int2.castShape?.body ?? null;
    const gate = gateBodies.find(g => g.body === b1 || g.body === b2);
    return (gate && gate.open) ? PreFlag.IGNORE : PreFlag.ACCEPT;
  },
);
gateKeyPre.space = space;

// ── Switch/Gate state management ──
function _activateSwitch(sw) {
  if (sw.type === 'toggle') {
    if (sw.active) return; // one-shot: already activated, ignore
    sw.active = true;
  } else if (sw.type === 'pressure') {
    sw.active = true;
  } else if (sw.type === 'timed') {
    sw.active = true;
    sw.timer = TIMED_SWITCH_DURATION;
  }
  _updateGatesForGroup(sw.group);
  sfx.pearlPickup(); // reuse pickup sound for switch activation
}

function _deactivateSwitch(sw) {
  if (sw.type === 'toggle') return; // one-shot: never deactivates
  sw.active = false;
  _updateGatesForGroup(sw.group);
}

function _updateGatesForGroup(group) {
  // A gate opens if ANY switch in its group is active
  const groupActive = switchBodies.some(s => s.group === group && s.active);
  for (const gate of gateBodies) {
    if (gate.group === group) {
      gate.open = groupActive;
    }
  }
}

// ── Keyboard Input ──
const keys = {};
let prevSpace = false;
let prevGrab = false;
let prevStun = false;
let prevSpeed = false;

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
  const stunDown = keys['KeyQ'] || false;
  const stunPulse = stunDown && !prevStun;
  prevStun = stunDown;
  const speedDown = keys['KeyR'] || false;
  const speedSurge = speedDown && !prevSpeed;
  prevSpeed = speedDown;
  return { dirX, dirY, dash, grab, stunPulse, speedSurge };
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

const CAM_INSET = TILE_SIZE * 2;  // 2 tile inset to avoid seeing behind level edges (perspective camera needs more)
const CAM_TOP_INSET = CAM_INSET - 50;  // px — allow camera 50px higher than default

function updateGameCamera() {
  const { visW, visH } = getVisibleSize();
  const targetX = player.position.x - visW / 2;
  const targetY = player.position.y - visH / 2 - 30;

  // Clamp to world bounds with inset
  const goalX = Math.max(CAM_INSET, Math.min(targetX, WORLD_W - visW - CAM_INSET));
  const goalY = Math.max(CAM_TOP_INSET, Math.min(targetY, WORLD_H - visH - CAM_INSET));

  // Smooth lerp
  camX += (goalX - camX) * 0.1;
  camY += (goalY - camY) * 0.1;
  camX = Math.max(CAM_INSET, Math.min(camX, WORLD_W - visW - CAM_INSET));
  camY = Math.max(CAM_TOP_INSET, Math.min(camY, WORLD_H - visH - CAM_INSET));
}

// Snap camera on first frame
{
  const { visW, visH } = getVisibleSize();
  camX = Math.max(CAM_INSET, Math.min(player.position.x - visW / 2, WORLD_W - visW - CAM_INSET));
  camY = Math.max(CAM_TOP_INSET, Math.min(player.position.y - visH / 2 - 30, WORLD_H - visH - CAM_INSET));
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
  hudCtx.font = "bold 10px 'Silkscreen', monospace";
  hudCtx.fillText(t('hud.physicsDebug'), 10, H - 10);
  hudCtx.restore();
}

// ── Game State ──
const TOTAL_PEARLS = entities.pearls.length + entities.chests.length;
const MAX_LIVES = 3;
let lives = MAX_LIVES;

// ── Level meta (boss flag, goal type) ──
const _levelMeta = getCurrentLevelMeta();
const IS_BOSS_LEVEL = _levelMeta.bossLevel || _levelMeta.levelGoal === 'boss';

const LEVEL_TIME = 5 * 60;              // s — 5 minute countdown
let timeRemaining = LEVEL_TIME;          // s — seconds left

let gameOverActive = false;
let victoryActive = false;

// ── Scoring & High Score ──
const HIGHSCORE_KEY = 'loaf_highscore';

function calculateScore(livesLeft, timeLeft) {
  const livesScore = livesLeft * 1000;                        // 1000 pts per life
  const timeScore = Math.floor(timeLeft) * 10;                // 10 pts per second
  const pearlScore = TOTAL_PEARLS * 50;                       // 50 pts per pearl
  return livesScore + timeScore + pearlScore;
}

function getHighScore() {
  try {
    return parseInt(localStorage.getItem(HIGHSCORE_KEY)) || 0;
  } catch (_) { return 0; }
}

function saveHighScore(score) {
  try { localStorage.setItem(HIGHSCORE_KEY, String(score)); } catch (_) {}
}

// ── Game Over / Victory Modals ──

function showGameOver() {
  gameOverActive = true;
  gamePaused = true;
  pauseBtn.classList.remove('visible');
  touchControls.hide();
  document.getElementById('goStatPearls').textContent = t('hud.pearlCount', { current: pearlCount, total: TOTAL_PEARLS });
  gameOverPanel.classList.add('visible');
}

function hideGameOver() {
  gameOverActive = false;
  gameOverPanel.classList.remove('visible');
}

function showVictory() {
  victoryActive = true;
  gamePaused = true;
  pauseBtn.classList.remove('visible');
  touchControls.hide();

  const mins = Math.floor(timeRemaining / 60);
  const secs = Math.floor(timeRemaining % 60);
  document.getElementById('vicStatLives').textContent = `${lives} / ${MAX_LIVES}`;
  const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  document.getElementById('vicStatTime').textContent = timeStr;

  const score = calculateScore(lives, timeRemaining);
  document.getElementById('vicStatScore').textContent = String(score);

  const highScore = getHighScore();
  const highScoreEl = document.getElementById('vicHighScore');
  if (score > highScore) {
    saveHighScore(score);
    highScoreEl.textContent = t('victory.newHighScore');
  } else {
    highScoreEl.textContent = t('victory.highScore', { score: highScore });
  }

  victoryPanel.classList.add('visible');
}

function hideVictory() {
  victoryActive = false;
  victoryPanel.classList.remove('visible');
}

// ── Death State ──
// Uses the shared iris system for circle wipe. Adds a freeze phase before.
const DEATH_FREEZE_TIME = 0.3;          // s — game frozen before iris starts
let deathActive = false;
let deathFreezeTimer = 0;

function triggerDeath() {
  if (deathActive || irisState !== 'none' || gameOverActive || victoryActive) return;
  sfx.playerDeath();
  deathActive = true;
  deathFreezeTimer = DEATH_FREEZE_TIME;
}

// Called each frame from game loop. Returns true if game logic should freeze.
function updateDeathState(dt) {
  if (!deathActive && irisState === 'none') return false;

  // Freeze phase: wait before starting iris
  if (deathActive && deathFreezeTimer > 0) {
    deathFreezeTimer -= dt;
    if (deathFreezeTimer <= 0) {
      const { visW, visH } = getVisibleSize();
      const fishSx = (player.position.x - camX) / visW * hudCanvas.width;
      const fishSy = (player.position.y - camY) / visH * hudCanvas.height;

      if (lives <= 1) {
        // Last life — close-only iris, stay black, show game over
        irisCloseOnly(fishSx, fishSy, () => {
          lives = 0;
          deathActive = false;
          showGameOver();
        });
      } else {
        // Still have lives — close→open iris, respawn
        irisCloseOpen(fishSx, fishSy, 0, 0, () => {
          lives--;
          fishCtrl.respawn(entities.playerSpawn.x, entities.playerSpawn.y);
          const { visW: sw, visH: sh } = getVisibleSize();
          camX = Math.max(CAM_INSET, Math.min(entities.playerSpawn.x - sw / 2, WORLD_W - sw - CAM_INSET));
          camY = Math.max(CAM_TOP_INSET, Math.min(entities.playerSpawn.y - sh / 2 - 30, WORLD_H - sh - CAM_INSET));
          irisOpenCx = (entities.playerSpawn.x - camX) / sw * hudCanvas.width;
          irisOpenCy = (entities.playerSpawn.y - camY) / sh * hudCanvas.height;
          deathActive = false;
        });
      }
    }
    return true; // freeze during pre-iris pause
  }

  // During iris: step and return freeze state
  if (irisState !== 'none') {
    return _irisStep(dt);
  }

  return false;
}

// Draw iris overlay (called after HUD each frame)
function renderDeathOverlay() {
  _irisDraw();
}

// ── Pause State ──
let gamePaused = false;

function pauseGame() {
  if (deathActive || irisState !== 'none' || gameOverActive || victoryActive) return;
  gamePaused = true;
  _showPauseModal();
}

function resumeGame() {
  gamePaused = false;
  _hidePauseModal();
  touchControls.show();
}

function _resetEntities() {
  // ── Remove chest-spawned pearls first (beyond original pearl count) ──
  const origPearlCount = entities.pearls.length;
  while (pearlBodies.length > origPearlCount) {
    const pb = pearlBodies.pop();
    if (pb.space) pb.space = null;
  }

  // ── Pearls ──
  for (let i = 0; i < pearlBodies.length; i++) {
    const b = pearlBodies[i];
    const p = entities.pearls[i];
    b.position = new Vec2(p.x, p.y);
    if (!b.space) b.space = space;
  }
  voxelRenderer.buildPearls(pearlBodies);

  // ── Piranhas ──
  for (let i = 0; i < enemyBodies.length; i++) {
    const b = enemyBodies[i];
    const en = entities.enemies[i];
    b.position = new Vec2(en.x, en.y);
    b.velocity = new Vec2(0, 0);
    b._patrol._dir = 1;
    if (!b.space) b.space = space;
  }

  // ── Sharks ──
  for (let i = 0; i < sharkBodies.length; i++) {
    const b = sharkBodies[i];
    const sh = entities.sharks[i];
    b.position = new Vec2(sh.x, sh.y);
    b.velocity = new Vec2(0, 0);
    b._patrol._dir = 1;
    b._chase.chasing = false;
    if (!b.space) b.space = space;
  }

  // ── Pufferfish ──
  for (let i = 0; i < pufferfishBodies.length; i++) {
    const b = pufferfishBodies[i];
    const pf = entities.pufferfish[i];
    b.position = new Vec2(pf.x, pf.y);
    b.velocity = new Vec2(0, 0);
    b._patrol._dir = 1;
    if (!b.space) b.space = space;
  }

  // ── Crabs ──
  for (let i = 0; i < crabBodies.length; i++) {
    const b = crabBodies[i];
    const cr = entities.crabs[i];
    b.position = new Vec2(cr.x, cr.y);
    b.velocity = new Vec2(0, 0);
    b._patrol._dir = 1;
    if (!b.space) b.space = space;
  }

  // ── Toxic fish ──
  for (let i = 0; i < toxicFishBodies.length; i++) {
    const b = toxicFishBodies[i];
    const tf = entities.toxicFish[i];
    b.position = new Vec2(tf.x, tf.y);
    b.velocity = new Vec2(0, 0);
    b._patrol._dir = 1;
    b._shoot.cooldown = 0;
    if (!b.space) b.space = space;
  }

  // ── Armored fish ──
  for (let i = 0; i < armoredFishBodies.length; i++) {
    const b = armoredFishBodies[i];
    const af = entities.armoredFish[i];
    b.position = new Vec2(af.x, af.y);
    b.velocity = new Vec2(0, 0);
    b._patrol._dir = 1;
    if (!b.space) b.space = space;
  }

  // ── Projectiles — remove all active ──
  for (const pb of projectileBodies) {
    if (pb.space) pb.space = null;
  }
  projectileBodies.length = 0;

  // ── Boulders ──
  for (let i = 0; i < boulderBodies.length; i++) {
    const b = boulderBodies[i];
    const br = entities.boulders[i];
    b.position = new Vec2(br.x, br.y);
    b.velocity = new Vec2(0, 0);
    b.rotation = 0;
    b.angularVel = 0;
    if (!b.space) b.space = space;
  }
  grabbedBoulder = null;
  voxelRenderer.buildBoulders(boulderBodies);

  // ── Crates ──
  for (let i = 0; i < crateBodies.length; i++) {
    const b = crateBodies[i];
    const cr = entities.crates[i];
    b.position = new Vec2(cr.x, cr.y);
    b.velocity = new Vec2(0, 0);
    b.rotation = 0;
    b.angularVel = 0;
    if (!b.space) b.space = space;
  }
  voxelRenderer.buildCrates(crateBodies);

  // ── Breakable walls ──
  for (let i = 0; i < breakableWallBodies.length; i++) {
    const b = breakableWallBodies[i];
    const bw = entities.breakableWalls[i];
    b.position = new Vec2(bw.x, bw.y);
    if (!b.space) b.space = space;
  }
  voxelRenderer.buildBreakableWalls(breakableWallBodies);

  // ── Keys ──
  for (let i = 0; i < keyBodies.length; i++) {
    const k = keyBodies[i];
    const kd = entities.keys[i];
    k.body.position = new Vec2(kd.x, kd.y);
    k.body.velocity = new Vec2(0, 0);
    k.body.rotation = 0;
    k.body.angularVel = 0;
    if (!k.body.space) k.body.space = space;
  }
  grabbedKey = null;
  voxelRenderer.buildKeys(keyBodies);

  // ── Chests ──
  for (let i = 0; i < chestBodies.length; i++) {
    const c = chestBodies[i];
    const cd = entities.chests[i];
    c.body.position = new Vec2(cd.x, cd.y);
    if (!c.body.space) c.body.space = space;
  }
  voxelRenderer.buildChests(chestBodies);

  // ── Buoys ──
  for (let i = 0; i < buoyBodies.length; i++) {
    const b = buoyBodies[i];
    b.position = new Vec2(entities.buoys[i].x, WATER_SURFACE_Y);
    b.velocity = new Vec2(0, 0);
    b.rotation = 0;
    b.angularVel = 0;
  }

  // ── Rafts ──
  for (let i = 0; i < raftBodies.length; i++) {
    const b = raftBodies[i];
    b.position = new Vec2(entities.rafts[i].x, WATER_SURFACE_Y);
    b.velocity = new Vec2(0, 0);
    b.rotation = 0;
    b.angularVel = 0;
  }

  // ── Floating Logs ──
  for (let i = 0; i < floatingLogBodies.length; i++) {
    const b = floatingLogBodies[i];
    const fl = entities.floatingLogs[i];
    b.position = new Vec2(fl.x, fl.y);
    b.velocity = new Vec2(0, 0);
    b.rotation = 0;
    b.angularVel = 0;
    if (!b.space) b.space = space;
  }
  voxelRenderer.buildFloatingLogs(floatingLogBodies);

  // ── Swinging Anchors ──
  for (const sa of swingingAnchorBodies) {
    sa.angle = 0.4;
    sa.angularVel = 0;
    const anchorX = sa.pivotX + sa.chainLength * Math.sin(sa.angle);
    const anchorY = sa.pivotY + sa.chainLength * Math.cos(sa.angle);
    sa.body.position = new Vec2(anchorX, anchorY);
    sa.body.velocity = new Vec2(0, 0);
  }
  voxelRenderer.buildSwingingAnchors(swingingAnchorBodies);

  // ── Switches — reset to inactive ──
  for (const sw of switchBodies) {
    sw.active = false;
    sw.timer = 0;
  }

  // ── Gates — reset to closed ──
  for (const gate of gateBodies) {
    gate.open = false;
    gate.angle = 0;
  }

  // ── Bottles — reset to uncollected ──
  for (let i = 0; i < bottleBodies.length; i++) {
    const bb = bottleBodies[i];
    const bm = entities.bottleMessages[i];
    bb.collected = false;
    bb.body.position = new Vec2(bm.x, bm.y);
    if (!bb.body.space) bb.body.space = space;
  }
  voxelRenderer.buildBottles(bottleBodies);

  // ── Hint stones — no reset needed (static, permanent) ──

  // ── Giant Crab Bosses — restore HP and spawn position ──
  for (let i = 0; i < bossCrabBodies.length; i++) {
    const b = bossCrabBodies[i];
    const bc = entities.giantCrabBosses[i];
    if (!bc) continue;
    b.position = new Vec2(b._boss.spawnX, b._boss.spawnY);
    b.velocity = new Vec2(0, 0);
    if (b._boss) {
      b._boss.hp = b._boss.maxHp;
      b._boss.state = 'patrol';
      b._boss.stateTimer = 0;
      b._boss.throwTimer = BOSS_CRAB_THROW_INTERVAL * 0.6;
      b._boss.throwing = false;
      b._boss.chargeTimer = BOSS_CRAB_CHARGE_INTERVAL;
      b._boss.jumpTimer = BOSS_CRAB_JUMP_INTERVAL * 0.8;
      b._boss.jumpVy = 0;
      b._boss.slamTimer = BOSS_CRAB_SLAM_INTERVAL;
      b._boss.retreatTimer = BOSS_CRAB_RETREAT_INTERVAL * 0.7;
      b._boss.invulnTimer = 0;
      b._boss.flashTimer = 0;
      b._boss.dir = 1;
    }
    if (!b.space) b.space = space;
  }

  // ── Boss rocks — despawn all active ──
  for (const r of bossRockBodies) {
    if (r.space) r.space = null;
  }
  bossRockBodies.length = 0;

  // ── Clear message overlay ──
  _messageOverlay = null;
  _activeHint = null;

  // ── Restore visibility for all enemy meshes ──
  voxelRenderer.resetEnemyVisibility();
}

function restartGame() {
  if (irisState !== 'none' && !_irisHoldBlack) return;
  const wasGameOver = gameOverActive;
  gamePaused = false;
  _hidePauseModal();
  hideGameOver();
  hideVictory();

  if (wasGameOver) {
    // Already black — just open from spawn
    _irisHoldBlack = false;
    lives = MAX_LIVES;
    pearlCount = 0;
    _resetEntities();
    timeRemaining = LEVEL_TIME;
    fishCtrl.respawn(entities.playerSpawn.x, entities.playerSpawn.y);
    const { visW: sw, visH: sh } = getVisibleSize();
    camX = Math.max(CAM_INSET, Math.min(entities.playerSpawn.x - sw / 2, WORLD_W - sw - CAM_INSET));
    camY = Math.max(CAM_TOP_INSET, Math.min(entities.playerSpawn.y - sh / 2 - 30, WORLD_H - sh - CAM_INSET));
    irisOpenCx = (entities.playerSpawn.x - camX) / sw * hudCanvas.width;
    irisOpenCy = (entities.playerSpawn.y - camY) / sh * hudCanvas.height;
    // Transition from held black → open
    irisState = 'open_small';
    irisTimer = 0;
    if (!_editorPlayTest) pauseBtn.classList.add('visible');
  } else {
    // Normal restart: close→open iris
    const { visW, visH } = getVisibleSize();
    const fishSx = (player.position.x - camX) / visW * hudCanvas.width;
    const fishSy = (player.position.y - camY) / visH * hudCanvas.height;
    irisCloseOpen(fishSx, fishSy, 0, 0, () => {
      lives = MAX_LIVES;
      pearlCount = 0;
      _resetEntities();
      timeRemaining = LEVEL_TIME;
      fishCtrl.respawn(entities.playerSpawn.x, entities.playerSpawn.y);
      const { visW: sw, visH: sh } = getVisibleSize();
      camX = Math.max(CAM_INSET, Math.min(entities.playerSpawn.x - sw / 2, WORLD_W - sw - CAM_INSET));
      camY = Math.max(CAM_TOP_INSET, Math.min(entities.playerSpawn.y - sh / 2 - 30, WORLD_H - sh - CAM_INSET));
      irisOpenCx = (entities.playerSpawn.x - camX) / sw * hudCanvas.height;
      irisOpenCy = (entities.playerSpawn.y - camY) / sh * hudCanvas.height;
      if (!_editorPlayTest) pauseBtn.classList.add('visible');
    });
  }
}

let _exitPending = false;

function exitToMenu() {
  // In editor play test mode, redirect to editor instead of menu
  if (_editorPlayTest) {
    _exitEditorPlayTest();
    return;
  }
  if (irisState !== 'none' && !_irisHoldBlack) return;
  const wasGameOver = gameOverActive;
  gamePaused = false;
  // Get button rect BEFORE hiding (hidden elements return 0,0,0,0)
  const exitBtn = gameOverActive ? document.getElementById('goExit')
    : victoryActive ? document.getElementById('vicExit')
    : document.getElementById('pauseExit');
  const exitRect = exitBtn.getBoundingClientRect();
  _hidePauseModal();
  hideGameOver();
  hideVictory();

  if (wasGameOver) {
    // Already black — go straight to menu with open iris from center
    _irisHoldBlack = false;
    const startCx = hudCanvas.width / 2;
    const startCy = hudCanvas.height / 2;
    irisOpenCx = startCx;
    irisOpenCy = startCy;
    irisState = 'open_small';
    irisTimer = 0;
    _exitPending = true;
    gameInitialized = false;
    showMenu();
    return;
  }

  const exitCx = exitRect.left + exitRect.width / 2;
  const exitCy = exitRect.top + exitRect.height / 2;
  // Open center: screen center (Start button is hidden during game)
  const startCx = hudCanvas.width / 2;
  const startCy = hudCanvas.height / 2;
  _exitPending = true;
  irisCloseOpen(exitCx, exitCy, startCx, startCy, () => {
    // onBlack: switch to menu, game loop will detect _exitPending and self-terminate
    gameInitialized = false;
    showMenu();
  });
}

// Expose pause functions for UI buttons (these closures reference startGame scope)
window._pauseGame = pauseGame;
window._resumeGame = resumeGame;
window._restartGame = restartGame;
window._exitToMenu = exitToMenu;

// Escape key: toggle pause (use named fn to prevent duplicates on re-init)
if (window._escHandler) window.removeEventListener('keydown', window._escHandler);
window._escHandler = (e) => {
  if (e.code === 'Escape' && appState === 'game' && !editorActive) {
    e.preventDefault();
    if (gameOverActive || victoryActive) return; // can't ESC out of result screens
    if (gamePaused) resumeGame();
    else pauseGame();
  }
};
window.addEventListener('keydown', window._escHandler);

// ── HUD Rendering ──

function renderHUD() {
  const W = hudCanvas.width;
  const H = hudCanvas.height;
  hudCtx.clearRect(0, 0, W, H);

  // ── Pearl progress bar (top-center) — replaced by boss HP bar on boss levels ──
  const barW = 340;
  const barH = 28;
  const barX = (W - barW) / 2;
  const barY = 12;
  const progress = TOTAL_PEARLS > 0 ? pearlCount / TOTAL_PEARLS : 0;
  if (IS_BOSS_LEVEL && bossCrabBodies.length > 0) {
    _drawBossHpBar(barX, barY, barW, barH);
  } else {

  // Bar background
  hudCtx.fillStyle = 'rgba(0, 20, 40, 0.65)';
  hudCtx.beginPath();
  hudCtx.roundRect(barX, barY, barW, barH, 14);
  hudCtx.fill();

  // Bar border
  hudCtx.strokeStyle = 'rgba(255, 217, 61, 0.45)';
  hudCtx.lineWidth = 2;
  hudCtx.beginPath();
  hudCtx.roundRect(barX, barY, barW, barH, 14);
  hudCtx.stroke();

  // Bar fill
  if (progress > 0) {
    const fillW = Math.max(8, barW * progress);
    hudCtx.fillStyle = '#ffd93d';
    hudCtx.globalAlpha = 0.85;
    hudCtx.beginPath();
    hudCtx.roundRect(barX, barY, fillW, barH, 14);
    hudCtx.fill();
    hudCtx.globalAlpha = 1.0;
  }

  // Pearl icon — blocky cube with highlight (matches in-game BoxGeometry)
  const iconS = 18; // square size
  const iconX = barX - iconS - 10;
  const iconY = barY + (barH - iconS) / 2;
  // Main cube face
  hudCtx.fillStyle = '#ffd93d';
  hudCtx.fillRect(iconX, iconY, iconS, iconS);
  // Dark edge (bottom-right)
  hudCtx.fillStyle = 'rgba(180, 140, 20, 0.6)';
  hudCtx.fillRect(iconX + iconS - 3, iconY + 3, 3, iconS - 3);
  hudCtx.fillRect(iconX + 3, iconY + iconS - 3, iconS - 3, 3);
  // Shine (top-left)
  hudCtx.fillStyle = '#fff8e0';
  hudCtx.fillRect(iconX + 3, iconY + 3, 5, 5);

  // Count text
  hudCtx.fillStyle = '#ffffff';
  hudCtx.font = "bold 16px 'Silkscreen', monospace";
  hudCtx.textAlign = 'center';
  hudCtx.fillText(t('hud.pearlCount', { current: pearlCount, total: TOTAL_PEARLS }), barX + barW / 2, barY + barH - 7);
  } // end pearl-bar branch

  // ── Lives (hearts) — top-left ──
  const heartSize = 28;
  const heartGap = 10;
  const heartY = 25;
  const heartStartX = 22;
  for (let i = 0; i < MAX_LIVES; i++) {
    const hx = heartStartX + i * (heartSize + heartGap);
    const hy = heartY;
    _drawHeart(hx, hy, heartSize, i < lives);
  }

  // ── Timer (top-right, left of pause button) ──
  const mins = Math.floor(timeRemaining / 60);
  const secs = Math.floor(timeRemaining % 60);
  const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  const timerX = W - 58;
  const timerY = 32;

  // Clock icon
  _drawClock(timerX - 74, timerY - 6, 8);

  // Timer text
  if (timeRemaining <= 30) {
    const flash = Math.sin(Date.now() * 0.008) > 0;
    hudCtx.fillStyle = flash ? '#ff4060' : '#ff8090';
  } else if (timeRemaining <= 60) {
    hudCtx.fillStyle = '#ff8c42';
  } else {
    hudCtx.fillStyle = 'rgba(200, 230, 255, 0.8)';
  }
  hudCtx.font = "bold 18px 'Silkscreen', monospace";
  hudCtx.textAlign = 'right';
  hudCtx.fillText(timeStr, timerX, timerY);

  hudCtx.textAlign = 'left';

  // ── Dash cooldown bar (under the fish) ──
  const dashState = fishCtrl.getState();
  if (dashState.dashCooldownPct > 0.01) {
    const { visW, visH } = getVisibleSize();
    const fishSx = (player.position.x - camX) / visW * W;
    const fishSy = (player.position.y - camY) / visH * H;

    const dbW = 28;
    const dbH = 3;
    const dbX = fishSx - dbW / 2;
    const dbY = fishSy + 32;

    // Background
    hudCtx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    hudCtx.fillRect(dbX, dbY, dbW, dbH);

    // Fill — countdown: starts full, shrinks to 0 as cooldown expires
    const fillW = dbW * dashState.dashCooldownPct;
    hudCtx.fillStyle = 'rgba(100, 220, 255, 0.7)';
    hudCtx.fillRect(dbX, dbY, fillW, dbH);
  }

  // ── Skill cooldown indicators (bottom-left corner) ──
  {
    const skillState = fishCtrl.getState();
    const skillY = H - 70;
    const skillSize = 36;
    const skillGap = 8;

    // Stun Pulse (Q)
    const s1x = 22;
    _drawSkillIcon(s1x, skillY, skillSize, 'Q',
      'rgba(180, 100, 255, 0.8)', 'rgba(180, 100, 255, 0.3)',
      skillState.stunPulseCooldownPct, skillState.stunPulseActive);

    // Speed Surge (R)
    const s2x = s1x + skillSize + skillGap;
    _drawSkillIcon(s2x, skillY, skillSize, 'R',
      'rgba(100, 255, 180, 0.8)', 'rgba(100, 255, 180, 0.3)',
      skillState.speedSurgeCooldownPct, skillState.speedSurgeActive,
      skillState.speedSurgeTimerPct);
  }

  // ── Message bubble overlay (bottles + hint stones) ──
  const msgText = _activeHint !== null
    ? hintStoneBodies[_activeHint].text
    : (_messageOverlay ? _messageOverlay.text : null);

  if (msgText) {
    const { visW, visH } = getVisibleSize();
    let alpha = 1.0;
    if (_messageOverlay && _messageOverlay.fadeOut) {
      alpha = Math.max(0, _messageOverlay.timer / 800);
    }

    // Position: above the fish
    const fishSx = (player.position.x - camX) / visW * W;
    const fishSy = (player.position.y - camY) / visH * H;

    hudCtx.save();
    hudCtx.globalAlpha = alpha;

    // ── Parse rich text markup ──
    // Supported: {key:DESKTOP|MOBILE} → key badge, <color='#hex'>text</color> → colored text
    const _isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const segments = []; // { text, type: 'plain' | 'badge' | 'color', color? }
    const markupRe = /\{key:([^}|]+)\|([^}]+)\}|<color='([^']+)'>([^<]+)<\/color>/g;
    let lastIdx = 0;
    let match;
    while ((match = markupRe.exec(msgText)) !== null) {
      if (match.index > lastIdx) segments.push({ text: msgText.slice(lastIdx, match.index), type: 'plain' });
      if (match[1] !== undefined) {
        segments.push({ text: _isTouch ? match[2] : match[1], type: 'badge' });
      } else {
        segments.push({ text: match[4], type: 'color', color: match[3] });
      }
      lastIdx = markupRe.lastIndex;
    }
    if (lastIdx < msgText.length) segments.push({ text: msgText.slice(lastIdx), type: 'plain' });

    // ── Measure & word-wrap with inline badges / colored spans ──
    const textFont = "13px 'Silkscreen', monospace";
    const badgeFont = "bold 11px 'Silkscreen', monospace";
    const iconSize = 20;
    const iconGap = 10;
    const maxBubW = 320;
    const padX = 14;
    const padY = 10;
    const textOffsetX = iconSize + iconGap;
    const maxTextW = maxBubW - padX * 2 - textOffsetX;
    const badgePadX = 6;
    const lineH = 20;

    // Build flat token list: each word or badge is one token
    const tokens = [];
    for (const seg of segments) {
      if (seg.type === 'badge') {
        hudCtx.font = badgeFont;
        const w = hudCtx.measureText(seg.text).width + badgePadX * 2;
        tokens.push({ text: seg.text, type: 'badge', width: w });
      } else {
        // Plain or colored text — split into words, preserve type/color
        const words = seg.text.split(' ');
        for (const word of words) {
          if (word === '') continue;
          hudCtx.font = textFont;
          const w = hudCtx.measureText(word).width;
          tokens.push({ text: word, type: seg.type, color: seg.color, width: w });
        }
      }
    }

    // Wrap tokens into lines
    hudCtx.font = textFont;
    const spaceW = hudCtx.measureText(' ').width;
    const wrappedLines = [[]];
    let lineW = 0;
    for (const tok of tokens) {
      const gap = wrappedLines[wrappedLines.length - 1].length > 0 ? spaceW : 0;
      if (lineW + gap + tok.width > maxTextW && wrappedLines[wrappedLines.length - 1].length > 0) {
        wrappedLines.push([]);
        lineW = 0;
      }
      wrappedLines[wrappedLines.length - 1].push(tok);
      lineW += (wrappedLines[wrappedLines.length - 1].length > 1 ? spaceW : 0) + tok.width;
    }

    // Compute max line width
    let maxW = 0;
    for (const line of wrappedLines) {
      let w = 0;
      for (let i = 0; i < line.length; i++) {
        if (i > 0) w += spaceW;
        w += line[i].width;
      }
      if (w > maxW) maxW = w;
    }

    const bubW = maxW + padX * 2 + textOffsetX;
    const bubH = Math.max(wrappedLines.length * lineH + padY * 2, iconSize + padY * 2);
    const bubX = Math.max(10, Math.min(W - bubW - 10, fishSx - bubW / 2));
    const bubY = Math.max(10, fishSy - 65 - bubH);

    // Bubble background
    hudCtx.fillStyle = 'rgba(10, 30, 50, 0.82)';
    hudCtx.beginPath();
    hudCtx.roundRect(bubX, bubY, bubW, bubH, 8);
    hudCtx.fill();

    // Bubble border
    hudCtx.strokeStyle = _activeHint !== null ? 'rgba(160, 200, 180, 0.6)' : 'rgba(200, 220, 255, 0.5)';
    hudCtx.lineWidth = 1.5;
    hudCtx.beginPath();
    hudCtx.roundRect(bubX, bubY, bubW, bubH, 8);
    hudCtx.stroke();

    // Small triangle pointer toward fish
    const triX = Math.max(bubX + 12, Math.min(bubX + bubW - 12, fishSx));
    hudCtx.fillStyle = 'rgba(10, 30, 50, 0.82)';
    hudCtx.beginPath();
    hudCtx.moveTo(triX - 6, bubY + bubH);
    hudCtx.lineTo(triX + 6, bubY + bubH);
    hudCtx.lineTo(triX, bubY + bubH + 8);
    hudCtx.closePath();
    hudCtx.fill();

    // Icon — left side, vertically centered
    const icon = _activeHint !== null ? '🪨' : '🍾';
    const iconY = bubY + (bubH - iconSize) / 2;
    hudCtx.font = `${iconSize}px sans-serif`;
    hudCtx.fillText(icon, bubX + padX, iconY + iconSize - 2);

    // ── Render rich text lines ──
    hudCtx.textAlign = 'left';
    for (let i = 0; i < wrappedLines.length; i++) {
      let cx = bubX + padX + textOffsetX;
      const cy = bubY + padY + lineH * (i + 1) - 3;
      for (let j = 0; j < wrappedLines[i].length; j++) {
        if (j > 0) cx += spaceW;
        const tok = wrappedLines[i][j];
        if (tok.type === 'badge') {
          const bh = 16;
          const by = cy - bh + 3;
          hudCtx.fillStyle = 'rgba(60, 140, 220, 0.35)';
          hudCtx.beginPath();
          hudCtx.roundRect(cx - 2, by, tok.width + 4, bh + 2, 4);
          hudCtx.fill();
          hudCtx.strokeStyle = 'rgba(100, 180, 255, 0.6)';
          hudCtx.lineWidth = 1;
          hudCtx.beginPath();
          hudCtx.roundRect(cx - 2, by, tok.width + 4, bh + 2, 4);
          hudCtx.stroke();
          hudCtx.fillStyle = '#80d0ff';
          hudCtx.font = badgeFont;
          hudCtx.fillText(tok.text, cx + badgePadX, cy);
          cx += tok.width;
        } else {
          hudCtx.fillStyle = tok.type === 'color' ? tok.color : '#ddeeff';
          hudCtx.font = textFont;
          hudCtx.fillText(tok.text, cx, cy);
          cx += tok.width;
        }
      }
    }

    hudCtx.restore();
  }
}

// Draw the boss HP bar (top-center, replaces pearl bar on boss levels)
function _drawBossHpBar(barX, barY, barW, barH) {
  // Aggregate HP across all alive bosses — usually one, but supports multi-boss arenas
  let totalHp = 0;
  let totalMax = 0;
  for (const b of bossCrabBodies) {
    if (!b._boss) continue;
    if (!b.space) continue; // dead — excluded from totals
    totalHp += b._boss.hp;
    totalMax += b._boss.maxHp;
  }
  if (totalMax <= 0) return;
  const progress = totalHp / totalMax;

  // Background
  hudCtx.fillStyle = 'rgba(40, 10, 10, 0.7)';
  hudCtx.beginPath();
  hudCtx.roundRect(barX, barY, barW, barH, 14);
  hudCtx.fill();

  // Border
  hudCtx.strokeStyle = 'rgba(255, 120, 100, 0.6)';
  hudCtx.lineWidth = 2;
  hudCtx.beginPath();
  hudCtx.roundRect(barX, barY, barW, barH, 14);
  hudCtx.stroke();

  // Fill
  if (progress > 0) {
    const fillW = Math.max(8, barW * progress);
    hudCtx.fillStyle = '#ff4a3a';
    hudCtx.globalAlpha = 0.9;
    hudCtx.beginPath();
    hudCtx.roundRect(barX, barY, fillW, barH, 14);
    hudCtx.fill();
    hudCtx.globalAlpha = 1.0;
  }

  // Boss label
  hudCtx.fillStyle = '#ffffff';
  hudCtx.font = "bold 14px 'Silkscreen', monospace";
  hudCtx.textAlign = 'center';
  hudCtx.fillText(`${t('hud.boss')}  ${totalHp} / ${totalMax}`, barX + barW / 2, barY + barH - 8);
  hudCtx.textAlign = 'left';
}

// Draw a pixel-art style heart
function _drawHeart(cx, cy, size, filled) {
  const r = size / 2;
  hudCtx.save();
  hudCtx.translate(cx, cy);
  hudCtx.beginPath();
  hudCtx.moveTo(0, r * 0.35);
  hudCtx.bezierCurveTo(-r * 0.1, -r * 0.3, -r, -r * 0.3, -r, r * 0.1);
  hudCtx.bezierCurveTo(-r, r * 0.55, -r * 0.2, r * 0.8, 0, r);
  hudCtx.bezierCurveTo(r * 0.2, r * 0.8, r, r * 0.55, r, r * 0.1);
  hudCtx.bezierCurveTo(r, -r * 0.3, r * 0.1, -r * 0.3, 0, r * 0.35);
  hudCtx.closePath();

  if (filled) {
    hudCtx.fillStyle = '#ff4060';
    hudCtx.fill();
    hudCtx.strokeStyle = 'rgba(255, 100, 120, 0.6)';
    hudCtx.lineWidth = 1;
    hudCtx.stroke();
    // Highlight
    hudCtx.fillStyle = 'rgba(255, 200, 200, 0.5)';
    hudCtx.beginPath();
    hudCtx.arc(-r * 0.3, -r * 0.05, r * 0.2, 0, Math.PI * 2);
    hudCtx.fill();
  } else {
    hudCtx.fillStyle = 'rgba(60, 20, 30, 0.5)';
    hudCtx.fill();
    hudCtx.strokeStyle = 'rgba(255, 64, 96, 0.3)';
    hudCtx.lineWidth = 1;
    hudCtx.stroke();
  }
  hudCtx.restore();
}

// Draw a simple clock icon (circle + two hands)
function _drawClock(cx, cy, r) {
  const col = 'rgba(200, 230, 255, 0.7)';
  hudCtx.save();
  // Circle
  hudCtx.strokeStyle = col;
  hudCtx.lineWidth = 3;
  hudCtx.beginPath();
  hudCtx.arc(cx, cy, r, 0, Math.PI * 2);
  hudCtx.stroke();
  // Minute hand (up)
  hudCtx.strokeStyle = 'rgba(200, 230, 255, 0.9)';
  hudCtx.lineWidth = 2;
  hudCtx.beginPath();
  hudCtx.moveTo(cx, cy);
  hudCtx.lineTo(cx, cy - r * 0.6);
  hudCtx.stroke();
  // Hour hand (right-ish)
  hudCtx.beginPath();
  hudCtx.moveTo(cx, cy);
  hudCtx.lineTo(cx + r * 0.45, cy + r * 0.2);
  hudCtx.stroke();
  hudCtx.restore();
}

// Draw a skill icon: square with key label, cooldown sweep, active glow
function _drawSkillIcon(x, y, size, label, activeColor, cooldownColor, cooldownPct, active, durationPct) {
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;

  hudCtx.save();

  // Background
  hudCtx.fillStyle = 'rgba(0, 20, 40, 0.6)';
  hudCtx.beginPath();
  hudCtx.roundRect(x, y, size, size, 6);
  hudCtx.fill();

  // Cooldown sweep (darken the icon as cooldown ticks down)
  if (cooldownPct > 0.01) {
    hudCtx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    hudCtx.beginPath();
    hudCtx.moveTo(cx, cy);
    hudCtx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + cooldownPct * Math.PI * 2);
    hudCtx.closePath();
    hudCtx.fill();
  }

  // Active glow border (when skill is in effect or just fired)
  if (active || (durationPct !== undefined && durationPct > 0.01)) {
    const pct = durationPct !== undefined ? durationPct : 1;
    hudCtx.strokeStyle = activeColor;
    hudCtx.lineWidth = 2.5;
    hudCtx.globalAlpha = 0.5 + pct * 0.5;
    hudCtx.beginPath();
    hudCtx.roundRect(x, y, size, size, 6);
    hudCtx.stroke();
    hudCtx.globalAlpha = 1;
  } else {
    // Normal border
    hudCtx.strokeStyle = cooldownPct > 0.01 ? 'rgba(80, 80, 100, 0.4)' : cooldownColor;
    hudCtx.lineWidth = 1.5;
    hudCtx.beginPath();
    hudCtx.roundRect(x, y, size, size, 6);
    hudCtx.stroke();
  }

  // Duration bar (for speed surge — shows remaining time)
  if (durationPct !== undefined && durationPct > 0.01) {
    const barH = 3;
    const barW = size - 6;
    const barX = x + 3;
    const barY = y + size - 6;
    hudCtx.fillStyle = activeColor;
    hudCtx.fillRect(barX, barY, barW * durationPct, barH);
  }

  // Key label
  hudCtx.fillStyle = cooldownPct > 0.01 ? 'rgba(150, 150, 170, 0.5)' : 'rgba(255, 255, 255, 0.8)';
  hudCtx.font = "bold 14px 'Silkscreen', monospace";
  hudCtx.textAlign = 'center';
  hudCtx.fillText(label, cx, cy + 5);
  hudCtx.textAlign = 'left';

  hudCtx.restore();
}

// ── Game Loop (Fixed Timestep + Accumulator) ──
function gameLoop(timestamp) {
  // Calculate real elapsed time, accumulate for fixed-step logic
  if (!timestamp) timestamp = performance.now();
  if (_lastFrameTime === 0) {
    _lastFrameTime = timestamp;
    _accumulator = FIXED_DT; // ensure at least one step on the first frame
  } else {
    const rawDt = (timestamp - _lastFrameTime) / 1000; // ms → s
    _lastFrameTime = timestamp;
    // Clamp to avoid spiral of death (e.g. tab was backgrounded)
    _accumulator += Math.min(rawDt, MAX_STEPS_PER_FRAME * FIXED_DT);
  }

  // ── Editor Mode ──
  if (editorActive && gameEditor) {
    const sidebarPx = 216;
    const canvasW = renderer.domElement.clientWidth;
    const canvasH = renderer.domElement.clientHeight;
    const viewportW = canvasW - sidebarPx;
    const editorAspect = viewportW / canvasH;

    const editorGetVisibleSize = () => {
      const vFov = CAM_FOV * Math.PI / 180;
      const visH = 2 * Math.tan(vFov / 2) * CAM_DISTANCE;
      const visW = visH * editorAspect;
      return { visW, visH };
    };

    // Fixed-step editor logic
    while (_accumulator >= FIXED_DT) {
      _accumulator -= FIXED_DT;
      gameEditor.update(FIXED_DT, editorGetVisibleSize);
      gameEditor.processPendingActions(editorGetVisibleSize);
      voxelRenderer._time += FIXED_DT;
    }

    // Render (once per frame)
    camX = gameEditor.camX;
    camY = gameEditor.camY;
    _gameCamX = camX;
    _gameCamY = camY;

    camera.aspect = editorAspect;
    camera.updateProjectionMatrix();

    const { visW: camVisW, visH: camVisH } = editorGetVisibleSize();
    const lookX = camX + camVisW / 2;
    const lookY = -(camY + camVisH / 2);
    camera.position.set(lookX, lookY, CAM_DISTANCE);
    camera.lookAt(lookX, lookY, 0);

    renderer.setViewport(sidebarPx, 0, viewportW, canvasH);
    renderer.setScissor(sidebarPx, 0, viewportW, canvasH);
    renderer.setScissorTest(true);
    renderer.render(scene, camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, canvasW, canvasH);

    camera.aspect = canvasW / canvasH;
    camera.updateProjectionMatrix();

    hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
    gameEditor.render(editorGetVisibleSize);
    gameEditor.renderToast(FIXED_DT);

    gameAnimId = requestAnimationFrame(gameLoop);
    return;
  }

  // ── Paused ──
  if (gamePaused) {
    while (_accumulator >= FIXED_DT) {
      _accumulator -= FIXED_DT;
      if (irisState !== 'none') _irisStep(FIXED_DT);
    }
    renderer.render(scene, camera);
    renderHUD();
    if (irisState !== 'none') _irisDraw();
    gameAnimId = requestAnimationFrame(gameLoop);
    return;
  }

  // ── Exit to menu: iris still playing after menu is shown ──
  if (_exitPending) {
    if (irisState === 'none') {
      _exitPending = false;
      gameAnimId = null;
      return;
    }
    while (_accumulator >= FIXED_DT) {
      _accumulator -= FIXED_DT;
      _irisStep(FIXED_DT);
    }
    hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
    _irisDraw();
    gameAnimId = requestAnimationFrame(gameLoop);
    return;
  }

  // ── Death / Respawn Animation (freezes gameplay) ──
  if (deathActive) {
    while (_accumulator >= FIXED_DT) {
      _accumulator -= FIXED_DT;
      updateDeathState(FIXED_DT);
    }
    const { visW: dVisW, visH: dVisH } = getVisibleSize();
    const dLookX = camX + dVisW / 2;
    const dLookY = -(camY + dVisH / 2);
    camera.position.set(dLookX, dLookY - CAM_Y_OFFSET, CAM_Z_OFFSET);
    camera.lookAt(dLookX, dLookY, 0);
    renderer.render(scene, camera);
    renderHUD();
    renderDeathOverlay();
    if (irisState !== 'none') _irisDraw();
    gameAnimId = requestAnimationFrame(gameLoop);
    return;
  }

  // ── Fixed-Step Logic Loop ──
  while (_accumulator >= FIXED_DT) {
    _accumulator -= FIXED_DT;
    _gameLogicStep();
    if (irisState !== 'none') _irisStep(FIXED_DT);
  }

  // ── Render (once per frame, outside the fixed-step loop) ──
  // Camera
  updateGameCamera();
  _gameCamX = camX;
  _gameCamY = camY;

  // Position perspective camera
  const { visW: camVisW, visH: camVisH } = getVisibleSize();
  const lookX = camX + camVisW / 2;
  const lookY = -(camY + camVisH / 2);
  camera.position.set(lookX, lookY - CAM_Y_OFFSET, CAM_Z_OFFSET);
  camera.lookAt(lookX, lookY, 0);

  // Sync voxel renderer
  const fishState = fishCtrl.getState();
  voxelRenderer.syncFrame(player, fishState, enemyBodies, FIXED_DT, {
    sharkBodies, pufferfishBodies, crabBodies, toxicFishBodies, projectileBodies,
    armoredFishBodies, spittingCoralBodies, switchBodies, gateBodies,
    swingingAnchorBodies, bossCrabBodies, bossRockBodies,
    camX, camY, camVisW, camVisH,
  });

  renderer.render(scene, camera);

  // HUD
  renderHUD();
  renderDeathOverlay();
  if (irisState !== 'none') _irisDraw();
  renderPhysicsDebug();

  gameAnimId = requestAnimationFrame(gameLoop);
}

// ── Single fixed-timestep logic step ──
function _gameLogicStep() {
  // ── Input ──
  const kbInput = getKeyboardInput();
  const touchInput = touchControls.getInput();
  const input = {
    dirX: Math.abs(kbInput.dirX) > Math.abs(touchInput.dirX) ? kbInput.dirX : touchInput.dirX,
    dirY: Math.abs(kbInput.dirY) > Math.abs(touchInput.dirY) ? kbInput.dirY : touchInput.dirY,
    dash: kbInput.dash || touchInput.dash,
    grab: kbInput.grab || touchInput.grab,
    stunPulse: kbInput.stunPulse || touchInput.stunPulse,
    speedSurge: kbInput.speedSurge || touchInput.speedSurge,
  };

  // ── Victory check ──
  if (!victoryActive && !deathActive) {
    if (IS_BOSS_LEVEL) {
      // Victory is triggered by the dying state's victoryTimer, not by space check
      // (gives player time to collect pearls after boss death)
      const anyBossDying = bossCrabBodies.some(b => b._boss && b._boss.state === 'dying');
      const anyBossAlive = bossCrabBodies.some(b => b.space && (!b._boss || b._boss.state !== 'dying'));
      if (bossCrabBodies.length > 0 && !anyBossAlive && !anyBossDying) showVictory();
    } else if (pearlCount >= TOTAL_PEARLS) {
      showVictory();
    }
  }

  // ── Countdown timer ──
  if (!deathActive && irisState === 'none' && !victoryActive) {
    timeRemaining -= FIXED_DT;
    if (timeRemaining <= 0) {
      timeRemaining = 0;
      triggerDeath();  // time's up = death
    }
  }

  // ── Update piranha patrol (point-to-point, supports diagonal) ──
  for (const eb of enemyBodies) {
    if (!eb._patrol || !eb.space) continue;
    if (eb._stunTimer > 0) { eb.velocity = new Vec2(0, 0); continue; }
    const p = eb._patrol;
    const pdx = p.x2 - p.x1;
    const pdy = p.y2 - p.y1;
    const pathLen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
    eb.velocity = new Vec2((pdx / pathLen) * p.speed * p._dir, (pdy / pathLen) * p.speed * p._dir);
    const tx = p._dir === 1 ? p.x2 : p.x1;
    const ty = p._dir === 1 ? p.y2 : p.y1;
    const dot = (tx - eb.position.x) * pdx * p._dir + (ty - eb.position.y) * pdy * p._dir;
    if (dot <= 0) {
      eb.position.x = tx;
      eb.position.y = ty;
      p._dir *= -1;
    }
  }

  // ── Update armored fish patrol (point-to-point, supports diagonal) ──
  for (const af of armoredFishBodies) {
    if (!af._patrol || !af.space) continue;
    if (af._stunTimer > 0) { af.velocity = new Vec2(0, 0); continue; }
    const p = af._patrol;
    const pdx = p.x2 - p.x1;
    const pdy = p.y2 - p.y1;
    const pathLen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
    af.velocity = new Vec2((pdx / pathLen) * p.speed * p._dir, (pdy / pathLen) * p.speed * p._dir);
    const tx = p._dir === 1 ? p.x2 : p.x1;
    const ty = p._dir === 1 ? p.y2 : p.y1;
    const dot = (tx - af.position.x) * pdx * p._dir + (ty - af.position.y) * pdy * p._dir;
    if (dot <= 0) {
      af.position.x = tx;
      af.position.y = ty;
      p._dir *= -1;
    }
  }

  // ── Check if player is hidden in seagrass ──
  const playerCol = Math.floor(player.position.x / TILE_SIZE);
  const playerRow = Math.floor(player.position.y / TILE_SIZE);
  const playerInSeagrass =
    playerRow >= 0 && playerRow < LEVEL_ROWS &&
    playerCol >= 0 && playerCol < LEVEL_COLS &&
    TILES[playerRow]?.[playerCol] === 8;

  // ── Update shark AI (patrol + chase) ──
  for (const sb of sharkBodies) {
    if (!sb._patrol || !sb.space) continue;
    if (sb._stunTimer > 0) { sb.velocity = new Vec2(0, 0); sb._chase.chasing = false; continue; }
    const p = sb._patrol;
    const ch = sb._chase;
    const dx = player.position.x - sb.position.x;
    const dy = player.position.y - sb.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!ch.chasing && dist < SHARK_DETECT_RADIUS && !playerInSeagrass) {
      ch.chasing = true;
      sfx.sharkAlert();
    } else if (ch.chasing && (dist > SHARK_LOSE_RADIUS || playerInSeagrass)) {
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
    if (pf._stunTimer > 0) { pf.velocity = new Vec2(0, 0); continue; }
    const p = pf._patrol;
    const py = pf.position.y;
    if (py >= p.maxY) p._dir = -1;
    if (py <= p.minY) p._dir = 1;
    pf.velocity = new Vec2(0, p._dir * p.speed);
  }

  // ── Update crab AI (horizontal ground patrol) ──
  for (const cb of crabBodies) {
    if (!cb._patrol || !cb.space) continue;
    if (cb._stunTimer > 0) { cb.velocity = new Vec2(0, 0); continue; }
    const p = cb._patrol;
    const px = cb.position.x;
    if (px >= p.maxX) p._dir = -1;
    if (px <= p.minX) p._dir = 1;
    cb.velocity = new Vec2(p._dir * p.speed, 0);
  }

  // ── Update boss crab AI (patrol → windup → charge; periodic rock throw) ──
  for (const bc of bossCrabBodies) {
    if (!bc._boss) continue;
    const st = bc._boss;
    // Dead boss: only tick victory timer
    if (!bc.space) {
      if (st.dead && st.victoryTimer !== undefined) {
        st.victoryTimer = Math.max(0, st.victoryTimer - FIXED_DT * 1000);
        if (st.victoryTimer <= 0) showVictory();
      }
      continue;
    }

    // Tick per-boss timers
    st.stateTimer = Math.max(0, st.stateTimer - FIXED_DT * 1000);
    st.throwTimer = Math.max(0, st.throwTimer - FIXED_DT * 1000);
    st.chargeTimer = Math.max(0, st.chargeTimer - FIXED_DT * 1000);
    st.jumpTimer = Math.max(0, st.jumpTimer - FIXED_DT * 1000);
    st.slamTimer = Math.max(0, st.slamTimer - FIXED_DT * 1000);
    st.retreatTimer = Math.max(0, st.retreatTimer - FIXED_DT * 1000);
    if (st.invulnTimer > 0) st.invulnTimer = Math.max(0, st.invulnTimer - FIXED_DT * 1000);
    if (st.flashTimer > 0) st.flashTimer = Math.max(0, st.flashTimer - FIXED_DT * 1000);

    const bx = bc.position.x;
    const playerDx = player.position.x - bx;
    const playerDy = player.position.y - bc.position.y;

    // State machine
    if (st.state === 'dying') {
      // Boss is collapsing — stop movement, flash/shake
      bc.velocity = new Vec2(0, 0);
      if (st.stateTimer <= 0 && !st.dead) {
        // Begin pearl eruption phase — boss stays visible while pearls fly out
        st.dead = true;
        st.despawnTimer = 2000; // boss visible for 2s while pearls erupt
        const cx = bc.position.x, cy = bc.position.y;
        sfx.enemyDeath();
        bc.velocity = new Vec2(0, 0);

        // Pearl explosion — staggered outward burst
        const pearlNum = 8;
        const pearlRestY = st.spawnY - BOSS_CRAB_HEIGHT * 0.5;
        for (let p = 0; p < pearlNum; p++) {
          const delay = p * 200; // slightly more spread over time
          setTimeout(() => {
            if (!space) return;
            const angle = (p / pearlNum) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const startX = cx + (Math.random() - 0.5) * 60;
            const startY = cy - 20;
            const pb = new Body(BodyType.KINEMATIC, new Vec2(startX, startY));
            const ps = new Circle(6);
            ps.sensorEnabled = true;
            ps.cbTypes.add(pearlTag);
            pb.shapes.add(ps);
            pb.space = space;
            pb.velocity = new Vec2(
              Math.cos(angle) * 120 + (Math.random() - 0.5) * 40,
              -180 - Math.random() * 60,
            );
            pb._bossLoot = true;
            pb._lootFloorY = pearlRestY;
            pearlBodies.push(pb);
            voxelRenderer.buildPearlAt(pb);
            // Small burst particle at each pearl spawn
            voxelRenderer.spawnBoulderBreak(startX, startY);
          }, delay);
        }

        // Kill all other enemies
        for (const e of [...enemyBodies, ...crabBodies, ...toxicFishBodies, ...armoredFishBodies]) {
          if (e.space) {
            voxelRenderer.spawnEnemyDeath(e.position.x, e.position.y, [0xcc3322, 0xdd4433, 0xbb2211]);
            e.space = null;
          }
        }
        // Despawn all active boss rocks
        for (const r of bossRockBodies) { if (r.space) r.space = null; }
        bossRockBodies.length = 0;
        // Victory after 10s pearl collection time
        st.victoryTimer = 10000;
      }
      // Despawn boss after pearls have erupted
      if (st.dead && st.despawnTimer !== undefined) {
        st.despawnTimer = Math.max(0, st.despawnTimer - FIXED_DT * 1000);
        if (st.despawnTimer <= 0 && bc.space) {
          const cx = bc.position.x, cy = bc.position.y;
          bc.space = null;
          voxelRenderer.spawnBoulderBreak(cx, cy);
          voxelRenderer.spawnEnemyDeath(cx, cy, [0xcc3322, 0xdd4433, 0xbb2211, 0xee5544, 0xff8866]);
        }
      }
      continue; // skip all other logic for dying boss
    }
    if (st.state === 'charge') {
      // Lunge in locked direction, reverse at arena edges
      bc.velocity = new Vec2(st.dir * BOSS_CRAB_CHARGE_SPEED, 0);
      if (bx <= st.minX) st.dir = 1;
      if (bx >= st.maxX) st.dir = -1;
      if (st.stateTimer <= 0) {
        st.state = 'patrol';
        st.stateTimer = 0;
        st.chargeTimer = BOSS_CRAB_CHARGE_INTERVAL;
      }
    } else if (st.state === 'windup') {
      // Telegraph: stop and face player
      bc.velocity = new Vec2(0, 0);
      if (playerDx < -4) st.dir = -1;
      else if (playerDx > 4) st.dir = 1;
      if (st.stateTimer <= 0) {
        st.state = 'charge';
        st.stateTimer = BOSS_CRAB_CHARGE_DURATION;
      }
    } else if (st.state === 'jumpWindup') {
      // Telegraph: crouch before jumping
      bc.velocity = new Vec2(0, 0);
      if (playerDx < -4) st.dir = -1;
      else if (playerDx > 4) st.dir = 1;
      if (st.stateTimer <= 0) {
        st.state = 'jump';
        st.jumpVy = BOSS_CRAB_JUMP_SPEED_Y;
      }
    } else if (st.state === 'jump') {
      // Jump attack — parabolic arc toward player, deals damage on landing
      st.jumpVy += BOSS_CRAB_JUMP_GRAVITY * FIXED_DT;
      bc.velocity = new Vec2(st.dir * BOSS_CRAB_JUMP_SPEED_X, st.jumpVy);
      // Land when reaching or exceeding spawn Y (ground level)
      if (bc.position.y >= st.spawnY && st.jumpVy > 0) {
        bc.position.y = st.spawnY;
        bc.velocity = new Vec2(0, 0);
        st.state = 'patrol';
        st.jumpTimer = BOSS_CRAB_JUMP_INTERVAL;
        sfx.crabPush();
      }
    } else if (st.state === 'throwWindup') {
      // Telegraph: stop and raise arms before throwing
      bc.velocity = new Vec2(0, 0);
      if (playerDx < -4) st.dir = -1;
      else if (playerDx > 4) st.dir = 1;
      if (st.stateTimer <= 0) {
        st.state = 'patrol';
        _spawnBossRock(bc);
      }
    } else if (st.state === 'slamWindup') {
      // Telegraph before ground slam — crouch and shake
      bc.velocity = new Vec2(0, 0);
      if (st.stateTimer <= 0) {
        st.state = 'slam';
        st.stateTimer = 200; // brief slam animation
        // Spawn falling rocks from above across the arena
        _spawnFallingRocks(bc);
        sfx.stoneThrow();
      }
    } else if (st.state === 'slam') {
      // Ground slam recovery
      bc.velocity = new Vec2(0, 0);
      if (st.stateTimer <= 0) {
        st.state = 'patrol';
        st.slamTimer = BOSS_CRAB_SLAM_INTERVAL;
      }
    } else if (st.state === 'flee') {
      // Flee from player after getting hit — run away fast
      const awayDir = playerDx >= 0 ? -1 : 1;
      st.dir = awayDir;
      bc.velocity = new Vec2(awayDir * BOSS_CRAB_RETREAT_SPEED * 2, 0);
      // Reverse at arena edge
      if (bx <= st.minX) { st.dir = 1; bc.velocity = new Vec2(BOSS_CRAB_RETREAT_SPEED * 2, 0); }
      if (bx >= st.maxX) { st.dir = -1; bc.velocity = new Vec2(-BOSS_CRAB_RETREAT_SPEED * 2, 0); }
      if (st.stateTimer <= 0) {
        st.state = 'patrol';
      }
    } else if (st.state === 'retreat') {
      // Back away from the player — gives breathing room
      const awayDir = playerDx >= 0 ? -1 : 1;
      st.dir = awayDir;
      bc.velocity = new Vec2(awayDir * BOSS_CRAB_RETREAT_SPEED, 0);
      // Clamp to arena
      if (bx <= st.minX || bx >= st.maxX) bc.velocity = new Vec2(0, 0);
      if (st.stateTimer <= 0) {
        st.state = 'patrol';
        st.retreatTimer = BOSS_CRAB_RETREAT_INTERVAL;
      }
    } else {
      // patrol — slow back-and-forth
      if (bx >= st.maxX) st.dir = -1;
      if (bx <= st.minX) st.dir = 1;
      bc.velocity = new Vec2(st.dir * BOSS_CRAB_PATROL_SPEED, 0);

      // Don't start new attacks while a throw sequence is still active
      if (!st.throwing) {
        // Start a charge when player is roughly on the same floor level and in range
        const playerInFront = (st.dir === 1 ? playerDx > 0 : playerDx < 0);
        const inRange = Math.abs(playerDx) < 380 && Math.abs(playerDy) < 90;
        if (st.chargeTimer <= 0 && playerInFront && inRange) {
          st.state = 'windup';
          st.stateTimer = BOSS_CRAB_CHARGE_WINDUP;
        }
        // Jump attack — crouch then leap toward the player
        else if (st.jumpTimer <= 0 && Math.abs(playerDx) < 500) {
          st.state = 'jumpWindup';
          st.stateTimer = BOSS_CRAB_JUMP_WINDUP;
          st.dir = playerDx >= 0 ? 1 : -1;
        }
        // Ground slam — face-slam that rains rocks from above
        else if (st.slamTimer <= 0) {
          st.state = 'slamWindup';
          st.stateTimer = BOSS_CRAB_SLAM_WINDUP;
        }
        // Retreat — back off to give the player breathing room
        else if (st.retreatTimer <= 0 && Math.abs(playerDx) < 300) {
          st.state = 'retreat';
          st.stateTimer = BOSS_CRAB_RETREAT_DURATION;
        }
      }
    }

    // Rock throw — only during patrol, triggers a windup first
    const distToPlayer = Math.abs(playerDx) + Math.abs(playerDy);
    const inVisualRange = distToPlayer < 600;
    if (st.throwTimer <= 0 && st.state === 'patrol' && inVisualRange && bc.space) {
      st.throwTimer = BOSS_CRAB_THROW_INTERVAL;
      st.state = 'throwWindup';
      st.stateTimer = BOSS_CRAB_THROW_WINDUP;
    }
  }

  // ── Tick boss loot pearls (custom gravity, stop at floor) ──
  for (const pb of pearlBodies) {
    if (!pb._bossLoot || !pb.space) continue;
    // Apply gravity
    pb.velocity = new Vec2(pb.velocity.x * 0.99, pb.velocity.y + 400 * FIXED_DT);
    // Stop at floor level
    if (pb.position.y >= pb._lootFloorY) {
      pb.position.y = pb._lootFloorY;
      pb.velocity = new Vec2(0, 0);
      pb._bossLoot = false; // stop ticking, pearl rests on floor
    }
  }

  // ── Tick boss rock projectiles (gravity + life) ──
  for (let i = bossRockBodies.length - 1; i >= 0; i--) {
    const r = bossRockBodies[i];
    if (!r.space) { bossRockBodies.splice(i, 1); continue; }
    r._life -= FIXED_DT * 1000;
    if (r._life <= 0) {
      r.space = null;
      bossRockBodies.splice(i, 1);
      continue;
    }
    // Apply gravity manually (KINEMATIC ignores the space gravity)
    // Falling rocks (from slam) use heavier gravity for faster descent
    const rockGrav = r._fallingRock ? BOSS_CRAB_THROW_GRAVITY * 1.2 : BOSS_CRAB_THROW_GRAVITY;
    r.velocity = new Vec2(r.velocity.x, r.velocity.y + rockGrav * FIXED_DT);
  }

  // ── Update toxic fish AI (patrol + shoot) ──
  for (const tf of toxicFishBodies) {
    if (!tf._patrol || !tf.space) continue;
    if (tf._stunTimer > 0) { tf.velocity = new Vec2(0, 0); continue; }
    const p = tf._patrol;
    const px = tf.position.x;
    if (px >= p.maxX) p._dir = -1;
    if (px <= p.minX) p._dir = 1;
    tf.velocity = new Vec2(p._dir * p.speed, 0);

    // Shooting logic
    tf._shoot.cooldown = Math.max(0, tf._shoot.cooldown - FIXED_DT * 1000);
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
      sfx.toxicSpit();
    }
  }

  // ── Update spitting coral AI (stationary, fan projectiles) ──
  for (const sc of spittingCoralBodies) {
    if (!sc.space) continue;
    sc._shoot.cooldown = Math.max(0, sc._shoot.cooldown - FIXED_DT * 1000);
    if (sc._shoot.cooldown <= 0) {
      sc._shoot.cooldown = CORAL_SHOOT_INTERVAL;
      // Fire 3 projectiles in fan pattern: left-up, straight up, right-up
      const angles = [-CORAL_FAN_ANGLE, 0, CORAL_FAN_ANGLE];
      for (const angle of angles) {
        const vx = Math.sin(angle) * CORAL_PROJECTILE_SPEED;
        const vy = -Math.cos(angle) * CORAL_PROJECTILE_SPEED; // negative = upward
        const pb = new Body(BodyType.KINEMATIC, new Vec2(sc.position.x, sc.position.y - 12));
        const ps = new Circle(4);
        ps.sensorEnabled = true;
        ps.cbTypes.add(projectileTag);
        pb.shapes.add(ps);
        pb.space = space;
        pb.velocity = new Vec2(vx, vy);
        pb._life = CORAL_PROJECTILE_LIFE;
        pb._coralProjectile = true;
        projectileBodies.push(pb);
        voxelRenderer.buildProjectile(pb, true);
      }
      sfx.toxicSpit();
    }
  }

  // ── Update projectiles (lifetime) ──
  for (let i = projectileBodies.length - 1; i >= 0; i--) {
    const pb = projectileBodies[i];
    if (!pb.space) { projectileBodies.splice(i, 1); continue; }
    pb._life -= FIXED_DT * 1000;
    if (pb._life <= 0) {
      pb.space = null;
      projectileBodies.splice(i, 1);
    }
  }

  // ── Update timed switches (countdown) ──
  for (const sw of switchBodies) {
    if (sw.type === 'timed' && sw.active) {
      sw.timer -= FIXED_DT * 1000;
      if (sw.timer <= 0) {
        sw.timer = 0;
        sw.active = false;
        _updateGatesForGroup(sw.group);
      }
    }
  }

  // ── Update gate animation (swing open/close via rotation) ──
  for (const gate of gateBodies) {
    const targetAngle = gate.open ? Math.PI / 2 : 0;
    if (Math.abs(gate.angle - targetAngle) > 0.01) {
      const dir = targetAngle > gate.angle ? 1 : -1;
      gate.angle += dir * GATE_OPEN_SPEED * FIXED_DT;
      // Clamp
      if (dir > 0 && gate.angle > targetAngle) gate.angle = targetAngle;
      if (dir < 0 && gate.angle < targetAngle) gate.angle = targetAngle;
    }
    // When gate is more than ~45° open, disable solid collision
    // (PreListener handles the ACCEPT/IGNORE dynamically)
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

  // ── Update floating logs (damping, keep stable) ──
  for (const fb of floatingLogBodies) {
    fb.velocity = new Vec2(fb.velocity.x * 0.97, fb.velocity.y * 0.97);
    fb.angularVel *= 0.96;
  }

  // ── Update swinging anchors (pendulum physics) ──
  const PENDULUM_GRAVITY = 300; // px/s² — effective gravity for pendulum swing
  for (const sa of swingingAnchorBodies) {
    // Pendulum: angular_accel = -g/L * sin(angle)
    const angAccel = -(PENDULUM_GRAVITY / sa.chainLength) * Math.sin(sa.angle);
    sa.angularVel += angAccel * FIXED_DT;
    sa.angularVel *= 0.9995; // very slight damping — nearly perpetual
    sa.angle += sa.angularVel * FIXED_DT;
    // Position anchor body at center of anchor model (below chain end)
    const ANCHOR_BODY_OFFSET = 12; // px — offset from chain end to anchor body center
    const totalLen = sa.chainLength + ANCHOR_BODY_OFFSET;
    const ax = sa.pivotX + totalLen * Math.sin(sa.angle);
    const ay = sa.pivotY + totalLen * Math.cos(sa.angle);
    sa.body.position = new Vec2(ax, ay);
  }

  // ── Hint stone proximity detection ──
  _activeHint = null;
  for (let i = 0; i < hintStoneBodies.length; i++) {
    const hs = hintStoneBodies[i];
    const dx = player.position.x - hs.body.position.x;
    const dy = player.position.y - hs.body.position.y;
    if (Math.sqrt(dx * dx + dy * dy) < HINT_PROXIMITY) {
      _activeHint = i;
      break;
    }
  }

  // ── Message overlay timer (bottles) ──
  if (_messageOverlay && _messageOverlay.timer > 0) {
    _messageOverlay.timer -= FIXED_DT * 1000;
    if (_messageOverlay.timer <= 800) _messageOverlay.fadeOut = true;
    if (_messageOverlay.timer <= 0) _messageOverlay = null;
  }

  // ── Boulder / Key grab / carry / throw mechanic (E key) ──
  if (grabbedBoulder && !grabbedBoulder.space) {
    grabbedBoulder = null;
  }
  if (grabbedKey && !grabbedKey.space) {
    grabbedKey = null;
  }

  if (input.grab) {
    if (grabbedBoulder) {
      // ── Throw boulder ──
      const throwDirX = fishCtrl.facingRight ? 1 : -1;
      const throwDirY = Math.abs(input.dirY) > 0.1 ? input.dirY * 0.7 : 0;
      grabbedBoulder.velocity = new Vec2(throwDirX * 350, throwDirY * 350);
      grabbedBoulder = null;
      sfx.stoneThrow();
    } else if (grabbedKey) {
      // ── Throw key (same arc, no damage) ──
      const throwDirX = fishCtrl.facingRight ? 1 : -1;
      const throwDirY = Math.abs(input.dirY) > 0.1 ? input.dirY * 0.7 : 0;
      grabbedKey.velocity = new Vec2(throwDirX * 300, throwDirY * 300);
      grabbedKey = null;
      sfx.stoneThrow();
    } else {
      // ── Grab: find nearest boulder or key within range ──
      let closest = null;
      let closestDist = BOULDER_GRAB_DIST;
      let closestType = null; // 'boulder' or 'key'
      for (const br of boulderBodies) {
        if (!br.space) continue;
        const dx = br.position.x - player.position.x;
        const dy = br.position.y - player.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) {
          closestDist = dist;
          closest = br;
          closestType = 'boulder';
        }
      }
      for (const k of keyBodies) {
        if (!k.body.space) continue;
        const dx = k.body.position.x - player.position.x;
        const dy = k.body.position.y - player.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) {
          closestDist = dist;
          closest = k.body;
          closestType = 'key';
        }
      }
      if (closest) {
        if (closestType === 'boulder') {
          grabbedBoulder = closest;
          grabSide = fishCtrl.facingRight ? 1 : -1;
        } else {
          grabbedKey = closest;
          keyGrabSide = fishCtrl.facingRight ? 1 : -1;
        }
        sfx.stonePickup();
      }
    }
  }

  // ── Carry boulder ──
  if (grabbedBoulder) {
    grabSide = fishCtrl.facingRight ? 1 : -1;
    const targetX = player.position.x + grabSide * BOULDER_CARRY_OFFSET;
    const targetY = player.position.y;
    const dx = targetX - grabbedBoulder.position.x;
    const dy = targetY - grabbedBoulder.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > BOULDER_SNAP_DIST) {
      grabbedBoulder = null;
    } else {
      const pull = 12;
      grabbedBoulder.velocity = new Vec2(dx * pull, dy * pull);
      grabbedBoulder.angularVel = 0;
    }
  }

  // ── Carry key ──
  if (grabbedKey) {
    keyGrabSide = fishCtrl.facingRight ? 1 : -1;
    const targetX = player.position.x + keyGrabSide * KEY_CARRY_OFFSET;
    const targetY = player.position.y;
    const dx = targetX - grabbedKey.position.x;
    const dy = targetY - grabbedKey.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > KEY_SNAP_DIST) {
      grabbedKey = null;
    } else {
      const pull = 12;
      grabbedKey.velocity = new Vec2(dx * pull, dy * pull);
      grabbedKey.angularVel = 0;
    }
  }

  // ── Fish controller update ──
  fishCtrl.update(input, WATER_SURFACE_Y);

  // ── Stun Pulse: on activation frame, stun all enemies within radius ──
  const fishState0 = fishCtrl.getState();
  if (fishState0.stunPulseActive) {
    const stunR = FishController.STUN_PULSE_RADIUS;
    const stunDur = FishController.STUN_DURATION_MS;
    const allEnemies = [
      ...enemyBodies, ...sharkBodies, ...pufferfishBodies,
      ...crabBodies, ...toxicFishBodies, ...armoredFishBodies,
    ];
    for (const eb of allEnemies) {
      if (!eb.space) continue;
      const dx = eb.position.x - player.position.x;
      const dy = eb.position.y - player.position.y;
      if (Math.sqrt(dx * dx + dy * dy) < stunR) {
        eb._stunTimer = stunDur;
      }
    }
    sfx.stunPulse();
    voxelRenderer.spawnStunPulse(player.position.x, player.position.y);
  }

  // ── Tick down stun timers on all enemies ──
  const _allStunnableEnemies = [
    ...enemyBodies, ...sharkBodies, ...pufferfishBodies,
    ...crabBodies, ...toxicFishBodies, ...armoredFishBodies,
  ];
  for (const eb of _allStunnableEnemies) {
    if (eb._stunTimer > 0) {
      eb._stunTimer -= FIXED_DT * 1000;
      if (eb._stunTimer <= 0) eb._stunTimer = 0;
    }
  }

  // ── Speed Surge: play SFX on activation frame ──
  if (fishState0.speedSurgeActive && fishState0.speedSurgeTimerPct > 0.99) {
    sfx.speedSurge();
  }

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
  space.step(FIXED_DT, 8, 3);
}

// Update iris open center to player spawn position (for start-game transition)
if (_startWithExpand) {
  _startWithExpand = false;
  const { visW: sw, visH: sh } = getVisibleSize();
  irisOpenCx = (player.position.x - camX) / sw * hudCanvas.width;
  irisOpenCy = (player.position.y - camY) / sh * hudCanvas.height;
}

// Kick off the game loop inside startGame
gameLoop();
} // end startGame
