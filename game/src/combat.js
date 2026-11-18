// combat.js — Cayo Lumen: pistol hitscan combat, goons, punching, health + regen.
// All characters and weapons are original; no assets from any commercial game.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const CFG = CONFIG || {};
const COMBAT_CFG = CFG.combat || {};
const PISTOL_DAMAGE = COMBAT_CFG.pistolDamage ?? 34;
const PUNCH_DAMAGE = COMBAT_CFG.punchDamage ?? 25;
const PUNCH_RANGE = COMBAT_CFG.punchRange ?? 2.2;
const START_AMMO = COMBAT_CFG.startAmmo ?? 24;
const GOON_HEALTH = COMBAT_CFG.goonHealth ?? 100;
const REGEN_DELAY = 6;
const REGEN_RATE = 2;

function stdMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, metalness: opts.metalness ?? 0.3, roughness: opts.roughness ?? 0.8,
  });
}

/** Original street goon: dark hoodie figure with a pistol. */
function buildGoonMesh() {
  const group = new THREE.Group();
  const hoodie = stdMat(0x3a2f2f, { roughness: 0.9 });
  const skin = stdMat(0x8a5a3b, { roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.34), hoodie);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  // Red bandana stripe across the chest.
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.36), stdMat(0xb02020, { roughness: 0.8 }));
  band.position.y = 1.3;
  group.add(band);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.23, 0.09, 12), stdMat(0x1c1c22, { roughness: 0.7 }));
  cap.position.y = 1.78;
  group.add(cap);
  const legGeo = new THREE.BoxGeometry(0.2, 0.78, 0.22);
  const legL = new THREE.Mesh(legGeo, stdMat(0x23232c, { roughness: 0.9 }));
  legL.position.set(-0.15, 0.39, 0);
  const legR = new THREE.Mesh(legGeo, stdMat(0x23232c, { roughness: 0.9 }));
  legR.position.set(0.15, 0.39, 0);
  group.add(legL);
  group.add(legR);
  const armGeo = new THREE.BoxGeometry(0.14, 0.62, 0.16);
  const armL = new THREE.Mesh(armGeo, hoodie);
  armL.position.set(-0.38, 1.12, 0);
  const armR = new THREE.Mesh(armGeo, hoodie);
  armR.position.set(0.38, 1.12, 0);
  armR.rotation.x = -1.1; // Right arm raised, aiming forward.
  group.add(armL);
  group.add(armR);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.42), stdMat(0x111214, { metalness: 0.7, roughness: 0.35 }));
  gun.position.set(0.38, 1.28, 0.42);
  group.add(gun);
  group.userData.legs = [legL, legR];
  group.userData.arms = [armL, armR];
  group.userData.gun = gun;
  return group;
}

/** Player pistol, enemy goons, punching, health regen and death. */
export class CombatSystem {
  constructor(G) {
    this.G = G;
    this.rng = G.rng || Math.random;
    this.ammo = START_AMMO;
    this.health = 100;
    this.goons = [];
    this.tracers = [];
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 160;
    this.lastShotAt = -100;
    this.lastDamageAt = -100;
    this.punchCooldown = 0;
    this.flashLife = 0;
    this.muzzle = new THREE.PointLight(0xffc266, 0, 14, 1.6);
    G.scene.add(this.muzzle);
    G.ammo = this.ammo;
    G.health = this.health;
  }

  playerPos() {
    return this.G.player ? this.G.player.pos : new THREE.Vector3(0, 0, 0);
  }

  /** Spawn one goon at pos. opts: { health, speed, accuracy }. */
  spawnGoon(pos, opts = {}) {
    const group = buildGoonMesh();
    group.position.copy(pos);
    group.position.y = 0;
    this.G.scene.add(group);
    const goon = {
      group,
      health: opts.health ?? GOON_HEALTH,
      maxHealth: opts.health ?? GOON_HEALTH,
      speed: opts.speed ?? 4.5,
      accuracy: opts.accuracy ?? 0.22,
      shootTimer: 1 + this.rng() * 1.5,
      stagger: 0,
      phase: this.rng() * Math.PI * 2,
      dead: false,
      deadTimer: 0,
      flashTimer: 0,
    };
    group.userData.goon = goon;
    this.goons.push(goon);
    return goon;
  }

  /** Hitscan pistol shot from the centre of the camera. */
  shoot() {
    const G = this.G;
    if (G.state !== 'playing') return;
    if (G.player && G.player.inCar) {
      G.hud?.flash?.('You cannot shoot while driving');
      return;
    }
    if (this.ammo <= 0) {
      G.audio?.play?.('click');
      G.hud?.flash?.('Out of ammo — buy more at the garage (G)');
      return;
    }
    const camera = G.camera;
    if (!camera) return;
    this.ammo -= 1;
    G.ammo = this.ammo;
    this.lastShotAt = G.time;
    G.audio?.play?.('shot');

    // Muzzle position: just below and ahead of the camera.
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const muzzlePos = camera.position.clone()
      .addScaledVector(forward, 0.9)
      .add(new THREE.Vector3(0, -0.25, 0));
    this.muzzle.position.copy(muzzlePos);
    this.muzzle.intensity = 5;
    this.flashLife = 0.07;

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const targets = [];
    for (const goon of this.goons) if (!goon.dead) targets.push(goon.group);
    if (G.traffic) for (const car of G.traffic.cars) targets.push(car.group);
    if (G.police) {
      for (const car of G.police.copCars) targets.push(car.group);
      for (const off of G.police.officers) targets.push(off.group);
    }
    const hits = this.raycaster.intersectObjects(targets, true);
    let end;
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      const goon = this.findGoon(hit.object);
      if (goon) {
        this.damageGoon(goon, PISTOL_DAMAGE, hit.point);
      } else if (hit.object) {
        // Hit a car or an officer: sparks, noise, and the law notices.
        G.police?.addHeat?.(2);
      }
    } else {
      end = camera.position.clone().addScaledVector(forward, 120);
    }
    this.addTracer(muzzlePos, end);
    // A loud shot in the street scatters nearby pedestrians.
    if (G.peds && typeof G.peds.fleeFrom === 'function') {
      G.peds.fleeFrom(this.playerPos(), 30);
    }
  }

  findGoon(object) {
    let node = object;
    while (node) {
      if (node.userData && node.userData.goon) return node.userData.goon;
      node = node.parent;
    }
    return null;
  }

  addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geo, mat);
    this.G.scene.add(line);
    this.tracers.push({ line, life: 0.14 });
  }

  /** Fist attack: short range, in front of the player, with knockback. */
  punch() {
    const G = this.G;
    if (G.state !== 'playing') return;
    if (this.punchCooldown > 0) return;
    if (G.player && G.player.inCar) return;
    this.punchCooldown = 0.45;
    G.audio?.play?.('punch');
    const p = this.playerPos();
    const yaw = G.player ? G.player.yaw : 0;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    let hitSomething = false;

    for (const goon of this.goons) {
      if (goon.dead) continue;
      const toGoon = new THREE.Vector3().subVectors(goon.group.position, p).setY(0);
      const d = toGoon.length();
      if (d < PUNCH_RANGE && d > 0.001 && toGoon.normalize().dot(fwd) > 0.4) {
        this.damageGoon(goon, PUNCH_DAMAGE, goon.group.position.clone());
        goon.group.position.addScaledVector(toGoon, 1.4);
        goon.stagger = 0.7;
        hitSomething = true;
      }
    }
    if (!hitSomething && G.peds) {
      const ped = G.peds.nearestPed ? G.peds.nearestPed(p, PUNCH_RANGE) : null;
      if (ped) {
        const toPed = new THREE.Vector3().subVectors(ped.group.position, p).setY(0);
        if (toPed.length() > 0.001 && toPed.normalize().dot(fwd) > 0.3) {
          G.police?.addHeat?.(4);
          G.peds.fleeFrom(p, 35);
          hitSomething = true;
        }
      }
    }
    if (!hitSomething && G.police) {
      // Punching an officer is a much worse idea than punching a goon.
      for (const off of G.police.officers) {
        const toOff = new THREE.Vector3().subVectors(off.group.position, p).setY(0);
        const d = toOff.length();
        if (d < PUNCH_RANGE && d > 0.001 && toOff.normalize().dot(fwd) > 0.4) {
          off.group.position.addScaledVector(toOff, 1.6);
          off.arrestTimer = 0;
          G.police.addHeat(10);
          G.hud?.flash?.('You hit an officer!');
          hitSomething = true;
          break;
        }
      }
    }
  }

  damageGoon(goon, dmg, point) {
    goon.health -= dmg;
    goon.flashTimer = 0.12;
    const torso = goon.group.children[0];
    if (torso && torso.material) {
      torso.material.emissive = new THREE.Color(0x881111);
      torso.material.emissiveIntensity = 0.9;
    }
    if (goon.health <= 0 && !goon.dead) {
      goon.dead = true;
      goon.deadTimer = 2.2;
      goon.group.rotation.x = -Math.PI / 2;
      goon.group.position.y = 0.35;
      this.G.audio?.play?.('pickup');
      // Goons drop street cash.
      if (this.G.economy && typeof this.G.economy.add === 'function') this.G.economy.add(50);
      else this.G.money = (this.G.money || 0) + 50;
      this.G.hud?.flash?.('Goon down — +$50');
      this.G.police?.addHeat?.(3);
    }
  }

  /** Damage the player; death flips the game to the game-over state. */
  damagePlayer(n) {
    const G = this.G;
    if (G.state !== 'playing') return;
    this.health = Math.max(0, this.health - n);
    this.lastDamageAt = G.time;
    G.health = this.health;
    if (G.player) G.player.health = this.health;
    G.hud?.damageFlash?.();
    if (this.health <= 0) {
      G.state = 'gameover';
      if (G.economy && typeof G.economy.spend === 'function') {
        G.economy.spend(Math.floor((G.money || 0) * 0.1));
      } else {
        G.money = Math.floor((G.money || 0) * 0.9);
      }
      G.audio?.play?.('fail');
      G.hud?.showGameOver?.('wasted');
    }
  }

  healPlayer(n) {
    this.health = Math.min(100, this.health + n);
    this.G.health = this.health;
    if (this.G.player) this.G.player.health = this.health;
  }

  addAmmo(n) {
    this.ammo += n;
    this.G.ammo = this.ammo;
  }

  update(dt) {
    const G = this.G;
    if (this.punchCooldown > 0) this.punchCooldown -= dt;

    // Click to shoot (consumed once per frame by input.js).
    if (G.state === 'playing' && G.input && typeof G.input.consumeClick === 'function') {
      if (G.input.consumeClick()) this.shoot();
    }

    // Muzzle flash decay.
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) this.muzzle.intensity = 0;
    }

    // Tracers fade out fast.
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.14) * 0.95;
      if (t.life <= 0) {
        G.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }

    // Health regen after 6 s without taking damage.
    if (G.state === 'playing' && this.health > 0 && this.health < 100
      && G.time - this.lastDamageAt > REGEN_DELAY) {
      this.health = Math.min(100, this.health + REGEN_RATE * dt);
      G.health = this.health;
      if (G.player) G.player.health = this.health;
    }

    // Goons: chase inside 40 m, strafe and shoot with poor accuracy.
    const p = this.playerPos();
    const playerInCar = G.player ? G.player.inCar : false;
    for (let i = this.goons.length - 1; i >= 0; i -= 1) {
      const goon = this.goons[i];
      if (goon.dead) {
        goon.deadTimer -= dt;
        if (goon.deadTimer <= 0) {
          G.scene.remove(goon.group);
          this.goons.splice(i, 1);
        }
        continue;
      }
      if (goon.flashTimer > 0) {
        goon.flashTimer -= dt;
        if (goon.flashTimer <= 0) {
          const torso = goon.group.children[0];
          if (torso && torso.material) torso.material.emissiveIntensity = 0;
        }
      }
      const pos = goon.group.position;
      const toPlayer = new THREE.Vector3().subVectors(p, pos).setY(0);
      const dist = toPlayer.length();
      if (dist > 130) {
        G.scene.remove(goon.group);
        this.goons.splice(i, 1);
        continue;
      }
      if (goon.stagger > 0) {
        goon.stagger -= dt;
        continue;
      }
      if (dist < 40 && dist > 0.01) {
        toPlayer.normalize();
        // Close to 12 m, then hold and shoot.
        if (dist > 12) {
          pos.addScaledVector(toPlayer, goon.speed * dt);
          pos.y = 0;
          goon.phase += dt * 8;
          const s = Math.sin(goon.phase) * 0.55;
          const legs = goon.group.userData.legs || [];
          if (legs[0]) legs[0].rotation.x = s;
          if (legs[1]) legs[1].rotation.x = -s;
        }
        goon.group.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        goon.shootTimer -= dt;
        if (goon.shootTimer <= 0 && dist < 46 && G.state === 'playing') {
          goon.shootTimer = 1.3 + this.rng() * 0.9;
          const gunPos = goon.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
          const target = p.clone().add(new THREE.Vector3(0, 1.3, 0));
          // Goon tracers are red so the player can tell them apart.
          const geo = new THREE.BufferGeometry().setFromPoints([gunPos, target]);
          const mat = new THREE.LineBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.9 });
          const line = new THREE.Line(geo, mat);
          G.scene.add(line);
          this.tracers.push({ line, life: 0.14 });
          G.audio?.play?.('shot');
          const hitChance = playerInCar ? goon.accuracy * 0.35 : goon.accuracy;
          if (this.rng() < hitChance) {
            this.damagePlayer(8 + Math.floor(this.rng() * 7));
          }
        }
      }
    }
  }
}
