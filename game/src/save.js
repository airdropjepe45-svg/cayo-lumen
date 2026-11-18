// save.js — persisting a Cayo Lumen run in the browser's localStorage.
//
// One key, one small object: the wallet, the missions finished, the cars in
// the garage, where Mara is standing and how healthy she is. Wanted is always
// saved as 0 — nobody loads back into a police chase. The game saves on
// mission complete, from the pause menu, and automatically every 60 seconds
// while playing. Loading never throws: a missing, corrupt or half-written save
// simply means "no save", and the player starts fresh.

export const SAVE_KEY = 'cayo-lumen-save-v1';

const AUTO_SAVE_INTERVAL_MS = 60 * 1000;

let _autoSaveTimer = null;

function storageAvailable() {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch (err) {
    return false;
  }
}

/** Build the save object from the live game state. */
function buildSaveData(G) {
  const playerPos = (() => {
    if (G.player && G.player.pos) {
      return { x: G.player.pos.x, y: 0, z: G.player.pos.z };
    }
    if (G.player && typeof G.player.x === 'number') {
      return { x: G.player.x, y: 0, z: G.player.z || 0 };
    }
    return { x: -90, y: 0, z: -270 };
  })();
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    money: G.economy ? G.economy.money : (G.money || 0),
    missionsDone: G.missions && Array.isArray(G.missions.done) ? G.missions.done.slice() : [],
    missionsUnlocked: G.missions ? G.missions.unlocked || 0 : 0,
    ownedCars: G.economy && Array.isArray(G.economy.ownedCars) ? G.economy.ownedCars.slice() : [],
    playerPos,
    health: Math.max(0, Math.min(100, G.health ?? (G.player && G.player.health) ?? 100)),
    wanted: 0,
  };
}

/** Write the current run to localStorage. Returns true when it stuck. */
export function saveGame(G) {
  if (!G || !storageAvailable()) return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(buildSaveData(G)));
    return true;
  } catch (err) {
    return false;
  }
}

/** Read the saved run, or null when there is none / it cannot be parsed. */
export function loadGame() {
  if (!storageAvailable()) return null;
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (err) {
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (!Array.isArray(data.missionsDone)) data.missionsDone = [];
    if (!Array.isArray(data.ownedCars)) data.ownedCars = [];
    if (typeof data.money !== 'number') data.money = 250;
    if (!data.playerPos || typeof data.playerPos.x !== 'number') {
      data.playerPos = { x: -90, y: 0, z: -270 };
    }
    if (typeof data.health !== 'number') data.health = 100;
    data.wanted = 0;
    return data;
  } catch (err) {
    return null;
  }
}

/** True when a loadable save exists. */
export function hasSave() {
  return loadGame() !== null;
}

/**
 * Apply a loaded save to a live game: wallet, missions, garage cars, Mara's
 * position and health. Call after the managers exist, before play resumes.
 */
export function applySave(G, data) {
  if (!G || !data) return false;
  if (G.economy) {
    G.economy.money = data.money;
    G.economy.ownedCars = data.ownedCars.slice();
    G.economy.respawnOwnedCars();
  }
  G.money = data.money;
  if (G.missions && typeof G.missions.restore === 'function') {
    G.missions.restore({ done: data.missionsDone, unlocked: data.missionsUnlocked });
  }
  G.health = data.health;
  if (G.player) {
    G.player.health = data.health;
    if (G.player.pos && data.playerPos) {
      // pos is a THREE.Vector3 in the real game, a plain {x,y,z} in tests.
      if (typeof G.player.pos.set === 'function') {
        G.player.pos.set(data.playerPos.x, data.playerPos.y || 0, data.playerPos.z);
      } else {
        G.player.pos.x = data.playerPos.x;
        G.player.pos.y = data.playerPos.y || 0;
        G.player.pos.z = data.playerPos.z;
      }
    }
  }
  G.wanted = 0;
  G.heat = 0;
  return true;
}

/** Start the 60-second autosave loop; safe to call twice (restarts it). */
export function startAutoSave(G) {
  stopAutoSave();
  if (typeof setInterval === 'undefined') return null;
  _autoSaveTimer = setInterval(() => {
    if (G && G.state === 'playing') saveGame(G);
  }, AUTO_SAVE_INTERVAL_MS);
  return _autoSaveTimer;
}

/** Stop the autosave loop (menu / game over). */
export function stopAutoSave() {
  if (_autoSaveTimer !== null) {
    clearInterval(_autoSaveTimer);
    _autoSaveTimer = null;
  }
}

export default { saveGame, loadGame, hasSave, applySave, startAutoSave, stopAutoSave, SAVE_KEY };
