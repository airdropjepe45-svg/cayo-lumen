// vehicles.js — Cayo Lumen: car meshes, AI traffic and the player's arcade car.
// All vehicles are original box-built models; no art from any commercial game.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const CFG = CONFIG || {};
const CAR_CFG = CFG.cars || {};
const ACCEL = CAR_CFG.accel ?? 22;
const BRAKE = CAR_CFG.brake ?? 30;
const REVERSE_MAX = CAR_CFG.reverseMax ?? 10;
const MAX_SPEED = CAR_CFG.maxSpeed ?? 42;
const SPORT_MAX = CAR_CFG.sportMax ?? 50;
const TRAFFIC_COUNT = CAR_CFG.trafficCount ?? 14;

const ROAD_LINES = [-360, -270, -180, -90, 0, 90, 180, 270, 360];
const WORLD_EDGE = 440;

const CAR_COLORS = [
  0xc23b3b, 0x2e6fc2, 0xe8b93c, 0x3fae6a, 0xe8e4da, 0x22242a,
  0xc26a2e, 0x7a4fc2, 0x4fc2b8, 0x9aa3ad, 0x8a2f4d, 0x3c7a3c,
];

const KIND_DIMS = {
  sedan: { len: 4.4, wid: 1.9, bodyH: 0.72, cabLen: 2.3, cabH: 0.62, cabZ: -0.15, wheelR: 0.36 },
  taxi: { len: 4.4, wid: 1.9, bodyH: 0.72, cabLen: 2.3, cabH: 0.62, cabZ: -0.15, wheelR: 0.36 },
  sport: { len: 4.3, wid: 2.0, bodyH: 0.58, cabLen: 1.9, cabH: 0.5, cabZ: -0.35, wheelR: 0.34 },
  truck: { len: 5.4, wid: 2.1, bodyH: 1.0, cabLen: 1.5, cabH: 0.85, cabZ: 1.55, wheelR: 0.42 },
  van: { len: 4.9, wid: 2.05, bodyH: 1.45, cabLen: 3.4, cabH: 0.55, cabZ: -0.3, wheelR: 0.38 },
};

function stdMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, metalness: opts.metalness ?? 0.55, roughness: opts.roughness ?? 0.4,
  });
}

function glowMat(color, intensity = 1.6) {
  return new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: intensity, roughness: 0.3,
  });
}

/**
 * Build an original box-model car. Forward is local +Z.
 * kind: 'sedan' | 'taxi' | 'sport' | 'truck' | 'van'.
 */
export function createCarMesh(kind, color) {
  const dims = KIND_DIMS[kind] || KIND_DIMS.sedan;
  const paint = color ?? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  const group = new THREE.Group();
  const wheels = [];

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(dims.wid, dims.bodyH, dims.len), stdMat(paint),
  );
  body.position.y = dims.wheelR + dims.bodyH / 2;
  body.castShadow = true;
  group.add(body);

  // Cabin / glasshouse. Trucks get a cab at the front plus an open bed.
  if (kind === 'truck') {
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(dims.wid * 0.94, dims.cabH, dims.cabLen),
      stdMat(0x14181d, { metalness: 0.85, roughness: 0.15 }),
    );
    cab.position.set(0, dims.wheelR + dims.bodyH + dims.cabH / 2 - 0.05, dims.cabZ);
    cab.castShadow = true;
    group.add(cab);
    const bedWall = new THREE.Mesh(
      new THREE.BoxGeometry(dims.wid, 0.34, dims.len - dims.cabLen - 0.6),
      stdMat(paint, { roughness: 0.55 }),
    );
    bedWall.position.set(0, dims.wheelR + dims.bodyH + 0.17, -1.2);
    group.add(bedWall);
  } else {
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(dims.wid * 0.86, dims.cabH, dims.cabLen),
      stdMat(0x14181d, { metalness: 0.85, roughness: 0.15 }),
    );
    cabin.position.set(0, dims.wheelR + dims.bodyH + dims.cabH / 2 - 0.04, dims.cabZ);
    cabin.castShadow = true;
    group.add(cabin);
  }

  // Wheels: cylinders with the axle along X.
  const wheelGeo = new THREE.CylinderGeometry(dims.wheelR, dims.wheelR, 0.26, 14);
  const wheelMat = stdMat(0x111214, { metalness: 0.2, roughness: 0.9 });
  const hubGeo = new THREE.CylinderGeometry(dims.wheelR * 0.55, dims.wheelR * 0.55, 0.28, 10);
  const hubMat = stdMat(0xb8bec6, { metalness: 0.9, roughness: 0.25 });
  const zx = dims.len * 0.32;
  const xx = dims.wid / 2 - 0.05;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * xx, dims.wheelR, sz * zx);
      wheel.castShadow = true;
      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.rotation.z = Math.PI / 2;
      wheel.add(hub);
      group.add(wheel);
      wheels.push(wheel);
    }
  }

  // Headlights (front, +Z) and taillights (rear, -Z).
  const lampGeo = new THREE.BoxGeometry(0.34, 0.14, 0.08);
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(lampGeo, glowMat(0xfff2c0, 2.2));
    head.position.set(sx * (dims.wid / 2 - 0.35), dims.wheelR + dims.bodyH * 0.62, dims.len / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(lampGeo, glowMat(0xff2a22, 1.8));
    tail.position.set(sx * (dims.wid / 2 - 0.35), dims.wheelR + dims.bodyH * 0.62, -dims.len / 2 - 0.02);
    group.add(tail);
  }

  if (kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.18, 0.4), glowMat(0xffc93c, 1.2),
    );
    sign.position.set(0, dims.wheelR + dims.bodyH + dims.cabH + 0.05, dims.cabZ);
    group.add(sign);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(dims.wid + 0.02, 0.16, dims.len * 0.7),
      stdMat(0x1c1c1c, { roughness: 0.6 }),
    );
    stripe.position.set(0, dims.wheelR + dims.bodyH * 0.55, 0);
    group.add(stripe);
  }
  if (kind === 'sport') {
    const spoiler = new THREE.Mesh(
      new THREE.BoxGeometry(dims.wid * 0.9, 0.07, 0.42), stdMat(0x14161a, { metalness: 0.7, roughness: 0.3 }),
    );
    spoiler.position.set(0, dims.wheelR + dims.bodyH + 0.28, -dims.len / 2 + 0.28);
    spoiler.castShadow = true;
    group.add(spoiler);
    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(dims.wid + 0.06, 0.16, dims.len * 0.8),
      stdMat(0x14161a, { roughness: 0.5 }),
    );
    skirt.position.set(0, dims.wheelR + 0.06, 0);
    group.add(skirt);
  }
  if (kind === 'van') {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(dims.wid + 0.02, 0.22, dims.len * 0.9),
      stdMat(0xe8e4da, { roughness: 0.5 }),
    );
    stripe.position.set(0, dims.wheelR + dims.bodyH * 0.8, 0);
    group.add(stripe);
  }

  group.userData.kind = kind;
  group.userData.wheels = wheels;
  group.userData.wheelR = dims.wheelR;
  return group;
}

function laneOffset(axis, dir) {
  // Right-hand traffic: offset 3.5 m from the road centre line.
  return axis === 'x' ? dir * 3.5 : -dir * 3.5;
}

function pickRoadLine(rng) {
  return ROAD_LINES[Math.floor(rng() * ROAD_LINES.length)];
}

function nextIntersection(m, dir) {
  if (dir > 0) return Math.ceil((m + 0.5) / 90) * 90;
  return Math.floor((m - 0.5) / 90) * 90;
}

function randomKind(rng) {
  const kinds = ['sedan', 'sedan', 'sedan', 'taxi', 'sport', 'truck', 'van'];
  return kinds[Math.floor(rng() * kinds.length)];
}

/** AI traffic: cars that follow the road grid, turn at intersections and brake. */
export class TrafficManager {
  constructor(G) {
    this.G = G;
    this.rng = G.rng || Math.random;
    this.cars = [];
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) this.spawnCar();
  }

  spawnCar() {
    const rng = this.rng;
    const kind = randomKind(rng);
    const color = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
    const group = createCarMesh(kind, color);
    const axis = rng() < 0.5 ? 'x' : 'z';
    const dir = rng() < 0.5 ? 1 : -1;
    const road = pickRoadLine(rng);
    const moving = pickRoadLine(rng) + (rng() * 40 - 20);
    const car = {
      group, kind, axis, dir, road,
      cruise: 8 + rng() * 6,
      speed: 0,
      parked: false,
      angle: 0,
    };
    if (axis === 'x') {
      group.position.set(moving, 0, road + laneOffset('x', dir));
      car.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      group.position.set(road + laneOffset('z', dir), 0, moving);
      car.angle = dir > 0 ? Math.PI : 0;
    }
    group.rotation.y = car.angle;
    this.G.scene.add(group);
    this.cars.push(car);
    return car;
  }

  /** Nearest car (traffic or parked) within r metres of pos, or null. */
  nearestCar(pos, r) {
    let best = null;
    let bestD = r;
    for (const car of this.cars) {
      const d = car.group.position.distanceTo(pos);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  /** Remove a car from traffic (e.g. stolen by the player). Keeps its mesh alive. */
  removeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }

  /** Park a car the player left behind; it stays visible but never drives. */
  addParkedCar(car) {
    car.parked = true;
    car.speed = 0;
    if (!this.cars.includes(car)) this.cars.push(car);
  }

  /** A parked car that the player may steal counts as traffic again when re-added. */
  unparkCar(car) {
    car.parked = false;
    car.cruise = 8 + this.rng() * 6;
  }

  carAhead(car) {
    const pos = car.group.position;
    const moving = car.axis === 'x' ? pos.x : pos.z;
    const fixed = car.axis === 'x' ? pos.z : pos.x;
    for (const other of this.cars) {
      if (other === car || other.parked) continue;
      if (other.axis !== car.axis) continue;
      const oPos = other.group.position;
      const oFixed = car.axis === 'x' ? oPos.z : oPos.x;
      if (Math.abs(oFixed - fixed) > 4) continue;
      const oMoving = car.axis === 'x' ? oPos.x : oPos.z;
      const gap = (oMoving - moving) * car.dir;
      if (gap > 0 && gap < 12) return other;
    }
    // Brake for the player's car when it is right ahead.
    const pc = this.G.playerCar;
    if (pc && pc.inCar && pc.group) {
      const pPos = pc.group.position;
      const pFixed = car.axis === 'x' ? pPos.z : pPos.x;
      if (Math.abs(pFixed - fixed) < 4) {
        const pMoving = car.axis === 'x' ? pPos.x : pPos.z;
        const gap = (pMoving - moving) * car.dir;
        if (gap > 0 && gap < 12) return { player: true };
      }
    }
    return null;
  }

  update(dt) {
    const rng = this.rng;
    for (const car of this.cars) {
      if (car.parked) continue;
      const blocked = this.carAhead(car);
      const target = blocked ? 0 : car.cruise;
      const rate = target > car.speed ? 6 : 14;
      car.speed += Math.max(-rate * dt, Math.min(rate * dt, target - car.speed));

      const pos = car.group.position;
      const moving = car.axis === 'x' ? pos.x : pos.z;
      const inter = nextIntersection(moving, car.dir);
      const distToInter = Math.abs(inter - moving);
      const step = car.speed * dt;
      const atEdge = Math.abs(inter) > 360;

      if (distToInter <= step + 0.6 && (atEdge || rng() < 0.3)) {
        // Turn at this intersection (forced at the edge of the road grid).
        const newDir = atEdge ? (rng() < 0.5 ? 1 : -1) : (rng() < 0.5 ? 1 : -1);
        const newAxis = car.axis === 'x' ? 'z' : 'x';
        if (car.axis === 'x') {
          car.axis = 'z';
          car.dir = newDir;
          car.road = inter;
          pos.x = inter + laneOffset('z', newDir);
          car.angle = newDir > 0 ? Math.PI : 0;
        } else {
          car.axis = 'x';
          car.dir = newDir;
          car.road = inter;
          pos.z = inter + laneOffset('x', newDir);
          car.angle = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        car.group.rotation.y = car.angle;
      } else if (atEdge && distToInter <= step + 0.6) {
        // Safety net: U-turn instead of driving off the grid.
        car.dir *= -1;
        if (car.axis === 'x') {
          pos.z = car.road + laneOffset('x', car.dir);
          car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          pos.x = car.road + laneOffset('z', car.dir);
          car.angle = car.dir > 0 ? Math.PI : 0;
        }
        car.group.rotation.y = car.angle;
      }

      const forward = car.axis === 'x'
        ? new THREE.Vector3(car.dir, 0, 0)
        : new THREE.Vector3(0, 0, car.dir);
      pos.addScaledVector(forward, car.speed * dt);
      // Keep the car glued to its lane.
      if (car.axis === 'x') pos.z = car.road + laneOffset('x', car.dir);
      else pos.x = car.road + laneOffset('z', car.dir);
      pos.x = Math.max(-WORLD_EDGE, Math.min(WORLD_EDGE, pos.x));
      pos.z = Math.max(-WORLD_EDGE, Math.min(WORLD_EDGE, pos.z));
      pos.y = 0;

      const wheels = car.group.userData.wheels || [];
      const spin = (car.speed * dt) / (car.group.userData.wheelR || 0.36);
      for (const w of wheels) w.rotation.x += spin;
    }
  }
}

function keysDown(input, ...codes) {
  if (!input || !input.keys) return false;
  for (const c of codes) if (input.keys.has(c)) return true;
  return false;
}

/** The car the player is driving: arcade physics, collisions, heat from hits. */
export class PlayerCar {
  constructor(G) {
    this.G = G;
    this.car = null;
    this.group = null;
    this.kind = 'sedan';
    this.speed = 0;
    this.angle = 0;
    this.steer = 0;
    this.inCar = false;
    this.maxSpeed = MAX_SPEED;
    this.crashCooldown = 0;
    this.heatCooldown = 0;
    this.drifting = false;
  }

  attach(carRecord) {
    this.car = carRecord;
    this.group = carRecord.group;
    this.kind = carRecord.kind || 'sedan';
    this.maxSpeed = this.kind === 'sport' ? SPORT_MAX
      : this.kind === 'truck' ? 36 : this.kind === 'van' ? 38 : MAX_SPEED;
    this.angle = carRecord.angle ?? carRecord.group.rotation.y ?? 0;
    this.speed = carRecord.speed || 0;
    this.inCar = true;
    this.steer = 0;
    if (this.G) {
      this.G.playerCar = this;
    }
  }

  detach() {
    const record = this.car;
    if (record) {
      record.speed = Math.max(0, this.speed);
      record.angle = this.angle;
      record.group.rotation.y = this.angle;
    }
    this.car = null;
    this.group = null;
    this.speed = 0;
    this.inCar = false;
    return record;
  }

  resolveBuildings(pos) {
    const world = this.G.world;
    if (world && typeof world.resolveCircle === 'function') {
      const before = pos.clone();
      const hit = world.resolveCircle(pos, 2.3);
      return hit || before.distanceToSquared(pos) > 0.000001;
    }
    if (world && Array.isArray(world.colliders)) {
      let hit = false;
      for (const c of world.colliders) {
        const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < 2.3 * 2.3) {
          const d = Math.sqrt(d2) || 0.001;
          const push = (2.3 - d) / d;
          pos.x += dx * push;
          pos.z += dz * push;
          hit = true;
        }
      }
      return hit;
    }
    return false;
  }

  update(dt, input) {
    if (!this.inCar || !this.group) return;
    const inp = input || this.G.input || { keys: new Set() };
    const G = this.G;
    if (this.crashCooldown > 0) this.crashCooldown -= dt;
    if (this.heatCooldown > 0) this.heatCooldown -= dt;

    const throttle = keysDown(inp, 'KeyW', 'ArrowUp');
    const braking = keysDown(inp, 'KeyS', 'ArrowDown');
    const left = keysDown(inp, 'KeyA', 'ArrowLeft');
    const right = keysDown(inp, 'KeyD', 'ArrowRight');
    const handbrake = keysDown(inp, 'Space');

    if (throttle) this.speed += ACCEL * dt;
    if (braking) {
      if (this.speed > 0.5) this.speed -= BRAKE * dt;
      else this.speed -= ACCEL * 0.55 * dt;
    }
    if (!throttle && !braking) {
      // Rolling drag.
      const drag = 7 * dt;
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), drag);
    }
    this.speed = Math.max(-REVERSE_MAX, Math.min(this.maxSpeed, this.speed));

    const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 10);
    const speedFactor = Math.min(1, Math.abs(this.speed) / 9);
    const grip = handbrake ? 1.9 : 1;
    this.drifting = handbrake && Math.abs(this.speed) > 8;
    if (this.drifting) this.speed *= Math.max(0, 1 - 0.55 * dt);
    const dirSign = this.speed >= 0 ? 1 : -1;
    this.angle += this.steer * 1.75 * grip * speedFactor * dirSign * dt;

    const pos = this.group.position;
    const forward = new THREE.Vector3(Math.sin(this.angle), 0, Math.cos(this.angle));
    pos.addScaledVector(forward, this.speed * dt);
    pos.y = 0;
    if (G.world && typeof G.world.clampToWorld === 'function') G.world.clampToWorld(pos);
    else {
      pos.x = Math.max(-WORLD_EDGE, Math.min(WORLD_EDGE, pos.x));
      pos.z = Math.max(-WORLD_EDGE, Math.min(WORLD_EDGE, pos.z));
    }

    // Buildings: bounce off, lose speed, make noise and a little heat.
    if (this.resolveBuildings(pos)) {
      if (Math.abs(this.speed) > 4 && this.crashCooldown <= 0) {
        G.audio?.play?.('crash');
        G.hud?.flash?.('Crash!');
        if (this.heatCooldown <= 0) {
          G.police?.addHeat?.(1);
          this.heatCooldown = 2;
        }
        this.crashCooldown = 0.6;
      }
      this.speed *= -0.22;
    }

    // Traffic: shove the other car, lose speed, small heat for the smash.
    if (G.traffic) {
      for (const other of G.traffic.cars) {
        if (!other || other === this.car || other.group === this.group) continue;
        const d = other.group.position.distanceTo(pos);
        if (d < 4.4 && d > 0.001) {
          const push = new THREE.Vector3().subVectors(other.group.position, pos).setY(0).normalize();
          other.group.position.addScaledVector(push, (4.4 - d) * 0.8);
          other.speed = Math.max(0, (other.speed || 0) - 4);
          if (Math.abs(this.speed) > 6 && this.crashCooldown <= 0) {
            G.audio?.play?.('crash');
            if (this.heatCooldown <= 0) {
              G.police?.addHeat?.(2);
              this.heatCooldown = 2;
            }
            this.crashCooldown = 0.6;
          }
          this.speed *= 0.62;
        }
      }
    }

    // Pedestrians: hitting one is a crime — heat, sound, and they scatter.
    if (G.peds) {
      const ped = G.peds.nearestPed ? G.peds.nearestPed(pos, 3.4) : null;
      if (ped) {
        if (this.heatCooldown <= 0) {
          G.police?.addHeat?.(8);
          this.heatCooldown = 1.5;
        }
        G.audio?.play?.('crash');
        G.hud?.flash?.('Pedestrian hit!');
        if (typeof G.peds.fleeFrom === 'function') G.peds.fleeFrom(pos, 40);
        this.speed *= 0.7;
      }
    }

    this.group.rotation.y = this.angle;
    const wheels = this.group.userData.wheels || [];
    const spin = (this.speed * dt) / (this.group.userData.wheelR || 0.36);
    for (const w of wheels) w.rotation.x += spin;
    // Front wheels visually steer. Wheel order is (rear-left, front-left,
    // rear-right, front-right), so the front pair is indices 1 and 3.
    if (wheels.length >= 4) {
      wheels[1].rotation.y = this.steer * 0.38;
      wheels[3].rotation.y = this.steer * 0.38;
    }
  }
}
