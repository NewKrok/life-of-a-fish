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
- **Basic enemy**: Patrol back and forth between defined bounds (±80px), sensor kills player
- **Shark** (`sharkTag`): Patrols ±100px, switches to chase mode when player within 150px, stops chasing at 220px. Chase speed 110 px/s vs patrol 50 px/s. Kills player on contact.
- **Pufferfish** (`pufferfishTag`): Moves vertically up/down (±60px range, 30 px/s). Circle shape (r=14). Kills player on contact.
- **Crab** (`crabTag`): Walks on ground, patrols ±50px at 25 px/s. Does NOT kill player — pushes them away (840 px/s impulse) from 2x sensor range (44×28 box).
- **Toxic fish** (`toxicFishTag`): Slow patrol ±60px. Shoots poison projectiles at player within 180px range, 2s cooldown. Projectiles are kinematic circles that kill on contact, expire after 2.5s.
- All enemies are kinematic = no physics response, position updated directly each frame
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

## CbType System

Each entity class has a named `CbType` for collision filtering:

- `playerTag`, `enemyTag`, `pearlTag`, `hazardTag`
- `buoyTag`, `boulderTag`, `raftTag`
- `sharkTag`, `pufferfishTag`, `crabTag`, `toxicFishTag`, `projectileTag`

`InteractionListener` callbacks handle:
- Player ↔ Pearl → collect pearl, destroy body
- Player ↔ Enemy → respawn player
- Player ↔ Hazard → respawn player
- Player ↔ Shark → respawn player
- Player ↔ Pufferfish → respawn player
- Player ↔ Crab → push player away (no kill)
- Player ↔ Projectile → respawn player, destroy projectile
- Boulder ↔ Enemy (sensor) → kill enemy, remove from space
- Boulder ↔ Shark (sensor) → kill shark, remove from space
- Boulder ↔ Pufferfish (sensor) → kill pufferfish, remove from space
- Boulder ↔ Crab (sensor) → kill crab, remove from space
- Boulder ↔ Toxic fish (sensor) → kill toxic fish, remove from space
- Boulder ↔ Player (collision) → respawn player if boulder speed > 80 px/s

## Greedy Rectangle Merging Algorithm (level-data.js)

This optimization reduces hundreds of individual tile bodies into a few dozen merged rectangles:

1. Create a visited grid (same size as tile map)
2. For each unvisited solid tile (stone/sand/coral):
   a. Extend right as far as possible while same tile type and unvisited
   b. Try to extend the entire horizontal run downward row by row
   c. Mark all covered tiles as visited
   d. Emit one rectangle body for the merged region
3. Result: dramatically fewer physics bodies → better nape-js performance
