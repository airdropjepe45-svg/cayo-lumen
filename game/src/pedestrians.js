// pedestrians.js — Cayo Lumen: sidewalk walkers who flee from danger.
// Simple original figures (cylinder body + sphere head), varied shirt colours.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const CFG = CONFIG || {};
const PED_CFG = CFG.peds || {};
const PED_COUNT = PED_CFG.count ?? 26;
const WALK_SPEED = PED_CFG.walkSpeed ?? 1.4;
const FLEE_SPEED = PED_CFG.fleeSpeed ?? 5.2;

const ROAD_LINES = [-360, -270, -180, -90, 0, 90, 180, 270, 360];
const WORLD_EDGE = 440;

const SHIRT_COLORS = [
  0xd94f4f, 0x4f7fd9, 0x53b06a, 0xe0a83c, 0x8a5fd0, 0xe07ab8,
  0x3fb8b2, 0xd9d9d9, 0x2b2b33, 0xc96a2e, 0x7fb069, 0x5b8dd9,
];
const SKIN_TONES = [0xe8b88a, 0xc98d5f, 0x8a5a3b, 0xf0c8a0, 0x6e4426];
const PANTS_COLORS = [0x2b3242, 0x3a3a3a, 0x5a4a3a, 0x24344d, 0x4a4a55];

function randomSidewalkPoint(rng) {
  // Sidewalks run 9 m off each road centre line (road 14 wide + 4 sidewalk).
  const alongRoad = ROAD_LINES[Math.floor(rng() * ROAD_LINES.length)];
  const acrossRoad = ROAD_LINES[Math.floor(rng() * ROAD_LINES.length)];
  const side = rng() < 0.5 ? -1 : 1;
  const offset = 9 + rng() * 2;
  const t = (rng() * 2 - 1) * 420;
  if (rng() < 0.5) {
    return new THREE.Vector3(t, 0, alongRoad + side * offset);
  }
  return new THREE.Vector3(acrossRoad + side * offset, 0, t);
}

function buildPedMesh(rng) {
  const group = new THREE.Group();
  const shirt = SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)];
  const skin = SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)];
  const pants = PANTS_COLORS[Math.floor(rng() * PANTS_COLORS.length)];

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.3, 0.72, 10),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 }),
  );
  body.position.y = 1.02;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 12, 10),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 }),
  );
  head.position.y = 1.56;
  head.castShadow = true;
  group.add(head);

  // Hair cap so heads read at a distance.
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.215, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 0.95 }),
  );
  hair.position.y = 1.6;
  group.add(hair);

  const legGeo = new THREE.BoxGeometry(0.16, 0.62, 0.18);
  const legMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.13, 0.33, 0);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.13, 0.33, 0);
  group.add(legL);
  group.add(legR);

  const armGeo = new THREE.BoxGeometry(0.11, 0.58, 0.13);
  const armMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
  const armL = new THREE.Mesh(armGeo, armMat);
  armL.position.set(-0.34, 1.02, 0);
  const armR = new THREE.Mesh(armGeo, armMat);
  armR.position.set(0.34, 1.02, 0);
  group.add(armL);
  group.add(armR);

  group.userData.legs = [legL, legR];
  group.userData.arms = [armL, armR];
  return group;
}

/** 26 pedestrians wandering the sidewalks, fleeing speeding cars and gunfire. */
export class PedestrianManager {
  constructor(G) {
    this.G = G;
    this.rng = G.rng || Math.random;
    this.peds = [];
    for (let i = 0; i < PED_COUNT; i += 1) this.spawnPed();
  }

  spawnPed(atPos) {
    const rng = this.rng;
    const group = buildPedMesh(rng);
    const start = atPos ? atPos.clone() : randomSidewalkPoint(rng);
    start.y = 0;
    group.position.copy(start);
    const ped = {
      group,
      target: randomSidewalkPoint(rng),
      speed: WALK_SPEED * (0.8 + rng() * 0.5),
      idleTimer: 0,
      fleeing: false,
      fleeTimer: 0,
      phase: rng() * Math.PI * 2,
      panic: 0,
    };
    this.G.scene.add(group);
    this.peds.push(ped);
    return ped;
  }

  /** Spawn one pedestrian who immediately runs away from `fromPos` (car-theft driver). */
  spawnFleeingPed(fromPos) {
    const ped = this.spawnPed(fromPos);
    this.fleeFrom(fromPos, 50, ped);
    return ped;
  }

  /** Make peds near `pos` run away from it. `only` limits it to one ped. */
  fleeFrom(pos, radius = 30, only = null) {
    const list = only ? [only] : this.peds;
    for (const ped of list) {
      const d = ped.group.position.distanceTo(pos);
      if (d < radius) {
        ped.fleeing = true;
        ped.fleeTimer = 2.5 + this.rng() * 2;
        ped.panic = 1;
      }
    }
  }

  /** Nearest pedestrian within r metres of pos, or null. */
  nearestPed(pos, r) {
    let best = null;
    let bestD = r;
    for (const ped of this.peds) {
      const d = ped.group.position.distanceTo(pos);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }

  update(dt) {
    const G = this.G;
    const playerCar = G.playerCar;
    const carPos = playerCar && playerCar.inCar && playerCar.group
      ? playerCar.group.position : null;
    const carSpeed = playerCar && playerCar.inCar ? Math.abs(playerCar.speed || 0) : 0;
    const shotRecently = G.combat && G.time - (G.combat.lastShotAt || -99) < 1.5;
    const playerPos = G.player ? G.player.pos : null;

    for (const ped of this.peds) {
      const pos = ped.group.position;
      let speed = ped.speed;
      let moveTarget = ped.target;

      // Flee a speeding player car, nearby gunfire, or a punch-up.
      if (carPos && carSpeed > 9 && pos.distanceTo(carPos) < 14) {
        ped.fleeing = true;
        ped.fleeTimer = Math.max(ped.fleeTimer, 1.5);
      }
      if (shotRecently && playerPos && pos.distanceTo(playerPos) < 25) {
        ped.fleeing = true;
        ped.fleeTimer = Math.max(ped.fleeTimer, 2);
      }

      if (ped.fleeing) {
        ped.fleeTimer -= dt;
        speed = FLEE_SPEED;
        const away = new THREE.Vector3().subVectors(pos, carPos || playerPos || pos).setY(0);
        if (away.lengthSq() < 0.01) away.set(1, 0, 0);
        away.normalize();
        moveTarget = pos.clone().addScaledVector(away, 10);
        if (ped.fleeTimer <= 0) {
          ped.fleeing = false;
          ped.target = randomSidewalkPoint(this.rng);
        }
      } else if (ped.idleTimer > 0) {
        ped.idleTimer -= dt;
        // Idle pedestrians turn to face where they are about to walk.
        const toNext = new THREE.Vector3().subVectors(ped.target, pos).setY(0);
        if (toNext.lengthSq() > 0.01) {
          const ty = Math.atan2(toNext.x, toNext.z);
          let dy = ty - ped.group.rotation.y;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          ped.group.rotation.y += dy * Math.min(1, dt * 2);
        }
        this.animatePed(ped, dt, 0);
        continue;
      }

      const toTarget = new THREE.Vector3().subVectors(moveTarget, pos).setY(0);
      const dist = toTarget.length();
      if (dist < 0.8) {
        if (ped.fleeing) {
          ped.target = randomSidewalkPoint(this.rng);
        } else {
          ped.idleTimer = 1 + this.rng() * 2.5;
          ped.target = randomSidewalkPoint(this.rng);
        }
        this.animatePed(ped, dt, 0);
        continue;
      }
      toTarget.normalize();
      pos.addScaledVector(toTarget, speed * dt);
      pos.x = Math.max(-WORLD_EDGE, Math.min(WORLD_EDGE, pos.x));
      pos.z = Math.max(-WORLD_EDGE, Math.min(WORLD_EDGE, pos.z));
      pos.y = 0;
      const targetYaw = Math.atan2(toTarget.x, toTarget.z);
      let dy = targetYaw - ped.group.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      ped.group.rotation.y += dy * Math.min(1, dt * 8);
      this.animatePed(ped, dt, speed);
    }
  }

  animatePed(ped, dt, speed) {
    ped.phase += dt * (2 + speed * 3.2);
    const swing = ped.fleeing ? 0.85 : 0.45;
    const legs = ped.group.userData.legs || [];
    const arms = ped.group.userData.arms || [];
    if (speed > 0.05) {
      const s = Math.sin(ped.phase) * swing;
      if (legs[0]) legs[0].rotation.x = s;
      if (legs[1]) legs[1].rotation.x = -s;
      if (arms[0]) arms[0].rotation.x = -s * 0.7;
      if (arms[1]) arms[1].rotation.x = s * 0.7;
      ped.group.position.y = Math.abs(Math.sin(ped.phase)) * (ped.fleeing ? 0.09 : 0.04);
    } else {
      if (legs[0]) legs[0].rotation.x *= 0.8;
      if (legs[1]) legs[1].rotation.x *= 0.8;
      if (arms[0]) arms[0].rotation.x *= 0.8;
      if (arms[1]) arms[1].rotation.x *= 0.8;
      ped.group.position.y = 0;
    }
  }
}
