# VoxelRenderer — Three.js Rendering Layer

All visuals are procedural voxels — no external assets. The renderer syncs Three.js objects to nape-js physics state each frame.

## Terrain

Each tile type gets its own `InstancedMesh` with a single `BoxGeometry(TILE_SIZE)`:

| Tile    | Color Hex  | Notes           |
|---------|------------|-----------------|
| Stone   | `0x5a5a6e` | Primary terrain |
| Sand    | `0xc2a86e` | Cave floor      |
| Coral   | `0xe05555` | Decoration      |
| Seaweed | `0x2d8a4e` | Vegetation      |

InstancedMesh is used for batched draw calls — all tiles of the same type in one draw.

## Fish Models

Voxel groups built from hardcoded coordinate arrays:

**Player fish** (orange `0xff8c42`):
- Body block, white eye with dark pupil, yellow top fin, red-orange tail
- Tail is a separate pivot for wag animation
- Mirrored on Y-axis via `scale.z = -1` when facing left

**Enemy fish** (dark red `0x992222`):
- Similar structure, spiky fin (`0x661111`)
- No animation beyond position sync

## Water

- Translucent blue box (`0x1a6baa`, 18% opacity)
- Cyan surface line (`0x4dc9f6`, 40% opacity)
- Surface animates via `sin(time * 1.5)` vertical offset

## Bubbles

Particle-like system using small sphere meshes:

- Spawned when fish moves fast or enters water
- Rise with upward velocity + slight horizontal drift
- Fade opacity over 1.5–3.5 second lifetime
- Removed from scene when expired

## Lighting Setup

| Type        | Color      | Intensity | Role               |
|-------------|------------|-----------|---------------------|
| Ambient     | `0x446688` | 0.7       | Blue base fill      |
| Directional | `0xffffee` | 0.9       | Warm sun from above |
| Fill        | `0x88aacc` | 0.3       | Cool side fill      |
| Fog         | underwater blue | —    | 200–1000 unit range |

## Key Method: `syncFrame()`

Called every frame after physics step. Updates:
1. Player fish group position/rotation from nape body
2. Tail wag angle (frequency = 8 + speed×0.05, amplitude 0.3–0.7 rad)
3. Enemy positions from their nape bodies
4. Bubble positions, opacity, and lifetime
5. Water surface animation
