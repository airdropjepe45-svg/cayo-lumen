// CAYO LUMEN — every tuning number, colour and story constant in one place.
// The city is measured in metres, ground at y = 0, world x/z inside [-450, 450].
// Nothing here touches the DOM or three.js: pure data the other modules read.

export const CONFIG = {
  // ---- world geometry ----
  // The managers read these through the shared config too (missions,
  // economy and hud all fall back to their own defaults when a key is
  // missing, but this object is the single source of truth).
  world: { halfSize: 450 },
  roadSpacing: 90,
  roadWidth: 14,
  sidewalkWidth: 4,
  // Avenues run north-south (x), streets run east-west (z).
  roadCoords: [-360, -270, -180, -90, 0, 90, 180, 270, 360],
  beachZ0: 380,
  oceanZ0: 450,
  pier: { x: 0, z: 430, length: 42, width: 8 },
  park: { minX: -270, maxX: -180, minZ: 90, maxZ: 180 },
  garage: { x: -90, z: -270, label: 'VOSS GARAGE', radius: 26 },
  downtownHalf: 180,
  // Tail-the-rival and race tuning (missions.js reads these).
  follow: { minDist: 14, maxDist: 70, holdSeconds: 30 },
  race: { timeLimit: 150 },

  // ---- sunset palette (warm dusk over a coral coast) ----
  colors: {
    skyTop: 0x2e1a4d,
    skyMid: 0xff7e4a,
    skyLow: 0xffb36b,
    sun: 0xffb36b,
    sunDisc: 0xffd27a,
    fog: 0xe08a5a,
    hemiSky: 0xffd9a0,
    hemiGround: 0x3a2f4a,
    asphalt: 0x3c3a44,
    roadLine: 0xf5e9c8,
    sidewalk: 0x8d8578,
    sand: 0xe8c98f,
    ocean: 0x1d6f8f,
    oceanDeep: 0x0f4a66,
    grass: 0x4f7d3a,
    buildingRoof: 0x5a4a52,
    palmTrunk: 0x6b4a2f,
    palmLeaf: 0x2f7d3f,
    pierWood: 0x7a5a38,
    neonPink: 0xff4fa3,
    neonCyan: 0x37e0d8,
    neonAmber: 0xffb13d,
  },
  buildingPalette: [0xd8c1a3, 0xc9a98c, 0xb8c4cc, 0xe0b48f, 0x9fb4c4, 0xd8a0a0, 0xc4b49a, 0x8fa3b8],
  windowLit: 0xffd27a,
  windowDark: 0x2a2438,

  // ---- player on foot ----
  player: {
    walkSpeed: 3.5,
    runSpeed: 6.5,
    hopSpeed: 4.2,
    radius: 0.55,
    healthMax: 100,
    regenPerSec: 2,
    regenDelay: 6,
    punchRange: 2.2,
    punchDamage: 25,
  },

  // ---- driving ----
  car: {
    accel: 22,
    brake: 30,
    reverseAccel: 10,
    maxSpeed: 42,
    sportMaxSpeed: 50,
    truckMaxSpeed: 34,
    steer: 1.9,
    grip: 6.5,
    handbrakeGrip: 1.6,
    radius: 1.6,
  },
  traffic: { count: 14, speedMin: 8, speedMax: 14, followGap: 12 },

  // ---- wanted / police ----
  wanted: {
    // heat thresholds that raise the star level
    thresholds: [20, 40, 60, 80, 95],
    decayPerSec: 4,
    quietSeconds: 8,
    maxCops: 6,
    copSpawnMin: 150,
    copSpawnMax: 250,
    bustSeconds: 3,
    bustFine: 0.25, // fraction of money lost when busted
  },

  // ---- combat ----
  combat: {
    pistolDamage: 34,
    pistolAmmoStart: 24,
    pistolRange: 90,
    goonHealth: 100,
    goonDamage: 8,
    goonShootInterval: 1.4,
  },

  // ---- economy ----
  economy: {
    startingMoney: 250,
    ammoPrice: 50,
    ammoAmount: 24,
    healthPrice: 100,
    cashDrop: 50,
  },
  // Garage stock (economy.js reads this; prices match the design doc).
  cars: [
    { kind: 'sedan', label: 'Solmar Sedan', price: 800 },
    { kind: 'truck', label: 'Docks Hauler', price: 1500 },
    { kind: 'sport', label: 'Lumen GT', price: 2500 },
  ],

  // ---- missions ----
  missionRewards: [300, 400, 600, 700, 900, 1000, 1500, 2500],
  allMissionsBonus: 500,

  // ---- pedestrians ----
  peds: { count: 26, walkSpeed: 1.4, fleeSpeed: 4.2 },

  // ---- radio ----
  // stations is the plain name list the HUD shows; audio.js keeps the
  // matching sequencer patterns (bpm/tags in the same order).
  radio: {
    stations: ['SOL MAR FM', 'LUMEN 88', 'BASSLINE 101'],
    tags: ['synthwave', 'chill', 'bass'],
    bpm: [112, 76, 126],
  },

  // ---- cars ----
  carKinds: [
    { kind: 'sedan', colors: [0xb03a2e, 0x2e5f8a, 0xd8d3c8, 0x3a3f4a, 0x7a8a3a], length: 4.4, width: 1.9, height: 1.35 },
    { kind: 'taxi', colors: [0xf2c230], length: 4.4, width: 1.9, height: 1.35 },
    { kind: 'sport', colors: [0xd81b60, 0xff6d00, 0x1de9b6, 0x2979ff, 0xf5f5f5], length: 4.2, width: 2.0, height: 1.1 },
    { kind: 'truck', colors: [0x5d4037, 0x455a64, 0x8d6e63], length: 5.6, width: 2.2, height: 2.1 },
    { kind: 'van', colors: [0xeceff1, 0x78909c, 0x6d4c41], length: 5.0, width: 2.1, height: 2.0 },
  ],
  pedShirts: [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835, 0x8e24aa, 0xff7043, 0x00acc1, 0xf5f5f5],
  pedSkins: [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac],

  // ---- in-game clock: the whole game happens at golden hour ----
  clock: { startHour: 18, startMinute: 40, minutesPerSecond: 0.35 },

  // ---- determinism ----
  worldSeed: 1337,
  shotSeedDefault: 1,
};

// ---- story: all names, people and places are original ----
export const STORY = {
  city: 'Cayo Lumen',
  tagline: 'Sun, salt and unpaid debts.',
  protagonist: 'Mara Voss',
  protagonistRole: 'ex-courier, new debtor',
  fixer: 'Delia Rook',
  rival: 'Kito Fenn',
  contact: 'Ilsa Maren',
  districts: ['Old Port', 'Coral Row', 'Miramar Beach', 'The Docks', 'Palm Heights'],
  intro:
    'Mara Voss came back to Cayo Lumen with one suitcase and a debt she did not make. ' +
    'Delia Rook owns that debt now — and Delia always collects. Eight jobs. One ledger. Get it done.',
  ending:
    'The ledger is ash, the debt is gone, and the whole coast knows the name Mara Voss. ' +
    'Cayo Lumen is yours now, legend.',
};

export const SAVE_KEY = 'cayo-lumen-save-v1';
