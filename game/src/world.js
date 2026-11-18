// Cayo Lumen itself: a sun-soaked coastal city on a 90 m road grid, built once
// from a seed so the same seed always builds the same streets. Everything the
// player can bump into is an AABB in `colliders`; the helpers below are what the
// gameplay modules use to stay on the roads and out of the walls.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { chance, pick, rand } from './random.js';

const C = CONFIG.colors;
const ROADS = CONFIG.roadCoords;
const HALF = CONFIG.world.halfSize;
const ROAD_HALF = CONFIG.roadWidth / 2;
const WALK = CONFIG.sidewalkWidth;

/** True when (x, z) is on asphalt (a road strip, not a sidewalk or block). */
export function isOnRoad(x, z) {
  for (const c of ROADS) {
    if (Math.abs(x - c) <= ROAD_HALF || Math.abs(z - c) <= ROAD_HALF) return true;
  }
  return false;
}

/** Snap (x, z) to the centre line of the nearest road. */
export function nearestRoadPoint(x, z) {
  let bx = ROADS[0];
  let bz = ROADS[0];
  for (const c of ROADS) {
    if (Math.abs(c - x) < Math.abs(bx - x)) bx = c;
    if (Math.abs(c - z) < Math.abs(bz - z)) bz = c;
  }
  // Pick the nearer axis: avenue (x = bx) or street (z = bz).
  return Math.abs(bx - x) < Math.abs(bz - z) ? { x: bx, z } : { x, z: bz };
}

/** A random point on a random road, for spawning traffic and police. */
export function randomRoadPoint(rng) {
  if (chance(rng, 0.5)) {
    return { x: pick(rng, ROADS) + rand(rng, -4, 4), z: rand(rng, -360, 360) };
  }
  return { x: rand(rng, -360, 360), z: pick(rng, ROADS) + rand(rng, -4, 4) };
}

/** Keep a Vector3 inside the playable world (y untouched). */
export function clampToWorld(v) {
  v.x = Math.max(-HALF, Math.min(HALF, v.x));
  v.z = Math.max(-HALF, Math.min(HALF, v.z));
  return v;
}

/**
 * Push a circle at `pos` (a THREE.Vector3, x/z used) out of every building AABB
 * it overlaps. Returns true when a push happened. `world` is the object
 * buildWorld returned.
 */
export function resolveCircle(world, pos, radius) {
  let pushed = false;
  for (const b of world.colliders) {
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    pushed = true;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // Centre inside the box: shove out along the smallest penetration axis.
      const pl = pos.x - b.minX;
      const pr = b.maxX - pos.x;
      const pt = pos.z - b.minZ;
      const pb = b.maxZ - pos.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) pos.x = b.minX - radius;
      else if (m === pr) pos.x = b.maxX + radius;
      else if (m === pt) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    }
  }
  return pushed;
}

// ---- canvas textures (generated once, reused everywhere) ----

function makeWindowTexture(rng) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#3a3344';
  g.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const lit = rng() < 0.42;
      g.fillStyle = lit ? '#ffd27a' : '#241f33';
      g.fillRect(8 + col * 20, 10 + row * 20, 12, 12);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeTextTexture(text, fg, bg, fontPx) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(6, 6, 500, 116);
  g.fillStyle = fg;
  g.font = `bold ${fontPx}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeDashTexture(vertical) {
  // One dash per tile; the tile repeats along the road. Horizontal tiles repeat
  // along U (the plane's width), vertical tiles along V (the plane's height).
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d');
  if (vertical) {
    cv.width = 8;
    cv.height = 64;
    g.clearRect(0, 0, 8, 64);
    g.fillStyle = '#f5e9c8';
    g.fillRect(2, 0, 4, 36);
  } else {
    cv.width = 64;
    cv.height = 8;
    g.clearRect(0, 0, 64, 8);
    g.fillStyle = '#f5e9c8';
    g.fillRect(0, 2, 36, 4);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (vertical) tex.repeat.set(1, 60);
  else tex.repeat.set(60, 1);
  return tex;
}

function makeSkyTexture() {
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 256;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#241536');
  grad.addColorStop(0.45, '#7a3a6e');
  grad.addColorStop(0.75, '#ff7e4a');
  grad.addColorStop(1, '#ffb36b');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Build the whole city into `scene`. Deterministic for a given rng.
 * Returns { group, colliders, lamps, buildings, roadLines, skyMat, oceanMats,
 *   oceanPulse, resolveCircle, isOnRoad, nearestRoadPoint, randomRoadPoint,
 *   clampToWorld }.
 */
export function buildWorld(scene, rng) {
  const group = new THREE.Group();
  group.name = 'cayo-lumen';
  scene.add(group);
  scene.fog = new THREE.FogExp2(C.fog, 0.0016);
  scene.background = new THREE.Color(C.skyLow);

  const colliders = [];
  const lamps = [];
  const buildings = [];
  const roadLines = [];

  const windowTex = makeWindowTexture(rng);
  const dashTexH = makeDashTexture(false);
  const dashTexV = makeDashTexture(true);

  // Shared materials — a handful, reused across hundreds of meshes.
  const asphaltMat = new THREE.MeshLambertMaterial({ color: C.asphalt });
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: C.sidewalk });
  const pavementMat = new THREE.MeshLambertMaterial({ color: 0x7d7668 });
  const grassMat = new THREE.MeshLambertMaterial({ color: C.grass });
  const sandMat = new THREE.MeshLambertMaterial({ color: C.sand });
  const roofMat = new THREE.MeshLambertMaterial({ color: C.buildingRoof });
  const trunkMat = new THREE.MeshLambertMaterial({ color: C.palmTrunk });
  const leafMat = new THREE.MeshLambertMaterial({ color: C.palmLeaf, side: THREE.DoubleSide });
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x2c2c34 });
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const pierMat = new THREE.MeshLambertMaterial({ color: C.pierWood });
  const facadeMats = CONFIG.buildingPalette.map(
    (color) =>
      new THREE.MeshLambertMaterial({
        color,
        map: windowTex,
        emissive: 0xffc46b,
        emissiveMap: windowTex,
        emissiveIntensity: 0.55,
      }),
  );

  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    (parent || group).add(m);
    return m;
  }

  function flat(w, d, mat, x, z, y) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }

  // ---- ground: base, block fills, roads, sidewalks, dashes ----
  flat(HALF * 2 + 200, HALF * 2 + 200, new THREE.MeshLambertMaterial({ color: 0x565049 }), 0, 0, -0.05);
  for (let i = 0; i < ROADS.length - 1; i += 1) {
    for (let j = 0; j < ROADS.length - 1; j += 1) {
      const x0 = ROADS[i] + ROAD_HALF + WALK;
      const x1 = ROADS[i + 1] - ROAD_HALF - WALK;
      const z0 = ROADS[j] + ROAD_HALF + WALK;
      const z1 = ROADS[j + 1] - ROAD_HALF - WALK;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const w = x1 - x0;
      const d = z1 - z0;
      if (cz >= CONFIG.beachZ0 - 11) {
        flat(w, d, sandMat, cx, cz, 0.02);
      } else if (x0 >= CONFIG.park.minX && x1 <= CONFIG.park.maxX && z0 >= CONFIG.park.minZ && z1 <= CONFIG.park.maxZ) {
        flat(w, d, grassMat, cx, cz, 0.02);
      } else {
        flat(w, d, pavementMat, cx, cz, 0.02);
      }
    }
  }
  // Beach strip beyond the last street, and the sand in front of the ocean.
  flat(HALF * 2 + 60, 70, sandMat, 0, 415, 0.02);
  for (const c of ROADS) {
    flat(CONFIG.roadWidth, HALF * 2, asphaltMat, c, 0, 0.05);
    flat(HALF * 2, CONFIG.roadWidth, asphaltMat, 0, c, 0.05);
    flat(WALK, HALF * 2, sidewalkMat, c - ROAD_HALF - WALK / 2, 0, 0.06);
    flat(WALK, HALF * 2, sidewalkMat, c + ROAD_HALF + WALK / 2, 0, 0.06);
    flat(HALF * 2, WALK, sidewalkMat, 0, c - ROAD_HALF - WALK / 2, 0.06);
    flat(HALF * 2, WALK, sidewalkMat, 0, c + ROAD_HALF + WALK / 2, 0.06);
    const dashV = flat(0.5, HALF * 2, new THREE.MeshBasicMaterial({ map: dashTexV, transparent: true }), c, 0, 0.08);
    roadLines.push(dashV);
    const dashH = flat(HALF * 2, 0.5, new THREE.MeshBasicMaterial({ map: dashTexH, transparent: true }), 0, c, 0.08);
    roadLines.push(dashH);
  }

  // ---- sky dome + low western sun + clouds ----
  const skyMat = new THREE.MeshBasicMaterial({
    map: makeSkyTexture(),
    side: THREE.BackSide,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 16), skyMat);
  sky.position.y = -40;
  group.add(sky);
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(60, 32),
    new THREE.MeshBasicMaterial({ color: C.sunDisc, fog: false }),
  );
  sunDisc.position.set(-1150, 130, 80);
  sunDisc.lookAt(0, 60, 0);
  group.add(sunDisc);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffe3c8, transparent: true, opacity: 0.5, fog: false });
  for (let i = 0; i < 9; i += 1) {
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(rand(rng, 120, 260), rand(rng, 18, 34)), cloudMat);
    cl.position.set(rand(rng, -800, 800), rand(rng, 150, 260), rand(rng, -700, 500));
    cl.rotation.x = -Math.PI / 2;
    group.add(cl);
  }

  // ---- ocean: two overlapping transparent planes, pulsing opacity ----
  const oceanMatA = new THREE.MeshLambertMaterial({ color: C.ocean, transparent: true, opacity: 0.88 });
  const oceanMatB = new THREE.MeshLambertMaterial({ color: C.oceanDeep, transparent: true, opacity: 0.5 });
  const oceanA = flat(HALF * 2 + 400, 260, oceanMatA, 0, 580, 0.1);
  const oceanB = flat(HALF * 2 + 400, 240, oceanMatB, 0, 590, 0.14);
  oceanA.receiveShadow = false;
  oceanB.receiveShadow = false;

  // ---- pier at (0, 430), planks out to z = 470 ----
  const pier = new THREE.Group();
  pier.position.set(CONFIG.pier.x, 0, CONFIG.pier.z);
  group.add(pier);
  box(CONFIG.pier.width, 0.6, CONFIG.pier.length, pierMat, 0, 1.2, 8, pier);
  for (let i = 0; i < 5; i += 1) {
    box(0.5, 2.6, 0.5, pierMat, -3.4, 0, -8 + i * 8, pier);
    box(0.5, 2.6, 0.5, pierMat, 3.4, 0, -8 + i * 8, pier);
  }
  // Pier shack + "PIER 9" neon at the pier head.
  box(6, 4, 5, new THREE.MeshLambertMaterial({ color: 0x8a5a3a }), 0, 3.2, 24, pier);
  const pierSign = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 2.5),
    new THREE.MeshBasicMaterial({ map: makeTextTexture('PIER 9', '#37e0d8', '#101018', 56) }),
  );
  pierSign.position.set(0, 6.4, 24);
  pier.add(pierSign);

  // ---- beach umbrellas ----
  const umbrellaMat = new THREE.MeshLambertMaterial({ color: 0xff5a76, side: THREE.DoubleSide });
  const umbrellaMat2 = new THREE.MeshLambertMaterial({ color: 0xffd23d, side: THREE.DoubleSide });
  for (let i = 0; i < 10; i += 1) {
    const ux = rand(rng, -330, 330);
    const uz = rand(rng, 392, 442);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), lampPoleMat);
    pole.position.set(ux, 1.2, uz);
    group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.0, 8), i % 2 ? umbrellaMat : umbrellaMat2);
    top.position.set(ux, 2.7, uz);
    group.add(top);
  }

  // ---- buildings: 1–4 per block, taller near the centre ----
  const blockInner = CONFIG.roadSpacing - (ROAD_HALF + WALK) * 2; // 68
  for (let i = 0; i < ROADS.length - 1; i += 1) {
    for (let j = 0; j < ROADS.length - 1; j += 1) {
      const x0 = ROADS[i] + ROAD_HALF + WALK;
      const z0 = ROADS[j] + ROAD_HALF + WALK;
      const cx = x0 + blockInner / 2;
      const cz = z0 + blockInner / 2;
      if (cz >= CONFIG.beachZ0 - 11) continue; // beach blocks stay open
      if (x0 >= CONFIG.park.minX && z0 >= CONFIG.park.minZ && x0 < CONFIG.park.maxX && z0 < CONFIG.park.maxZ) continue; // park
      const distCentre = Math.hypot(cx, cz);
      const downtown = Math.abs(cx) < CONFIG.downtownHalf && Math.abs(cz) < CONFIG.downtownHalf;
      const count = downtown ? rand(rng, 0, 1) < 0.5 ? 1 : 2 : Math.floor(rand(rng, 1, 4.99));
      const quads = shuffle(rng, [
        { dx: -1, dz: -1 },
        { dx: 1, dz: -1 },
        { dx: -1, dz: 1 },
        { dx: 1, dz: 1 },
      ]);
      for (let q = 0; q < count; q += 1) {
        const quad = quads[q];
        const qw = blockInner / 2;
        const bw = rand(rng, qw * 0.55, qw * 0.92);
        const bd = rand(rng, qw * 0.55, qw * 0.92);
        const bx = cx + quad.dx * qw * 0.5;
        const bz = cz + quad.dz * qw * 0.5;
        const tall = 1 - Math.min(distCentre / 620, 1);
        const h = Math.round(rand(rng, 12, 12 + tall * 58 + (downtown ? 10 : 0)));
        const facade = pick(rng, facadeMats);
        const mats = [facade, facade, roofMat, roofMat, facade, facade];
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, h, bd), mats);
        mesh.position.set(bx, h / 2, bz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        buildings.push(mesh);
        colliders.push({ minX: bx - bw / 2, maxX: bx + bw / 2, minZ: bz - bd / 2, maxZ: bz + bd / 2 });
      }
    }
  }

  // ---- garage / safehouse at (-90, -270): low block + big sign ----
  const garageMat = new THREE.MeshLambertMaterial({ color: 0x4a6b8a });
  const garageMesh = box(26, 7, 18, garageMat, CONFIG.garage.x, 3.5, CONFIG.garage.z);
  garageMesh.castShadow = true;
  buildings.push(garageMesh);
  colliders.push({
    minX: CONFIG.garage.x - 13,
    maxX: CONFIG.garage.x + 13,
    minZ: CONFIG.garage.z - 9,
    maxZ: CONFIG.garage.z + 9,
  });
  const garageSign = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 4),
    new THREE.MeshBasicMaterial({ map: makeTextTexture('VOSS GARAGE', '#ffb13d', '#101018', 44) }),
  );
  garageSign.position.set(CONFIG.garage.x, 9.5, CONFIG.garage.z + 9.2);
  group.add(garageSign);

  // ---- neon signs on downtown towers ----
  const neonDefs = [
    { text: 'SOL MAR', fg: '#ff4fa3', x: -95, z: -95, y: 46 },
    { text: 'LUMEN', fg: '#37e0d8', x: 95, z: 5, y: 58 },
    { text: 'TACOS', fg: '#ffb13d', x: 5, z: -185, y: 30 },
    { text: 'HOTEL', fg: '#ff4fa3', x: 185, z: 95, y: 40 },
    { text: 'PIER 9', fg: '#37e0d8', x: -185, z: 185, y: 34 },
  ];
  for (const n of neonDefs) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 3.5),
      new THREE.MeshBasicMaterial({ map: makeTextTexture(n.text, n.fg, '#0d0d16', 64) }),
    );
    sign.position.set(n.x, n.y, n.z);
    sign.rotation.y = rand(rng, 0, Math.PI * 2);
    group.add(sign);
  }

  // ---- palms: beach road, park, and scattered along sidewalks ----
  const leafGeo = new THREE.PlaneGeometry(3.4, 1.1);
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 5.5, 6);
  function palm(x, z, s) {
    const p = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.75;
    trunk.rotation.z = rand(rng, -0.06, 0.06);
    p.add(trunk);
    for (let l = 0; l < 6; l += 1) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      const a = (l / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.2, 5.6, Math.sin(a) * 1.2);
      leaf.rotation.set(0.5, -a + Math.PI / 2, 0);
      leaf.rotation.order = 'YXZ';
      p.add(leaf);
    }
    p.position.set(x, 0, z);
    p.scale.setScalar(s);
    group.add(p);
    return p;
  }
  for (let x = -340; x <= 340; x += 42) {
    palm(x + rand(rng, -4, 4), 372 + rand(rng, -2, 2), rand(rng, 0.9, 1.25));
  }
  for (let i = 0; i < 14; i += 1) {
    palm(rand(rng, CONFIG.park.minX + 6, CONFIG.park.maxX - 6), rand(rng, CONFIG.park.minZ + 6, CONFIG.park.maxZ - 6), rand(rng, 0.9, 1.3));
  }
  for (let i = 0; i < 22; i += 1) {
    const p = randomRoadPoint(rng);
    const side = chance(rng, 0.5) ? 1 : -1;
    palm(p.x + side * (ROAD_HALF + WALK / 2), p.z, rand(rng, 0.8, 1.1));
  }

  // ---- street lamps every 45 m along the roads ----
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6, 6);
  const bulbGeo = new THREE.SphereGeometry(0.28, 8, 6);
  const heroSpots = [
    { x: 0, z: 0 },
    { x: CONFIG.garage.x, z: CONFIG.garage.z + 16 },
    { x: 0, z: 360 },
    { x: -180, z: 90 },
  ];
  let heroUsed = 0;
  for (const c of ROADS) {
    for (let t = -360; t <= 360; t += 45) {
      for (const side of [-1, 1]) {
        if ((Math.round(t / 45) + (side > 0 ? 1 : 0)) % 2 === 0) continue; // stagger sides
        const lx = c + side * (ROAD_HALF + WALK / 2 + 0.4);
        const lz = t;
        const pole = new THREE.Mesh(poleGeo, lampPoleMat);
        pole.position.set(lx, 3, lz);
        group.add(pole);
        const bulb = new THREE.Mesh(bulbGeo, lampGlowMat);
        bulb.position.set(lx, 6.1, lz);
        group.add(bulb);
        const lamp = { x: lx, z: lz, bulb };
        lamps.push(lamp);
        const isHero = heroUsed < 4 && heroSpots.some((h) => Math.abs(h.x - lx) < 12 && Math.abs(h.z - lz) < 12);
        if (isHero) {
          heroUsed += 1;
          const light = new THREE.PointLight(0xffc46b, 60, 55, 1.8);
          light.position.set(lx, 6, lz);
          group.add(light);
          lamp.light = light;
        }
      }
    }
  }

  const world = {
    group,
    colliders,
    lamps,
    buildings,
    roadLines,
    skyMat,
    oceanMats: [oceanMatA, oceanMatB],
    // Slow breathing of the two ocean layers; main.js calls this every frame.
    oceanPulse(t) {
      oceanMatA.opacity = 0.82 + Math.sin(t * 0.5) * 0.06;
      oceanMatB.opacity = 0.42 + Math.sin(t * 0.5 + 1.7) * 0.08;
    },
    resolveCircle: (pos, radius) => resolveCircle(world, pos, radius),
    isOnRoad,
    nearestRoadPoint,
    randomRoadPoint,
    clampToWorld,
  };
  return world;
}
