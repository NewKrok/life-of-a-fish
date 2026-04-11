# FishController — Player Movement System

The player fish has two distinct movement modes (water vs air) and a dash ability. All values are tuned for game feel, not realism.

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

`respawn(x, y)` teleports the body to the given position with zero velocity. Called when touching hazards or enemies.
