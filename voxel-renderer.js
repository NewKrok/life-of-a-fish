// ── Voxel Renderer ─────────────────────────────────────────────────────────
// Three.js voxel-style renderer for the underwater platformer.
// Uses InstancedMesh for terrain, Group of boxes for fish/enemies.

import { TILE_SIZE, LEVEL_COLS, LEVEL_ROWS, TILES, WATER_SURFACE_Y } from './level-data.js';

// Tile type -> color
const TILE_COLORS = {
  1: 0x5a5a6e, // stone
  2: 0xc2a86e, // sand
  3: 0xe05555, // coral
  4: 0x2d8a4e, // seaweed/hazard (green)
};

const VOXEL_DEPTH = TILE_SIZE; // Z depth of each voxel

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
      const mat = new THREE.MeshLambertMaterial({ color });
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

  // ── Build water volume ──
  buildWater(worldW, worldH) {
    const THREE = this.THREE;
    const waterTop = WATER_SURFACE_Y;
    const waterH = worldH - waterTop;

    // Water volume (translucent blue box)
    const geo = new THREE.BoxGeometry(worldW + 100, waterH, VOXEL_DEPTH * 3);
    const mat = new THREE.MeshLambertMaterial({
      color: 0x1a6baa,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(worldW / 2, -(waterTop + waterH / 2), 0);
    mesh.renderOrder = 999;
    this.scene.add(mesh);
    this.waterMesh = mesh;

    // Water surface line (thin bright box)
    const surfGeo = new THREE.BoxGeometry(worldW + 100, 3, VOXEL_DEPTH * 3);
    const surfMat = new THREE.MeshLambertMaterial({
      color: 0x4dc9f6,
      transparent: true,
      opacity: 0.4,
    });
    const surfMesh = new THREE.Mesh(surfGeo, surfMat);
    surfMesh.position.set(worldW / 2, -waterTop, 0);
    surfMesh.renderOrder = 998;
    this.scene.add(surfMesh);
  }

  // ── Setup lighting ──
  setupLighting() {
    const THREE = this.THREE;

    // Ambient (underwater mood)
    const ambient = new THREE.AmbientLight(0x446688, 0.7);
    this.scene.add(ambient);

    // Sun from above
    const sun = new THREE.DirectionalLight(0xffffee, 0.9);
    sun.position.set(200, 300, 400);
    this.scene.add(sun);

    // Soft fill from the side
    const fill = new THREE.DirectionalLight(0x88aacc, 0.3);
    fill.position.set(-200, 0, 200);
    this.scene.add(fill);

    // Underwater fog
    this.scene.fog = new THREE.Fog(0x0a2a4a, 200, 1000);
    this.scene.background = new THREE.Color(0x061520);
  }

  // ── Spawn a bubble particle ──
  spawnBubble(x, y) {
    const THREE = this.THREE;
    if (this.bubbles.length > 40) return; // limit

    const size = 1 + Math.random() * 3;
    const geo = new THREE.SphereGeometry(size, 6, 6);
    const mat = new THREE.MeshLambertMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.4,
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

    // ── Animate water surface ──
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
  }
}
