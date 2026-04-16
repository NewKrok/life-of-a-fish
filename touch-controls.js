// ── Touch Controls ──────────────────────────────────────────────────────────
// Virtual joystick (left) + dash button (right) for mobile devices.
// Outputs { dirX, dirY, dash } with the same interface as keyboard input.

export class TouchControls {
  constructor() {
    this.dirX = 0;
    this.dirY = 0;
    this.dash = false;
    this.grab = false;
    this.stunPulse = false;
    this.speedSurge = false;

    this._container = document.querySelector('.touch-controls');
    this._joystickZone = document.getElementById('joystickZone');
    this._joystickInner = document.getElementById('joystickInner');
    this._dashBtn = document.getElementById('dashBtn');
    this._grabBtn = document.getElementById('grabBtn');
    this._stunBtn = document.getElementById('stunBtn');
    this._speedBtn = document.getElementById('speedBtn');

    this._joystickActive = false;
    this._joystickPointerId = null;
    this._joystickCenterX = 0;
    this._joystickCenterY = 0;
    this._maxRadius = 50; // max offset from center in px

    this._dashPointerId = null;
    this._grabPointerId = null;
    this._stunPointerId = null;
    this._speedPointerId = null;

    if (this._joystickZone) this._initJoystick();
    if (this._dashBtn) this._initDash();
    if (this._grabBtn) this._initGrab();
    if (this._stunBtn) this._initStun();
    if (this._speedBtn) this._initSpeed();
  }

  _initJoystick() {
    const zone = this._joystickZone;

    zone.addEventListener('pointerdown', (e) => {
      if (this._joystickActive) return;
      e.preventDefault();
      zone.setPointerCapture(e.pointerId);
      this._joystickActive = true;
      this._joystickPointerId = e.pointerId;

      const rect = zone.getBoundingClientRect();
      this._joystickCenterX = rect.left + rect.width / 2;
      this._joystickCenterY = rect.top + rect.height / 2;

      this._updateJoystick(e.clientX, e.clientY);
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._joystickPointerId) return;
      e.preventDefault();
      this._updateJoystick(e.clientX, e.clientY);
    });

    const endJoystick = (e) => {
      if (e.pointerId !== this._joystickPointerId) return;
      this._joystickActive = false;
      this._joystickPointerId = null;
      this.dirX = 0;
      this.dirY = 0;
      if (this._joystickInner) {
        this._joystickInner.style.transform = 'translate(-50%, -50%)';
      }
    };

    zone.addEventListener('pointerup', endJoystick);
    zone.addEventListener('pointercancel', endJoystick);
  }

  _updateJoystick(clientX, clientY) {
    let dx = clientX - this._joystickCenterX;
    let dy = clientY - this._joystickCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxR = this._maxRadius;

    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }

    // Normalize to [-1, 1]
    this.dirX = dx / maxR;
    this.dirY = dy / maxR;

    // Apply deadzone
    if (Math.abs(this.dirX) < 0.15) this.dirX = 0;
    if (Math.abs(this.dirY) < 0.15) this.dirY = 0;

    // Move the inner knob visually
    if (this._joystickInner) {
      this._joystickInner.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
  }

  _initDash() {
    const btn = this._dashBtn;

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      this._dashPointerId = e.pointerId;
      this.dash = true;
      btn.classList.add('active');
    });

    const endDash = (e) => {
      if (e.pointerId !== this._dashPointerId) return;
      this._dashPointerId = null;
      btn.classList.remove('active');
    };

    btn.addEventListener('pointerup', endDash);
    btn.addEventListener('pointercancel', endDash);
  }

  _initGrab() {
    const btn = this._grabBtn;

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      this._grabPointerId = e.pointerId;
      this.grab = true;
      btn.classList.add('active');
    });

    const endGrab = (e) => {
      if (e.pointerId !== this._grabPointerId) return;
      this._grabPointerId = null;
      btn.classList.remove('active');
    };

    btn.addEventListener('pointerup', endGrab);
    btn.addEventListener('pointercancel', endGrab);
  }

  _initStun() {
    const btn = this._stunBtn;

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      this._stunPointerId = e.pointerId;
      this.stunPulse = true;
      btn.classList.add('active');
    });

    const endStun = (e) => {
      if (e.pointerId !== this._stunPointerId) return;
      this._stunPointerId = null;
      btn.classList.remove('active');
    };

    btn.addEventListener('pointerup', endStun);
    btn.addEventListener('pointercancel', endStun);
  }

  _initSpeed() {
    const btn = this._speedBtn;

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      this._speedPointerId = e.pointerId;
      this.speedSurge = true;
      btn.classList.add('active');
    });

    const endSpeed = (e) => {
      if (e.pointerId !== this._speedPointerId) return;
      this._speedPointerId = null;
      btn.classList.remove('active');
    };

    btn.addEventListener('pointerup', endSpeed);
    btn.addEventListener('pointercancel', endSpeed);
  }

  // ── Show / Hide (for menu vs game state) ──
  show() {
    if (this._container) this._container.classList.add('game-active');
  }

  hide() {
    if (this._container) this._container.classList.remove('game-active');
  }

  getInput() {
    const result = {
      dirX: this.dirX,
      dirY: this.dirY,
      dash: this.dash,
      grab: this.grab,
      stunPulse: this.stunPulse,
      speedSurge: this.speedSurge,
    };
    // Single-frame triggers consumed after one read
    this.dash = false;
    this.grab = false;
    this.stunPulse = false;
    this.speedSurge = false;
    return result;
  }
}
