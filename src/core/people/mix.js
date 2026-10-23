// Keyed randomness for the people layer. The foundation's hash (FNV-1a) barely moves
// its top bits when only the last character of a key changes ('id:whim:1' vs 'id:whim:2'),
// which made a person's daily whims nearly the same every day. A final avalanche step
// fixes that, so each day and each key is an independent draw.

import { hash } from '../random.js';

export { hash };

function mixed(key) {
  let h = hash(key);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// A number in [0, 1) from a key.
export const unit = key => mixed(key) / 4294967296;
// An integer in [0, n) from a key.
export const pick = (key, n) => (n > 0 ? mixed(key) % n : 0);
