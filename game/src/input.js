// Keyboard + mouse for Cayo Lumen. Held keys live in `keys` (a Set of e.code
// strings); one-shot presses land in `pressed` until the loop calls endFrame().
// Mouse: pointer lock while playing, drag-to-orbit as a fallback, click = shoot.
//
// Keys: WASD move/drive, Shift run, E enter/exit car, F punch, Space brake /
// handbrake in a car (hop on foot), R radio station, M mute, P/Esc pause,
// G garage menu near the garage, T mission phone.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    /** Held keys, by KeyboardEvent.code. */
    this.keys = new Set();
    /** Keys pressed since the last endFrame() — edge-triggered actions read these. */
    this.pressed = new Set();
    /** Mouse movement since the last consumeMouse() call. */
    this.mouseDX = 0;
    this.mouseDY = 0;
    this._clicks = 0;
    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this.locked = false;
    /** Set by main.js: true only while the game state is 'playing'. */
    this.active = false;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys.add(event.code);
      this.pressed.add(event.code);
      // Keep Space / arrows from scrolling the page while playing.
      if (this.active && (event.code === 'Space' || event.code.startsWith('Arrow'))) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    // A key released while the tab is hidden never sends keyup: let go of all.
    window.addEventListener('blur', () => {
      this.keys.clear();
      this._dragging = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });

    canvas.addEventListener('mousedown', (event) => {
      if (!this.active) return;
      if (event.button === 0) {
        this._clicks += 1;
        if (!this.locked) {
          this._dragging = true;
          this._lastX = event.clientX;
          this._lastY = event.clientY;
        }
      }
    });
    window.addEventListener('mouseup', () => {
      this._dragging = false;
    });
    window.addEventListener('mousemove', (event) => {
      if (this.locked) {
        this.mouseDX += event.movementX || 0;
        this.mouseDY += event.movementY || 0;
      } else if (this._dragging && this.active) {
        this.mouseDX += event.clientX - this._lastX;
        this.mouseDY += event.clientY - this._lastY;
        this._lastX = event.clientX;
        this._lastY = event.clientY;
      }
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  /** True while the code is held down. */
  down(code) {
    return this.keys.has(code);
  }

  /** True if the code was pressed since the last endFrame(). */
  wasPressed(code) {
    return this.pressed.has(code);
  }

  /** Mouse delta since the last call; resets to zero. */
  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  /** Number of left clicks since the last call; resets to zero. */
  consumeClick() {
    const n = this._clicks;
    this._clicks = 0;
    return n;
  }

  /** Ask the browser for pointer lock on the canvas (call from a user gesture). */
  requestLock() {
    if (this.active && !this.locked && this.canvas.requestPointerLock) {
      try {
        const p = this.canvas.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        // Pointer lock is a nicety; drag-to-orbit still works without it.
      }
    }
  }

  /** Drop the edge-triggered press set. Call once per frame, after reading it. */
  endFrame() {
    this.pressed.clear();
  }

  /** Drop everything pending (held keys, presses, mouse deltas, clicks). */
  flush() {
    this.keys.clear();
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this._clicks = 0;
  }
}
