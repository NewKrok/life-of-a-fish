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
  getLevelEntities, getMergedSolidBodies, getWaterZones, resetTiles,
  getLevels, setCurrentLevel, getCurrentLevelIndex,
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
import { LevelEditor } from './level-editor.js';

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

// ── Level Editor ──
let editorActive = false;
let gameEditor = null;    // LevelEditor for game level
let menuEditor = null;    // LevelEditor for menu level
let _capturedEntities = null;  // snapshot of game entities for editor init
let _gameCamX = 0;       // exposed camera X from game loop
let _gameCamY = 0;       // exposed camera Y from game loop

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

// ── Touch Controls (module-level so menu/pause helpers can access) ──
const touchControls = new TouchControls();

function showMenu() {
  appState = 'menu';
  menuOverlay.classList.remove('hidden');
  // Ensure main menu buttons are visible, level select is hidden
  document.getElementById('menuMain').classList.remove('hidden');
  document.getElementById('levelSelect').classList.add('hidden');
  aquariumCloseBtn.classList.remove('visible');
  settingsPanel.classList.remove('visible');
  aboutPanel.classList.remove('visible');
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
function _irisStandaloneLoop() {
  _irisStep(1 / 60);

  // During black phase: if start-game is pending, init the game and hand off
  if (_startGamePending && irisState === 'black') {
    _startGamePending = false;
    _irisAnimId = null;
    // Init game — its game loop will drive the remaining open phases
    menuScene.stop();
    appState = 'game';
    music.play('game');
    pauseBtn.classList.add('visible');
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
      `<div class="level-card-number">Level ${lv.index + 1}</div>` +
      `<div class="level-card-name">${lv.name}</div>` +
      `<div class="level-card-desc">${lv.description}</div>`;
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
  appState = 'aquarium';
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
  appState = 'settings';
  menuOverlay.classList.add('hidden');
  settingsPanel.classList.add('visible');
});

document.getElementById('settingsBack').addEventListener('click', () => {
  sfx.buttonClick();
  showMenu();
});

document.getElementById('btnAbout').addEventListener('click', () => {
  sfx.buttonClick();
  appState = 'about';
  menuOverlay.classList.add('hidden');
  aboutPanel.classList.add('visible');
});

document.getElementById('aboutBack').addEventListener('click', () => {
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
  if (appState === 'game') pauseBtn.classList.add('visible');
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
      // Deactivate editor
      _deactivateEditor();
    } else {
      // Activate editor for current context
      _activateEditor();
    }
  }
});

function _activateEditor() {
  editorActive = true;

  if (appState === 'game' && gameInitialized) {
    // Game level editor
    if (!gameEditor) {
      const entityList = LevelEditor.buildEntityList(
        TILES, LEVEL_COLS, LEVEL_ROWS, _capturedEntities
      );
      gameEditor = new LevelEditor(
        hudCtx, hudCanvas, TILES, LEVEL_COLS, LEVEL_ROWS, WORLD_W, WORLD_H
      );
      // Wire up 3D rebuild callbacks
      gameEditor.onTerrainChange = () => {
        if (voxelRenderer) voxelRenderer.rebuildTerrain();
      };
      gameEditor.onEntityChange = (entities) => {
        _rebuildGameEntityVisuals(entities);
      };
      gameEditor.activate(_gameCamX, _gameCamY, entityList);
    } else {
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
      // Wire up 3D rebuild callbacks for menu
      menuEditor.onTerrainChange = () => {
        const mr = menuScene.voxelRenderer;
        if (mr) mr.rebuildTerrainFrom(MENU_TILES, MENU_COLS, MENU_ROWS, MENU_WORLD_H, MENU_WATER_SURFACE_Y);
      };
      menuEditor.onEntityChange = (entities) => {
        _rebuildMenuEntityVisuals(entities);
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
  }
}

// Rebuild entity visuals from editor entity list (game level)
function _rebuildGameEntityVisuals(entities) {
  if (!voxelRenderer) return;
  voxelRenderer.clearEntityVisuals();
  for (const ent of entities) {
    if (ent.tileId === 6)  voxelRenderer.buildEnemyFish();
    if (ent.tileId === 12) voxelRenderer.buildShark();
    if (ent.tileId === 13) voxelRenderer.buildPufferfish();
    if (ent.tileId === 14) voxelRenderer.buildCrab();
    if (ent.tileId === 15) voxelRenderer.buildToxicFish();
  }
  // Position the newly created visuals at the entity positions
  _positionEditorEntities(voxelRenderer, entities);
}

// Rebuild entity visuals for menu level
function _rebuildMenuEntityVisuals(entities) {
  const mr = menuScene.voxelRenderer;
  if (!mr) return;
  mr.clearEntityVisuals();
  for (const ent of entities) {
    if (ent.tileId === 6)  mr.buildEnemyFish();
    if (ent.tileId === 12) mr.buildShark();
    if (ent.tileId === 13) mr.buildPufferfish();
    if (ent.tileId === 14) mr.buildCrab();
    if (ent.tileId === 15) mr.buildToxicFish();
  }
  _positionEditorEntities(mr, entities);
}

// Position editor entity visuals at their world positions
function _positionEditorEntities(vr, entities) {
  let ei = 0, si = 0, pi = 0, ci = 0, ti = 0;
  for (const ent of entities) {
    const x = ent.x;
    const y = -ent.y; // Three.js Y is flipped
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
    }
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
}

function _getActiveEditor() {
  if (!editorActive) return null;
  if (appState === 'game' && gameInitialized) return gameEditor;
  return menuEditor;
}

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

  // Reset tile data so entities are re-extracted cleanly on re-start
  resetTiles();

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

// Build dynamic object meshes
voxelRenderer.buildBuoys(buoyBodies);
voxelRenderer.buildBoulders(boulderBodies);
voxelRenderer.buildKeys(keyBodies);
voxelRenderer.buildChests(chestBodies);
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

// Enemy collision -> death
const enemyListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, enemyTag,
  () => { triggerDeath(); },
);
enemyListener.space = space;

// Hazard collision -> death
const hazardListener = new InteractionListener(
  CbEvent.BEGIN, InteractionType.SENSOR, playerTag, hazardTag,
  () => { triggerDeath(); },
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
      sfx.enemyDeath();
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
      sfx.enemyDeath();
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
      sfx.enemyDeath();
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
      sfx.enemyDeath();
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
      if (boulderBody && boulderBody.space) {
        if (grabbedBoulder === boulderBody) grabbedBoulder = null;
        boulderBody.space = null;
        voxelRenderer.spawnBoulderBreak(cx, cy);
      }
    }
  },
);
boulderToxicListener.space = space;

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
    sfx.pearlPickup();

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

// Player-key collision: ignored while carrying
const keyPlayerPre = new PreListener(
  InteractionType.COLLISION, playerTag, keyTag,
  () => grabbedKey ? PreFlag.IGNORE : PreFlag.ACCEPT,
);
keyPlayerPre.space = space;

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
  hudCtx.fillText('PHYSICS DEBUG (F3)', 10, H - 10);
  hudCtx.restore();
}

// ── Game State ──
const TOTAL_PEARLS = entities.pearls.length + entities.chests.length;
const MAX_LIVES = 3;
let lives = MAX_LIVES;

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
  document.getElementById('goStatPearls').textContent = `${pearlCount} / ${TOTAL_PEARLS}`;
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
  document.getElementById('vicStatTime').textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

  const score = calculateScore(lives, timeRemaining);
  document.getElementById('vicStatScore').textContent = String(score);

  const highScore = getHighScore();
  const highScoreEl = document.getElementById('vicHighScore');
  if (score > highScore) {
    saveHighScore(score);
    highScoreEl.textContent = 'New High Score!';
  } else {
    highScoreEl.textContent = `High Score: ${highScore}`;
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

  // ── Enemies ──
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
    pauseBtn.classList.add('visible');
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
      irisOpenCx = (entities.playerSpawn.x - camX) / sw * hudCanvas.width;
      irisOpenCy = (entities.playerSpawn.y - camY) / sh * hudCanvas.height;
      pauseBtn.classList.add('visible');
    });
  }
}

let _exitPending = false;

function exitToMenu() {
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

  // ── Pearl progress bar (top-center) ──
  const barW = 340;
  const barH = 28;
  const barX = (W - barW) / 2;
  const barY = 12;
  const progress = TOTAL_PEARLS > 0 ? pearlCount / TOTAL_PEARLS : 0;

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
  hudCtx.fillText(`${pearlCount} / ${TOTAL_PEARLS}`, barX + barW / 2, barY + barH - 7);

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

// ── Game Loop ──
function gameLoop() {

  // ── Editor Mode ──
  if (editorActive && gameEditor) {
    // Editor: free camera, no physics, render overlay
    gameEditor.update(DT, getVisibleSize);
    gameEditor.processPendingActions(getVisibleSize);

    // Use editor camera
    camX = gameEditor.camX;
    camY = gameEditor.camY;
    _gameCamX = camX;
    _gameCamY = camY;

    const { visW: camVisW, visH: camVisH } = getVisibleSize();
    const lookX = camX + camVisW / 2;
    const lookY = -(camY + camVisH / 2);
    camera.position.set(lookX, lookY - CAM_Y_OFFSET, CAM_Z_OFFSET);
    camera.lookAt(lookX, lookY, 0);

    // In editor mode, skip syncFrame (entities are positioned by editor callbacks).
    // Only update time-based animations (water, bubbles, etc.)
    voxelRenderer._time += DT;

    renderer.render(scene, camera);

    // Editor HUD
    hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
    gameEditor.render(getVisibleSize);
    gameEditor.renderToast(DT);

    gameAnimId = requestAnimationFrame(gameLoop);
    return;
  }

  // ── Paused ──
  if (gamePaused) {
    // Keep rendering the scene but skip game logic
    // Still step iris if it's playing (game over/victory triggered during iris)
    if (irisState !== 'none') {
      _irisStep(DT);
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
      // Iris finished — stop game loop, menu scene is already running
      _exitPending = false;
      gameAnimId = null;
      return;
    }
    // Still animating — step iris, draw overlay on top of menu scene
    _irisStep(DT);
    hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
    _irisDraw();
    gameAnimId = requestAnimationFrame(gameLoop);
    return;
  }

  // ── Death / Respawn Animation ──
  const deathFrozen = updateDeathState(DT);
  if (deathFrozen) {
    // Update Three.js camera position (camX/camY may have changed during respawn)
    const { visW: dVisW, visH: dVisH } = getVisibleSize();
    const dLookX = camX + dVisW / 2;
    const dLookY = -(camY + dVisH / 2);
    camera.position.set(dLookX, dLookY - CAM_Y_OFFSET, CAM_Z_OFFSET);
    camera.lookAt(dLookX, dLookY, 0);
    renderer.render(scene, camera);
    renderHUD();
    renderDeathOverlay();
    gameAnimId = requestAnimationFrame(gameLoop);
    return;
  }

  // ── Input ──
  const kbInput = getKeyboardInput();
  const touchInput = touchControls.getInput();
  const input = {
    dirX: Math.abs(kbInput.dirX) > Math.abs(touchInput.dirX) ? kbInput.dirX : touchInput.dirX,
    dirY: Math.abs(kbInput.dirY) > Math.abs(touchInput.dirY) ? kbInput.dirY : touchInput.dirY,
    dash: kbInput.dash || touchInput.dash,
    grab: kbInput.grab || touchInput.grab,
  };

  // ── Victory check ──
  if (!victoryActive && !deathActive && pearlCount >= TOTAL_PEARLS) {
    showVictory();
  }

  // ── Countdown timer ──
  if (!deathActive && irisState === 'none' && !victoryActive) {
    timeRemaining -= DT;
    if (timeRemaining <= 0) {
      timeRemaining = 0;
      triggerDeath();  // time's up = death
    }
  }

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
      sfx.sharkAlert();
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
      sfx.toxicSpit();
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
  _gameCamX = camX;
  _gameCamY = camY;

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
  renderDeathOverlay();
  renderPhysicsDebug();

  gameAnimId = requestAnimationFrame(gameLoop);
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
