// A tiny mesh accumulator for figures: low-poly primitives (boxes, lathes, shells)
// written straight into plain arrays with a bone index and a flat colour per vertex.
// Pure JavaScript, no THREE, so figures can be built and counted in Node.

const LITE_CAPS = new Set([1, 13, 14, 15]);
const linearCache = new Map();
// sRGB hex → linear RGB (three.js treats vertex colours as linear).
export function linearRGB(hex) {
  let c = linearCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => { v /= 255; return v < 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    c = [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
    linearCache.set(hex, c);
  }
  return c;
}

// Mix two hex colours (t = 0 → a, 1 → b), for shades and highlights.
export function mixHex(a, b, t) {
  const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16);
  const ch = s => Math.round(((p >> s) & 255) * (1 - t) + ((q >> s) & 255) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}
export const shade = (hex, t) => mixHex(hex, t < 0 ? '#000000' : '#ffffff', Math.abs(t));

// A rotation matrix (column-major 3×3) from Euler angles applied x, then y, then z
// (THREE's 'XYZ' order: R = Rx · Ry · Rz acting on column vectors).
function rotation(rx = 0, ry = 0, rz = 0) {
  const a = Math.cos(rx), b = Math.sin(rx), c = Math.cos(ry), d = Math.sin(ry), e = Math.cos(rz), f = Math.sin(rz);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  // Same element layout as THREE.Matrix4.makeRotationFromEuler for 'XYZ'.
  return [c * e, af + be * d, bf - ae * d, -c * f, ae - bf * d, be + af * d, d, -b * c, a * c];
}

export class FigureMesh {
  constructor(lite = false) { this.lite = lite; this.pos = []; this.nrm = []; this.col = []; this.bone = []; this.idx = []; }
  get vertexCount() { return this.pos.length / 3; }
  get triangleCount() { return this.idx.length / 3; }

  // Place local points: optional rotation [rx, ry, rz] then translation [x, y, z].
  _xf(at, rot) { return { R: rot ? rotation(rot[0], rot[1], rot[2]) : null, x: at ? at[0] : 0, y: at ? at[1] : 0, z: at ? at[2] : 0 }; }
  _v(bone, xf, x, y, z, nx, ny, nz, rgb) {
    const R = xf.R;
    if (R) {
      const X = R[0] * x + R[3] * y + R[6] * z, Y = R[1] * x + R[4] * y + R[7] * z, Z = R[2] * x + R[5] * y + R[8] * z;
      const NX = R[0] * nx + R[3] * ny + R[6] * nz, NY = R[1] * nx + R[4] * ny + R[7] * nz, NZ = R[2] * nx + R[5] * ny + R[8] * nz;
      x = X; y = Y; z = Z; nx = NX; ny = NY; nz = NZ;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    this.pos.push(x + xf.x, y + xf.y, z + xf.z);
    this.nrm.push(nx / l, ny / l, nz / l);
    this.col.push(rgb[0], rgb[1], rgb[2]);
    this.bone.push(bone);
    return this.pos.length / 3 - 1;
  }

  // A box centred on (x, y, z) with sizes (sx, sy, sz), optionally rotated about its centre.
  box(bone, color, x, y, z, sx, sy, sz, rot = null, only = null) {
    const xf = this._xf([x, y, z], rot), rgb = linearRGB(color), b0 = this.vertexCount;
    for (let i = 0; i < 8; i++) {
      const px = i & 1 ? 1 : -1, py = i & 2 ? 1 : -1, pz = i & 4 ? 1 : -1;
      this._v(bone, xf, px * sx / 2, py * sy / 2, pz * sz / 2, px, py, pz, rgb);
    }
    for (const q of (this.lite && only ? only.map(i => BOX_QUADS[i]) : BOX_QUADS)) this.idx.push(b0 + q[0], b0 + q[1], b0 + q[2], b0 + q[0], b0 + q[2], b0 + q[3]);
    return this;
  }

  // A lathe: rings from bottom to top, each [y, rx, rz, cx = 0, cz = 0, tilt = 0] (tilt raises
  // the ring's front: y + tilt·cos a). n sides; the first side faces +x. Ends: 'flat' (a
  // fan at the ring), a number (a tip at that y), or null (open).
  lathe(bone, color, rings, { n = 8, bottom = 'flat', top = 'flat', at = null, rot = null } = {}) {
    if (this.lite) n = n >= 8 ? 6 : n >= 6 ? 4 : n;
    const xf = this._xf(at, rot), rgb = linearRGB(color), b0 = this.vertexCount, R = rings.length;
    const phase = Math.PI / n;
    for (const ring of rings) {
      const [y, rx, rz, cx = 0, cz = 0, tilt = 0] = ring;
      for (let j = 0; j < n; j++) {
        const a = phase + j * 2 * Math.PI / n, ca = Math.cos(a), sa = Math.sin(a);
        this._v(bone, xf, cx + rx * ca, y + tilt * ca, cz + rz * sa, ca / Math.max(rx, 1e-3), 0, sa / Math.max(rz, 1e-3), rgb);
      }
    }
    for (let k = 0; k < R - 1; k++) {
      for (let j = 0; j < n; j++) {
        const j1 = (j + 1) % n;
        const a0 = b0 + k * n + j, a1 = b0 + k * n + j1, c0 = b0 + (k + 1) * n + j, c1 = b0 + (k + 1) * n + j1;
        this.idx.push(a1, a0, c0, a1, c0, c1);
      }
    }
    const cap = (end, ring, base, down) => {
      if (end === null || end === undefined) return;
      if (this.lite && end === 'flat' && (down || !LITE_CAPS.has(bone))) return;
      const [y, , , cx = 0, cz = 0] = ring;
      const c = this._v(bone, xf, cx, end === 'flat' ? y : end, cz, 0, down ? -1 : 1, 0, rgb);
      for (let j = 0; j < n; j++) {
        const j1 = (j + 1) % n;
        if (down) this.idx.push(c, base + j, base + j1); else this.idx.push(c, base + j1, base + j);
      }
    };
    cap(bottom, rings[0], b0, true);
    cap(top, rings[R - 1], b0 + (R - 1) * n, false);
    return this;
  }

  // An ellipsoid with radii (rx, ry, rz) centred on (x, y, z): n sides, m bands.
  ball(bone, color, x, y, z, rx, ry, rz, { n = 6, m = 4, rot = null } = {}) {
    if (this.lite) { n = Math.min(n, 5); m = Math.min(m, 3); }
    const rings = [];
    for (let i = 1; i < m; i++) {
      const phi = -Math.PI / 2 + Math.PI * i / m;
      rings.push([ry * Math.sin(phi), rx * Math.cos(phi), rz * Math.cos(phi)]);
    }
    return this.lathe(bone, color, rings, { n, bottom: -ry, top: ry, at: [x, y, z], rot });
  }

  // A thick curved band around the y axis between angles a0..a1 (radians, 0 = +x front),
  // from y0 (radii r0 = [rx, rz]) up to y1 (radii r1), `thick` deep: hair, open coats.
  shell(bone, color, { y0, y1, r0, r1, a0, a1, thick, n = 5, cx = 0, at = null, rot = null }) {
    if (this.lite) n = Math.max(3, Math.ceil(n * 0.6));
    const xf = this._xf(at, rot), rgb = linearRGB(color), b0 = this.vertexCount;
    // 4 vertices per column: outer-bottom, outer-top, inner-top, inner-bottom.
    for (let j = 0; j <= n; j++) {
      const a = a0 + (a1 - a0) * j / n, ca = Math.cos(a), sa = Math.sin(a);
      const pts = [[r0, y0, 1], [r1, y1, 1], [r1, y1, 0], [r0, y0, 0]];
      for (const [r, y, out] of pts) {
        const s = out ? 1 : 1 - thick / Math.max(r[0], r[1]);
        this._v(bone, xf, cx + r[0] * s * ca, y, r[1] * s * sa, out ? ca : -ca, 0, out ? sa : -sa, rgb);
      }
    }
    for (let j = 0; j < n; j++) {
      const p = b0 + j * 4, q = p + 4;
      // outer (0,1), top (1,2), inner (2,3), bottom (3,0) faces of this column strip.
      for (let f = 0; f < 4; f++) {
        const i0 = f, i1 = (f + 1) % 4;
        this.idx.push(p + i0, p + i1, q + i1, p + i0, q + i1, q + i0);
      }
    }
    const e0 = b0, e1 = b0 + n * 4;
    this.idx.push(e0, e0 + 2, e0 + 1, e0, e0 + 3, e0 + 2);
    this.idx.push(e1, e1 + 1, e1 + 2, e1, e1 + 2, e1 + 3);
    return this;
  }
}

// Box faces as quads of corner indices (corner i: x = bit 0, y = bit 1, z = bit 2), CCW from outside.
const BOX_QUADS = [[1, 3, 7, 5], [0, 4, 6, 2], [2, 6, 7, 3], [0, 1, 5, 4], [4, 5, 7, 6], [0, 2, 3, 1]];
