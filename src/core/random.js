// Deterministic hashing and random numbers. Everything random in the town is a
// function of a string key, so the same key gives the same value in every browser,
// in Node, on every visit.

// 32-bit FNV-1a of a string.
export function hash(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// A number in [0, 1) from a key.
export function unit(key) {
  return hash(key) / 4294967296;
}

// A number in [0, 1) from a key, its bits well mixed: keys that differ only in their last
// characters ('…:w1', '…:w2') land far apart, which plain FNV (unit) does not promise.
// For scattering many similar things (which windows are lit); unit() stays as it is,
// since every resident's habits are keyed by it.
export function scatter(key) {
  let h = hash(key);
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// An integer in [0, n) from a key.
export function pick(key, n) {
  return n > 0 ? hash(key) % n : 0;
}

// A seeded generator (SplitMix32): returns a function giving numbers in [0, 1).
export function rng(seed) {
  let state = (typeof seed === 'string' ? hash(seed) : seed) >>> 0;
  return function next() {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    z ^= z >>> 15;
    return (z >>> 0) / 4294967296;
  };
}
