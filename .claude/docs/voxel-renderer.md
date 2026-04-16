# VoxelRenderer — Three.js Rendering Layer

All visuals are procedural voxels — no external assets. The renderer syncs Three.js objects to nape-js physics state each frame.

## Terrain

Each tile type gets its own `InstancedMesh` with a single `BoxGeometry(TILE_SIZE)` and a **procedural Minecraft-style 16x16 pixel grid texture**:

| Tile    | Texture Style                                        |
|---------|------------------------------------------------------|
| Stone   | Bright grays with random patches and darker cracks   |
| Sand    | Warm brown tones with grain dots and wave lines      |
| Coral   | Vibrant pinks/reds with polyp bumps and highlights   |
| Hazard  | Red with spike/cross pattern and dark edges           |
| Seagrass | Green kelp blades with lighter vertical streaks       |
| Breakable Wall | Dark grays with prominent diagonal crack lines  |

Each pixel in the 16x16 grid is drawn as a 4x4 block on a 64x64 canvas. Block edges have highlight (top/left bright) and shadow (bottom/right dark) for a 3D pixel-art look.

Textures are generated once via `_generateTileTexture()` using a canvas, cached per type, and applied with `NearestFilter`. Material is `MeshStandardMaterial` (roughness: 0.9, metalness: 0.0) with no color tint — the texture provides all color. The old `TILE_COLORS` constant and `MeshLambertMaterial` with color tint have been removed. InstancedMesh is used for batched draw calls.

**Depth-based darkening**: Each terrain instance has a per-instance color via `InstancedBufferAttribute`. Tiles deeper underwater are progressively darkened (up to 55% darker at the bottom). This simulates light absorption with depth. Tiles above `WATER_SURFACE_Y` remain at full brightness.

### Cave Background Layer

Auto-generated visual layer behind terrain that simulates cave openings. Not a tile type in the level data — computed at build time by `_buildCaveBackgroundMap()`.

**How it works**: Every empty cell within `CAVE_BG_NEIGHBOR_RADIUS` (2) tiles of a solid block (stone/sand/coral) gets a dark background block placed at `CAVE_BG_Z_OFFSET` (-TILE_SIZE) on the Z axis. The fish can swim in front of these blocks, creating the illusion of cave depth.

**Rendering**: Uses its own `InstancedMesh` with a dedicated `'cave_bg'` texture (very dark stone — grays in the 30–65 brightness range with subtle cracks). Base brightness is `CAVE_BG_DARKEN` (0.35) with additional depth-based darkening (up to 0.15 more). Material: `MeshStandardMaterial` (roughness: 1.0, metalness: 0.0).

**Constants**: `CAVE_BG_Z_OFFSET` (-32px), `CAVE_BG_DARKEN` (0.35), `CAVE_BG_NEIGHBOR_RADIUS` (2 tiles).

## Entity Mesh Optimization

Entity voxels use a `VoxelCollector` + `_mergeVoxelGroup` system that batches voxels by color into `InstancedMesh` objects. This reduces draw calls from ~60 per entity (one Mesh per voxel) to ~6-10 (one InstancedMesh per unique color). A shared `BoxGeometry` per voxel size is cached in `_sharedGeoCache`.

**Frustum culling**: The `syncFrame` method receives viewport bounds (`camX`, `camY`, `camVisW`, `camVisH`) in the extras parameter. Off-screen entities are set to `visible = false` with a 120px margin to prevent pop-in.

## Fish Models

Voxel groups built from hardcoded coordinate arrays, merged via `VoxelCollector`:

**Player fish** (orange `0xff8c42`):
- Body block, white eye with dark pupil, yellow top fin, red-orange tail
- Tail is a separate pivot for wag animation
- Mirrored on Y-axis via `scale.z = -1` when facing left
- Uses `MeshStandardMaterial` (roughness: 0.85, metalness: 0.0)

**Piranha** (dark purple `0x662244`):
- Similar structure, spiky fin, red angry eyes
- Tail is a separate pivot for wag animation
- 3D flip via Y-rotation lerp based on velocity direction

**Shark** (blue-grey `0x445566`):
- Longer body with pointed snout and white teeth
- Tall dorsal fin, dark menacing eyes
- Tail pivot for wag animation (faster when chasing)
- Slightly larger than piranha (Capsule 28×14)

**Pufferfish** (golden `0xccaa44`):
- Round/spherical body with protruding spikes in all directions
- Big white+black eyes, small tail fin
- Subtle scale-pulse animation (inflate/deflate)
- Wobble rotation animation

**Crab** (red `0xcc3322`):
- Wide flat body with claw appendages and eye stalks
- Legs below body, claws on sides with lighter tips
- Scuttle animation (vertical bob) when walking

**Toxic fish** (green `0x336644`):
- Similar to piranha but green body with purple toxic spots
- Glowing purple eyes, purple dorsal fin
- Tail pivot for wag animation
- Shoots green glowing poison projectiles (`BoxGeometry 6×6×6`, emissive `0x44cc00`)

**Armored fish** (steel blue `0x667788`):
- Bulky body with metallic armor plating and rivets
- Lighter belly, bright yellow warning eyes
- Dorsal and side fins with armor-tinted tips
- Tail pivot for wag animation
- Visual shield flash effect when dash bounces off

**Spitting coral** (purple-pink `0x884466`):
- Ground-fixed polyp with rocky brown base and 3 vertical tubes
- Center tube tallest, side tubes shorter — open "mouth" tips glow pink (`0xff99cc`)
- Green toxic spots on tubes
- No movement animation (static enemy)
- Fires purple projectiles (`BoxGeometry 6×6×6`, emissive `0x8822cc`) in upward fan pattern

**Switches** (per-type color: toggle green `0x22aa44`, pressure blue `0x3366cc`, timed orange `0xcc8822`):
- **Toggle** (green): flat pad with center button — button presses down on activation and stays down permanently
- **Pressure** (blue): same flat pad as toggle — button presses down while weight on it, pops back up when released
- **Timed** (orange): base block with pivot post and lever arm — lever tilts left on activation, gradually drifts back right as timer expires
- Toggle/pressure use `padMesh` with emissive glow; timed uses `leverPivot` group with rotation.z animation
- Emissive intensity pulses brighter when active (0.8 + sin×0.2)

**Gates** (metallic grey `0x888899`):
- 2-tile-tall, 1-tile-wide metal grate with 5 vertical bars, horizontal frame bars (top/bottom), and middle cross bar
- Pivot group at left edge (hinge) — rotates on Y axis to swing open sideways (0→π/2)
- Frame and cross bars use `MeshStandardMaterial` with high metalness (0.7-0.8)

## Background & Atmosphere

### Depth Gradient Background
- Full-world-size plane at z=-400 with a vertical canvas gradient (bright blue → deep dark, slightly brightened colors)
- 3 parallax background layers at increasing z-depth with decreasing opacity

### Ground Plane
- Minecraft-style sandy/dirt texture generated by `_generateGroundTexture()` (16x16 pixel grid on 64x64 canvas)
- Rotated -90° on X axis to lie flat in XZ plane, positioned at world bottom
- Extends 600px in Z depth behind the terrain blocks (visible from the angled perspective camera)
- Uses `MeshStandardMaterial` (roughness: 1.0, metalness: 0.0)

### Sky (Above Water)
- Sky gradient plane behind everything (z=-380), covering the area above the water surface
- Linear gradient: deep blue → pale blue → golden glow at water line

### Background Waves
- `BG_WAVE_COUNT` (5) horizontal wave lines behind terrain (z: -120 to -360)
- Built with `LineBasicMaterial`, animated sine-wave vertex displacement in `syncFrame()`
- Each line has unique amplitude, speed, and frequency; opacity fades with depth (0.06 → 0.02)

### Underwater Currents (Visual Only)
- `CURRENT_STREAK_COUNT` (40) thin horizontal line streaks drifting through the water
- Built with `LineBasicMaterial` + `AdditiveBlending`, blue-cyan hue range
- Each streak has random length (30–120px), speed (15–55 px/s), and direction (70% rightward)
- Vertical sine-wave wobble for organic feel; opacity pulses subtly
- Wraps around at world edges for infinite flow effect
- Constants: `CURRENT_OPACITY` 0.06, speed/length ranges defined per-streak

### God Rays (Volumetric Light)
- `GOD_RAY_COUNT` (12) trapezoid-shaped beams from the water surface downward
- Narrow at top, wider at bottom; uses `AdditiveBlending`
- Tilted ~15° (`rotation.z = -0.26`) so light appears to come from the right (matching the sun position)
- **Soft fade-out at bottom**: uses a shared canvas gradient texture mapped via UV (top=full opacity → bottom=transparent), replacing the old hard-edge cutoff
- Animated: horizontal sway (`sin`) + opacity pulsing per ray
- Constants: `GOD_RAY_MAX_WIDTH` 80px, `GOD_RAY_HEIGHT` 600px, `GOD_RAY_OPACITY` 0.07

## Water

### Water Fill Plane
- Double-sided plane (`0x0e5a8a`, 25% opacity) spanning from water surface to world bottom
- Fills the visual gap between the wave mesh and the background gradient
- Positioned at z=25 (behind wave mesh at z=30, in front of terrain at z=0)

### Water Surface (Pixelated)
- Triangle-strip mesh with one segment per tile (chunky pixel-art look)
- Surface band is ±8px tall (reduced from ±20px for a thinner, crisper line)
- Pixelated 32x16 texture with `NearestFilter` — Minecraft-style pixel blocks instead of smooth gradient
- Wave animation uses smooth sine values; pixel look comes from tile-width segments + NearestFilter
- Texture scroll for subtle shimmer

### Surface Sparkles
- `SURFACE_SPARKLE_COUNT` (60) small plane particles along the surface
- Sparkle on/off via `pow(sin(t), 8)` for sharp flash pattern
- `AdditiveBlending` for bright glint effect

## Pearls

Built via `buildPearls(pearlBodies)`:

- Gold cubes using `BoxGeometry(10, 10, 10)` for voxel-consistent look
- `MeshStandardMaterial` with emissive glow (`color: 0xfff0c0`, `emissive: 0xffd93d`, `emissiveIntensity: 0.5`)
- Animated in `syncFrame()`: vertical bob (sine wave) + Y-axis spin
- Auto-removed when collected (detected by `body.space === null`)

## Interactive Physics Objects

### Buoys
Built via `buildBuoys(buoyBodies)`:
- Voxel group: red/white body with yellow ring at waterline
- Rounded shape (corners clipped), tip at top
- Colors: `RED` (0xcc2222), `WHITE` (0xeeeeee), `RING` (0xffcc00)
- Synced from physics body position + rotation each frame

### Boulders
Built via `buildBoulders(boulderBodies)`:
- Roughly spherical voxel group with randomized colors
- Colors: `ROCK` grays (0x555566–0x778888) with `MOSS` patches (0x556644)
- Per-boulder seeded RNG for unique appearance
- Synced from physics body position + rotation each frame

### Rafts
Built via `buildRafts(raftBodies)`:
- Flat wooden plank deck (~30 voxels wide, 2 layers thick)
- Rope bindings across the deck, raised edge rails
- Colors: `PLANK` browns (0x6B4914–0xA07828), `ROPE` (0x99884C)
- Synced from physics body position + rotation each frame

### Floating Logs
Built via `buildFloatingLogs(floatingLogBodies)`:
- Natural driftwood appearance — cylindrical log shape (~11 voxels long, ~3 radius)
- Colors: `BARK` browns (0x4A3218–0x8B6B3A), occasional `MOSS` patches (0x4A6B3A), `INNER` wood visible at ends (0xA08050)
- Tapered ends, stub branches for detail
- Synced from physics body position + rotation each frame

### Swinging Anchors
Built via `buildSwingingAnchors(anchorData)`:
- Classic nautical anchor shape — vertical shank, cross arm (fluke bar), curved fluke tips, ring at top
- Chain links rendered as voxels from anchor ring upward to pivot point
- Colors: `METAL` grays (0x3A3A4A–0x6A6A7A), `RUST` (0x7A4A2A), `CHAIN` (0x6A6A7A)
- Pivot marker (bracket) at top of chain
- Position synced from pendulum physics each frame (kinematic body)

### Bottles
Built via `buildBottles(bottleData)`:
- Small corked bottle shape (~3 wide × 7 tall voxels)
- Glass body with emissive glow (`GLASS` 0x88ccaa, `GLOW` 0xaaeedd)
- Cork at top, tiny scroll (paper) visible inside
- Gentle bob animation in syncFrame
- `spawnBottleCollect(x, y)` spawns sparkle particle burst on collection

### Hint Stones
Built via `buildHintStones(hintData)`:
- Small stone tablet (~5×5×3 voxels) with carved symbols on front face
- Colors: `STONE` grays (0x5a6a5a–0x8a9a8a), `MOSS` accents (0x4a7a3a), `SYMBOL` highlights (0xaaccbb)
- Seaweed tufts on top for natural look
- Static position — no animation needed

## Bubbles

### Player/Piranha Bubbles
- Spawned when player fish moves fast; also spawned for piranhas (at lower frequency)
- `BoxGeometry` cubes for voxel-consistent look
- Rise with upward velocity + slight horizontal drift
- Fade opacity over 1.5–3.5 second lifetime
- Fade out and are removed when reaching the water surface (no bubbles above water)
- Use `AdditiveBlending` for a glowing look
- Removed from scene when expired or surfaced

### Splash Particles
- `spawnSplash(x, speed)` — spawns 10–25 larger particles at the water surface
- Triggered on both **entering** and **leaving** water (jump out + dive back in)
- Particle count and horizontal spread scale with fish speed
- Larger cubes (2–6px) with higher opacity (0.5–0.8) and brighter color (`0xcceeff`)
- Horizontal velocity (`vx`) spreads particles outward with 0.96/frame drag
- Short lifetime (0.6–1.4s) for a quick burst effect
- Also spawns airborne splash droplets and a surface disturbance (see below)

### Splash Droplets (Airborne)
- 6–18 small cubes (`BoxGeometry`, 1.5–4px) launched **above** the water surface
- Fly upward with initial velocity (60–140+ px/s) and spread horizontally
- Subject to gravity (220 px/s²) — arc up then fall back down
- Higher opacity (0.6–0.9) and brighter color (`0xddeeff`) for visible spray
- Removed when they fall back below the water surface or lifetime expires (0.8–1.4s)
- Stored in `splashDroplets[]`, separate from the underwater `bubbles[]`

### Surface Disturbances
- `_surfaceDisturbances[]` — ripple effects on the water surface mesh triggered by splash events
- Each disturbance stores: `x` (impact position), `amplitude` (6 + speed×0.04 px), `age`, `decay` (1.8–2.0s), `spread` (starts 40px, grows at 120px/s)
- Ripple math: outward-traveling sine wave (`sin(dist×0.12 - age×8)`) with exponential distance falloff and quadratic lifetime fade
- Composited additively onto the base wave animation in the vertex loop
- Auto-removed when `age ≥ decay`

### Rock Debris Particles (Breakable Walls)
- `spawnBreakableWallDebris(x, y)` — spawns 24 cubic rock fragments
- Gray stone colors (5 shades from `0x4a4a5a` to `0x8a8a9a`)
- Box geometries (2–8px), random rotation on all axes
- Wider spread (±28px) and faster lateral velocity (±150 px/s) than boulder break
- Uses `_isRock: true` flag for gravity-affected bubble update (no surface fade)
- Lifetime 0.9–1.8s with opacity fade

### Ambient Bubbles
- `AMBIENT_BUBBLE_COUNT` (30) small cubes (`BoxGeometry`) scattered throughout the underwater area
- Slowly rise (8–23 px/s) with horizontal sine-wave wobble
- Low opacity (0.08–0.18) with `AdditiveBlending` for subtle atmosphere
- Respawn at the bottom of the water column when reaching the surface

## Lighting Setup

| Type        | Color      | Intensity | Role                             |
|-------------|------------|-----------|----------------------------------|
| Ambient     | `0x88aacc` | 1.2       | Bright blue base fill            |
| Directional | `0xffeedd` | 1.4       | Warm sun from right, casts shadows (PCFSoft, 2048 shadow map) |
| Fill        | `0x88bbdd` | 0.6       | Cool side fill from left-front   |
| Uplight     | `0xccaa77` | 0.3       | Warm bounce from sand floor      |
| Hemisphere  | `0x88ccff` / `0x886644` | 0.4 | Natural sky/ground coloring |
| Fog         | `FogExp2`  | 0.0006    | Exponential depth fade (reduced) |

## Skill Visual Effects

### Stun Pulse Ring
- Expanding purple ring (`0x8833cc`) triggered by `spawnStunPulseRing(x, y)`
- `RingGeometry` that scales outward from 0 to `STUN_PULSE_RADIUS` (80px)
- `AdditiveBlending`, fades opacity as it expands
- Lifetime ~0.5s, auto-removed after animation completes

### Stun Dizzy Stars
- Small rotating star particles above stunned enemies
- Spawned per enemy when stun is applied, orbit in a circle above the enemy's head
- Yellow `0xffdd44` with emissive glow
- Removed when enemy's `_stunTimer` expires

### Stun Wobble
- Stunned enemies get sinusoidal rotation wobble on Z axis
- Applied in `syncFrame()` when enemy body has `_stunTimer > 0`

### Speed Surge Trail
- Green trail particles (`0x44ff88`) spawned behind the player during Speed Surge
- Small cubes with `AdditiveBlending`, short lifetime (~0.5s)
- Emitted every few frames while `fishController.speedSurgeActive` is true
- Fade out and are removed on expiry

## Key Method: `syncFrame()`

Called every frame after physics step. Updates:
1. Player fish group position/rotation from nape body
2. Tail wag angle (frequency = 8 + speed×0.05, amplitude 0.3–0.7 rad)
3. Piranha positions from their nape bodies; hide dead piranhas (body.space === null)
4. Shark positions, 3D flip, tail wag (faster when chasing), bubbles
5. Pufferfish positions, wobble rotation, scale pulse animation
6. Crab positions, 3D flip, scuttle bob animation
7. Toxic fish positions, 3D flip, tail wag
8. Armored fish positions, 3D flip, tail wag
9. Spitting coral positions, hide dead
10. Switch pad press animation, emissive glow pulse when active
11. Gate pivot rotation animation (swing open/close)
12. Projectile positions, spin rotation, emissive pulse, remove expired
9. Pearl bob + spin animation; remove collected pearls (body.space === null)
10. Buoy, boulder, raft, floating log positions + rotations from physics bodies
10b. Swinging anchor positions from pendulum physics
11. Bubble positions, opacity, and lifetime (including horizontal `vx` drag for splash particles)
7. Surface disturbance aging, spread growth, and cleanup
8. God ray sway and opacity pulsing
9. Water surface wave vertex animation + texture scrolling + disturbance ripples
10. Surface sparkle flash pattern
11. Background wave vertex animation
12. Ambient bubble rise, wobble, and respawn
13. Underwater current streak drift, wave wobble, opacity pulse, and edge wrapping
