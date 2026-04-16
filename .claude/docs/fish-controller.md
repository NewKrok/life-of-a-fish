# FishController — Player Movement System

The player fish has two distinct movement modes (water vs air), a dash ability, and two active skills ("Gifts of the Ocean"). All values are tuned for game feel, not realism.

## Movement Constants

| Constant               | Value   | Context                                   |
|------------------------|---------|-------------------------------------------|
| `SWIM_THRUST`          | 400     | px/s² in water                            |
| `SWIM_MAX_SPEED`       | 200     | px/s in water                             |
| `SWIM_DRAG`            | 0.92    | per-frame damp                            |
| `DASH_SPEED`           | 450     | px/s burst                                |
| `DASH_DURATION_MS`     | 180     | ms lock time                              |
| `DASH_COOLDOWN_MS`     | 600     | ms before next                            |
| `SURFACE_JUMP_VY`      | -180    | px/s upward (gentle leap)                 |
| `WATER_ENTRY_DAMPING`  | 0.85    | velocity kept on water entry              |
| `ENTRY_MOMENTUM_FRAMES`| 50      | frames of reduced drag after water entry  |
| `ENTRY_DRAG_START`     | 0.998   | drag at moment of water entry             |
| `ENTRY_SINK_FORCE`     | 350     | px/s² downward to counteract buoyancy     |
| `ROTATION_LERP`        | 0.12    | per-frame                                 |

## Skill Constants

| Constant                    | Value   | Context                              |
|-----------------------------|---------|--------------------------------------|
| `STUN_PULSE_COOLDOWN_MS`   | 20000   | 20s cooldown between pulses          |
| `STUN_PULSE_RADIUS`        | 80      | px AoE radius                        |
| `STUN_DURATION_MS`         | 3000    | 3s enemy freeze duration             |
| `SPEED_SURGE_COOLDOWN_MS`  | 25000   | 25s cooldown between surges          |
| `SPEED_SURGE_DURATION_MS`  | 4000    | 4s sprint boost duration             |
| `SPEED_SURGE_SPEED_MULT`   | 1.8     | max speed multiplier                 |
| `SPEED_SURGE_THRUST_MULT`  | 1.6     | thrust multiplier                    |

## State Machine

```
┌──────────┐   enter water   ┌──────────┐
│  IN AIR  │ ──────────────> │ SWIMMING │
│ (gravity)│ <────────────── │ (thrust) │
└──────────┘   leave water   └──────────┘
      │                            │
      │         dash input         │
      └──────────┐  ┌─────────────┘
                 ▼  ▼
              ┌────────┐
              │ DASHING│  (180ms, ignores input)
              └────────┘
```

### Water Detection

Uses nape-js fluid arbiters on the player body. Hysteresis zone of ±8px near water surface prevents flickering between states.

### Dash Mechanic

- Triggered by space/touch dash button
- Only available in water when cooldown is 0
- Locks movement for `DASH_DURATION_MS`, then returns to swimming
- Applies `DASH_SPEED` in the current facing direction
- 600ms cooldown prevents spam

### Surface Jump

When the fish leaves water (transition `inWater → !inWater`), an upward velocity boost of `SURFACE_JUMP_VY` (-180 px/s) is applied — a gentle "dolphin leap" effect.

### Water Re-entry Momentum

When the fish falls back into water, it keeps most of its velocity (`WATER_ENTRY_DAMPING = 0.85`) and enters a momentum phase lasting `ENTRY_MOMENTUM_FRAMES` (50 frames ≈ 0.83s). During this phase:

- Drag is interpolated from `ENTRY_DRAG_START` (0.998, nearly frictionless) down to `SWIM_DRAG` (0.92)
- `ENTRY_SINK_FORCE` (350 px/s²) pushes the fish downward, fading with momentum `t`, to counteract nape-js fluid buoyancy
- Max speed limit is temporarily raised by up to 60% so the fish can sink deeper
- Buoyancy (`IDLE_FLOAT_UP`) is suppressed so the fish doesn't immediately float back up

This creates a natural arc: the fish leaps out, falls back in, sinks to a natural depth, then gradually returns to normal swimming drag.

### Respawn

`respawn(x, y)` teleports the body to the given position with zero velocity. All skill cooldowns and timers are also reset. Called when touching hazards or enemies.

## Skills — "Gifts of the Ocean"

Two active skills managed by FishController. Available from the start for testing; will be story-gated per world in the future.

### Stun Pulse (Q / touch STUN)

- Activated by `input.stunPulse` flag when `stunPulseCooldown <= 0`
- Sets `stunPulseActive = true` for one frame (used by game.js for AoE check)
- `stunPulseCooldown` starts at 20000ms, decrements each frame
- **game.js** iterates all enemy bodies within `STUN_PULSE_RADIUS` (80px) of the player and sets `_stunTimer = STUN_DURATION_MS` (3000ms)
- Enemies with `_stunTimer > 0` skip patrol/chase/shooting logic; velocity zeroed
- VoxelRenderer shows: expanding purple ring on pulse, dizzy star particles above stunned enemies, wobble rotation
- Static constants exposed via `FishController.STUN_PULSE_RADIUS` and `FishController.STUN_DURATION_MS`

### Speed Surge (R / touch SPEED)

- Activated by `input.speedSurge` flag when `speedSurgeCooldown <= 0`
- Sets `speedSurgeActive = true`, `speedSurgeTimer = 4000ms`, `speedSurgeCooldown = 25000ms`
- While active: `SWIM_THRUST` multiplied by 1.6×, `SWIM_MAX_SPEED` multiplied by 1.8×
- Timer decrements each frame; when expired, `speedSurgeActive = false`
- VoxelRenderer spawns green trail particles behind the fish during surge
- HUD shows duration bar under the Speed Surge skill icon
