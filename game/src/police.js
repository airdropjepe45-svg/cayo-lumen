// police.js — Cayo Lumen: wanted level, cop cars, foot officers, heli, roadblocks.
// All units are original; the force is the fictional "Lumen Port Authority".
import * as THREE from 'three';
import { CONFIG } from './config.js';

const CFG = CONFIG || {};
const POLICE_CFG = CFG.police || {};
const WANTED_THRESHOLDS = POLICE_CFG.thresholds ?? [20, 40, 60, 80, 95];
const HEAT_DECAY = POLICE_CFG.heatDecay ?? 4;
const DECAY_GRACE = 8;
const MAX_COP_CARS = POLICE_CFG.maxCopCars ?? 6;
const SAFEHOUSE = new THREE.Vector3(-90, 0, -270);
const ROAD_LINES = [-360, -270, -180, -90, 0, 90, 180, 270, 360];

function stdMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, metalness: opts.metalness ?? 0.4, roughness: opts.roughness ?? 0.5,
  });
}

/** Original black-and-white patrol car with a red/blue light bar. */
function buildCopCarMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.72, 4.4), stdMat(0xe8e8e8, { metalness: 0.55, roughness: 0.35 }));
  body.position.y = 0.72;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.62, 2.3), stdMat(0x14181d, { metalness: 0.85, roughness: 0.15 }));
  cabin.position.set(0, 1.35, -0.15);
  cabin.castShadow = true;
  group.add(cabin);
  // Black hood + trunk bands, white doors: the classic two-tone look.
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.1, 1.0), stdMat(0x14161a, { roughness: 0.4 }));
  hood.position.set(0, 1.06, 1.55);
  group.add(hood);
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.1, 0.9), stdMat(0x14161a, { roughness: 0.4 }));
  trunk.position.set(0, 1.06, -1.6);
  group.add(trunk);

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
  const wheelMat = stdMat(0x111214, { metalness: 0.2, roughness: 0.9 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 0.9, 0.36, sz * 1.42);
      group.add(wheel);
    }
  }
  const lampGeo = new THREE.BoxGeometry(0.34, 0.14, 0.08);
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(lampGeo, new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xfff2c0, emissiveIntensity: 2.2 }));
    head.position.set(sx * 0.55, 0.85, 2.22);
    group.add(head);
    const tail = new THREE.Mesh(lampGeo, new THREE.MeshStandardMaterial({ color: 0xff2a22, emissive: 0xff2a22, emissiveIntensity: 1.8 }));
    tail.position.set(sx * 0.55, 0.85, -2.22);
    group.add(tail);
  }
  // Roof light bar: red left, blue right, flashing in update().
  const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.34), stdMat(0x222222));
  barBase.position.set(0, 1.72, -0.15);
  group.add(barBase);
  const red = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.16, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2 }),
  );
  red.position.set(-0.28, 1.8, -0.15);
  const blue = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.16, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x2040ff, emissive: 0x2040ff, emissiveIntensity: 2 }),
  );
  blue.position.set(0.28, 1.8, -0.15);
  group.add(red);
  group.add(blue);
  group.userData.lightRed = red;
  group.userData.lightBlue = blue;
  return group;
}

/** Original foot officer: navy uniform, cap, badge dot. */
function buildOfficerMesh() {
  const group = new THREE.Group();
  const navy = stdMat(0x1d2f55, { roughness: 0.85 });
  const skin = stdMat(0xc98d5f, { roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.32), navy);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.03),
    new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0xffc93c, emissiveIntensity: 0.7 }),
  );
  badge.position.set(-0.14, 1.28, 0.17);
  group.add(badge);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.24, 0.1, 12), stdMat(0x141a26, { roughness: 0.7 }));
  cap.position.y = 1.78;
  group.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.18), stdMat(0x141a26));
  brim.position.set(0, 1.74, 0.2);
  group.add(brim);
  const legGeo = new THREE.BoxGeometry(0.2, 0.78, 0.22);
  const legL = new THREE.Mesh(legGeo, stdMat(0x141a26, { roughness: 0.9 }));
  legL.position.set(-0.15, 0.39, 0);
  const legR = new THREE.Mesh(legGeo, stdMat(0x141a26, { roughness: 0.9 }));
  legR.position.set(0.15, 0.39, 0);
  group.add(legL);
  group.add(legR);
  const armGeo = new THREE.BoxGeometry(0.14, 0.62, 0.16);
  const armL = new THREE.Mesh(armGeo, navy);
  armL.position.set(-0.37, 1.12, 0);
  const armR = new THREE.Mesh(armGeo, navy);
  armR.position.set(0.37, 1.12, 0);
  group.add(armL);
  group.add(armR);
  group.userData.legs = [legL, legR];
  group.userData.arms = [armL, armR];
  return group;
}

/** Original news-style helicopter: dark body, tail boom, spinning rotor. */
function buildHeliMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 3.4), stdMat(0x22303e, { metalness: 0.6, roughness: 0.4 }));
  body.castShadow = true;
  group.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 1.0), stdMat(0x0e1418, { metalness: 0.9, roughness: 0.1 }));
  glass.position.set(0, 0.25, 1.45);
  group.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.2), stdMat(0x22303e, { metalness: 0.6, roughness: 0.4 }));
  tail.position.set(0, 0.2, -3.6);
  group.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.2, 0.9), stdMat(0x22303e));
  fin.position.set(0, 0.7, -5.5);
  group.add(fin);
  const rotor = new THREE.Group();
  const bladeGeo = new THREE.BoxGeometry(7.6, 0.07, 0.42);
  const bladeMat = stdMat(0x11141a, { metalness: 0.7, roughness: 0.4 });
  rotor.add(new THREE.Mesh(bladeGeo, bladeMat));
  const blade2 = new THREE.Mesh(bladeGeo, bladeMat);
  blade2.rotation.y = Math.PI / 2;
  rotor.add(blade2);
  rotor.position.y = 0.95;
  group.add(rotor);
  const skidGeo = new THREE.BoxGeometry(0.14, 0.14, 3.0);
  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(skidGeo, stdMat(0x11141a));
    skid.position.set(sx * 1.0, -0.85, 0);
    group.add(skid);
  }
  group.userData.rotor = rotor;
  return group;
}

function randomRoadPoint(rng, cx, cz, minDist, maxDist) {
  // Pick a point on the road grid at a distance band from (cx, cz).
  for (let tries = 0; tries < 12; tries += 1) {
    const ang = rng() * Math.PI * 2;
    const dist = minDist + rng() * (maxDist - minDist);
    const x = cx + Math.cos(ang) * dist;
    const z = cz + Math.sin(ang) * dist;
    const onAvenue = ROAD_LINES.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a), 0);
    const onStreet = ROAD_LINES.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a), 0);
    const px = Math.abs(onAvenue - x) < Math.abs(onStreet - z) ? onAvenue : x;
    const pz = Math.abs(onAvenue - x) < Math.abs(onStreet - z) ? z : onStreet;
    const snapped = new THREE.Vector3(
      Math.max(-430, Math.min(430, px)),
      0,
      Math.max(-430, Math.min(430, pz)),
    );
    if (snapped.distanceTo(new THREE.Vector3(cx, 0, cz)) >= minDist * 0.7) return snapped;
  }
  return new THREE.Vector3(
    Math.max(-430, Math.min(430, cx + 180)),
    0,
    Math.max(-430, Math.min(430, cz)),
  );
}

/** Wanted level, police pursuit, arrests, helicopter and roadblocks. */
export class PoliceManager {
  constructor(G) {
    this.G = G;
    this.rng = G.rng || Math.random;
    this.heat = 0;
    this.wanted = 0;
    this.lastCrimeAt = -100;
    this.copCars = [];
    this.officers = [];
    this.heli = null;
    this.heliLight = null;
    this.heliAngle = 0;
    this.roadblock = null;
    this.roadblockTimer = 0;
    this.sirenOn = false;
    this.flashTimer = 0;
    G.wanted = 0;
    G.heat = 0;
  }

  addHeat(n) {
    if (this.G.state !== 'playing') return;
    this.heat = Math.min(100, this.heat + n);
    this.lastCrimeAt = this.G.time;
    this.G.heat = this.heat;
    this.updateWanted();
  }

  getWanted() {
    return this.wanted;
  }

  updateWanted() {
    let w = 0;
    for (const t of WANTED_THRESHOLDS) if (this.heat >= t) w += 1;
    if (w !== this.wanted) {
      const rising = w > this.wanted;
      this.wanted = w;
      this.G.wanted = w;
      if (rising) {
        this.G.hud?.flash?.(w >= 3 ? `WANTED LEVEL ${w} — lose them!` : `Wanted level ${w}`);
        this.G.audio?.play?.('siren');
        this.sirenOn = true;
      }
      if (w === 0) this.clearPursuit();
    }
  }

  clearPursuit() {
    for (const car of this.copCars) this.G.scene.remove(car.group);
    this.copCars = [];
    for (const off of this.officers) this.G.scene.remove(off.group);
    this.officers = [];
    this.removeHeli();
    this.removeRoadblock();
    this.sirenOn = false;
  }

  playerPos() {
    if (this.G.player) return this.G.player.pos;
    return new THREE.Vector3(0, 0, 0);
  }

  spawnCopCar() {
    const p = this.playerPos();
    const spot = randomRoadPoint(this.rng, p.x, p.z, 150, 250);
    const group = buildCopCarMesh();
    group.position.copy(spot);
    this.G.scene.add(group);
    const car = { group, angle: 0, speed: 0, ramCooldown: 0 };
    this.copCars.push(car);
    return car;
  }

  spawnOfficer(atPos) {
    const group = buildOfficerMesh();
    group.position.copy(atPos);
    group.position.y = 0;
    this.G.scene.add(group);
    const off = { group, arrestTimer: 0, phase: this.rng() * Math.PI * 2, guard: false };
    this.officers.push(off);
    return off;
  }

  removeHeli() {
    if (this.heli) {
      this.G.scene.remove(this.heli);
      this.heli = null;
    }
    if (this.heliLight) {
      this.G.scene.remove(this.heliLight);
      this.G.scene.remove(this.heliLight.target);
      this.heliLight = null;
    }
  }

  ensureHeli() {
    if (this.heli) return;
    const p = this.playerPos();
    this.heli = buildHeliMesh();
    this.heli.position.set(p.x + 25, 42, p.z);
    this.G.scene.add(this.heli);
    this.heliLight = new THREE.SpotLight(0xfff2c0, 900, 120, 0.32, 0.45, 1.2);
    this.heliLight.position.copy(this.heli.position);
    this.heliLight.target.position.copy(p);
    this.G.scene.add(this.heliLight);
    this.G.scene.add(this.heliLight.target);
    this.G.hud?.flash?.('Police helicopter overhead!');
  }

  removeRoadblock() {
    if (!this.roadblock) return;
    for (const car of this.roadblock.cars) this.G.scene.remove(car);
    for (const off of this.roadblock.officers) {
      this.G.scene.remove(off.group);
      const i = this.officers.indexOf(off);
      if (i >= 0) this.officers.splice(i, 1);
    }
    this.roadblock = null;
  }

  placeRoadblock() {
    this.removeRoadblock();
    const p = this.playerPos();
    const pc = this.G.playerCar;
    const heading = pc && pc.inCar ? pc.angle : (this.G.player ? this.G.player.yaw : 0);
    const ahead = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    const centre = p.clone().addScaledVector(ahead, 85);
    // Snap the block onto the nearest road line.
    const onAvenue = ROAD_LINES.reduce((a, b) => (Math.abs(b - centre.x) < Math.abs(a - centre.x) ? b : a), 0);
    const onStreet = ROAD_LINES.reduce((a, b) => (Math.abs(b - centre.z) < Math.abs(a - centre.z) ? b : a), 0);
    const acrossRoad = Math.abs(onAvenue - centre.x) < Math.abs(onStreet - centre.z);
    const cars = [];
    const officers = [];
    for (const off of [-4.2, 4.2]) {
      const car = buildCopCarMesh();
      if (acrossRoad) car.position.set(onAvenue + off, 0, centre.z);
      else car.position.set(centre.x, 0, onStreet + off);
      car.rotation.y = acrossRoad ? 0 : Math.PI / 2;
      this.G.scene.add(car);
      cars.push(car);
    }
    for (const off of [-8, 8]) {
      const pos = acrossRoad
        ? new THREE.Vector3(onAvenue + off, 0, centre.z + 5)
        : new THREE.Vector3(centre.x + 5, 0, onStreet + off);
      const officer = this.spawnOfficer(pos);
      officer.guard = true;
      officers.push(officer);
    }
    this.roadblock = { cars, officers, centre };
    this.G.hud?.flash?.('Roadblock ahead!');
  }

  copSeesPlayer() {
    const p = this.playerPos();
    for (const car of this.copCars) {
      const d = car.group.position.distanceTo(p);
      if (d < 60) {
        const toPlayer = new THREE.Vector3().subVectors(p, car.group.position).setY(0).normalize();
        const fwd = new THREE.Vector3(Math.sin(car.angle), 0, Math.cos(car.angle));
        if (fwd.dot(toPlayer) > 0.2) return true;
      }
    }
    for (const off of this.officers) {
      if (off.group.position.distanceTo(p) < 40) return true;
    }
    return false;
  }

  busted() {
    const G = this.G;
    const fine = Math.min(G.money || 0, 150);
    if (G.economy && typeof G.economy.spend === 'function') G.economy.spend(fine);
    else G.money = Math.max(0, (G.money || 0) - fine);
    this.heat = 0;
    this.wanted = 0;
    G.heat = 0;
    G.wanted = 0;
    this.clearPursuit();
    if (G.player) G.player.respawnAtSafehouse();
    G.hud?.flash?.(`BUSTED! You paid a $${fine} fine.`);
    G.audio?.play?.('fail');
  }

  update(dt) {
    const G = this.G;
    if (G.state !== 'playing') return;
    this.flashTimer += dt;

    // Heat decays only after 8 s without a crime and no cop watching.
    if (G.time - this.lastCrimeAt > DECAY_GRACE && !this.copSeesPlayer() && this.heat > 0) {
      this.heat = Math.max(0, this.heat - HEAT_DECAY * dt);
      G.heat = this.heat;
      this.updateWanted();
    }

    const p = this.playerPos();
    const inCar = G.player ? G.player.inCar : false;

    // Cop cars: wanted count, capped at 6.
    const wantCars = this.wanted > 0 ? Math.min(this.wanted, MAX_COP_CARS) : 0;
    while (this.copCars.length < wantCars) this.spawnCopCar();
    while (this.copCars.length > wantCars) {
      const car = this.copCars.pop();
      G.scene.remove(car.group);
    }

    // Flash the light bars.
    const on = Math.floor(this.flashTimer * 6) % 2 === 0;
    for (const car of this.copCars) {
      if (car.group.userData.lightRed) car.group.userData.lightRed.material.emissiveIntensity = on ? 3 : 0.2;
      if (car.group.userData.lightBlue) car.group.userData.lightBlue.material.emissiveIntensity = on ? 0.2 : 3;
    }

    // Chase + ram. Each cop aims at a slightly different point around the
    // player so they fan out instead of piling onto one spot.
    for (let ci = 0; ci < this.copCars.length; ci += 1) {
      const car = this.copCars[ci];
      if (car.ramCooldown > 0) car.ramCooldown -= dt;
      const pos = car.group.position;
      const lateral = ((ci % 3) - 1) * 4.5;
      const chaseTarget = p.clone();
      const heading = G.player ? G.player.yaw : 0;
      chaseTarget.x += Math.cos(heading) * lateral;
      chaseTarget.z -= Math.sin(heading) * lateral;
      const toPlayer = new THREE.Vector3().subVectors(chaseTarget, pos).setY(0);
      const dist = pos.distanceTo(p);
      if (dist > 0.01) {
        toPlayer.normalize();
        const targetAngle = Math.atan2(toPlayer.x, toPlayer.z);
        let dy = targetAngle - car.angle;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        car.angle += dy * Math.min(1, dt * 2.2);
        const top = 30 + this.wanted * 2.5;
        car.speed += Math.max(-40 * dt, Math.min(22 * dt, top - car.speed));
        pos.addScaledVector(new THREE.Vector3(Math.sin(car.angle), 0, Math.cos(car.angle)), car.speed * dt);
        pos.y = 0;
        car.group.rotation.y = car.angle;
      }
      if (dist > 320) {
        // Too far behind: respawn closer to the player.
        const spot = randomRoadPoint(this.rng, p.x, p.z, 150, 220);
        pos.copy(spot);
        car.speed = 10;
      }
      // Ram the player's car.
      if (inCar && dist < 5 && car.ramCooldown <= 0) {
        const pc = G.playerCar;
        if (pc) pc.speed *= 0.62;
        car.speed *= 0.5;
        car.ramCooldown = 1.2;
        G.audio?.play?.('crash');
        G.hud?.flash?.('Cop rammed you!');
        this.addHeat(1);
      }
      // Bump a fleeing player on foot.
      if (!inCar && dist < 2.5 && car.ramCooldown <= 0) {
        car.ramCooldown = 1.5;
        G.combat?.damagePlayer?.(6);
      }
    }

    // Foot officers: chase on foot, arrest after 3 s pressed close.
    const wantOfficers = !inCar && this.wanted > 0 ? Math.min(this.wanted, 4) : 0;
    const footOfficers = this.officers.filter((o) => !o.guard);
    while (footOfficers.length < wantOfficers) {
      const spot = randomRoadPoint(this.rng, p.x, p.z, 30, 60);
      footOfficers.push(this.spawnOfficer(spot));
    }
    for (const off of [...footOfficers]) {
      const pos = off.group.position;
      const toPlayer = new THREE.Vector3().subVectors(p, pos).setY(0);
      const dist = toPlayer.length();
      if (dist > 130) {
        const spot = randomRoadPoint(this.rng, p.x, p.z, 30, 60);
        pos.copy(spot);
        off.arrestTimer = 0;
        continue;
      }
      if (dist > 0.01) {
        toPlayer.normalize();
        pos.addScaledVector(toPlayer, 5.4 * dt);
        pos.y = 0;
        off.group.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        off.phase += dt * 9;
        const s = Math.sin(off.phase) * 0.6;
        const legs = off.group.userData.legs || [];
        if (legs[0]) legs[0].rotation.x = s;
        if (legs[1]) legs[1].rotation.x = -s;
      }
      if (dist < 2.2) {
        off.arrestTimer += dt;
        if (off.arrestTimer > 3) {
          this.busted();
          return;
        }
      } else {
        off.arrestTimer = Math.max(0, off.arrestTimer - dt * 2);
      }
    }
    // Drop surplus officers.
    while (this.officers.filter((o) => !o.guard).length > wantOfficers) {
      const i = this.officers.findIndex((o) => !o.guard);
      if (i < 0) break;
      G.scene.remove(this.officers[i].group);
      this.officers.splice(i, 1);
    }

    // Helicopter at wanted 4+.
    if (this.wanted >= 4) {
      this.ensureHeli();
      this.heliAngle += dt * 0.35;
      const hx = p.x + Math.cos(this.heliAngle) * 26;
      const hz = p.z + Math.sin(this.heliAngle) * 26;
      this.heli.position.set(hx, 42 + Math.sin(this.G.time * 0.8) * 1.5, hz);
      this.heli.rotation.y = -this.heliAngle;
      if (this.heli.userData.rotor) this.heli.userData.rotor.rotation.y += dt * 22;
      if (this.heliLight) {
        this.heliLight.position.copy(this.heli.position);
        this.heliLight.target.position.copy(p);
        this.heliLight.target.updateMatrixWorld();
      }
    } else if (this.heli) {
      this.removeHeli();
    }

    // Roadblock at wanted 3+.
    if (this.wanted >= 3) {
      this.roadblockTimer -= dt;
      if (!this.roadblock) this.placeRoadblock();
      else if (this.roadblockTimer <= 0) {
        // Re-place ahead of the player as they move on.
        if (this.roadblock.centre.distanceTo(p) > 160) this.placeRoadblock();
        this.roadblockTimer = 4;
      }
    } else if (this.roadblock) {
      this.removeRoadblock();
    }
  }
}
