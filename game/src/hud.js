// hud.js — everything the player sees on top of the 3D world.
//
// The HUD binds the DOM ids from index.html (wanted stars, health, money,
// clock, radio, minimap, objective, crosshair, dialog, menus, toast, garage
// panel, mission phone), updates them every frame, draws the north-up minimap
// on a 180x180 canvas, runs the typewriter dialog, and owns the start / pause /
// game-over / ending overlays. It creates any element it cannot find, so a
// small id drift in index.html degrades to a working HUD instead of a crash.
// All game state comes from G; the HUD never owns gameplay state itself.

import * as configModule from './config.js';

const SHARED = (configModule && configModule.CONFIG) || {};
const RADIO_STATIONS = (SHARED.radio && SHARED.radio.stations) || [
  'SOL MAR FM', 'LUMEN 88', 'BASSLINE 101',
];
const GARAGE_POS = SHARED.garage || { x: -90, z: -270 };
const WORLD_HALF = (SHARED.world && SHARED.world.halfSize) || 450;

// In-game clock: the game opens at sunset, 18:40, and time drifts slowly.
const CLOCK_START_MINUTES = 18 * 60 + 40;
const CLOCK_MINUTES_PER_SECOND = 0.35;

function $(id) {
  return typeof document !== 'undefined' ? document.getElementById(id) : null;
}

function ensure(id, tag, parent) {
  let el = $(id);
  if (el) return el;
  el = document.createElement(tag || 'div');
  el.id = id;
  (parent || document.body).appendChild(el);
  return el;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export class HUD {
  constructor(G) {
    this.G = G;
    this.gameMinutes = CLOCK_START_MINUTES;
    this.feed = []; // last 3 flash messages, newest first
    this._toastTimer = 0;
    this._vignette = 0; // damage flash strength, 0..1
    this._typeText = '';
    this._typeShown = 0;
    this._typeTimer = 0;
    this._dialogTimer = 0;
    this._objective = { text: '', dist: null, bearing: 0 };
    this._speedKmh = 0;

    this._bindDom();
    this._bindMenuButtons();
    this.showStart();
  }

  // -- DOM binding ------------------------------------------------------------

  _bindDom() {
    const hudRoot = ensure('hud', 'div', document.body);
    // Top-left cluster: wanted stars + health bar.
    this.elWanted = $('wanted') || ensure('wanted', 'div', hudRoot);
    this.elHealth = $('health') || ensure('health', 'div', hudRoot);
    this.elHealthBar = $('health-bar') || null;
    if (!this.elHealthBar) {
      this.elHealthBar = document.createElement('div');
      this.elHealthBar.id = 'health-bar';
      this.elHealth.appendChild(this.elHealthBar);
    }
    // Top-right cluster: money + clock + radio.
    this.elMoney = $('money') || ensure('money', 'div', hudRoot);
    this.elClock = $('clock') || ensure('clock', 'div', hudRoot);
    this.elRadio = $('radio') || ensure('radio', 'div', hudRoot);
    // Bottom-left: minimap. Bottom-centre: objective. Bottom-right: speed.
    this.elMinimap = $('minimap') || ensure('minimap', 'canvas', hudRoot);
    if (this.elMinimap.width !== 180) this.elMinimap.width = 180;
    if (this.elMinimap.height !== 180) this.elMinimap.height = 180;
    this.minimapCtx = this.elMinimap.getContext('2d');
    this.elObjective = $('objective') || ensure('objective', 'div', hudRoot);
    this.elObjectiveText = $('objective-text') || null;
    this.elArrow = $('objective-arrow') || null;
    if (!this.elArrow) {
      this.elArrow = document.createElement('span');
      this.elArrow.id = 'objective-arrow';
      this.elArrow.textContent = '▲';
      this.elObjective.appendChild(this.elArrow);
    }
    this.elSpeed = $('speed') || ensure('speed', 'div', hudRoot);
    // Centre: crosshair + dialog box.
    this.elCrosshair = $('crosshair') || ensure('crosshair', 'div', hudRoot);
    this.elDialog = $('dialog') || ensure('dialog', 'div', hudRoot);
    this.elDialogSpeaker = $('dialog-speaker') || null;
    this.elDialogText = $('dialog-text') || null;
    if (!this.elDialogText) {
      this.elDialogSpeaker = document.createElement('strong');
      this.elDialogSpeaker.id = 'dialog-speaker';
      this.elDialogText = document.createElement('p');
      this.elDialogText.id = 'dialog-text';
      this.elDialog.append(this.elDialogSpeaker, this.elDialogText);
    }
    this.elDialog.classList.add('hidden');
    // Message feed + toast + damage vignette.
    this.elFeed = $('feed') || ensure('feed', 'div', hudRoot);
    this.elToast = $('toast') || ensure('toast', 'div', document.body);
    this.elVignette = $('vignette') || ensure('vignette', 'div', document.body);
    // Overlays (created here if index.html ever lacks one).
    this.elStart = $('menu-start') || ensure('menu-start', 'div', document.body);
    this.elPause = $('menu-pause') || ensure('menu-pause', 'div', document.body);
    this.elGameover = $('menu-gameover') || ensure('menu-gameover', 'div', document.body);
    this.elEnding = $('menu-ending') || ensure('menu-ending', 'div', document.body);
  }

  _bindMenuButtons() {
    const wire = (id, fn) => {
      const btn = $(id);
      if (btn) btn.addEventListener('click', fn);
    };
    wire('btn-new-game', () => this.G.startGame && this.G.startGame({ continueSave: false }));
    wire('btn-continue', () => this.G.startGame && this.G.startGame({ continueSave: true }));
    wire('btn-resume', () => this.G.pauseGame && this.G.pauseGame(false));
    wire('btn-restart', () => this.G.startGame && this.G.startGame({ continueSave: false }));
    wire('btn-save-quit', () => {
      if (typeof this.G.saveGame === 'function') this.G.saveGame(this.G);
      if (this.G.quitToMenu) this.G.quitToMenu();
    });
    wire('btn-respawn', () => this.G.startGame && this.G.startGame({ continueSave: true }));
    wire('btn-menu', () => this.G.quitToMenu && this.G.quitToMenu());
    wire('btn-ending-roam', () => this.hideMenus());
    // Buttons with no matching id in index.html are simply skipped; the
    // start overlay always gets working buttons built below if it is empty.
    if (this.elStart && !this.elStart.querySelector('button')) this._buildStartMenu();
    if (this.elPause && !this.elPause.querySelector('button')) this._buildPauseMenu();
    if (this.elGameover && !this.elGameover.querySelector('button')) this._buildGameoverMenu();
  }

  _menuButton(id, label, fn) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = id;
    btn.textContent = label;
    btn.addEventListener('click', fn);
    return btn;
  }

  _buildStartMenu() {
    this.elStart.innerHTML = '';
    const title = document.createElement('h1');
    title.textContent = 'CAYO LUMEN';
    const sub = document.createElement('p');
    sub.textContent = 'A sun-soaked open city. One debt. Eight jobs. Your legend starts at sunset.';
    const controls = document.createElement('p');
    controls.className = 'controls';
    controls.textContent = 'WASD move/drive · E enter car · F punch · Click shoot · Space brake/hop · G garage · T jobs · R radio · M mute · P pause';
    const newBtn = this._menuButton('btn-new-game', 'New Game', () => this.G.startGame && this.G.startGame({ continueSave: false }));
    this.elStart.append(title, sub, controls, newBtn);
    const hasSave = typeof this.G.hasSave === 'function' ? this.G.hasSave() : false;
    if (hasSave) {
      const contBtn = this._menuButton('btn-continue', 'Continue', () => this.G.startGame && this.G.startGame({ continueSave: true }));
      this.elStart.appendChild(contBtn);
    }
    const credits = document.createElement('p');
    credits.className = 'credits';
    credits.textContent = 'An original game — city, characters, music and story made for Cayo Lumen.';
    this.elStart.appendChild(credits);
  }

  _buildPauseMenu() {
    this.elPause.innerHTML = '';
    const title = document.createElement('h2');
    title.textContent = 'Paused';
    const resume = this._menuButton('btn-resume', 'Resume', () => this.G.pauseGame && this.G.pauseGame(false));
    const restart = this._menuButton('btn-restart', 'Restart', () => this.G.startGame && this.G.startGame({ continueSave: false }));
    const saveQuit = this._menuButton('btn-save-quit', 'Save & Quit to Menu', () => {
      if (typeof this.G.saveGame === 'function') this.G.saveGame(this.G);
      if (this.G.quitToMenu) this.G.quitToMenu();
    });
    this.elPause.append(title, resume, restart, saveQuit);
  }

  _buildGameoverMenu() {
    this.elGameover.innerHTML = '';
    const title = document.createElement('h2');
    title.id = 'gameover-title';
    title.textContent = 'Wasted';
    const text = document.createElement('p');
    text.id = 'gameover-text';
    text.textContent = 'Mara is down. The city keeps moving without her.';
    const respawn = this._menuButton('btn-respawn', 'Respawn at the Safehouse', () => this.G.startGame && this.G.startGame({ continueSave: true }));
    const menu = this._menuButton('btn-menu', 'Main Menu', () => this.G.quitToMenu && this.G.quitToMenu());
    this.elGameover.append(title, text, respawn, menu);
  }

  // -- per-frame update ---------------------------------------------------------

  update(dt) {
    if (this.G.state === 'playing') {
      this.gameMinutes += dt * CLOCK_MINUTES_PER_SECOND;
    }
    this._updateVitals();
    this._updateObjective();
    this._updateSpeed();
    this._updateClockAndRadio();
    this._updateTypewriter(dt);
    this._updateToast(dt);
    this._updateVignette(dt);
    this._drawMinimap();
  }

  _updateVitals() {
    const health = clamp(this.G.health ?? (this.G.player && this.G.player.health) ?? 100, 0, 100);
    const money = this.G.economy ? this.G.economy.money : (this.G.money || 0);
    const wanted = clamp(this.G.wanted || 0, 0, 5);
    if (this.elHealthBar) {
      this.elHealthBar.style.width = `${health}%`;
      this.elHealthBar.style.background = health > 50 ? '#7ddc7d' : health > 25 ? '#ffc94d' : '#e5534b';
    }
    if (this.elHealth) this.elHealth.setAttribute('data-health', String(Math.round(health)));
    if (this.elMoney) this.elMoney.textContent = `$${Math.round(money).toLocaleString('en-US')}`;
    if (this.elWanted) {
      this.elWanted.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
      this.elWanted.classList.toggle('hot', wanted >= 3);
    }
  }

  _updateObjective() {
    const text = this.G.missions && typeof this.G.missions.currentObjectiveText === 'function'
      ? this.G.missions.currentObjectiveText()
      : this._objective.text;
    const dist = this._objective.dist;
    const shown = dist == null ? text : `${text} · ${dist}m`;
    if (this.elObjectiveText) this.elObjectiveText.textContent = shown;
    else if (this.elObjective) {
      // Keep the arrow span intact: the objective text lives in a text node
      // in front of it, updated in place instead of rebuilt each frame.
      const first = this.elObjective.firstChild;
      if (first && first.nodeType === 3) first.textContent = `${shown} `;
      else this.elObjective.prepend(document.createTextNode(`${shown} `));
    }
    if (this.elArrow) {
      // Arrow points toward the objective relative to the camera.
      this.elArrow.style.transform = `rotate(${this._objective.bearing || 0}rad)`;
      this.elArrow.style.opacity = dist == null ? '0' : '1';
    }
  }

  _updateSpeed() {
    const inCar = this.G.playerCar && this.G.playerCar.inCar;
    const speed = (this.G.playerCar && this.G.playerCar.speed) || 0;
    this._speedKmh = Math.abs(speed) * 3.6;
    if (this.elSpeed) {
      this.elSpeed.textContent = inCar ? `${Math.round(this._speedKmh)} km/h` : '';
      this.elSpeed.style.display = inCar ? '' : 'none';
    }
    if (this.elCrosshair) {
      const armed = !!(this.G.combat && (this.G.combat.ammo > 0 || this.G.playerArmed));
      this.elCrosshair.style.display = armed && this.G.state === 'playing' && !inCar ? '' : 'none';
    }
  }

  _updateClockAndRadio() {
    const total = Math.floor(this.gameMinutes) % (24 * 60);
    const hh = String(Math.floor(total / 60)).padStart(2, '0');
    const mm = String(total % 60).padStart(2, '0');
    if (this.elClock) this.elClock.textContent = `${hh}:${mm}`;
    const station = (this.G.audio && (this.G.audio.stationName || RADIO_STATIONS[this.G.audio.station || 0]))
      || RADIO_STATIONS[0];
    if (this.elRadio) this.elRadio.textContent = `♪ ${station}`;
  }

  // -- messages, dialog, toasts --------------------------------------------------

  /** A short message: goes to the feed (last 3) and the toast line. */
  flash(msg) {
    if (!msg) return;
    this.feed.unshift(msg);
    if (this.feed.length > 3) this.feed.length = 3;
    if (this.elFeed) {
      this.elFeed.innerHTML = '';
      for (const line of this.feed) {
        const p = document.createElement('p');
        p.textContent = line;
        this.elFeed.appendChild(p);
      }
    }
    if (this.elToast) {
      this.elToast.textContent = msg;
      this.elToast.classList.add('show');
      this._toastTimer = 3;
    }
  }

  /** Big centred toast for mission completions. */
  showMissionComplete(title, reward) {
    this.flash(`Job complete: ${title} — +$${reward}`);
    if (this.elToast) {
      this.elToast.textContent = `★ ${title} complete — +$${reward}`;
      this.elToast.classList.add('show', 'big');
      this._toastTimer = 4;
    }
  }

  /** Queue a typewriter dialog line: speaker name + text typed out. */
  say(speaker, text) {
    this._typeText = text || '';
    this._typeShown = 0;
    this._typeTimer = 0;
    this._dialogTimer = 5;
    if (this.elDialogSpeaker) this.elDialogSpeaker.textContent = speaker || '';
    if (this.elDialogText) this.elDialogText.textContent = '';
    if (this.elDialog) this.elDialog.classList.remove('hidden');
  }

  _updateTypewriter(dt) {
    if (this._dialogTimer > 0) this._dialogTimer -= dt;
    if (this._typeShown < this._typeText.length) {
      this._typeTimer += dt;
      // Roughly 40 characters a second — readable, not sluggish.
      const target = Math.min(this._typeText.length, Math.floor(this._typeTimer * 40));
      if (target !== this._typeShown) {
        this._typeShown = target;
        if (this.elDialogText) this.elDialogText.textContent = this._typeText.slice(0, this._typeShown);
      }
    } else if (this._dialogTimer <= 0 && this.elDialog) {
      this.elDialog.classList.add('hidden');
    }
  }

  _updateToast(dt) {
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0 && this.elToast) this.elToast.classList.remove('show', 'big');
    }
  }

  /** Called by combat / police when the player takes a hit. */
  damageFlash() {
    this._vignette = 1;
  }

  /** Called by police when the player is arrested (Busted, not Wasted). */
  showBusted() {
    this.showGameOver('busted');
  }

  _updateVignette(dt) {
    if (this._vignette > 0) this._vignette = Math.max(0, this._vignette - dt * 1.4);
    if (this.elVignette) {
      this.elVignette.style.opacity = String(this._vignette * 0.75);
    }
  }

  /** Objective text + distance (m) + bearing (radians, 0 = ahead). */
  setObjective(text, dist, bearing) {
    if (typeof text === 'string') this._objective.text = text;
    if (typeof dist === 'number') this._objective.dist = dist;
    if (typeof bearing === 'number') this._objective.bearing = bearing;
  }

  // -- minimap -------------------------------------------------------------------

  _drawMinimap() {
    const ctx = this.minimapCtx;
    if (!ctx) return;
    const S = 180;
    const scale = S / (WORLD_HALF * 2);
    const toMap = (x, z) => [S / 2 + x * scale, S / 2 + z * scale];
    ctx.clearRect(0, 0, S, S);
    // Land, then the beach strip and the ocean edge at the bottom (south).
    ctx.fillStyle = '#2c3340';
    ctx.fillRect(0, 0, S, S);
    const [, beachY] = toMap(0, 380);
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(0, beachY, S, S - beachY);
    ctx.fillStyle = '#3a6ea5';
    ctx.fillRect(0, S - 4, S, 4);
    // Park block, bottom-left of centre.
    const [parkX, parkY] = toMap(-270, 90);
    ctx.fillStyle = '#3f7a44';
    ctx.fillRect(parkX, parkY, 90 * scale, 90 * scale);
    // Roads: grid lines every 90 units.
    ctx.strokeStyle = '#565e6e';
    ctx.lineWidth = 3;
    for (let v = -360; v <= 360; v += 90) {
      const [x1, y1] = toMap(v, -WORLD_HALF);
      const [x2, y2] = toMap(v, WORLD_HALF);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [x3, y3] = toMap(-WORLD_HALF, v);
      const [x4, y4] = toMap(WORLD_HALF, v);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }
    const dot = (x, z, r, color) => {
      const [mx, my] = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
    };
    // Garage (green), traffic cars (grey), mission objective (gold, pulsing).
    dot(GARAGE_POS.x, GARAGE_POS.z, 4, '#7ddc7d');
    const cars = (this.G.traffic && this.G.traffic.cars) || [];
    for (const car of cars) {
      const p = car.pos || (car.group && car.group.position);
      if (p) dot(p.x, p.z, 2, '#9aa3b2');
    }
    if (this.G.missions && typeof this.G.missions.currentTarget === 'function') {
      const target = this.G.missions.currentTarget();
      if (target) {
        const pulse = 4 + Math.sin((this.G.time || 0) * 4) * 1.5;
        dot(target.x, target.z, pulse, '#ffc94d');
      }
    }
    // Police (flashing blue/red).
    const cops = (this.G.police && this.G.police.copCars) || [];
    const copColor = Math.floor((this.G.time || 0) * 4) % 2 === 0 ? '#4d8dff' : '#ff4d4d';
    for (const cop of cops) {
      const p = cop.pos || (cop.group && cop.group.position) || cop;
      if (p && typeof p.x === 'number') dot(p.x, p.z, 3, copColor);
    }
    // Player arrow, rotated by yaw. North is up; the arrow is drawn
    // pointing north, and the player faces (sin yaw, cos yaw), so the
    // rotation that maps north onto the facing is PI - yaw (not -yaw:
    // yaw PI faces north, and rotate(-PI) would point the arrow south).
    const playerPos = this._playerPos();
    const yaw = (this.G.player && this.G.player.yaw) || 0;
    if (playerPos) {
      const [px, py] = toMap(playerPos.x, playerPos.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.PI - yaw);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Thin border so the map reads at a glance.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
  }

  _playerPos() {
    if (this.G.playerCar && this.G.playerCar.inCar && this.G.playerCar.group) {
      const p = this.G.playerCar.group.position;
      return { x: p.x, z: p.z };
    }
    if (this.G.player && this.G.player.pos) return { x: this.G.player.pos.x, z: this.G.player.pos.z };
    if (this.G.player && typeof this.G.player.x === 'number') return { x: this.G.player.x, z: this.G.player.z };
    return null;
  }

  // -- menus ----------------------------------------------------------------------

  _hideAllOverlays() {
    for (const el of [this.elStart, this.elPause, this.elGameover, this.elEnding]) {
      if (el) el.classList.add('hidden');
    }
  }

  hideMenus() {
    this._hideAllOverlays();
  }

  showStart() {
    this._hideAllOverlays();
    if (this.elStart) {
      this.elStart.classList.remove('hidden');
      // Refresh the Continue button: it only exists when a save is present.
      if (this.elStart.querySelector('button')) this._buildStartMenu();
    }
  }

  showPause() {
    this._hideAllOverlays();
    if (this.elPause) this.elPause.classList.remove('hidden');
  }

  /** kind: 'busted' (arrested) or 'wasted' (killed). */
  showGameOver(kind) {
    this._hideAllOverlays();
    if (this.elGameover) {
      const title = $('gameover-title');
      const text = $('gameover-text');
      if (kind === 'busted') {
        if (title) title.textContent = 'Busted';
        if (text) text.textContent = 'The Lumen police took you in. You lose some cash, but the city is still yours to take back.';
      } else {
        if (title) title.textContent = 'Wasted';
        if (text) text.textContent = 'Mara is down. The city keeps moving without her.';
      }
      this.elGameover.classList.remove('hidden');
    }
  }

  /** The end of the campaign: all eight jobs done. */
  showEnding() {
    this._hideAllOverlays();
    if (!this.elEnding) return;
    this.elEnding.innerHTML = '';
    const title = document.createElement('h1');
    title.textContent = 'CAYO LUMEN LEGEND';
    const text = document.createElement('p');
    text.textContent = 'All eight jobs done. The ledger is delivered, the debt is paid, and the city is yours, Mara Voss. Bonus: +$500. Free roam — Cayo Lumen is yours now.';
    const roam = this._menuButton('btn-ending-roam', 'Keep Roaming', () => this.hideMenus());
    const menu = this._menuButton('btn-ending-menu', 'Main Menu', () => this.G.quitToMenu && this.G.quitToMenu());
    this.elEnding.append(title, text, roam, menu);
    this.elEnding.classList.remove('hidden');
  }
}

export default HUD;
