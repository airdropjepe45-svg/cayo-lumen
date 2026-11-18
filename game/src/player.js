// player.js — Cayo Lumen: Mara Voss on foot (walk/run/hop/punch/steal cars).
// Camera yaw/pitch come from the mouse; movement is camera-relative.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const CFG = CONFIG || {};
const PLAYER_CFG = CFG.player || {};
const WALK_SPEED = PLAYER_CFG.walkSpeed ?? 3.8;
const RUN_SPEED = PLAYER_CFG.runSpeed ?? 6.5;
const HOP_VELOCITY = PLAYER_CFG.hopVelocity ?? 6;
const GRAVITY = PLAYER_CFG.gravity ?? 14;
const ENTER_RADIUS = 4;
const SAFEHOUSE = new THREE.Vector3(-90, 0, -270);

function keysDown(input, ...codes) {
  if (!input || !input.keys) return false;
  for (const c of codes) if (input.keys.has(c)) return true;
  return false;
}

function buildPlayerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x1f8a7a, roughness: 0.8 });
  const denim = new THREE.MeshStandardMaterial({ color: 0x2b3a55, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98d5f, roughness: 0.7 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.32), jacket);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);

  // Teal jacket stripe so Mara reads at a distance.
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.12, 0.34),
    new THREE.MeshStandardMaterial({ color: 0xffc93c, roughness: 0.6 }),
  );
  stripe.position.y = 1.3;
  group.add(stripe);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
    new THREE.MeshStandardMaterial({ color: 0x2a1608, roughness: 0.95 }),
  );
  hair.position.y = 1.66;
  group.add(hair);

  // Ponytail.
  const tail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.04, 0.42, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a1608, roughness: 0.95 }),
  );
  tail.position.set(0, 1.45, -0.24);
  tail.rotation.x = 0.35;
  group.add(tail);

  const legGeo = new THREE.BoxGeometry(0.2, 0.78, 0.22);
  const legL = new THREE.Mesh(legGeo, denim);
  legL.position.set(-0.15, 0.39, 0);
  const legR = new THREE.Mesh(legGeo, denim);
  legR.position.set(0.15, 0.39, 0);
  legL.castShadow = true;
  legR.castShadow = true;
  group.add(legL);
  group.add(legR);

  const armGeo = new THREE.BoxGeometry(0.14, 0.62, 0.16);
  const armL = new THREE.Mesh(armGeo, jacket);
  armL.position.set(-0.37, 1.12, 0);
  const armR = new THREE.Mesh(armGeo, jacket);
  armR.position.set(0.37, 1.12, 0);
  group.add(armL);
  group.add(armR);

  group.userData.legs = [legL, legR];
  group.userData.arms = [armL, armR];
  return group;
}

/** The protagonist on foot; delegates driving to G.playerCar (PlayerCar). */
export class Player {
  constructor(G) {
    this.G = G;
    this.pos = SAFEHOUSE.clone();
    this.yaw = Math.PI * 0.75;
    this.camYaw = Math.PI * 0.75;
    this.camPitch = -0.18;
    this.inCar = false;
    this.health = 100;
    this.vy = 0;
    this.onGround = true;
    this.walkPhase = 0;
    this.moving = false;
    this.running = false;
    this.prevE = false;
    this.prevF = false;
    this.prevSpace = false;
    this.mesh = buildPlayerMesh();
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    G.scene.add(this.mesh);
    G.player = this;
    if (typeof G.health !== 'number') G.health = 100;
  }

  /** Where the garage / safehouse is — the busted-respawn point. */
  get safehousePos() {
    return SAFEHOUSE.clone();
  }

  respawnAtSafehouse() {
    this.exitCarSilent();
    this.pos.copy(SAFEHOUSE);
    this.pos.y = 0;
    this.vy = 0;
    this.health = 100;
    this.G.health = 100;
    this.yaw = Math.PI * 0.75;
    this.camYaw = this.yaw;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
  }

  exitCarSilent() {
    if (!this.inCar) return;
    this.inCar = false;
    const pc = this.G.playerCar;
    if (pc && typeof pc.detach === 'function') {
      const record = pc.detach();
      if (record && this.G.traffic) this.G.traffic.addParkedCar(record);
    }
    this.mesh.visible = true;
  }

  enterCar(car) {
    const pc = this.G.playerCar;
    if (!pc || typeof pc.attach !== 'function') return false;
    const wasTraffic = this.G.traffic && this.G.traffic.cars.includes(car);
    if (wasTraffic) this.G.traffic.removeCar(car);
    if (this.G.traffic && car.parked) this.G.traffic.unparkCar?.(car);
    pc.attach(car);
    this.inCar = true;
    this.mesh.visible = false;
    this.pos.copy(car.group.position);
    this.yaw = pc.angle;
    return true;
  }

  exitCar() {
    const pc = this.G.playerCar;
    if (!this.inCar || !pc) return;
    const carPos = pc.group ? pc.group.position.clone() : this.pos.clone();
    const side = new THREE.Vector3(Math.cos(pc.angle || 0), 0, -Math.sin(pc.angle || 0));
    const record = typeof pc.detach === 'function' ? pc.detach() : null;
    if (record && this.G.traffic) this.G.traffic.addParkedCar(record);
    this.inCar = false;
    this.pos.copy(carPos).addScaledVector(side, 2.4);
    this.pos.y = 0;
    this.vy = 0;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    this.G.hud?.flash?.('Out of the car');
  }

  tryEnterCar() {
    const traffic = this.G.traffic;
    if (!traffic) return;
    const car = traffic.nearestCar ? traffic.nearestCar(this.pos, ENTER_RADIUS) : null;
    if (!car) {
      this.G.hud?.flash?.('No car nearby — get closer and press E');
      return;
    }
    const stealing = !car.parked;
    if (this.enterCar(car)) {
      if (stealing) {
        this.G.police?.addHeat?.(8);
        this.G.hud?.flash?.('You stole a car! The driver ran off.');
        this.G.audio?.play?.('pickup');
        const door = car.group.position.clone();
        this.G.peds?.spawnFleeingPed?.(door);
      } else {
        this.G.hud?.flash?.('In the car — W to drive, Space to handbrake');
      }
    }
  }

  damage(n) {
    this.health = Math.max(0, this.health - n);
    this.G.health = this.health;
  }

  heal(n) {
    this.health = Math.min(100, this.health + n);
    this.G.health = this.health;
  }

  resolveBuildings(pos, radius) {
    const world = this.G.world;
    if (world && typeof world.resolveCircle === 'function') {
      world.resolveCircle(pos, radius);
      return;
    }
    if (world && Array.isArray(world.colliders)) {
      for (const c of world.colliders) {
        const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          const d = Math.sqrt(d2) || 0.001;
          const push = (radius - d) / d;
          pos.x += dx * push;
          pos.z += dz * push;
        }
      }
    }
  }

  update(dt) {
    const G = this.G;
    const input = G.input || { keys: new Set(), mouseDX: 0, mouseDY: 0 };

    // Camera orbit from the mouse (pointer-lock deltas or drag deltas).
    const dx = input.mouseDX || 0;
    const dy = input.mouseDY || 0;
    if (dx || dy) {
      this.camYaw -= dx * 0.0032;
      this.camPitch = Math.max(-0.55, Math.min(0.5, this.camPitch - dy * 0.0028));
    }
    if (typeof input.consumeMouse === 'function') input.consumeMouse();
    else { input.mouseDX = 0; input.mouseDY = 0; }
    G.cameraYaw = this.camYaw;
    G.cameraPitch = this.camPitch;

    // E: enter / exit car (edge-triggered).
    const eDown = keysDown(input, 'KeyE');
    if (eDown && !this.prevE) {
      if (this.inCar) this.exitCar();
      else this.tryEnterCar();
    }
    this.prevE = eDown;

    // F: punch (edge-triggered, via combat).
    const fDown = keysDown(input, 'KeyF');
    if (fDown && !this.prevF && !this.inCar) G.combat?.punch?.();
    this.prevF = fDown;

    if (this.inCar) {
      // Riding: the car owns the position; the player just follows it.
      const pc = G.playerCar;
      if (pc && pc.group) {
        this.pos.copy(pc.group.position);
        this.yaw = pc.angle;
        this.mesh.position.copy(this.pos);
        this.mesh.rotation.y = this.yaw;
      }
      return;
    }

    // On foot: camera-relative WASD.
    const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const move = new THREE.Vector3();
    if (keysDown(input, 'KeyW', 'ArrowUp')) move.add(fwd);
    if (keysDown(input, 'KeyS', 'ArrowDown')) move.sub(fwd);
    if (keysDown(input, 'KeyD', 'ArrowRight')) move.add(right);
    if (keysDown(input, 'KeyA', 'ArrowLeft')) move.sub(right);

    this.moving = move.lengthSq() > 0.001;
    this.running = keysDown(input, 'ShiftLeft', 'ShiftRight') && this.moving;
    const speed = this.running ? RUN_SPEED : WALK_SPEED;
    if (this.moving) {
      move.normalize();
      this.pos.addScaledVector(move, speed * dt);
      this.yaw = Math.atan2(move.x, move.z);
      this.walkPhase += dt * speed * 1.9;
    }
    this.resolveBuildings(this.pos, 0.6);
    if (G.world && typeof G.world.clampToWorld === 'function') G.world.clampToWorld(this.pos);
    else {
      this.pos.x = Math.max(-440, Math.min(440, this.pos.x));
      this.pos.z = Math.max(-440, Math.min(440, this.pos.z));
    }

    // Hop with Space.
    const spaceDown = keysDown(input, 'Space');
    if (spaceDown && !this.prevSpace && this.onGround) {
      this.vy = HOP_VELOCITY;
      this.onGround = false;
    }
    this.prevSpace = spaceDown;
    if (!this.onGround) {
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.vy = 0;
        this.onGround = true;
      }
    }

    // Mesh + walk-cycle animation.
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    const legs = this.mesh.userData.legs || [];
    const arms = this.mesh.userData.arms || [];
    const swing = this.moving ? (this.running ? 0.75 : 0.5) : 0;
    const s = Math.sin(this.walkPhase) * swing;
    if (legs[0]) legs[0].rotation.x = s;
    if (legs[1]) legs[1].rotation.x = -s;
    if (arms[0]) arms[0].rotation.x = -s * 0.8;
    if (arms[1]) arms[1].rotation.x = s * 0.8;
    if (!this.moving) {
      this.mesh.position.y = this.pos.y;
    } else {
      this.mesh.position.y = this.pos.y + Math.abs(Math.sin(this.walkPhase)) * 0.05;
    }
  }
}
