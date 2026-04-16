import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock nape-js Vec2 for isolated testing ──
vi.mock('@newkrok/nape-js', () => ({
  Vec2: class Vec2 {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  },
}));

// Import after mock so the module sees the mocked Vec2
const { FishController } = await import('../fish-controller.js');

// ── Helpers ──

function makeMockBody() {
  return {
    position: { x: 100, y: 200 },
    velocity: { x: 0, y: 0 },
    rotation: 0,
    angularVel: 0,
  };
}

function makeMockSpace() {
  return {
    arbiters: {
      zpp_gl: () => 0,
      at: () => null,
    },
  };
}

function makeMockCC() {
  return { update: () => null };
}

function makeController() {
  const body = makeMockBody();
  const space = makeMockSpace();
  const cc = makeMockCC();
  return new FishController(space, body, cc, 200, null);
}

const noInput = { dirX: 0, dirY: 0, dash: false, grab: false, stunPulse: false, speedSurge: false };

// ── Tests ──

describe('FishController skill constants', () => {
  it('exposes STUN_PULSE_RADIUS', () => {
    expect(FishController.STUN_PULSE_RADIUS).toBe(80);
  });

  it('exposes STUN_DURATION_MS', () => {
    expect(FishController.STUN_DURATION_MS).toBe(3000);
  });
});

describe('Stun Pulse', () => {
  let ctrl;

  beforeEach(() => {
    ctrl = makeController();
  });

  it('activates on stunPulse input', () => {
    ctrl.update({ ...noInput, stunPulse: true }, 128);
    const state = ctrl.getState();
    expect(state.stunPulseActive).toBe(true);
    expect(state.stunPulseCooldownPct).toBeGreaterThan(0);
  });

  it('does not activate while on cooldown', () => {
    ctrl.update({ ...noInput, stunPulse: true }, 128);
    expect(ctrl.getState().stunPulseActive).toBe(true);

    // Next frame: input again, but cooldown is active
    ctrl.update({ ...noInput, stunPulse: true }, 128);
    expect(ctrl.getState().stunPulseActive).toBe(false);
  });

  it('cooldown decreases over time', () => {
    ctrl.update({ ...noInput, stunPulse: true }, 128);
    const pct1 = ctrl.getState().stunPulseCooldownPct;

    // Simulate several frames
    for (let i = 0; i < 60; i++) {
      ctrl.update(noInput, 128);
    }
    const pct2 = ctrl.getState().stunPulseCooldownPct;
    expect(pct2).toBeLessThan(pct1);
  });

  it('resets on respawn', () => {
    ctrl.update({ ...noInput, stunPulse: true }, 128);
    expect(ctrl.getState().stunPulseCooldownPct).toBeGreaterThan(0);

    ctrl.respawn(50, 150);
    expect(ctrl.getState().stunPulseCooldownPct).toBe(0);
    expect(ctrl.getState().stunPulseActive).toBe(false);
  });
});

describe('Speed Surge', () => {
  let ctrl;

  beforeEach(() => {
    ctrl = makeController();
  });

  it('activates on speedSurge input', () => {
    ctrl.update({ ...noInput, speedSurge: true }, 128);
    const state = ctrl.getState();
    expect(state.speedSurgeActive).toBe(true);
    expect(state.speedSurgeTimerPct).toBeGreaterThan(0);
    expect(state.speedSurgeCooldownPct).toBeGreaterThan(0);
  });

  it('does not activate while on cooldown', () => {
    ctrl.update({ ...noInput, speedSurge: true }, 128);
    expect(ctrl.getState().speedSurgeActive).toBe(true);

    // Next frame: try again, cooldown blocks it
    ctrl.update({ ...noInput, speedSurge: true }, 128);
    // It's still active from the first use (timer hasn't expired), but no re-trigger
    expect(ctrl.getState().speedSurgeCooldownPct).toBeGreaterThan(0);
  });

  it('duration decreases over time and deactivates', () => {
    ctrl.update({ ...noInput, speedSurge: true }, 128);
    expect(ctrl.getState().speedSurgeActive).toBe(true);

    // Run many frames to exhaust the 4s duration (at 60fps = 240 frames)
    for (let i = 0; i < 250; i++) {
      ctrl.update(noInput, 128);
    }
    expect(ctrl.getState().speedSurgeActive).toBe(false);
    expect(ctrl.getState().speedSurgeTimerPct).toBe(0);
  });

  it('resets on respawn', () => {
    ctrl.update({ ...noInput, speedSurge: true }, 128);
    expect(ctrl.getState().speedSurgeActive).toBe(true);

    ctrl.respawn(50, 150);
    expect(ctrl.getState().speedSurgeActive).toBe(false);
    expect(ctrl.getState().speedSurgeCooldownPct).toBe(0);
    expect(ctrl.getState().speedSurgeTimerPct).toBe(0);
  });
});

describe('getState includes skill fields', () => {
  it('returns all skill state properties', () => {
    const ctrl = makeController();
    const state = ctrl.getState();
    expect(state).toHaveProperty('stunPulseActive');
    expect(state).toHaveProperty('stunPulseCooldownPct');
    expect(state).toHaveProperty('speedSurgeActive');
    expect(state).toHaveProperty('speedSurgeTimerPct');
    expect(state).toHaveProperty('speedSurgeCooldownPct');
  });
});
