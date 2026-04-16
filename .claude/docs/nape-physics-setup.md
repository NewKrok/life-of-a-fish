# Nape-js Physics Setup

The game uses nape-js for all collision detection, rigid body dynamics, and fluid simulation. Physics setup is in `game.js`.

## Space Configuration

- Gravity: `(0, 200)` — downward 200 px/s²
- Step: `dt = 1/60`, 8 velocity iterations, 3 position iterations

## Body Types

### Terrain (static)
- Built by `getMergedSolidBodies()` in level-data.js
- Greedy rectangle merging: scans row-by-row, merges horizontal runs, extends downward
- Produces fewer, larger rectangles instead of one body per tile (performance optimization)
- Material: high friction, zero elasticity

### Water Zone (static, fluid)
- Single large body covering the water area
- Shape has `fluidEnabled = true`
- `FluidProperties`: density and viscosity values create buoyancy + drag
- Water surface at `WATER_SURFACE_Y = 128` (row 4 × 32px tiles)

### Player (dynamic)
- Single body with `CharacterController` for ground detection
- Interacts with fluid (buoyancy in water)
- Has its own `CbType` for collision filtering

### Enemies (kinematic)
- **Piranha** (`enemyTag`): Patrol back and forth between defined bounds (±80px). Kills player on contact, but player can kill piranha by dashing into it.
- **Shark** (`sharkTag`): Patrols ±100px, switches to chase mode when player within 150px, stops chasing at 220px. Chase speed 110 px/s vs patrol 50 px/s. Kills player on contact.
- **Pufferfish** (`pufferfishTag`): Moves vertically up/down (±60px range, 30 px/s). Circle shape (r=14). Kills player on contact.
- **Crab** (`crabTag`): Walks on ground, patrols ±50px at 25 px/s. Does NOT kill player — pushes them away (840 px/s impulse) from 2x sensor range (44×28 box).
- **Toxic fish** (`toxicFishTag`): Slow patrol ±60px. Shoots poison projectiles at player within 180px range, 2s cooldown. Projectiles are kinematic circles that kill on contact, expire after 2.5s.
- **Armored fish** (`armoredFishTag`): Point-to-point patrol (supports diagonal), 50 px/s. Dash bounces off with knockback (300 px/s, cancels dash). Killed only by boulder throw. Capsule shape (26×14).
- **Spitting coral** (`spittingCoralTag`): Fixed on ground (static body), does not move. Fires 3 projectiles upward in fan pattern (left-up, straight up, right-up, 30° spread) every 3s. Projectiles are slower (100 px/s), expire after 2s. Killed by boulder throw, kills player on contact. Box shape (20×24).
- All enemies are kinematic (except spitting coral which is static) — position updated directly each frame
- Have sensor shapes for player contact detection

### Pearls (static, sensor)
- Sensor shapes — no physical response, only trigger callbacks
- `InteractionListener` fires on overlap with player CbType
- Pearl body is destroyed on collection

### Hazards (static, sensor)
- Same sensor pattern as pearls
- Triggers player respawn on contact

### Buoys (dynamic)
- Floating objects on water surface
- Low density (0.4) so nape-js fluid physics pushes them up naturally
- Player can push them around; extra damping applied each frame to prevent endless bouncing
- Rotation enabled — tilts when pushed

### Boulders (dynamic)
- Heavy underwater rocks (density 8) that the player can slowly push
- Rotation enabled — rolls when pushed off a ledge
- Has `boulderTag` CbType for collision interactions with enemies and player
- Boulder ↔ Enemy (sensor interaction) → kills enemy (removes from space)
- Boulder ↔ Player (collision) → kills player only if boulder speed > 80 px/s

### Rafts (dynamic)
- Floating wooden platforms on water surface
- Low density (0.3) for strong buoyancy, high friction (0.5) so player can ride them
- Wider collision shape (64×10 px) — player can jump onto and stand on them
- Rotation enabled with extra angular damping (0.95/frame) so raft rocks gently
- Extra velocity damping to feel heavy and stable

### Floating Logs (dynamic)
- Dynamic bodies that float in water via fluid physics (density 0.6)
- Pushable by player and other objects (boulders, keys, crates)
- Can activate pressure switches when pushed onto them
- Wide, thin collision shape (56×14 px) — horizontal orientation
- Extra velocity/angular damping each frame (0.97) for stability
- Rotation enabled — tilts when pushed

### Swinging Anchors (kinematic, pendulum)
- Kinematic bodies — position calculated each frame via pendulum physics
- Tile position represents the **pivot point** (ceiling attachment); anchor hangs below
- Chain length configurable via `anchorChainLengths` level metadata (default: 96px = 3 tiles)
- Pendulum physics: `angAccel = -gravity/chainLength * sin(angle)`, nearly no damping (0.9995)
- Starts at 0.4 radian offset for immediate swing
- Collision shape (24×20 px) pushes player and objects in its path
- Visual model includes chain links from anchor up to pivot point

## CbType System

Each entity class has a named `CbType` for collision filtering:

- `playerTag`, `enemyTag`, `pearlTag`, `hazardTag`
- `buoyTag`, `boulderTag`, `raftTag`
- `sharkTag`, `pufferfishTag`, `crabTag`, `toxicFishTag`, `projectileTag`
- `keyTag`, `chestTag`, `crateTag`, `breakableWallTag`, `armoredFishTag`, `spittingCoralTag`
- `switchTag`, `gateTag`
- `floatingLogTag`, `swingingAnchorTag`

`InteractionListener` callbacks handle:
- Player ↔ Pearl → collect pearl, destroy body
- Player ↔ Piranha → kill piranha if dashing, else respawn player
- Player ↔ Hazard → respawn player
- Player ↔ Shark → respawn player
- Player ↔ Pufferfish → respawn player
- Player ↔ Crab → push player away (no kill)
- Player ↔ Projectile → respawn player, destroy projectile
- Boulder ↔ Piranha (sensor) → kill piranha, remove from space
- Boulder ↔ Shark (sensor) → kill shark, remove from space
- Boulder ↔ Pufferfish (sensor) → kill pufferfish, remove from space
- Boulder ↔ Crab (sensor) → kill crab, remove from space
- Boulder ↔ Toxic fish (sensor) → kill toxic fish, remove from space
- Boulder ↔ Armored fish (sensor) → kill armored fish, remove from space
- Player ↔ Armored fish → if dashing, bounce player back with knockback (300 px/s), cancel dash; else respawn player
- Player ↔ Spitting coral → respawn player
- Boulder ↔ Spitting coral (sensor) → kill coral, remove from space
- Boulder ↔ Player (collision) → respawn player if boulder speed > 80 px/s
- Player ↔ Crate → if dashing, destroy crate, wood plank particles, ~30% pearl drop
- Player ↔ Breakable Wall → if dashing, destroy wall, rock debris particles
- Key ↔ Chest → if matching color, open chest, spawn pearl
- Player/Boulder/Key/Crate ↔ Switch (BEGIN) → activate switch
- Player/Boulder/Key/Crate ↔ Switch (END) → deactivate pressure switch only
- Player/Boulder/Key ↔ Gate (PreListener) → IGNORE if gate open, ACCEPT if closed

### Switches (static, sensor)
- Static bodies with sensor shape (~0.8×0.3 tile)
- `switchTag` CbType — shared by all 3 types
- 3 types: toggle (one-shot, stays open permanently), pressure (active while player/boulder/key/crate overlaps), timed (5s countdown)
- Linked to gates by group ID (from `switchGateGroups` level metadata)
- Toggle: activates once, never deactivates
- Pressure: active while something overlaps, deactivates on END event
- Timed: activates for `TIMED_SWITCH_DURATION` (5000ms), auto-closes

### Gates (kinematic, 2 tiles tall)
- Kinematic bodies, 1 tile wide (32px) × 2 tiles tall (64px)
- Solid collision shape with `gateTag` (no separate sensor)
- Linked to switches by group ID — opens when any switch in group is active
- Open animation: `pivotGroup` rotates around left-edge hinge (Y axis, 0→π/2, swings sideways)
- PreListener on player/boulder/key checks `gate.open` to IGNORE or ACCEPT collision
- `GATE_OPEN_SPEED` = 3.0 rad/s for smooth swing animation

### Breakable Walls (static, sensor overlay)
- Static bodies with solid collision shape (32×32 px) + sensor overlay (34×34 px)
- `breakableWallTag` CbType on sensor for dash detection
- Destroyed only by player dash — rock debris particle effect
- NOT merged into terrain (individual bodies for independent destruction)
- Extracted as entities from tile data (tile ID 27, char `K`)

## Greedy Rectangle Merging Algorithm (level-data.js)

This optimization reduces hundreds of individual tile bodies into a few dozen merged rectangles:

1. Create a visited grid (same size as tile map)
2. For each unvisited solid tile (stone/sand/coral):
   a. Extend right as far as possible while same tile type and unvisited
   b. Try to extend the entire horizontal run downward row by row
   c. Mark all covered tiles as visited
   d. Emit one rectangle body for the merged region
3. Result: dramatically fewer physics bodies → better nape-js performance
