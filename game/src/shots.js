// Screenshot staging behind ?shot=start|chase|mission|night (&seed=N).
// Each shot poses the real game — the real city, the real managers, the real
// HUD — then raises window.__shotReady after ~1.2 s so the screenshot lands on
// a settled frame. With no ?shot= parameter the game boots to the menu as usual.
//
// The poses use only the documented G-level APIs (G.wanted, G.heat,
// G.police.addHeat, G.missions.startMission, G.combat.spawnGoon,
// G.hud.setObjective, G.player.pos/yaw) plus createCarMesh for dressing, and
// every manager call is guarded, so a shot never crashes if a manager is
// still being wired up. A shot never writes to localStorage or the save file.

import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { createCarMesh } from './vehicles.js';

const SETTLE_MS = 1200;

/** Read the shot parameters out of the page URL. */
export function readShotParams() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
  const seed = Number.isInteger(seedParam) ? seedParam : 1;
  return { shot, seed };
}

/** Put the player in a fresh car of `kind` at (x, z), facing `yaw`. */
function posePlayerInCar(G, kind, color, x, z, yaw, speed) {
  const carGroup = createCarMesh(kind, color);
  carGroup.position.set(x, 0, z);
  carGroup.rotation.y = yaw;
  G.scene.add(carGroup);
  // PlayerCar.attach takes a car record ({ group, kind, angle, speed }), not
  // a bare mesh — the record is what TrafficManager hands out too.
  if (G.playerCar && typeof G.playerCar.attach === 'function') {
    G.playerCar.attach({ group: carGroup, kind, angle: yaw, speed });
  }
  if (G.player) {
    G.player.pos.set(x, 0, z);
    G.player.yaw = yaw;
    // Car angle and camera yaw are opposite conventions: the car drives
    // toward (sin yaw, cos yaw) while the camera looks toward
    // (-sin camYaw, -cos camYaw), so the orbit sits half a turn around.
    G.player.camYaw = yaw + Math.PI;
    G.player.inCar = true;
    if (G.player.mesh) G.player.mesh.visible = false; // on-foot mesh hides while driving
  }
  return carGroup;
}

/** A simple police helicopter built from primitives, for the chase shot. */
function makeHeli() {
  const heli = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x22304a });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd8ef });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 4.2), bodyMat);
  heli.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 1.2), glassMat);
  nose.position.set(0, -0.1, 2.4);
  heli.add(nose);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.4), bodyMat);
  tail.position.set(0, 0.3, -4.0);
  heli.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x11131a }));
  rotor.position.y = 1.1;
  heli.add(rotor);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 6), bodyMat);
  mast.position.y = 0.8;
  heli.add(mast);
  const skidMat = new THREE.MeshLambertMaterial({ color: 0x11131a });
  for (const s of [-0.9, 0.9]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.2), skidMat);
    skid.position.set(s, -1.0, 0);
    heli.add(skid);
  }
  return heli;
}

/** A gold objective beam + floating diamond, as a fallback if missions is absent. */
function makeObjectiveBeam(G, x, z) {
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.35 });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true), beamMat);
  beam.position.set(x, 30, z);
  G.scene.add(beam);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: 0xffd23d }),
  );
  diamond.position.set(x, 7, z);
  G.scene.add(diamond);
  return { beam, diamond };
}

function stageStart(G) {
  G.state = 'menu';
  if (G.hud && typeof G.hud.showStart === 'function') G.hud.showStart();
}

function stageChase(G) {
  G.state = 'playing';
  if (G.hud && typeof G.hud.hideMenus === 'function') G.hud.hideMenus();
  // Player in a coral sport coupe, heading north up the avenue at speed.
  posePlayerInCar(G, 'sport', 0xd81b60, 0, 30, Math.PI, 30);
  // Three cop cruisers tight on the player's flanks, all ahead of the
  // chase camera so the shot shows the pursuit, not empty road.
  const copOffsets = [
    { x: -5, z: 30 },
    { x: 5, z: 34 },
    { x: -2, z: 38 },
  ];
  for (const o of copOffsets) {
    const cop = createCarMesh('sedan', 0x22304a);
    cop.position.set(o.x, 0, o.z);
    cop.rotation.y = Math.PI;
    G.scene.add(cop);
  }
  // Helicopter ahead of the chase, low over the avenue and in frame.
  const heli = makeHeli();
  heli.position.set(5, 15, 6);
  heli.rotation.y = 0.6;
  G.scene.add(heli);
  G.wanted = 3;
  G.heat = 65;
  if (G.police && typeof G.police.addHeat === 'function') G.police.addHeat(65);
  if (G.audio) G.audio.play('siren-on');
  if (G.hud) {
    if (typeof G.hud.setObjective === 'function') G.hud.setObjective('Lose the cops — break line of sight!');
    if (typeof G.hud.flash === 'function') G.hud.flash('WANTED: 3 stars — the whole precinct is coming');
  }
}

function stageMission(G) {
  G.state = 'playing';
  if (G.hud && typeof G.hud.hideMenus === 'function') G.hud.hideMenus();
  // Mara on foot at Pier 9, mid-fight in mission 6, "The Informant".
  if (G.player) {
    G.player.pos.set(-2, 0, 424);
    G.player.yaw = 0; // facing the pier head (+z)
    G.player.camYaw = Math.PI; // camera behind her, looking up the pier
    G.player.inCar = false;
    if (G.player.mesh) G.player.mesh.visible = true;
  }
  G.wanted = 1;
  G.heat = 25;
  let missionStarted = false;
  if (G.missions && typeof G.missions.startMission === 'function') {
    // Stage the shot mid-campaign: unlock up to job 6 first, or
    // startMission refuses a job the player has not reached yet.
    G.missions.unlocked = Math.max(G.missions.unlocked || 0, 5);
    missionStarted = G.missions.startMission(5);
  }
  if (G.combat && typeof G.combat.spawnGoon === 'function') {
    G.combat.spawnGoon(new THREE.Vector3(4, 0, 442), { armed: true });
    G.combat.spawnGoon(new THREE.Vector3(-6, 0, 448), { armed: true });
  }
  if (!missionStarted) {
    makeObjectiveBeam(G, 0, 452);
    if (G.hud && typeof G.hud.setObjective === 'function') {
      G.hud.setObjective('Meet the informant at Pier 9 — then fight off his crew');
    }
  }
  if (G.hud && typeof G.hud.flash === 'function') G.hud.flash('Mission 6: The Informant — Delia Rook');
}

function stageNight(G) {
  G.state = 'playing';
  if (G.hud && typeof G.hud.hideMenus === 'function') G.hud.hideMenus();
  // Dusk has fallen: dim the sun, deepen the haze, let the neon take over.
  if (G.lights) {
    G.lights.sun.intensity = 0.55;
    G.lights.sun.color.setHex(0xff9a5a);
    if (G.lights.hemi) G.lights.hemi.intensity = 0.32;
  }
  if (G.scene) {
    G.scene.fog.color.setHex(0x2a1830);
    G.scene.fog.density = 0.0022;
    G.scene.background = new THREE.Color(0x1c1030);
  }
  if (G.world && G.world.skyMat) G.world.skyMat.color.setHex(0x4a4a72);
  // Player cruising the beach road in a taxi-yellow sedan, one star of heat.
  posePlayerInCar(G, 'sedan', 0xf2c230, -40, 360, Math.PI / 2, 18);
  G.wanted = 1;
  G.heat = 25;
  if (G.police && typeof G.police.addHeat === 'function') G.police.addHeat(25);
  if (G.hud && typeof G.hud.setObjective === 'function') {
    G.hud.setObjective('Cruise Miramar Beach — Delia is waiting on your call');
  }
}

const STAGES = { start: stageStart, chase: stageChase, mission: stageMission, night: stageNight };

/**
 * Snap the chase camera onto the staged pose at once. The per-frame camera
 * lerps from the menu orbit, so at a low frame rate it would still be
 * travelling when the screenshot lands and the shot would show the city,
 * not the staged scene. This mirrors main.js's followCamera exactly
 * (yaw = camYaw + PI), so the next frames keep it there. Each shot gets
 * its own distance/pitch: the chase sits further back and higher so the
 * pursuit fits in frame, the mission sits close on the player.
 */
const SHOT_CAMERA = {
  chase: { dist: 15, pitch: 0.38 },
  mission: { dist: 6.5, pitch: 0.2 },
  night: { dist: 13, pitch: 0.34 },
};

function snapCamera(G) {
  if (!G.camera || !G.player || G.state !== 'playing') return;
  const yaw = (G.player.camYaw ?? Math.PI) + Math.PI;
  const pose = SHOT_CAMERA[G.shotMode] || {};
  const pitch = pose.pitch ?? G.player.camPitch ?? 0.28;
  const inCar = G.player.inCar && G.playerCar && G.playerCar.group;
  const dist = pose.dist ?? (inCar ? 11.5 : 8.5);
  const focus = inCar ? G.playerCar.group.position : G.player.pos;
  const cx = focus.x - Math.sin(yaw) * Math.cos(pitch) * dist;
  const cy = focus.y + Math.sin(pitch) * dist + 1.6;
  const cz = focus.z - Math.cos(yaw) * Math.cos(pitch) * dist;
  G.camera.position.set(cx, Math.max(0.6, cy), cz);
  G.camera.lookAt(
    focus.x + Math.sin(yaw) * 2.2,
    focus.y + 1.4,
    focus.z + Math.cos(yaw) * 2.2,
  );
}

/**
 * Stage the named shot on the already-booted game G. Returns the shot name
 * (or null when there is none). Sets window.__shotReady after the settle.
 */
export function applyShot(G) {
  const { shot, seed } = readShotParams();
  if (!shot || !STAGES[shot]) return null;
  G.rng = mulberry32(seed);
  G.shotMode = shot;
  window.__shotReady = false;
  STAGES[shot](G);
  snapCamera(G);
  window.setTimeout(() => {
    window.__shotReady = true;
  }, SETTLE_MS);
  return shot;
}
