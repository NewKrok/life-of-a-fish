// ── Codex Renderer ──────────────────────────────────────────────────────────
// Renders offscreen preview thumbnails for the Codex (encyclopedia) panel.
// Uses a temporary VoxelRenderer to build entity models, then renders them
// into small canvases and returns dataURL images.
// Uses a single shared offscreen WebGLRenderer to avoid exhausting contexts.

import { VoxelRenderer } from './voxel-renderer.js';

const PREVIEW_SIZE = 96;  // px — thumbnail resolution

// ── Render a single THREE.Group into a dataURL using shared renderer ──
function _renderPreview(THREE, offRenderer, group, opts = {}) {
  const size = opts.size || PREVIEW_SIZE;
  const camAngle = opts.camAngle || 0.3;

  offRenderer.setSize(size, size);
  offRenderer.setClearColor(0x0a1e30, 0);

  // Scene with lighting
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0x88aacc, 1.4));
  const sun = new THREE.DirectionalLight(0xffeedd, 1.6);
  sun.position.set(50, 40, 60);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x88bbdd, 0.5);
  fill.position.set(-30, 10, 40);
  scene.add(fill);
  scene.add(new THREE.HemisphereLight(0x88ccff, 0x886644, 0.3));

  // Center the group at origin
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.sub(center);
  scene.add(group);

  // Camera — auto-fit to bounding box
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 500);
  const bSize = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(bSize.x, bSize.y, bSize.z);
  const dist = opts.camDist || Math.max(maxDim * 2.2, 30);
  camera.position.set(
    dist * 0.15,
    dist * Math.sin(camAngle),
    dist * Math.cos(camAngle)
  );
  camera.lookAt(0, 0, 0);

  offRenderer.render(scene, camera);
  const url = offRenderer.domElement.toDataURL('image/png');

  scene.remove(group);
  return url;
}

// ── Build a single terrain block preview ──
function _buildTerrainBlock(THREE, vr, tileType) {
  const texture = vr._generateTileTexture(tileType);
  const geo = new THREE.BoxGeometry(16, 16, 16);
  const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0.0 });
  const mesh = new THREE.Mesh(geo, mat);
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

// ── Build a pearl preview ──
function _buildPearlPreview(THREE) {
  const geo = new THREE.BoxGeometry(12, 12, 12);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xfff0c0,
    emissive: 0xffd93d,
    emissiveIntensity: 0.5,
    roughness: 0.3,
    metalness: 0.4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

// ── Build water surface preview ──
function _buildWaterPreview(THREE) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(24, 10, 16);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2288cc,
    transparent: true,
    opacity: 0.6,
    roughness: 0.2,
    metalness: 0.1,
  });
  group.add(new THREE.Mesh(geo, mat));
  const lineGeo = new THREE.BoxGeometry(24, 2, 16);
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0x66ccff,
    emissive: 0x44aadd,
    emissiveIntensity: 0.3,
  });
  const lineMesh = new THREE.Mesh(lineGeo, lineMat);
  lineMesh.position.y = 6;
  group.add(lineMesh);
  return group;
}

// ── Cache and generate all previews ──
let _cache = null;

export function generateCodexPreviews(THREE) {
  if (_cache) return _cache;

  // Single shared offscreen renderer — avoids exhausting WebGL contexts
  const offRenderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  offRenderer.setPixelRatio(1);

  const tempScene = new THREE.Scene();
  const vr = new VoxelRenderer(THREE, tempScene);

  const previews = {};

  // Helper: build with VR, extract the group, render it
  const capture = (buildFn, opts) => {
    const group = buildFn();
    tempScene.remove(group);
    return _renderPreview(THREE, offRenderer, group, opts);
  };

  // Player fish
  previews.player = capture(() => vr.buildFish());

  // Enemies
  previews.piranha = capture(() => vr.buildEnemyFish());
  previews.shark = capture(() => vr.buildShark());
  previews.pufferfish = capture(() => vr.buildPufferfish());
  previews.crab = capture(() => vr.buildCrab());
  previews.toxicFish = capture(() => vr.buildToxicFish());
  previews.armoredFish = capture(() => vr.buildArmoredFish());
  previews.spittingCoral = capture(() => vr.buildSpittingCoral(), { camAngle: 0.5 });

  // Items — fake body for build methods that expect physics bodies
  const fakeBody = { position: { x: 0, y: 0 } };

  // Pearl
  {
    const g = _buildPearlPreview(THREE);
    previews.pearl = _renderPreview(THREE, offRenderer, g);
  }

  // Boulder
  {
    vr.buildBoulders([fakeBody]);
    const g = vr.boulderMeshes[0]?.mesh;
    if (g) {
      tempScene.remove(g);
      g.position.set(0, 0, 0);
      previews.boulder = _renderPreview(THREE, offRenderer, g);
    }
    vr.boulderMeshes.length = 0;
  }

  // Key (red variant)
  {
    vr.buildKeys([{ body: fakeBody, colorIndex: 0 }]);
    const g = vr.keyMeshes[0]?.mesh;
    if (g) {
      tempScene.remove(g);
      g.position.set(0, 0, 0);
      previews.key = _renderPreview(THREE, offRenderer, g);
    }
    vr.keyMeshes.length = 0;
  }

  // Chest (red variant)
  {
    vr.buildChests([{ body: fakeBody, colorIndex: 0 }]);
    const g = vr.chestMeshes[0]?.mesh;
    if (g) {
      tempScene.remove(g);
      g.position.set(0, 0, 0);
      previews.chest = _renderPreview(THREE, offRenderer, g);
    }
    vr.chestMeshes.length = 0;
  }

  // Buoy
  {
    vr.buildBuoys([fakeBody]);
    const g = vr.buoyMeshes[0]?.mesh;
    if (g) {
      tempScene.remove(g);
      g.position.set(0, 0, 0);
      previews.buoy = _renderPreview(THREE, offRenderer, g);
    }
    vr.buoyMeshes.length = 0;
  }

  // Raft
  {
    vr.buildRafts([fakeBody]);
    const g = vr.raftMeshes[0]?.mesh;
    if (g) {
      tempScene.remove(g);
      g.position.set(0, 0, 0);
      previews.raft = _renderPreview(THREE, offRenderer, g, { camDist: 120 });
    }
    vr.raftMeshes.length = 0;
  }

  // Crate
  {
    vr.buildCrates([fakeBody]);
    const g = vr.crateMeshes[0]?.mesh;
    if (g) {
      tempScene.remove(g);
      g.position.set(0, 0, 0);
      previews.crate = _renderPreview(THREE, offRenderer, g);
    }
    vr.crateMeshes.length = 0;
  }

  // Breakable wall
  {
    vr.buildBreakableWalls([fakeBody]);
    const g = vr.breakableWallMeshes[0]?.mesh;
    if (g) {
      tempScene.remove(g);
      g.position.set(0, 0, 0);
      previews.breakableWall = _renderPreview(THREE, offRenderer, g, { camDist: 50 });
    }
    vr.breakableWallMeshes.length = 0;
  }

  // Switches (one preview per type)
  for (const [type, key] of [['toggle', 'switchToggle'], ['pressure', 'switchPressure'], ['timed', 'switchTimed']]) {
    vr.buildSwitches([{ body: fakeBody, type }]);
    const g = vr.switchMeshes[0]?.mesh;
    if (g) {
      tempScene.remove(g);
      g.position.set(0, 0, 0);
      previews[key] = _renderPreview(THREE, offRenderer, g, { camAngle: 0.6 });
    }
    vr.switchMeshes.length = 0;
  }

  // Gate
  {
    vr.buildGates([{ body: fakeBody, open: false }]);
    const g = vr.gateMeshes[0]?.mesh;
    if (g) {
      tempScene.remove(g);
      g.position.set(0, 0, 0);
      previews.gate = _renderPreview(THREE, offRenderer, g, { camDist: 90 });
    }
    vr.gateMeshes.length = 0;
  }

  // Floating Log
  {
    vr.buildFloatingLogs([fakeBody]);
    const g = vr.floatingLogMeshes[0]?.mesh;
    if (g) {
      tempScene.remove(g);
      g.position.set(0, 0, 0);
      previews.floatingLog = _renderPreview(THREE, offRenderer, g, { camDist: 40 });
    }
    vr.floatingLogMeshes.length = 0;
  }

  // Swinging Anchor
  {
    const fakeData = { body: fakeBody, pivotX: 0, pivotY: 0, chainLength: 96 };
    vr.buildSwingingAnchors([fakeData]);
    const g = vr.swingingAnchorMeshes[0]?.mesh;
    if (g) {
      tempScene.remove(g);
      g.position.set(0, 0, 0);
      previews.swingingAnchor = _renderPreview(THREE, offRenderer, g, { camDist: 80 });
    }
    vr.swingingAnchorMeshes.length = 0;
  }

  // Bottle
  {
    vr.buildBottles([{ body: fakeBody, text: '...', collected: false }]);
    const g = vr.bottleMeshes[0]?.mesh;
    if (g) {
      tempScene.remove(g);
      g.position.set(0, 0, 0);
      previews.bottle = _renderPreview(THREE, offRenderer, g, { camDist: 30 });
    }
    vr.bottleMeshes.length = 0;
  }

  // Hint Stone
  {
    vr.buildHintStones([{ body: fakeBody, text: '...' }]);
    const g = vr.hintStoneMeshes[0]?.mesh;
    if (g) {
      tempScene.remove(g);
      g.position.set(0, 0, 0);
      previews.hintStone = _renderPreview(THREE, offRenderer, g, { camDist: 35 });
    }
    vr.hintStoneMeshes.length = 0;
  }

  // Stun Pulse skill preview — purple ring
  {
    const g = new THREE.Group();
    const ringGeo = new THREE.TorusGeometry(10, 1.5, 8, 24);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xcc88ff, emissive: 0xaa66ee, emissiveIntensity: 0.8,
      transparent: true, opacity: 0.85,
    });
    g.add(new THREE.Mesh(ringGeo, ringMat));
    // Inner glow sphere
    const coreGeo = new THREE.SphereGeometry(4, 8, 8);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xddaaff, emissive: 0xcc88ff, emissiveIntensity: 1.0,
      transparent: true, opacity: 0.7,
    });
    g.add(new THREE.Mesh(coreGeo, coreMat));
    previews.stunPulse = _renderPreview(THREE, offRenderer, g, { camDist: 40 });
  }

  // Speed Surge skill preview — green streak
  {
    const g = new THREE.Group();
    // Arrow-like streak shape
    const streakGeo = new THREE.BoxGeometry(18, 4, 3);
    const streakMat = new THREE.MeshStandardMaterial({
      color: 0x66ffaa, emissive: 0x44cc88, emissiveIntensity: 0.7,
      transparent: true, opacity: 0.85,
    });
    const streak = new THREE.Mesh(streakGeo, streakMat);
    g.add(streak);
    // Trail particles
    for (let i = 0; i < 5; i++) {
      const pSize = 2 + Math.random() * 2;
      const pGeo = new THREE.BoxGeometry(pSize, pSize, pSize);
      const pMat = new THREE.MeshStandardMaterial({
        color: 0x88ffdd, emissive: 0x44ddcc, emissiveIntensity: 0.5,
        transparent: true, opacity: 0.6 - i * 0.08,
      });
      const p = new THREE.Mesh(pGeo, pMat);
      p.position.set(-8 - i * 3, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4);
      g.add(p);
    }
    previews.speedSurge = _renderPreview(THREE, offRenderer, g, { camDist: 45 });
  }

  // Terrain blocks
  {
    const stoneGroup = _buildTerrainBlock(THREE, vr, 1);
    previews.stone = _renderPreview(THREE, offRenderer, stoneGroup, { camDist: 40 });
  }
  {
    const coralGroup = _buildTerrainBlock(THREE, vr, 3);
    previews.coral = _renderPreview(THREE, offRenderer, coralGroup, { camDist: 40 });
  }
  {
    const sandGroup = _buildTerrainBlock(THREE, vr, 2);
    previews.sand = _renderPreview(THREE, offRenderer, sandGroup, { camDist: 40 });
  }
  {
    const seagrassGroup = _buildTerrainBlock(THREE, vr, 8);
    previews.seagrass = _renderPreview(THREE, offRenderer, seagrassGroup, { camDist: 40 });
  }
  {
    const hazardGroup = _buildTerrainBlock(THREE, vr, 4);
    previews.hazard = _renderPreview(THREE, offRenderer, hazardGroup, { camDist: 40 });
  }
  {
    const waterGroup = _buildWaterPreview(THREE);
    previews.water = _renderPreview(THREE, offRenderer, waterGroup, { camDist: 50 });
  }

  // Cleanup — dispose the single shared renderer
  offRenderer.dispose();

  _cache = previews;
  return previews;
}
