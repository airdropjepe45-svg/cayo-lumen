// economy.js — money, the garage shop, and everything the player can buy.
//
// The Economy owns the player's wallet: cash earned from jobs and street
// pickups, and spent on cars, ammunition and health. It also owns the garage
// menu (G key, near the safehouse garage): a DOM panel listing the cars for
// sale, plus ammo and a full heal. Buying a car spawns it at the garage so the
// player can walk up and drive it away. Like every other manager it talks to
// the rest of the game only through G, and it keeps G.money in sync so the HUD
// always shows the same number the wallet holds.

import * as configModule from './config.js';

const SHARED = (configModule && configModule.CONFIG) || {};

// The garage stock: what is for sale and what it costs. The shared config may
// override prices; these are the defaults the design doc promises.
export const GARAGE_STOCK = (SHARED.cars && Array.isArray(SHARED.cars) && SHARED.cars.length
  ? SHARED.cars
  : [
      { kind: 'sedan', label: 'Lumen Sedan', price: 800 },
      { kind: 'truck', label: 'Docks Truck', price: 1500 },
      { kind: 'sport', label: 'Miramar Sport', price: 2500 },
    ]).map((car) => ({ kind: car.kind, label: car.label || car.kind, price: car.price }));

export const AMMO_PACK = { label: 'Pistol ammo ×24', price: 50, amount: 24 };
export const HEALTH_PACK = { label: 'Full heal', price: 100 };

const GARAGE_POS = SHARED.garage || { x: -90, z: -270 };
const GARAGE_RADIUS = 26;
const STARTING_MONEY = (SHARED.economy && SHARED.economy.startingMoney) || 250;

function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export class Economy {
  constructor(G) {
    this.G = G;
    this.money = STARTING_MONEY;
    this.ownedCars = []; // kinds the player owns, e.g. ['sedan', 'sport']
    this.panelOpen = false;
    this._spawned = {}; // kind -> car group parked at the garage
    this.G.money = this.money;
    this._bindGarageKey();
  }

  // Every manager exposes update(dt) so the main loop can tick it uniformly.
  // The economy has no per-frame work: the wallet only moves on events, and
  // the garage menu is driven by its key binding and button clicks.
  update(_dt) {
    // Intentionally empty.
  }

  // -- wallet ----------------------------------------------------------------

  add(n) {
    const amount = Math.max(0, Math.round(n) || 0);
    this.money += amount;
    this.G.money = this.money;
    return this.money;
  }

  spend(n) {
    const amount = Math.max(0, Math.round(n) || 0);
    if (this.money < amount) return false;
    this.money -= amount;
    this.G.money = this.money;
    return true;
  }

  canAfford(n) {
    return this.money >= n;
  }

  /** Street cash: a goon drops $50, a pickup is found, a job pays out. */
  collectDrop(amount) {
    this.add(amount || 50);
    this.G.hud && this.G.hud.flash(`+$${amount || 50}`);
    this.G.audio && this.G.audio.play && this.G.audio.play('pickup');
  }

  // -- cars -------------------------------------------------------------------

  owns(kind) {
    return this.ownedCars.includes(kind);
  }

  buyCar(kind, price) {
    const stock = GARAGE_STOCK.find((car) => car.kind === kind);
    const cost = typeof price === 'number' ? price : (stock ? stock.price : 0);
    if (!stock) {
      this.G.hud && this.G.hud.flash(`No ${kind} in stock at the garage.`);
      return false;
    }
    if (this.owns(kind)) {
      this.G.hud && this.G.hud.flash(`You already own the ${stock.label}.`);
      return false;
    }
    if (!this.spend(cost)) {
      this.G.hud && this.G.hud.flash(`Not enough cash for the ${stock.label} ($${cost}).`);
      this.G.audio && this.G.audio.play && this.G.audio.play('fail');
      return false;
    }
    this.ownedCars.push(kind);
    this._spawnOwnedCar(kind);
    this.G.hud && this.G.hud.flash(`Bought the ${stock.label} — it is parked at the garage.`);
    this.G.audio && this.G.audio.play && this.G.audio.play('success');
    this._renderPanel();
    return true;
  }

  buyAmmo() {
    if (!this.spend(AMMO_PACK.price)) {
      this.G.hud && this.G.hud.flash(`Not enough cash for ammo ($${AMMO_PACK.price}).`);
      return false;
    }
    if (this.G.combat) {
      this.G.combat.ammo = (this.G.combat.ammo || 0) + AMMO_PACK.amount;
    } else if (this.G.player) {
      this.G.player.ammo = (this.G.player.ammo || 0) + AMMO_PACK.amount;
    }
    this.G.hud && this.G.hud.flash(`+${AMMO_PACK.amount} pistol ammo.`);
    this.G.audio && this.G.audio.play && this.G.audio.play('pickup');
    this._renderPanel();
    return true;
  }

  buyHealth() {
    if (!this.spend(HEALTH_PACK.price)) {
      this.G.hud && this.G.hud.flash(`Not enough cash for a full heal ($${HEALTH_PACK.price}).`);
      return false;
    }
    this.G.health = 100;
    if (this.G.player) this.G.player.health = 100;
    this.G.hud && this.G.hud.flash('Patched up — health full.');
    this.G.audio && this.G.audio.play && this.G.audio.play('pickup');
    this._renderPanel();
    return true;
  }

  /** Park a newly bought car beside the garage, ready to drive away. */
  _spawnOwnedCar(kind) {
    const slot = this.ownedCars.length - 1;
    const x = GARAGE_POS.x + 14 + slot * 8;
    const z = GARAGE_POS.z + 18;
    let group = null;
    if (typeof this.G.createCarMesh === 'function') {
      group = this.G.createCarMesh(kind, 0x2e86c1);
    } else if (this.G.traffic && typeof this.G.traffic.spawnParkedCar === 'function') {
      group = this.G.traffic.spawnParkedCar(kind, x, z);
    }
    if (group) {
      group.position.set(x, 0, z);
      if (this.G.scene && !group.parent) this.G.scene.add(group);
      // Register the car with traffic as a parked record, so the player
      // can actually get in it with E (nearestCar only sees records).
      if (this.G.traffic && typeof this.G.traffic.addParkedCar === 'function') {
        this.G.traffic.addParkedCar({ group, kind, angle: 0, speed: 0, parked: true, axis: 'x', dir: 1, cruise: 0 });
      }
      this._spawned[kind] = group;
      // The player module treats any car group near the player as enterable,
      // so a spawned group is enough for E to work.
      if (this.G.parkedCars) this.G.parkedCars.push(group);
    }
  }

  /** Re-park every owned car after a load (positions are deterministic). */
  respawnOwnedCars() {
    const owned = this.ownedCars.slice();
    this.ownedCars = [];
    this._spawned = {};
    for (const kind of owned) {
      this.ownedCars.push(kind);
      this._spawnOwnedCar(kind);
    }
  }

  // -- garage menu (G key, near the garage) ------------------------------------

  _bindGarageKey() {
    if (typeof document === 'undefined') return;
    document.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyG') return;
      if (!this.G || this.G.state !== 'playing') return;
      if (this.panelOpen) {
        this.closeGarage();
        return;
      }
      if (this._nearGarage()) this.openGarage();
      else this.G.hud && this.G.hud.flash('The garage is at the safehouse — head to the green blip.');
    });
  }

  _nearGarage() {
    const pos = this._playerPos();
    if (!pos) return false;
    return dist2D(pos.x, pos.z, GARAGE_POS.x, GARAGE_POS.z) <= GARAGE_RADIUS;
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

  openGarage() {
    this.panelOpen = true;
    const panel = document.getElementById('garage-panel');
    if (!panel) return;
    panel.classList.add('open');
    this._renderPanel();
  }

  closeGarage() {
    this.panelOpen = false;
    const panel = document.getElementById('garage-panel');
    if (panel) panel.classList.remove('open');
  }

  _renderPanel() {
    const panel = document.getElementById('garage-panel');
    if (!panel || !this.panelOpen) return;
    panel.innerHTML = '';
    const title = document.createElement('h2');
    title.textContent = 'Safehouse Garage';
    const cash = document.createElement('p');
    cash.className = 'garage-cash';
    cash.textContent = `Cash: $${this.money}`;
    panel.append(title, cash);

    for (const car of GARAGE_STOCK) {
      const row = document.createElement('div');
      row.className = 'garage-row';
      const name = document.createElement('strong');
      name.textContent = car.label;
      const price = document.createElement('span');
      price.textContent = this.owns(car.kind) ? 'Owned — parked outside' : `$${car.price}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = this.owns(car.kind) ? 'Owned' : 'Buy';
      button.disabled = this.owns(car.kind) || !this.canAfford(car.price);
      button.addEventListener('click', () => this.buyCar(car.kind, car.price));
      row.append(name, price, button);
      panel.appendChild(row);
    }

    const ammoRow = document.createElement('div');
    ammoRow.className = 'garage-row';
    const ammoName = document.createElement('strong');
    ammoName.textContent = AMMO_PACK.label;
    const ammoPrice = document.createElement('span');
    ammoPrice.textContent = `$${AMMO_PACK.price}`;
    const ammoButton = document.createElement('button');
    ammoButton.type = 'button';
    ammoButton.textContent = 'Buy';
    ammoButton.disabled = !this.canAfford(AMMO_PACK.price);
    ammoButton.addEventListener('click', () => this.buyAmmo());
    ammoRow.append(ammoName, ammoPrice, ammoButton);
    panel.appendChild(ammoRow);

    const healRow = document.createElement('div');
    healRow.className = 'garage-row';
    const healName = document.createElement('strong');
    healName.textContent = HEALTH_PACK.label;
    const healPrice = document.createElement('span');
    healPrice.textContent = `$${HEALTH_PACK.price}`;
    const healButton = document.createElement('button');
    healButton.type = 'button';
    healButton.textContent = 'Buy';
    healButton.disabled = !this.canAfford(HEALTH_PACK.price);
    healButton.addEventListener('click', () => this.buyHealth());
    healRow.append(healName, healPrice, healButton);
    panel.appendChild(healRow);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'garage-close';
    close.textContent = 'Close (G)';
    close.addEventListener('click', () => this.closeGarage());
    panel.appendChild(close);
  }

  // -- save / load ------------------------------------------------------------

  serialize() {
    return { money: this.money, ownedCars: this.ownedCars.slice() };
  }

  restore(data) {
    if (!data) return;
    if (typeof data.money === 'number') {
      this.money = data.money;
      this.G.money = this.money;
    }
    if (Array.isArray(data.ownedCars)) {
      this.ownedCars = data.ownedCars.slice();
      this.respawnOwnedCars();
    }
  }
}

export default Economy;
