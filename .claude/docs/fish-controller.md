# FishController — Player Movement System

The player fish has two distinct movement modes (water vs air) and a dash ability. All values are tuned for game feel, not realism.

## Movement Constants

| Constant            | Value   | Context         |
|---------------------|---------|-----------------|
| `SWIM_THRUST`       | 400     | px/s² in water  |
| `SWIM_MAX_SPEED`    | 200     | px/s in water   |
| `SWIM_DRAG`         | 0.92    | per-frame damp  |
| `DASH_SPEED`        | 450     | px/s burst      |
| `DASH_DURATION_MS`  | 180     | ms lock time    |
| `DASH_COOLDOWN_MS`  | 600     | ms before next  |
| `SURFACE_JUMP_VY`   | -320    | px/s upward     |
| `ROTATION_LERP`     | 0.12    | per-frame       |

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

When the fish leaves water (transition `inWater → !inWater`), an upward velocity boost of `SURFACE_JUMP_VY` is applied — this gives a "dolphin leap" effect.

### Respawn

`respawn(x, y)` teleports the body to the given position with zero velocity. Called when touching hazards or enemies.
