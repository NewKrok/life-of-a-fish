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
- Patrol back and forth between defined bounds
- Position updated directly each frame (kinematic = no physics response)
- Have sensor shapes for player contact detection

### Pearls (static, sensor)
- Sensor shapes — no physical response, only trigger callbacks
- `InteractionListener` fires on overlap with player CbType
- Pearl body is destroyed on collection

### Hazards (static, sensor)
- Same sensor pattern as pearls
- Triggers player respawn on contact

## CbType System

Each entity class has a named `CbType` for collision filtering:

- Player CbType
- Enemy CbType
- Pearl CbType
- Hazard CbType

`InteractionListener` callbacks handle:
- Player ↔ Pearl → collect pearl, destroy body
- Player ↔ Enemy → respawn player
- Player ↔ Hazard → respawn player

## Greedy Rectangle Merging Algorithm (level-data.js)

This optimization reduces hundreds of individual tile bodies into a few dozen merged rectangles:

1. Create a visited grid (same size as tile map)
2. For each unvisited solid tile (stone/sand/coral):
   a. Extend right as far as possible while same tile type and unvisited
   b. Try to extend the entire horizontal run downward row by row
   c. Mark all covered tiles as visited
   d. Emit one rectangle body for the merged region
3. Result: dramatically fewer physics bodies → better nape-js performance
