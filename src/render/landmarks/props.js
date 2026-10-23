// Small things the park-like landmarks share: trees, lamp posts, benches, planters,
// paving helpers. Everything adds to ShapeBuilders (merged by the caller).

import * as THREE from 'three';
import { noise } from './common.js';

const FOLIAGE = ['#5f9a4a', '#6aa855', '#56904a', '#78b05c'];
const BLOSSOM = ['#f3a6bd', '#f6d56a', '#ffffff', '#ee8a6a'];

// A round-crowned tree, ~ `size` * 14 tall: trunk and two or three stacked blobs.
export function tree(sb, x, z, size = 1, seed = 0, y = 0.2) {
  const n = k => noise(Math.round(x * 7 + z * 13) + seed, k);
  const trunk = 3.2 * size;
  sb.cylinder(x, y + trunk / 2, z, 0.28 * size, 0.42 * size, trunk, '#7a5a3d', 7);
  const col = FOLIAGE[Math.floor(n(1) * FOLIAGE.length)];
  const r = 3.4 * size;
  sb.sphere(x, y + trunk + r * 0.55, z, r, col, 9, 6, [1, 0.88, 1]);
  sb.sphere(x + (n(2) - 0.5) * r * 0.7, y + trunk + r * 1.25, z + (n(3) - 0.5) * r * 0.7, r * 0.72, FOLIAGE[(Math.floor(n(1) * 4) + 1) % 4], 8, 6);
  sb.sphere(x + (n(4) - 0.5) * r, y + trunk + r * 0.3, z + (n(5) - 0.5) * r, r * 0.6, col, 8, 5);
}

// A flowering shrub: a green ball with a few blossoms.
export function shrub(sb, x, z, r = 1.3, seed = 0, y = 0.2) {
  const n = k => noise(Math.round(x * 5 + z * 11) + seed, k + 20);
  sb.sphere(x, y + r * 0.7, z, r, FOLIAGE[Math.floor(n(1) * 4)], 8, 5, [1, 0.8, 1]);
  const bl = BLOSSOM[Math.floor(n(2) * BLOSSOM.length)];
  for (let i = 0; i < 5; i++) {
    const a = n(3 + i) * Math.PI * 2, e = 0.3 + n(9 + i) * 0.7;
    sb.sphere(x + Math.cos(a) * r * 0.8 * e, y + r * (0.7 + 0.45 * Math.sin(e + i)), z + Math.sin(a) * r * 0.8 * e, 0.26, bl, 5, 4);
  }
}

// A rectangular raised planter with soil and shrubs along its length (x or z).
export function planter(sb, x, z, length, width, alongX, seed = 0, y = 0.2) {
  const w = alongX ? length : width, d = alongX ? width : length;
  sb.block(x, y, z, w, 1.1, d, '#d8d0c0');
  sb.block(x, y + 1.1, z, w - 0.6, 0.12, d - 0.6, '#6b4a34');
  const count = Math.max(2, Math.round(length / 2.6));
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count - 0.5;
    shrub(sb, x + (alongX ? t * (length - 1.6) : 0), z + (alongX ? 0 : t * (length - 1.6)), Math.min(1.2, width * 0.42), seed + i, y + 1.1);
  }
}

// A lamp post with a lit globe: the post goes to sb, the globe to lit, the halo to glows.
export function lampPost(sb, lit, glows, x, z, height = 9, y = 0.2, color = '#fff0c8') {
  sb.cylinder(x, y + 0.3, z, 0.55, 0.65, 0.6, '#4a5258', 8);
  sb.cylinder(x, y + height / 2, z, 0.14, 0.22, height, '#4a5258', 6);
  sb.cylinder(x, y + height + 0.05, z, 0.5, 0.3, 0.2, '#4a5258', 8);
  lit.sphere(x, y + height + 0.75, z, 0.62, color, 8, 6);
  glows.add(x, y + height + 0.75, z, color, 4.2);
}

// A park bench facing `heading` (forward +x), seat top 1.4.
export function bench(sb, x, z, heading, y = 0.2) {
  const m = (lx, ly, lz, w, h, d, color) => {
    const c = Math.cos(heading), s = Math.sin(heading);
    sb.add(new THREE.BoxGeometry(w, h, d), sb.transform(x + lx * c - lz * s, y + ly, z + lx * s + lz * c, [0, -heading, 0]), color);
  };
  m(0, 1.28, 0, 1.2, 0.14, 4.2, '#a7774f');
  m(-0.62, 2.0, 0, 0.14, 1.3, 4.2, '#a7774f');
  for (const lz of [-1.8, 1.8]) m(0, 0.65, lz, 1.0, 1.3, 0.2, '#3b4045');
}

// A thin flat ring (annulus) lying on the ground at height y.
export function groundRing(sb, x, z, r0, r1, y, color, segments = 48) {
  sb.add(new THREE.RingGeometry(r0, r1, segments), sb.transform(x, y, z, [-Math.PI / 2, 0, 0]), color);
}

// A flat disc on the ground.
export function groundDisc(sb, x, z, r, y, color, segments = 40) {
  sb.add(new THREE.CircleGeometry(r, segments), sb.transform(x, y, z, [-Math.PI / 2, 0, 0]), color);
}
