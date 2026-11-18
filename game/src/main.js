// CAYO LUMEN — boot, the one game loop, and the state machine.
//
// States: menu → playing ⇄ paused → gameover → menu. main.js owns the shared
// state object G (see design.md) and wires every manager into it; the managers
// themselves never import each other — they talk through G (G.hud.flash,
// G.audio.play, G.police.addHeat, ...).
//
// Who owns what (the integration contract, learned from the managers):
// - Player owns the mouse orbit: it reads input.mouseDX/DY itself and keeps
//   camYaw/camPitch; main.js reads those for the chase camera and never
//   consumes the mouse deltas itself. Player.update(dt) runs every playing
//   frame, on foot AND in a car (in a car it just syncs to the PlayerCar).
// - Combat owns the trigger: it consumes clicks in its own update, so main
//   never calls input.consumeClick(); pointer lock is requested from a plain
//   mousedown listener on the canvas instead.
// - HUD owns every menu button (it wires them in its constructor) and the
//   start-menu content (it rebuilds it); main.js only wires the one button
//   HUD does not know, btn-gameover-menu. HUD's Resume calls
//   G.pauseGame(false), so pauseGame takes an optional boolean.
// - Economy owns the G key (garage) and Missions owns the T key (phone);
//   main.js handles only M (mute), R (radio) and P/Esc (pause).
// - Economy owns the wallet (G.money is its mirror); save.js owns load/apply.
// - Combat and Police flip G.state to 'gameover' directly when Mara dies;
//   the loop's state watcher below runs the game-over side effects for any
//   path that gets there.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { mulberry32 } from './random.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { buildWorld } from './world.js';
import {
  createCamera,
  createLights,
  createRenderer,
  followCamera,
  resizeRenderer,
  updateSunRig,
} from './render.js';
import { applyShot, readShotParams } from './shots.js';
import { Player } from './player.js';
import { PlayerCar, TrafficManager, createCarMesh } from './vehicles.js';
import { PedestrianManager } from './pedestrians.js';
import { PoliceManager } from './police.js';
import { CombatSystem } from './combat.js';
import { MissionManager } from './missions.js';
import { Economy } from './economy.js';
import { HUD } from './hud.js';
import { applySave, hasSave, loadGame, saveGame } from './save.js';

const MAX_DT = 0.05; // a longer stall is dropped, never replayed
const AUTOSAVE_SECONDS = 60;

const params = readShotParams();
const worldSeed = params.shot ? params.seed : CONFIG.worldSeed;

const canvas = document.getElementById('c');
const hudRoot = document.getElementById('hud');

const G = {
  scene: new THREE.Scene(),
  camera: null,
  renderer: null,
  clock: new THREE.Clock(),
  rng: mulberry32(params.shot ? params.seed : (Math.random() * 0x7fffffff) | 0),
  state: 'menu',
  time: 0, // seconds since boot
  world: null,
  lights: null,
  player: null,
  playerCar: null,
  traffic: null,
  police: null,
  peds: null,
  combat: null,
  missions: null,
  economy: null,
  hud: null,
  audio: new AudioEngine(),
  input: null,
  money: CONFIG.economy.startingMoney,
  wanted: 0,
  heat: 0,
  health: CONFIG.player.healthMax,
  flags: {},
  camYaw: Math.PI * 0.15,
  camPitch: 0.32,
  shotMode: null,
  gameoverReason: null,
};

// Save helpers on G before any manager is built: HUD and Missions call
// G.saveGame / G.hasSave from their own constructors and callbacks.
G.createCarMesh = createCarMesh; // Economy + Missions borrow the car factory
G.saveGame = saveGame;
G.hasSave = hasSave;
G.loadGame = loadGame;
G.applySave = applySave;

window.__game = G;
window.__shotReady = false;

// ---- boot: renderer, world, managers, in that order ----
G.renderer = createRenderer(canvas);
G.camera = createCamera();
G.lights = createLights(G.scene);
G.world = buildWorld(G.scene, mulberry32(worldSeed));
G.input = new Input(canvas);
G.player = new Player(G);
G.playerCar = new PlayerCar(G);
G.traffic = new TrafficManager(G);
G.police = new PoliceManager(G);
G.peds = new PedestrianManager(G);
G.combat = new CombatSystem(G);
G.missions = new MissionManager(G);
G.economy = new Economy(G);
G.hud = new HUD(G);

// A slightly elevated default orbit: the Player's own default looks up from
// street level, which hides the road ahead while driving.
G.player.camPitch = 0.28;

// ---- state machine ----
function setMenuOverlay(name) {
  if (!G.hud) return;
  if (name === 'start' && typeof G.hud.showStart === 'function') G.hud.showStart();
  else if (name === 'pause' && typeof G.hud.showPause === 'function') G.hud.showPause();
  else if (name === 'gameover' && typeof G.hud.showGameOver === 'function') {
    G.hud.showGameOver(G.gameoverReason || 'wasted');
  } else if (name === null && typeof G.hud.hideMenus === 'function') G.hud.hideMenus();
}

function setHudVisible(visible) {
  if (hudRoot) hudRoot.classList.toggle('hidden', !visible);
}

function startGame(options = {}) {
  const { continueSave = false } = options;
  if (continueSave && hasSave()) {
    const data = loadGame();
    if (data) applySave(G, data);
  } else {
    // Fresh story: wallet, jobs and Mara all back to the beginning.
    if (G.economy && typeof G.economy.restore === 'function') {
      G.economy.restore({ money: CONFIG.economy.startingMoney, ownedCars: [] });
    }
    G.money = CONFIG.economy.startingMoney;
    G.wanted = 0;
    G.heat = 0;
    G.health = CONFIG.player.healthMax;
    G.flags = {};
    if (G.missions) {
      if (typeof G.missions.restore === 'function') {
        G.missions.restore({ done: [], unlocked: 0 });
      }
      // No public reset: clear the active job and its marker directly.
      G.missions.current = null;
      G.missions.stepIndex = 0;
      G.missions.stepState = null;
      G.missions.raceTimer = 0;
      if (typeof G.missions._clearMarker === 'function') G.missions._clearMarker();
      if (typeof G.missions._clearRival === 'function') G.missions._clearRival();
      if (typeof G.missions.closePhone === 'function') G.missions.closePhone();
    }
    if (G.economy && typeof G.economy.closeGarage === 'function') G.economy.closeGarage();
    G.player.respawnAtSafehouse();
  }
  G.state = 'playing';
  G.gameoverReason = null;
  G.input.flush(); // drop any clicks/keys pressed on the menu
  G.input.active = true;
  G.input.requestLock();
  G.audio.ensure();
  setMenuOverlay(null);
  setHudVisible(true);
  if (G.hud && typeof G.hud.flash === 'function') {
    G.hud.flash(continueSave ? 'Welcome back to Cayo Lumen' : 'Cayo Lumen — Delia Rook is waiting');
  }
}

function pauseGame(on) {
  // HUD's Resume button calls pauseGame(false); P/Esc call pauseGame().
  if (on === false) {
    resumeGame();
    return;
  }
  if (G.state !== 'playing') return;
  G.state = 'paused';
  G.input.active = false;
  if (document.pointerLockElement) document.exitPointerLock();
  setMenuOverlay('pause');
  saveGame(G);
}

function resumeGame() {
  if (G.state !== 'paused') return;
  G.state = 'playing';
  G.input.flush(); // a click on Resume must not become a gunshot
  G.input.active = true;
  G.input.requestLock();
  setMenuOverlay(null);
}

function quitToMenu() {
  saveGame(G);
  G.state = 'menu';
  G.input.active = false;
  if (document.pointerLockElement) document.exitPointerLock();
  setMenuOverlay('start');
  setHudVisible(false);
}

function gameOver(reason) {
  if (G.state !== 'playing') return;
  G.state = 'gameover';
  G.gameoverReason = reason;
  G.input.active = false;
  if (document.pointerLockElement) document.exitPointerLock();
  // The fine: 10% when wasted, 25% when busted (Police takes its own $150
  // fine when it arrests Mara itself, so this path is for other callers).
  const fine = Math.floor(G.money * (reason === 'busted' ? 0.25 : 0.1));
  if (G.economy && typeof G.economy.spend === 'function' && fine > 0) G.economy.spend(fine);
  else G.money = Math.max(0, G.money - fine);
  G.audio.play('fail');
  saveGame(G);
  setMenuOverlay('gameover');
}

G.startGame = startGame;
G.pauseGame = pauseGame;
G.resumeGame = resumeGame;
G.quitToMenu = quitToMenu;
G.gameOver = gameOver;

// The one menu button HUD does not wire itself (its id is btn-menu).
const gameoverMenuBtn = document.getElementById('btn-gameover-menu');
if (gameoverMenuBtn) {
  gameoverMenuBtn.addEventListener('click', () => {
    G.audio.ensure();
    G.audio.play('click');
    quitToMenu();
  });
}

// First gesture unlocks audio (browsers require it).
for (const evt of ['pointerdown', 'keydown']) {
  window.addEventListener(evt, () => G.audio.ensure(), { once: true });
}
// Pointer lock on click while playing — a plain listener, so the click itself
// still reaches Combat (main.js never consumes clicks).
canvas.addEventListener('mousedown', () => {
  if (G.state === 'playing') G.input.requestLock();
});
window.addEventListener('resize', () => resizeRenderer(G.renderer, G.camera));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.state === 'playing') pauseGame();
});

// ---- per-frame input that belongs to main, not to a manager ----
// (G and T are owned by Economy / Missions; the mouse orbit is owned by
// Player; clicks are owned by Combat. Main keeps M, R, P/Esc and the menus.)
function handleGlobalKeys() {
  const input = G.input;
  if (input.wasPressed('KeyM')) {
    const muted = G.audio.toggleMute();
    if (G.hud && typeof G.hud.flash === 'function') G.hud.flash(muted ? 'Sound muted (M)' : 'Sound on (M)');
  }
  if (input.wasPressed('KeyR')) {
    const station = G.audio.cycleRadio();
    if (G.hud && typeof G.hud.flash === 'function') G.hud.flash(`Radio: ${station} (R)`);
  }
  if (G.state === 'playing') {
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) pauseGame();
  } else if (G.state === 'menu') {
    if (input.wasPressed('Enter') || input.wasPressed('Space')) startGame({ continueSave: false });
  } else if (G.state === 'paused') {
    if (input.wasPressed('KeyP') || input.wasPressed('Escape') || input.wasPressed('Enter')) resumeGame();
  } else if (G.state === 'gameover') {
    if (input.wasPressed('Enter') || input.wasPressed('Space')) startGame({ continueSave: true });
  }
}

// ---- camera ----
// The Player moves toward (-sin camYaw, -cos camYaw), so the chase camera
// sits at camYaw + PI: behind Mara, looking where she is headed.
function updateCamera(dt) {
  if (G.state === 'menu') {
    // Slow orbit over downtown for the title screen (and the start shot).
    const t = G.time * 0.045;
    G.camera.position.set(Math.sin(t) * 250, 95, Math.cos(t) * 250);
    G.camera.lookAt(0, 25, 0);
    return;
  }
  const yaw = (G.player ? G.player.camYaw : G.camYaw) + Math.PI;
  const pitch = G.player ? G.player.camPitch : G.camPitch;
  const focus = G.player.inCar && G.playerCar.group ? G.playerCar.group.position : G.player.pos;
  followCamera(G.camera, focus, yaw, pitch, G.player.inCar ? 11.5 : 8.5, dt);
  // Never let a low orbit put the lens under the street.
  if (G.camera.position.y < 0.6) G.camera.position.y = 0.6;
}

// ---- the loop ----
let autosaveTimer = 0;
let last = performance.now();
let prevState = G.state;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_DT);
  last = now;
  G.time += dt;

  handleGlobalKeys();

  if (G.state === 'playing') {
    const speed = G.player.inCar ? G.playerCar.speed || 0 : 0;
    if (G.player.inCar) G.playerCar.update(dt, G.input);
    G.player.update(dt); // runs on foot AND in a car; owns the mouse orbit
    G.traffic.update(dt);
    G.police.update(dt);
    G.peds.update(dt);
    G.combat.update(dt);
    G.missions.update(dt);
    if (G.economy && typeof G.economy.update === 'function') G.economy.update(dt);
    G.audio.update(dt, speed, G.wanted, G.player.inCar);
    G.hud.update(dt);
    autosaveTimer += dt;
    if (autosaveTimer >= AUTOSAVE_SECONDS) {
      autosaveTimer = 0;
      saveGame(G);
    }
  }

  // Side effects for state changes that bypass the functions above — Combat
  // flips G.state to 'gameover' directly when Mara dies, so the loop makes
  // sure the game-over screen, the save and the pointer-lock release happen.
  if (G.state !== prevState) {
    if (G.state === 'gameover') {
      G.gameoverReason = G.gameoverReason || 'wasted';
      G.input.active = false;
      if (document.pointerLockElement) document.exitPointerLock();
      saveGame(G);
      setMenuOverlay('gameover');
    }
    prevState = G.state;
  }

  G.world.oceanPulse(G.time);
  updateSunRig(G.lights, G.time);
  updateCamera(dt);
  G.renderer.render(G.scene, G.camera);
  G.input.endFrame();
}

// ---- boot to menu, then stage a screenshot pose if asked ----
setHudVisible(false);
G.shotMode = applyShot(G);
if (!G.shotMode) {
  // No shot: plain title screen over the city.
  G.state = 'menu';
  setMenuOverlay('start');
} else if (G.state === 'playing') {
  // Chase / mission / night shots play live, so the HUD must be visible
  // even though nobody pressed New Game.
  setHudVisible(true);
}
requestAnimationFrame(frame);
