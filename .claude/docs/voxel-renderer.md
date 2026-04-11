# VoxelRenderer — Three.js Rendering Layer

All visuals are procedural voxels — no external assets. The renderer syncs Three.js objects to nape-js physics state each frame.

## Terrain

Each tile type gets its own `InstancedMesh` with a single `BoxGeometry(TILE_SIZE)` and a **procedural canvas texture** (Minecraft-style):

| Tile    | Color Hex  | Texture Style                          |
|---------|------------|----------------------------------------|
| Stone   | `0x5a5a6e` | Gray with random patches and cracks    |
| Sand    | `0xc2a86e` | Warm with grain dots and wave lines    |
| Coral   | `0xe05555` | Vibrant with polyp bumps and highlights|
| Seaweed | `0x2d8a4e` | Green with leaf veins and spots        |

Textures are generated once via `_generateTileTexture()` using a canvas, cached per type, and applied with `NearestFilter` for a blocky pixel-art look. InstancedMesh is used for batched draw calls.

## Fish Models

Voxel groups built from hardcoded coordinate arrays:

**Player fish** (orange `0xff8c42`):
- Body block, white eye with dark pupil, yellow top fin, red-orange tail
- Tail is a separate pivot for wag animation
- Mirrored on Y-axis via `scale.z = -1` when facing left

**Enemy fish** (dark red `0x992222`):
- Similar structure, spiky fin (`0x661111`)
- No animation beyond position sync

## Background & Atmosphere

### Depth Gradient Background
- Full-world-size plane at z=-400 with a vertical canvas gradient (bright blue → deep dark)
- 3 parallax background layers at increasing z-depth with decreasing opacity

### God Rays (Volumetric Light)
- `GOD_RAY_COUNT` (12) trapezoid-shaped beams from the water surface downward
- Narrow at top, wider at bottom; uses `AdditiveBlending`
- Animated: horizontal sway (`sin`) + opacity pulsing per ray
- Constants: `GOD_RAY_MAX_WIDTH` 80px, `GOD_RAY_HEIGHT` 600px, `GOD_RAY_OPACITY` 0.07

## Water

### Water Volume
- Translucent box with a vertical gradient texture (lighter at top, darker at bottom)
- 30% opacity, `NormalBlending`

### Water Surface
- `SURFACE_WAVE_SEGMENTS` (200) triangle-strip mesh along the surface line
- Multi-layered sine wave animation: 3 frequencies for organic movement
- Horizontal shimmer texture that scrolls over time (`AdditiveBlending`)

### Surface Sparkles
- `SURFACE_SPARKLE_COUNT` (60) small plane particles along the surface
- Sparkle on/off via `pow(sin(t), 8)` for sharp flash pattern
- `AdditiveBlending` for bright glint effect

## Bubbles

Particle-like system using small sphere meshes:

- Spawned when fish moves fast or enters water
- Rise with upward velocity + slight horizontal drift
- Fade opacity over 1.5–3.5 second lifetime
- Use `AdditiveBlending` for a glowing look
- Removed from scene when expired

## Lighting Setup

| Type        | Color      | Intensity | Role                        |
|-------------|------------|-----------|-----------------------------|
| Ambient     | `0x5577aa` | 0.8       | Blue base fill              |
| Directional | `0xaaddff` | 1.0       | Cool sunlight from above    |
| Fill        | `0x6699bb` | 0.4       | Cool side fill              |
| Uplight     | `0xaa9966` | 0.15      | Warm bounce from sand floor |
| Fog         | `FogExp2`  | 0.0012    | Exponential depth fade      |

## Key Method: `syncFrame()`

Called every frame after physics step. Updates:
1. Player fish group position/rotation from nape body
2. Tail wag angle (frequency = 8 + speed×0.05, amplitude 0.3–0.7 rad)
3. Enemy positions from their nape bodies
4. Bubble positions, opacity, and lifetime
5. God ray sway and opacity pulsing
6. Water surface wave vertex animation + texture scrolling
7. Surface sparkle flash pattern
8. Water volume gentle bob
