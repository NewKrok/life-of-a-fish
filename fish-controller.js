// ── Fish Controller ─────────────────────────────────────────────────────────
// Handles fish swimming physics, air/water transitions, and dash mechanic.
// Works with nape-js Body + CharacterController.

import { Vec2 } from "https://cdn.jsdelivr.net/npm/@newkrok/nape-js@3.26.0/dist/index.js";

// ── Constants ──
const SWIM_THRUST = 400;         // acceleration when input is held (px/s^2)
const SWIM_MAX_SPEED = 200;      // max swimming velocity (px/s)
const SWIM_DRAG = 0.92;          // per-frame velocity damping in water
const DASH_SPEED = 450;          // burst speed on dash (px/s)
const DASH_DURATION_MS = 180;    // dash lock time
const DASH_COOLDOWN_MS = 600;    // time before next dash
const SURFACE_JUMP_VY = -180;    // upward burst when jumping from surface (px/s)
const AIR_GRAVITY_MULT = 1.2;    // fish falls slightly faster in air
const AIR_HORIZONTAL_DRAG = 0.98;
const WATER_ENTRY_DAMPING = 0.85; // velocity multiplier when entering water (less damping = more momentum)
const IDLE_FLOAT_UP = -92;       // upward drift when idle in water (px/s²)
const ROTATION_LERP = 0.12;      // how fast fish rotates toward velocity direction
const HYSTERESIS = 8;            // px above/below surface to prevent flicker
const ENTRY_MOMENTUM_FRAMES = 50; // frames to gradually blend from entry momentum to normal swim
const ENTRY_DRAG_START = 0.998;  // near-zero drag right after entering water
const ENTRY_SINK_FORCE = 350;    // downward force to counteract buoyancy during entry (px/s²)
const DT = 1 / 60;

export class FishController {
  constructor(space, body, cc, gravityY) {
    this.space = space;
    this.body = body;
    this.cc = cc;
    this.gravityY = gravityY;

    // State
    this.inWater = false;
    this.wasInWater = false;
    this.dashing = false;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.dashDirX = 1;
    this.dashDirY = 0;
    this.facingRight = true;
    this.swimSpeed = 0; // magnitude of velocity for animation
    this.visualRotation = 0; // visual tilt angle (not applied to physics body)
    this.alive = true;

    // For splash detection
    this.justEnteredWater = false;
    this.justLeftWater = false;

    // Water entry momentum: counts down from ENTRY_MOMENTUM_FRAMES to 0
    this.entryMomentum = 0;

    // Knockback: external force that overrides swim control for a few frames
    this.knockbackTimer = 0;
  }

  update(input, waterSurfaceY) {
    if (!this.alive) return;

    const body = this.body;
    const vx = body.velocity.x;
    const vy = body.velocity.y;

    // ── Detect water state ──
    this.wasInWater = this.inWater;
    this.inWater = this._detectInWater();

    // Hysteresis: if near surface, keep previous state to prevent flicker
    const py = body.position.y;
    if (Math.abs(py - waterSurfaceY) < HYSTERESIS) {
      this.inWater = this.wasInWater;
    }

    this.justEnteredWater = this.inWater && !this.wasInWater;
    this.justLeftWater = !this.inWater && this.wasInWater;

    // Dampen velocity when entering water (splash) — keep most momentum
    if (this.justEnteredWater) {
      body.velocity = new Vec2(vx * WATER_ENTRY_DAMPING, vy * WATER_ENTRY_DAMPING);
      this.entryMomentum = ENTRY_MOMENTUM_FRAMES;
    }

    // Tick down entry momentum
    if (this.entryMomentum > 0) this.entryMomentum--;

    // ── Knockback timer ──
    if (this.knockbackTimer > 0) {
      this.knockbackTimer--;
      // Minimal drag so the fish actually flies away
      body.velocity = new Vec2(body.velocity.x * 0.97, body.velocity.y * 0.97);
      this.swimSpeed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
      // Tilt toward knockback direction
      const targetAngle = Math.atan2(body.velocity.y, Math.abs(body.velocity.x));
      this.visualRotation += (targetAngle - this.visualRotation) * ROTATION_LERP;
      if (Math.abs(body.velocity.x) > 5) this.facingRight = body.velocity.x > 0;
      return; // skip all swim/dash logic during knockback
    }

    // ── Dash timer ──
    this.dashCooldown = Math.max(0, this.dashCooldown - 1000 * DT);
    if (this.dashing) {
      this.dashTimer -= 1000 * DT;
      if (this.dashTimer <= 0) {
        this.dashing = false;
      }
    }

    // ── CharacterController update (for wall/ground data) ──
    let ccResult = null;
    try {
      ccResult = this.cc.update();
    } catch (_) {}

    // ── Compute new velocity ──
    let newVx, newVy;

    if (this.dashing) {
      // During dash: maintain dash direction at dash speed
      newVx = this.dashDirX * DASH_SPEED;
      newVy = this.dashDirY * DASH_SPEED;
    } else if (this.inWater) {
      // ── Swimming ──
      // Let the fluid physics (buoyancy + drag) handle floating.
      // We only add thrust from player input.
      let cvx = body.velocity.x;
      let cvy = body.velocity.y;

      // Apply thrust from input
      cvx += input.dirX * SWIM_THRUST * DT;
      cvy += input.dirY * SWIM_THRUST * DT;

      // Drag: reduced right after entering water so the fish carries momentum
      const t = this.entryMomentum > 0
        ? this.entryMomentum / ENTRY_MOMENTUM_FRAMES  // 1 → 0 over time
        : 0;
      const drag = t * ENTRY_DRAG_START + (1 - t) * SWIM_DRAG;

      // During entry momentum, push downward to counteract fluid buoyancy
      if (this.entryMomentum > 0) {
        cvy += ENTRY_SINK_FORCE * t * DT;
      }

      // Extra drag when no input (fish slows down naturally)
      if (Math.abs(input.dirX) < 0.1) cvx *= drag;
      if (Math.abs(input.dirY) < 0.1) {
        cvy *= drag;
        // Gentle upward float when idle (buoyancy) — suppress during entry momentum
        if (this.entryMomentum === 0) {
          cvy += IDLE_FLOAT_UP * DT;
        }
      }

      // Clamp to max speed — allow higher speed during entry momentum for natural sinking
      const maxSpd = this.entryMomentum > 0
        ? SWIM_MAX_SPEED + (SWIM_MAX_SPEED * 0.6) * (this.entryMomentum / ENTRY_MOMENTUM_FRAMES)
        : SWIM_MAX_SPEED;
      const speed = Math.sqrt(cvx * cvx + cvy * cvy);
      if (speed > maxSpd) {
        const scale = maxSpd / speed;
        cvx *= scale;
        cvy *= scale;
      }

      newVx = cvx;
      newVy = cvy;

      // Dash initiation
      if (input.dash && this.dashCooldown <= 0) {
        this.dashing = true;
        this.dashTimer = DASH_DURATION_MS;
        this.dashCooldown = DASH_COOLDOWN_MS;
        // Dash in input direction, or facing direction if no input
        if (Math.abs(input.dirX) > 0.1 || Math.abs(input.dirY) > 0.1) {
          const mag = Math.sqrt(input.dirX * input.dirX + input.dirY * input.dirY);
          this.dashDirX = input.dirX / mag;
          this.dashDirY = input.dirY / mag;
        } else {
          this.dashDirX = this.facingRight ? 1 : -1;
          this.dashDirY = 0;
        }
        newVx = this.dashDirX * DASH_SPEED;
        newVy = this.dashDirY * DASH_SPEED;
      }
    } else {
      // ── In air ──
      let cvx = body.velocity.x;
      let cvy = body.velocity.y;

      // Slight horizontal control in air
      cvx += input.dirX * SWIM_THRUST * 0.3 * DT;
      cvx *= AIR_HORIZONTAL_DRAG;

      // Gravity is handled by the engine; amplify slightly
      cvy += this.gravityY * (AIR_GRAVITY_MULT - 1) * DT;

      newVx = cvx;
      newVy = cvy;

      // Surface jump: if was just in water and moving upward, boost
      if (this.justLeftWater && cvy < 0) {
        newVy = Math.min(newVy, SURFACE_JUMP_VY);
      }
    }

    // Apply velocity
    body.velocity = new Vec2(newVx, newVy);

    // ── Rotation ── fish points toward velocity direction
    // Always compute angle as if facing right (positive X), flip handles mirroring
    const spd = Math.sqrt(newVx * newVx + newVy * newVy);
    this.swimSpeed = spd;

    const hasInput = Math.abs(input.dirX) > 0.1 || Math.abs(input.dirY) > 0.1;

    if (hasInput && spd > 10) {
      // Rotate toward movement direction when player is actively steering
      const absVx = Math.abs(newVx);
      const targetAngle = Math.atan2(newVy, absVx);
      let diff = targetAngle - this.visualRotation;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      this.visualRotation += diff * ROTATION_LERP;
    } else if (this.inWater) {
      // Idle in water: gently return to horizontal
      this.visualRotation += (0 - this.visualRotation) * ROTATION_LERP * 0.5;
    }

    // Facing direction (for when idle)
    if (Math.abs(newVx) > 5) {
      this.facingRight = newVx > 0;
    }
  }

  _detectInWater() {
    try {
      const arbs = this.space.arbiters;
      const arbCount = arbs.zpp_gl();
      for (let i = 0; i < arbCount; i++) {
        const a = arbs.at(i);
        if (a.isFluidArbiter() && (a.body1 === this.body || a.body2 === this.body)) {
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  knockback(vx, vy, frames = 20) {
    this.body.velocity = new Vec2(vx, vy);
    this.knockbackTimer = frames;
  }

  respawn(x, y) {
    this.body.position = new Vec2(x, y);
    this.body.velocity = new Vec2(0, 0);
    this.body.rotation = 0;
    this.dashing = false;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.alive = true;
    this.inWater = true;
    this.wasInWater = true;
  }

  getState() {
    return {
      inWater: this.inWater,
      dashing: this.dashing,
      facingRight: this.facingRight,
      swimSpeed: this.swimSpeed,
      visualRotation: this.visualRotation,
      alive: this.alive,
      justEnteredWater: this.justEnteredWater,
      justLeftWater: this.justLeftWater,
    };
  }
}
