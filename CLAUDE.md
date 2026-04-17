# Life of a Fish

Underwater fish platformer — 2D side-scrolling game running in the browser.

## Core Design Principle — Underwater Movement

The game is almost entirely underwater. The fish swims freely in all directions — no ground-walking, no jumping onto platforms. "Standing on" things is meaningless underwater. Entities are obstacles/tools to interact with while swimming (push, dodge, block), not platforms to ride. The only exception is the brief dolphin-leap arc when the fish jumps out of the water, but even that doesn't turn the game into a classic platformer.

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
fish-controller.js    — Player movement: swim/dash/jump states, skills (stun/speed), water detection
voxel-renderer.js     — Three.js voxel rendering: terrain, fish models, bubbles, water
level-data.js         — Tile map definition (125×25), entity parsing, body merging
level-editor.js       — In-game level editor (F4): tile palette, entity placement, patrol editing
touch-controls.js     — Mobile virtual joystick + dash button (pointer events)
menu-scene.js         — Main menu background: aquarium scene with AI fish, camera pan
menu-level-data.js    — Dedicated tile map for menu aquarium (60×25)
example.js            — Nape-js physics reference/demo (not used in game)
```

## Architecture

### Menu System (menu-scene.js)

App starts in menu state. `MenuScene` creates its own Three.js scene, physics space, and VoxelRenderer to render a dedicated aquarium level as the menu background. AI fish patrol around creating a living aquarium effect.

- **States**: `menu` | `game` | `aquarium` | `settings` | `about`
- **Start Game**: stops menu scene, initializes and starts the game loop
- **Aquarium**: hides menu UI, enables slow camera pan across the level, shows close (×) button
- **Settings / About**: placeholder panels overlaid on the menu background

### Level Editor (level-editor.js)

In-game editor activated with **F4**. Works in both menu and game states. Pauses physics/AI while active. Camera switches to flat top-down view (no pitch) with viewport/scissor rendering offset by sidebar width.

- **Left sidebar** (216px): Unity-style grid of 60×60 square preview cells with collapsible categories (Tools, Terrain, Items, Enemies, Keys, Chests). 3D preview thumbnails generated from codex-renderer + per-color key/chest variants. Large preview area at top shows selected item.
- **Tools**: Erase (clear tile/entity) and Move (drag entities to new positions, snaps to grid)
- **Free camera**: WASD/Arrows to pan, Shift for fast scroll, right-click drag to pan, two-finger pan on mobile
- **3D ghost cursor**: selected entity/terrain shown as 50% opacity 3D model at cursor grid position
- **Placement**: click to place selected tile/entity, hold to paint terrain
- **Deletion**: double-click to remove entity or erase terrain tile
- **Patrol editing**: enemies show patrol range lines with draggable min/max handles, snapped to tile centers
- **Grid overlay**: toggle with G key
- **Export**: Ctrl+C copies LEVEL_STRINGS + patrol data to clipboard
- **Entity overlay**: colored markers with labels for all entities (pearls, enemies, spawn, etc.)
- **Mobile**: touch support for sidebar scroll/tap, world placement, double-tap delete, two-finger camera pan

### Game Loop (game.js, 60 FPS)

1. Aggregate input (keyboard + touch, including skill keys Q/R)
2. Update enemy patrol AI (skip stunned enemies)
3. `FishController.update()` — movement, dash, skills (stun pulse, speed surge), water transitions
4. Stun Pulse AoE check + Speed Surge SFX trigger
5. Clamp player to world bounds
6. `nape.Space.step()` — physics (dt=1/60, 8 velocity / 3 position iterations)
7. Camera smooth-follow player
8. `VoxelRenderer.syncFrame()` — sync 3D meshes to physics bodies, stun wobble, speed trail
9. Three.js render
10. HUD canvas draw (pearl count, skill cooldowns, dash bar, controls)

### Physics (nape-js)

- Terrain: solid bodies built via greedy rectangle merging from tile map
- Water: `FluidProperties` zone with density & viscosity for buoyancy
- Player: dynamic body with `CharacterController` for ground detection
- Enemies: kinematic bodies — piranha (patrol, killable by dash), shark (patrol+chase), pufferfish (vertical), crab (ground push), toxic fish (ranged), spitting coral (fixed, fan projectiles)
- Pearls / hazards: sensor shapes with `InteractionListener` callbacks
- Keys: dynamic bodies like boulders, carriable/throwable, no enemy damage
- Chests: static sensor bodies, opened by matching-color key collision
- Crates: dynamic bodies (float/roll in water), destroyed by dashing, wood plank particles, ~30% pearl drop
- Switches: static sensor bodies, 3 types: toggle (one-shot, stays open), pressure (open while weight on it), timed (5s then closes). Activated by player/boulder/key/crate contact
- Gates: kinematic bodies (2 tiles tall, 1 tile wide), linked to switches by group ID, swing open sideways around left-edge hinge
- Floating logs: dynamic bodies, float in water, pushable by player/objects, can activate pressure switches
- Swinging anchors: kinematic bodies, pendulum physics from ceiling pivot point, configurable chain length via `anchorChainLengths` metadata
- Bottle messages: static sensor bodies, collectible (disappear on contact), show text overlay
- Hint stones: static sensor bodies, permanent, show text when player is within proximity range (~48px)
- Giant Crab Boss: kinematic body with HP counter + state machine (patrol → windup → charge), tagged `bossCrabTag`. Spawns airborne rock projectiles tagged `bossRockTag` that arc with gravity and kill the player on contact. Thrown boulders decrement boss HP; invulnerability window between hits
- Each entity class has its own `CbType` for collision filtering

### Skills — "Gifts of the Ocean" (fish-controller.js + game.js)

Two active skills, available from the start for testing (will be story-gated per world later):

| Skill | Key | Duration | Cooldown | Effect |
|-------|-----|----------|----------|--------|
| Stun Pulse | Q / touch | instant | 20s | 80px AoE stun, enemies frozen 3s |
| Speed Surge | R / touch | 4s | 25s | 1.8× max speed, 1.6× thrust |

- **FishController** manages all skill state: cooldowns, timers, activation flags
- **game.js** handles Stun Pulse AoE (finds enemies within radius, sets `_stunTimer` on bodies) and SFX triggers
- Enemy patrol loops skip movement when `_stunTimer > 0` (velocity zeroed, no shooting, shark chase cancelled)
- **VoxelRenderer** provides visual feedback: expanding purple ring on pulse, dizzy star particles on stunned enemies, green speed trail particles during surge
- **HUD** shows two skill icons (bottom-left) with cooldown sweep overlay and active glow border
- **Touch controls**: STUN and SPEED buttons above the joystick on mobile

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
| `e`  | Piranha     | 6       |
| `@`  | Player spawn| 7       |
| `d`  | Seagrass    | 8       |
| `B`  | Buoy        | 9       |
| `R`  | Boulder     | 10      |
| `T`  | Raft        | 11      |
| `S`  | Shark       | 12      |
| `U`  | Pufferfish  | 13      |
| `C`  | Crab        | 14      |
| `F`  | Toxic Fish  | 15      |
| `1`  | Key Red     | 16      |
| `2`  | Key Blue    | 17      |
| `3`  | Key Green   | 18      |
| `4`  | Key Yellow  | 19      |
| `5`  | Key Purple  | 20      |
| `a`  | Chest Red   | 21      |
| `b`  | Chest Blue  | 22      |
| `g`  | Chest Green | 23      |
| `y`  | Chest Yellow| 24      |
| `q`  | Chest Purple| 25      |
| `W`  | Crate       | 26      |
| `K`  | Breakable Wall | 27   |
| `A`  | Armored Fish | 28     |
| `P`  | Spitting Coral | 29   |
| `V`  | Toggle Switch | 30    |
| `N`  | Pressure Switch | 31  |
| `O`  | Timed Switch | 32     |
| `G`  | Gate         | 33     |
| `L`  | Floating Log | 34     |
| `H`  | Swinging Anchor | 35  |
| `I`  | Bottle Message | 36   |
| `J`  | Hint Stone     | 37   |
| `M`  | Giant Crab Boss | 38  |

Keys are carriable/throwable like boulders but deal no damage. Throwing a key at its matching-color chest opens the chest with a particle effect and spawns a pearl. Chest pearls are included in `TOTAL_PEARLS` from level start.

Switches and gates are linked by group IDs stored in `switchGateGroups` metadata per level. Toggle switches flip on player contact. Pressure switches stay active while a boulder/key rests on them. Timed switches activate for 5s then auto-close. Gates are 2-tile-tall metal grates that swing open around a top hinge.

Floating logs are dynamic bodies that float in water and can be pushed. Swinging anchors hang from ceiling pivot points on chains and swing as pendulums. Chain length is configurable via `anchorChainLengths` metadata per level (default: 96px = 3 tiles). The anchor tile position represents the pivot point; the anchor body swings below.

Bottle messages are collectible — swim into them to read the text, then the bottle disappears. Hint stones are permanent — swim close to read, text disappears when you leave. Both store custom text via level metadata (`bottleMessages`, `hintStones` arrays with `{ row, col, text }`). In the editor, Shift+click on a placed bottle/hint stone opens a text prompt.

Giant Crab bosses are the world 1 boss. A level flagged `bossLevel: true` (with `levelGoal: 'boss'`) wins when every boss on it is defeated — the pearl-based victory check is bypassed. Each boss has 5 HP, patrols slowly, periodically winds up and charges (strong knockback on contact — no direct damage), and lobs rocks in parabolic arcs (rocks kill on hit). Boulders thrown at the boss decrement HP; there's a short invulnerability window between hits. HP bar replaces the pearl progress bar on boss levels.

Water surface is at row 4 (128px).

## Detailed Documentation

Deep-dive docs live in `.claude/docs/`. Refer to these when working on the relevant subsystem:

- [game-design.md](.claude/docs/game-design.md) — Full game design document: "The Call of the Deep" story, 5-world structure, new mechanics, enemies, skills, bosses, monetization
- [fish-controller.md](.claude/docs/fish-controller.md) — Player movement states, tuning constants, dash/jump mechanics, water detection
- [voxel-renderer.md](.claude/docs/voxel-renderer.md) — Three.js rendering: terrain instancing, fish voxel models, water/bubble animation, lighting
- [nape-physics-setup.md](.claude/docs/nape-physics-setup.md) — Physics space config, body types, CbType collision system, greedy rectangle merging
- [workflow.md](.claude/docs/workflow.md) — **MANDATORY workflow for roadmap items** — summarize, implement, test, document, push

**When the user requests a roadmap item by number (e.g. "#3"), MUST follow the workflow in [workflow.md](.claude/docs/workflow.md) before writing any code.**

**After completing a task**, check whether the changes affect any of these docs and update them to stay in sync with the code.

**Codex is mandatory for every new entity/mechanic.** Three integration points: `CODEX_DATA` in `game.js`, i18n entries in `locales/en.json` + `locales/hu.json` (`codex.<key>.*`), and preview in `codex-renderer.js`. See [workflow.md](.claude/docs/workflow.md) step 2b.

## Conventions

- **Constants**: `SCREAMING_SNAKE_CASE` with units in comments (`px/s`, `px/s²`, `ms`)
- **Variables/functions**: `camelCase`
- **Classes**: `PascalCase` — one class per file
- **Private methods**: underscore prefix (`_detectInWater`)
- **Section markers**: `// ── Section Name ──`
- **Physics units**: pixels for position, px/s for velocity, px/s² for acceleration
- **All assets are procedural** — no external images, textures, or audio files
- **Tests**: Vitest — `npx vitest run`. Test files in `tests/`. Logic-only (no DOM/renderer mocking)
