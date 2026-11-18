// missions.js — "The Lumen Job", the eight-story-mission campaign of Cayo Lumen.
//
// The MissionManager owns the campaign state: which mission is unlocked, which
// step of the active mission the player is on, the glowing objective marker in
// the world, and the phone menu (T) the player uses to pick a job up from Delia.
// It never touches another gameplay module directly. Everything it needs from
// the rest of the game arrives through G: the player position, the police heat,
// the combat system for goon fights, the HUD for dialog and objectives, and the
// economy for the payout. That keeps this file a single clear job: the story.

import * as THREE from 'three';
import * as configModule from './config.js';

// Tuning that lives here because it belongs to the story, not to the world:
// the garage corner, the districts, and the follow/race numbers. Anything the
// shared config already defines wins over these local fallbacks.
const LOCAL_DEFAULTS = {
  garage: { x: -90, z: -270 },
  follow: { minDist: 14, maxDist: 70, holdSeconds: 30 },
  race: { timeLimit: 150 },
  markerRadius: 6,
};

const SHARED = (configModule && configModule.CONFIG) || {};
const GARAGE = SHARED.garage || LOCAL_DEFAULTS.garage;
const FOLLOW = { ...LOCAL_DEFAULTS.follow, ...(SHARED.follow || {}) };
const RACE_LIMIT = (SHARED.race && SHARED.race.timeLimit) || LOCAL_DEFAULTS.race.timeLimit;

// ---------------------------------------------------------------------------
// The campaign. Eight jobs, one arc: Mara Voss, ex-courier, owes the fixer
// Delia Rook a debt; the rival driver Kito Fenn keeps getting in the way; the
// ledger at the end settles everything. Rewards climb with the risk.
// ---------------------------------------------------------------------------

export const MISSION_REWARDS = [300, 400, 600, 700, 900, 1000, 1500, 2500];

const MISSIONS = [
  {
    id: 'first-run',
    title: 'First Run',
    giver: 'Delia Rook',
    brief: 'Delia needs a package moved from Old Port to Coral Row. No questions, no stops, no police.',
    dialog: [
      ['Delia Rook', 'Mara. You owe me, and I collect. One package, Old Port to Coral Row. Drive like the city is watching — because it is.'],
      ['Mara Voss', 'One run. Then we talk about what I actually owe you.'],
    ],
    steps: [
      { type: 'goto', label: 'Pick up the package at Old Port', x: -360, z: 0, r: 8 },
      { type: 'drive', label: 'Deliver the package to Coral Row', x: 270, z: -90, r: 8 },
    ],
    reward: 300,
  },
  {
    id: 'the-pickup',
    title: 'The Pickup',
    giver: 'Delia Rook',
    brief: 'A briefcase is waiting on Miramar Beach. Collect it on foot and bring it back to the garage — patrols are thick tonight.',
    dialog: [
      ['Delia Rook', 'Briefcase, Miramar Beach, under the third umbrella from the pier. On foot. Cars draw eyes down there.'],
      ['Mara Voss', 'Third umbrella. Got it. If a patrol stops me, I was never here.'],
    ],
    steps: [
      { type: 'collect', label: 'Collect the briefcase at Miramar Beach', item: 'Briefcase', x: 120, z: 400, r: 6 },
      { type: 'goto', label: 'Bring the briefcase back to the garage', x: GARAGE.x, z: GARAGE.z, r: 8 },
    ],
    reward: 400,
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    giver: 'Delia Rook',
    brief: 'A sports car is parked in Palm Heights, keys in the sun visor. Take it and bring it home to the garage.',
    dialog: [
      ['Delia Rook', 'Palm Heights. Silver sports car, visor, keys. The owner is at dinner until nine. Do not be there at nine.'],
      ['Mara Voss', 'Borrowing a sports car. This debt of yours keeps getting more interesting.'],
    ],
    steps: [
      { type: 'steal', label: 'Steal the sports car in Palm Heights', kind: 'sport', x: 270, z: 180, r: 10 },
      { type: 'deliver', label: 'Deliver the sports car to the garage', x: GARAGE.x, z: GARAGE.z, r: 10 },
    ],
    reward: 600,
  },
  {
    id: 'harbor-lights',
    title: 'Harbor Lights',
    giver: 'Delia Rook',
    brief: 'Tail Kito Fenn through The Docks. Stay close enough to see him, far enough that he never sees you.',
    dialog: [
      ['Delia Rook', 'Kito is moving something through The Docks tonight. Follow him. If he spots you, he runs — and so does the job.'],
      ['Mara Voss', 'Tail the best driver in the city without being seen. Sure. Easy.'],
    ],
    steps: [
      {
        type: 'follow', label: 'Tail Kito Fenn through The Docks — stay in range',
        target: 'rivalCar', holdSeconds: FOLLOW.holdSeconds,
        waypoints: [
          { x: -270, z: 360 }, { x: -90, z: 360 }, { x: 90, z: 270 },
          { x: 270, z: 270 }, { x: 270, z: 90 }, { x: 90, z: 90 },
        ],
      },
    ],
    reward: 700,
  },
  {
    id: 'street-kings',
    title: 'Street Kings',
    giver: 'Kito Fenn',
    brief: 'Kito wants a race: five checkpoints across the city, 150 seconds. Beat him and he owes you. Lose and he never lets you forget it.',
    dialog: [
      ['Kito Fenn', 'Heard you can drive, courier. Five checkpoints, two and a half minutes. Winner takes the street. Loser walks home.'],
      ['Mara Voss', 'You just made the worst bet of your life, Kito.'],
    ],
    steps: [
      {
        type: 'race', label: 'Race Kito through 5 checkpoints',
        timeLimit: RACE_LIMIT,
        points: [
          { x: 0, z: -270 }, { x: 270, z: -270 }, { x: 270, z: 180 },
          { x: -270, z: 180 }, { x: 0, z: 0 },
        ],
      },
    ],
    reward: 900,
  },
  {
    id: 'the-informant',
    title: 'The Informant',
    giver: 'Delia Rook',
    brief: 'Meet the contact at Pier 9. It is a setup — four of Kito’s goons will be waiting. Deal with them.',
    dialog: [
      ['Delia Rook', 'Pier 9, midnight. My contact has the ledger’s location. Go alone. Trust no one at the pier.'],
      ['Mara Voss', 'Alone at midnight on a pier. What could possibly go wrong?'],
    ],
    steps: [
      { type: 'goto', label: 'Meet the contact at Pier 9', x: 0, z: 430, r: 8 },
      {
        type: 'combat', label: 'Fight off Kito’s goons (4 remaining)', count: 4,
        spawn: [
          { x: 18, z: 420 }, { x: -18, z: 420 }, { x: 10, z: 445 }, { x: -12, z: 445 },
        ],
      },
    ],
    reward: 1000,
  },
  {
    id: 'bank-of-lumen',
    title: 'Bank of Lumen',
    giver: 'Delia Rook',
    brief: 'Grab the cash from the Bank of Lumen downtown. The alarm will bring the whole city down on you — lose the heat, all of it.',
    dialog: [
      ['Delia Rook', 'Downtown bank. In, cash, out. The alarm buys you four stars and a helicopter. Lose them all and the money is yours.'],
      ['Mara Voss', 'Four stars and a helicopter. You really know how to pick a quiet Tuesday, Delia.'],
    ],
    steps: [
      { type: 'collect', label: 'Grab the cash at the Bank of Lumen', item: 'Cash bag', x: 90, z: 0, r: 8 },
      { type: 'escape', label: 'Lose the police — get your wanted level to zero', wanted: 0 },
    ],
    reward: 1500,
  },
  {
    id: 'the-last-job',
    title: 'The Last Job',
    giver: 'Delia Rook',
    brief: 'The finale. Deliver the ledger to the pier while the whole city hunts you at five stars. Finish this and the debt is done.',
    dialog: [
      ['Delia Rook', 'Last job, Mara. The ledger goes to the pier. Five stars, the whole city, one road. Bring it home and you are free.'],
      ['Mara Voss', 'Then let’s finish it. Cayo Lumen is mine tonight.'],
    ],
    steps: [
      { type: 'drive', label: 'Drive the ledger to the pier', x: 0, z: 430, r: 10 },
      { type: 'escape', label: 'Lose the five-star heat to finish the job', wanted: 0 },
    ],
    reward: 2500,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// ---------------------------------------------------------------------------
// MissionManager
// ---------------------------------------------------------------------------

export class MissionManager {
  constructor(G) {
    this.G = G;
    this.missions = MISSIONS;
    this.unlocked = 0; // index of the next mission the player may start
    this.done = []; // ids of completed missions, in order
    this.current = null; // active mission object (a copy of the definition)
    this.stepIndex = 0;
    this.stepState = null; // per-step scratch: timers, counters, spawned things
    this.phoneOpen = false;
    this.marker = null; // { group, beam, diamond }
    this.rival = null; // { pos, wpIndex, speed } for the follow step
    this.raceTimer = 0;
    this._dialogQueue = [];
    this._dialogTimer = 0;
    this._lastHeatBump = 0;

    this._buildMarker();
    this._bindPhone();
  }

  // -- public state ---------------------------------------------------------

  get active() {
    return this.current;
  }

  get currentStep() {
    if (!this.current) return null;
    return this.current.steps[this.stepIndex] || null;
  }

  /** Where the objective marker sits right now, or null when free roaming. */
  currentTarget() {
    const step = this.currentStep;
    if (!step) return null;
    if (step.type === 'follow' && this.rival) return { x: this.rival.pos.x, z: this.rival.pos.z };
    if (step.type === 'race') {
      const point = step.points[this.stepState ? this.stepState.pointIndex : 0];
      return point ? { x: point.x, z: point.z } : null;
    }
    if (typeof step.x === 'number') return { x: step.x, z: step.z };
    return null;
  }

  /** One-line objective text for the HUD, with a live counter where it helps. */
  currentObjectiveText() {
    const step = this.currentStep;
    if (!step) return this.done.length >= this.missions.length
      ? 'Cayo Lumen Legend — free roam'
      : 'Press T to call Delia and pick up a job';
    let label = step.label || this.current.title;
    if (step.type === 'race' && this.stepState) {
      label += ` — ${this.stepState.pointIndex}/${step.points.length} · ${Math.max(0, Math.ceil(step.timeLimit - this.raceTimer))}s`;
    }
    if (step.type === 'follow' && this.stepState) {
      label += ` — ${Math.floor(this.stepState.held)}s / ${step.holdSeconds}s`;
    }
    if (step.type === 'combat' && this.stepState) {
      label += ` — ${this.stepState.remaining} left`;
    }
    return label;
  }

  // -- starting / finishing --------------------------------------------------

  startMission(i) {
    if (i < 0 || i >= this.missions.length) return false;
    if (i > this.unlocked) {
      this.G.hud && this.G.hud.flash('That job is not open yet — finish the last one first.');
      return false;
    }
    if (this.current) return false;
    const def = this.missions[i];
    // Copy so per-run state never mutates the shared definition.
    this.current = JSON.parse(JSON.stringify(def));
    this.current.index = i;
    this.stepIndex = 0;
    this.raceTimer = 0;
    this.stepState = this._freshStepState(this.currentStep);
    this._sayLines(def.dialog || []);
    this.G.hud && this.G.hud.flash(`New job: ${def.title} — ${def.giver}`);
    this.G.hud && this.G.hud.setObjective(this.currentObjectiveText());
    this.G.audio && this.G.audio.play && this.G.audio.play('click');
    this.closePhone();
    this._placeMarker();
    return true;
  }

  _freshStepState(step) {
    if (!step) return null;
    if (step.type === 'follow') return { held: 0, spotted: false, wpIndex: 0 };
    if (step.type === 'race') return { pointIndex: 0 };
    if (step.type === 'combat') return { remaining: step.count || 0, spawned: false, down: [] };
    if (step.type === 'escape') return { raised: false };
    return {};
  }

  _advanceStep() {
    this.stepIndex += 1;
    const step = this.currentStep;
    if (!step) {
      this._completeMission();
      return;
    }
    this.stepState = this._freshStepState(step);
    if (step.type === 'combat') this._spawnGoons(step);
    if (step.type === 'escape') this._raiseHeatForEscape(step);
    this.G.hud && this.G.hud.setObjective(this.currentObjectiveText());
    this._placeMarker();
  }

  _completeMission() {
    const mission = this.current;
    if (!mission) return;
    this.done.push(mission.id);
    this.unlocked = Math.max(this.unlocked, mission.index + 1);
    if (this.G.economy) this.G.economy.add(mission.reward);
    else this.G.money = (this.G.money || 0) + mission.reward;
    this.G.hud && this.G.hud.showMissionComplete(mission.title, mission.reward);
    this.G.audio && this.G.audio.play && this.G.audio.play('success');
    this.current = null;
    this.stepIndex = 0;
    this.stepState = null;
    this.raceTimer = 0;
    this._clearMarker();
    this._clearRival();
    // Persist the run: save.js is a set of free functions, and main.js also
    // exposes the same save as G.saveGame — use whichever is wired up.
    if (typeof this.G.saveGame === 'function') this.G.saveGame(this.G);
    if (this.done.length >= this.missions.length) this._finishCampaign();
  }

  _finishCampaign() {
    if (this.G.economy) this.G.economy.add(500);
    else this.G.money = (this.G.money || 0) + 500;
    this.G.hud && this.G.hud.showEnding();
    this.G.audio && this.G.audio.play && this.G.audio.play('success');
  }

  // -- per-frame update ------------------------------------------------------

  update(dt) {
    if (!this.current) {
      this._tickDialog(dt);
      return;
    }
    this._tickDialog(dt);
    const step = this.currentStep;
    if (!step) return;
    const pos = this._playerPos();
    if (!pos) return;

    switch (step.type) {
      case 'goto':
      case 'drive':
      case 'deliver':
      case 'collect': {
        if (dist2D(pos.x, pos.z, step.x, step.z) <= (step.r || 8)) {
          if (step.type === 'collect') {
            this.G.hud && this.G.hud.flash(`Picked up: ${step.item || 'package'}`);
            this.G.audio && this.G.audio.play && this.G.audio.play('pickup');
          }
          this._advanceStep();
        }
        break;
      }
      case 'steal': {
        // Close to the target car: take it. If the player is already driving a
        // car of the right kind, that counts too.
        const inRightCar = this.G.playerCar && this.G.playerCar.inCar
          && this.G.playerCar.kind === step.kind;
        if (inRightCar || dist2D(pos.x, pos.z, step.x, step.z) <= (step.r || 10)) {
          if (!inRightCar) {
            this.G.hud && this.G.hud.flash(`Stole the ${step.kind} — get it to the garage!`);
            if (this.G.police && this.G.police.addHeat) this.G.police.addHeat(12);
          }
          this._advanceStep();
        }
        break;
      }
      case 'follow': {
        this._updateFollow(dt, pos, step);
        break;
      }
      case 'race': {
        this._updateRace(dt, pos, step);
        break;
      }
      case 'combat': {
        this._updateCombat(dt, pos, step);
        break;
      }
      case 'escape': {
        if (this.G.wanted <= (step.wanted || 0)) this._advanceStep();
        break;
      }
      default:
        break;
    }

    this._updateMarker(dt);
    this._updateHudObjective(pos);
  }

  // -- step logic ------------------------------------------------------------

  _updateFollow(dt, pos, step) {
    if (!this.rival) this._spawnRival(step);
    const rival = this.rival;
    // Drive the rival along its waypoints at a steady cruise.
    const wp = step.waypoints[rival.wpIndex % step.waypoints.length];
    const d = dist2D(rival.pos.x, rival.pos.z, wp.x, wp.z);
    if (d < 6) {
      rival.wpIndex += 1;
    } else {
      const speed = 11;
      rival.pos.x += ((wp.x - rival.pos.x) / d) * speed * dt;
      rival.pos.z += ((wp.z - rival.pos.z) / d) * speed * dt;
      rival.angle = Math.atan2(wp.x - rival.pos.x, wp.z - rival.pos.z);
    }
    if (rival.mesh) {
      rival.mesh.position.set(rival.pos.x, 0, rival.pos.z);
      rival.mesh.rotation.y = rival.angle || 0;
    }

    const dist = dist2D(pos.x, pos.z, rival.pos.x, rival.pos.z);
    if (dist < FOLLOW.minDist) {
      // Too close: Kito spots the tail. The clock resets and he gets nervous.
      if (!this.stepState.spotted) {
        this.stepState.spotted = true;
        this.G.hud && this.G.hud.flash('Too close — Kito spotted you! Back off.');
        this.G.audio && this.G.audio.play && this.G.audio.play('fail');
      }
      this.stepState.held = 0;
    } else if (dist <= FOLLOW.maxDist) {
      this.stepState.spotted = false;
      this.stepState.held += dt;
      if (this.stepState.held >= (step.holdSeconds || FOLLOW.holdSeconds)) {
        this.G.hud && this.G.hud.flash('Tail complete — Delia has what she needs.');
        this._clearRival();
        this._advanceStep();
      }
    } else {
      // Lost him: the tail goes cold and the step restarts from scratch.
      if (this.stepState.held > 0) {
        this.G.hud && this.G.hud.flash('You lost Kito — pick the tail back up.');
      }
      this.stepState.held = 0;
    }
  }

  _updateRace(dt, pos, step) {
    this.raceTimer += dt;
    if (this.raceTimer > step.timeLimit) {
      this.G.hud && this.G.hud.flash('Out of time — Kito wins this one. Try the race again.');
      this.G.audio && this.G.audio.play && this.G.audio.play('fail');
      this._failMission();
      return;
    }
    const point = step.points[this.stepState.pointIndex];
    if (!point) return;
    if (dist2D(pos.x, pos.z, point.x, point.z) <= 10) {
      this.stepState.pointIndex += 1;
      this.G.audio && this.G.audio.play && this.G.audio.play('pickup');
      this.G.hud && this.G.hud.flash(
        this.stepState.pointIndex >= step.points.length
          ? 'Finish! You beat Kito!'
          : `Checkpoint ${this.stepState.pointIndex}/${step.points.length}`,
      );
      if (this.stepState.pointIndex >= step.points.length) this._advanceStep();
      else this._placeMarker();
    }
  }

  _updateCombat(dt, pos, step) {
    if (!this.stepState.spawned) {
      this._spawnGoons(step);
      this.stepState.spawned = true;
    }
    // Ask the combat system how many goons are still standing; fall back to
    // the mission's own close-quarters takedowns when combat is absent.
    let remaining = this.stepState.remaining;
    if (this.G.combat && typeof this.G.combat.goonsAlive === 'number') {
      remaining = this.G.combat.goonsAlive;
    } else if (this.G.combat && Array.isArray(this.G.combat.enemies)) {
      remaining = this.G.combat.enemies.filter((e) => e && e.health > 0).length;
    } else {
      // No combat module: a goon goes down once the player stays on top of
      // him in close quarters for a moment (a brawl, not a shooting).
      for (const goon of this.stepState.down) {
        if (goon.counted) continue;
        if (dist2D(pos.x, pos.z, goon.x, goon.z) < 3) {
          goon.stand = (goon.stand || 0) + dt;
          if (goon.stand > 1.2) goon.counted = true;
        } else {
          goon.stand = 0;
        }
      }
      remaining = this.stepState.down.filter((g) => !g.counted).length;
    }
    this.stepState.remaining = remaining;
    if (remaining <= 0) {
      this.G.hud && this.G.hud.flash('Pier is clear. The contact is safe.');
      this._advanceStep();
    }
  }

  _failMission() {
    // A failed race (or any failed step) sends the player back to free roam;
    // the mission stays unlocked so it can be retried from the phone.
    this.G.hud && this.G.hud.flash(`${this.current.title} failed — press T to try again.`);
    this.current = null;
    this.stepIndex = 0;
    this.stepState = null;
    this.raceTimer = 0;
    this._clearMarker();
    this._clearRival();
  }

  // -- spawning ---------------------------------------------------------------

  _spawnGoons(step) {
    const spots = step.spawn || [{ x: 10, z: 420 }];
    this.stepState.down = spots.map((s) => ({ x: s.x, z: s.z, down: false, stand: 0, counted: false }));
    if (this.G.combat && typeof this.G.combat.spawnGoon === 'function') {
      for (const s of spots) this.G.combat.spawnGoon({ x: s.x, z: s.z });
    }
  }

  _spawnRival(step) {
    const start = (step.waypoints && step.waypoints[0]) || { x: -270, z: 360 };
    this.rival = { pos: { x: start.x, z: start.z }, wpIndex: 1, angle: 0, mesh: null };
    // Borrow the traffic car factory when it exists; otherwise drive a
    // marker-only rival (the minimap blip and HUD arrow still track him).
    if (this.G.traffic && typeof this.G.traffic.spawnRivalCar === 'function') {
      this.rival.mesh = this.G.traffic.spawnRivalCar(start.x, start.z);
    } else if (typeof this.G.createCarMesh === 'function') {
      const mesh = this.G.createCarMesh('sport', 0xc0392b);
      mesh.position.set(start.x, 0, start.z);
      this.G.scene && this.G.scene.add(mesh);
      this.rival.mesh = mesh;
    }
  }

  _clearRival() {
    if (this.rival && this.rival.mesh && this.G.scene) {
      this.G.scene.remove(this.rival.mesh);
    }
    this.rival = null;
  }

  _raiseHeatForEscape(step) {
    // The escape steps start hot: bank job raises four stars, the finale five.
    const target = this.current && this.current.id === 'the-last-job' ? 5 : 4;
    if (this.G.police && typeof this.G.police.setWanted === 'function') {
      this.G.police.setWanted(target);
    } else if (this.G.police && typeof this.G.police.addHeat === 'function') {
      this.G.police.addHeat(100);
    } else {
      this.G.wanted = target;
      this.G.heat = 100;
    }
    this.G.hud && this.G.hud.flash('The alarm is up — lose the heat!');
    this.G.audio && this.G.audio.play && this.G.audio.play('siren');
  }

  // -- objective marker (beam + floating diamond) ------------------------------

  _buildMarker() {
    if (!this.G.scene) return;
    const group = new THREE.Group();
    const beamGeo = new THREE.CylinderGeometry(1.6, 2.4, 60, 12, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffc94d, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 30;
    const diamondGeo = new THREE.OctahedronGeometry(1.4);
    const diamondMat = new THREE.MeshBasicMaterial({ color: 0xffd76a });
    const diamond = new THREE.Mesh(diamondGeo, diamondMat);
    diamond.position.y = 7;
    group.add(beam);
    group.add(diamond);
    group.visible = false;
    this.G.scene.add(group);
    this.marker = { group, beam, diamond };
  }

  _placeMarker() {
    if (!this.marker) return;
    const target = this.currentTarget();
    if (!target) {
      this.marker.group.visible = false;
      return;
    }
    this.marker.group.position.set(target.x, 0, target.z);
    this.marker.group.visible = true;
  }

  _clearMarker() {
    if (this.marker) this.marker.group.visible = false;
  }

  _updateMarker(dt) {
    if (!this.marker || !this.marker.group.visible) return;
    this.marker.diamond.rotation.y += dt * 2.2;
    this.marker.diamond.position.y = 7 + Math.sin((this.G.time || 0) * 2) * 0.7;
    this.marker.beam.material.opacity = 0.22 + Math.sin((this.G.time || 0) * 3) * 0.06;
    // Keep the marker glued to a moving target (rival car, next checkpoint).
    const target = this.currentTarget();
    if (target) this.marker.group.position.set(target.x, 0, target.z);
  }

  // -- HUD bridge ---------------------------------------------------------------

  _updateHudObjective(pos) {
    if (!this.G.hud) return;
    const target = this.currentTarget();
    if (!target) return;
    const dist = Math.round(dist2D(pos.x, pos.z, target.x, target.z));
    // Bearing relative to the camera yaw: 0 means straight ahead.
    const yaw = (this.G.player && this.G.player.yaw) || 0;
    const angleTo = Math.atan2(target.x - pos.x, target.z - pos.z);
    const bearing = angleTo - yaw;
    this.G.hud.setObjective(this.currentObjectiveText(), dist, bearing);
  }

  _playerPos() {
    if (this.G.playerCar && this.G.playerCar.inCar && this.G.playerCar.group) {
      const p = this.G.playerCar.group.position;
      return { x: p.x, z: p.z };
    }
    if (this.G.player && this.G.player.pos) {
      return { x: this.G.player.pos.x, z: this.G.player.pos.z };
    }
    if (this.G.player && typeof this.G.player.x === 'number') {
      return { x: this.G.player.x, z: this.G.player.z };
    }
    return null;
  }

  // -- dialog (typewriter lines, via the HUD) -------------------------------------

  _sayLines(lines) {
    this._dialogQueue = lines.slice();
    this._dialogTimer = 0;
  }

  _tickDialog(dt) {
    if (!this._dialogQueue.length) return;
    this._dialogTimer -= dt;
    if (this._dialogTimer > 0) return;
    const [speaker, text] = this._dialogQueue.shift();
    if (this.G.hud && typeof this.G.hud.say === 'function') {
      this.G.hud.say(speaker, text);
    }
    this._dialogTimer = 4.5;
  }

  // -- mission phone (T) -----------------------------------------------------------

  _bindPhone() {
    if (typeof document === 'undefined') return;
    document.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyT') return;
      if (!this.G || this.G.state !== 'playing') return;
      if (this.phoneOpen) this.closePhone();
      else this.openPhone();
    });
  }

  openPhone() {
    this.phoneOpen = true;
    const panel = document.getElementById('mission-phone');
    if (!panel) return;
    panel.classList.add('open');
    panel.innerHTML = '';
    const title = document.createElement('h2');
    title.textContent = 'Delia Rook — Jobs';
    panel.appendChild(title);
    this.missions.forEach((mission, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'phone-job';
      const status = this.done.includes(mission.id)
        ? 'DONE'
        : i === this.unlocked
          ? (this.current && this.current.index === i ? 'ACTIVE' : 'AVAILABLE')
          : 'LOCKED';
      row.disabled = i > this.unlocked || (this.current && this.current.index !== i);
      row.innerHTML = '';
      const name = document.createElement('strong');
      name.textContent = `${i + 1}. ${mission.title}`;
      const meta = document.createElement('span');
      meta.textContent = `${mission.giver} · $${mission.reward} · ${status}`;
      const brief = document.createElement('small');
      brief.textContent = mission.brief;
      row.append(name, meta, brief);
      row.addEventListener('click', () => {
        if (this.current && this.current.index === i) this.closePhone();
        else this.startMission(i);
      });
      panel.appendChild(row);
    });
    const hint = document.createElement('p');
    hint.className = 'phone-hint';
    hint.textContent = 'Press T to close. Tap a job to start it.';
    panel.appendChild(hint);
  }

  closePhone() {
    this.phoneOpen = false;
    const panel = document.getElementById('mission-phone');
    if (panel) panel.classList.remove('open');
  }

  // -- save / load ------------------------------------------------------------

  serialize() {
    return { done: this.done.slice(), unlocked: this.unlocked };
  }

  restore(data) {
    if (!data) return;
    if (Array.isArray(data.done)) this.done = data.done.slice();
    if (typeof data.unlocked === 'number') this.unlocked = data.unlocked;
  }
}

export default MissionManager;
