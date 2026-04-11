# Life of a Fish

Underwater fish platformer — 2D side-scrolling game running in the browser.

## Tech Stack

- **Physics**: nape-js v3.26.0 (CDN) — rigid body, fluid simulation, collision
- **Rendering**: Three.js v0.170.0 (CDN) — WebGL with perspective camera (~22° pitch), InstancedMesh for terrain
- **Language**: Vanilla ES6+ modules, no TypeScript
- **Build**: None — plain ES modules loaded via CDN, no bundler, no npm

## Running

Serve the root directory with any static HTTP server and open `index.html`:

```bash
python -m http.server 8000
# or
npx http-server
```

## Project Structure

```
index.html            — Entry point, two canvases (WebGL + HUD overlay)
game.js               — Main game loop, physics setup, camera, collision listeners
fish-controller.js    — Player movement: swim/dash/jump states, water detection
voxel-renderer.js     — Three.js voxel rendering: terrain, fish models, bubbles, water
level-data.js         — Tile map definition (125×25), entity parsing, body merging
touch-controls.js     — Mobile virtual joystick + dash button (pointer events)
example.js            — Nape-js physics reference/demo (not used in game)
```

## Architecture

### Game Loop (game.js, 60 FPS)

1. Aggregate input (keyboard + touch)
2. Update enemy patrol AI
3. `FishController.update()` — movement, dash, water transitions
4. Clamp player to world bounds
5. `nape.Space.step()` — physics (dt=1/60, 8 velocity / 3 position iterations)
6. Camera smooth-follow player
7. `VoxelRenderer.syncFrame()` — sync 3D meshes to physics bodies
8. Three.js render
9. HUD canvas draw (pearl count, state, depth, controls)

### Physics (nape-js)

- Terrain: solid bodies built via greedy rectangle merging from tile map
- Water: `FluidProperties` zone with density & viscosity for buoyancy
- Player: dynamic body with `CharacterController` for ground detection
- Enemies: kinematic bodies — basic (patrol), shark (patrol+chase), pufferfish (vertical), crab (ground push), toxic fish (ranged)
- Pearls / hazards: sensor shapes with `InteractionListener` callbacks
- Each entity class has its own `CbType` for collision filtering

### Rendering (Three.js)

- **Camera**: `PerspectiveCamera` with ~22° downward pitch for isometric 3D view (`CAM_FOV`, `CAM_PITCH`, `CAM_DISTANCE`, `CAM_Z_OFFSET`, `CAM_Y_OFFSET`). `getVisibleSize()` calculates visible world area at z=0.
- Terrain uses `InstancedMesh` per tile type with Minecraft-style 16x16 procedural textures (`MeshStandardMaterial`, no color tint)
- Cave background: auto-generated dark blocks behind terrain (Z offset) near solid tiles, creating visual cave depth
- Ground plane lies flat in XZ, extends 600px in Z depth, uses sandy/dirt Minecraft-style texture
- Fish models are voxel groups — body, eye, fins, animated tail (`MeshStandardMaterial`)
- Pearls are gold spheres with emissive glow, animated bob + spin, auto-removed on collect
- Water is translucent box with animated surface line
- Bubbles are sprite particles with velocity and fade
- Lighting: ambient + directional + fill + uplight + hemisphere + fog

### Level Format (level-data.js)

Tile map is a string grid (125 cols × 25 rows, 32px tiles):

| Char | Meaning     | Tile ID |
|------|-------------|---------|
| `.`  | Empty       | 0       |
| `#`  | Stone       | 1       |
| `s`  | Sand        | 2       |
| `c`  | Coral       | 3       |
| `x`  | Hazard      | 4       |
| `p`  | Pearl       | 5       |
| `e`  | Enemy       | 6       |
| `@`  | Player spawn| 7       |
| `d`  | Seagrass    | 8       |
| `B`  | Buoy        | 9       |
| `R`  | Boulder     | 10      |
| `T`  | Raft        | 11      |
| `S`  | Shark       | 12      |
| `U`  | Pufferfish  | 13      |
| `C`  | Crab        | 14      |
| `F`  | Toxic Fish  | 15      |

Water surface is at row 4 (128px).

## Detailed Documentation

Deep-dive docs live in `.claude/docs/`. Refer to these when working on the relevant subsystem:

- [fish-controller.md](.claude/docs/fish-controller.md) — Player movement states, tuning constants, dash/jump mechanics, water detection
- [voxel-renderer.md](.claude/docs/voxel-renderer.md) — Three.js rendering: terrain instancing, fish voxel models, water/bubble animation, lighting
- [nape-physics-setup.md](.claude/docs/nape-physics-setup.md) — Physics space config, body types, CbType collision system, greedy rectangle merging

**After completing a task**, check whether the changes affect any of these docs and update them to stay in sync with the code.

## Conventions

- **Constants**: `SCREAMING_SNAKE_CASE` with units in comments (`px/s`, `px/s²`, `ms`)
- **Variables/functions**: `camelCase`
- **Classes**: `PascalCase` — one class per file
- **Private methods**: underscore prefix (`_detectInWater`)
- **Section markers**: `// ── Section Name ──`
- **Physics units**: pixels for position, px/s for velocity, px/s² for acceleration
- **All assets are procedural** — no external images, textures, or audio files
- **No tests** — prototype/demo project
