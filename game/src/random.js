// Seeded randomness for Cayo Lumen: the same seed always builds the same city,
// which is what makes the screenshot scenes repeatable shot after shot.

/** mulberry32 — a tiny, fast seeded PRNG. Returns a function yielding [0, 1). */
export function mulberry32(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [a, b). */
export function rand(rng, a, b) {
  return a + rng() * (b - a);
}

/** An integer in [a, b] inclusive. */
export function randInt(rng, a, b) {
  return Math.floor(rand(rng, a, b + 1));
}

/** One random element of a non-empty array. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** True with probability p (0..1). */
export function chance(rng, p) {
  return rng() < p;
}

/** Fisher–Yates shuffle in place, driven by rng. Returns the array. */
export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/** Alias kept for callers that think of the generator as "create a random". */
export const createRandom = mulberry32;
