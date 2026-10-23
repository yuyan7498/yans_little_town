// A small geometry builder for the ground: flat-shaded triangles with vertex colours
// and world-mapped UVs (u = x, v = z on surfaces that face up, so a repeating
// texture tiles seamlessly across every piece). One Mesher per material.
import * as THREE from 'three';

const _c = new THREE.Color();

export class Mesher {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; }

  get count() { return this.pos.length / 3; }

  // One triangle from three [x, y, z] points, counter-clockwise seen from its front.
  // `uvs` (optional) gives [u, v] per corner; otherwise the world x, z are used.
  tri(a, b, c, color, uvs = null) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz);
    if (L < 1e-12) return this;
    nx /= L; ny /= L; nz /= L;
    _c.set(color);
    const pts = [a, b, c];
    for (let i = 0; i < 3; i++) {
      const p = pts[i];
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(_c.r, _c.g, _c.b);
      if (uvs) this.uv.push(uvs[i][0], uvs[i][1]); else this.uv.push(p[0], p[2]);
    }
    return this;
  }

  // A quad a→b→c→d (counter-clockwise seen from its front).
  quad(a, b, c, d, color, uvs = null) {
    this.tri(a, b, c, color, uvs && [uvs[0], uvs[1], uvs[2]]);
    return this.tri(a, c, d, color, uvs && [uvs[0], uvs[2], uvs[3]]);
  }

  // A horizontal rectangle facing up; `y` is a number or a function (x, z) → height.
  // `step` subdivides along x and z so a surface can follow a curved height.
  rect(x0, x1, z0, z1, y, color, step = 0) {
    const h = typeof y === 'function' ? y : () => y;
    const nx = step ? Math.max(1, Math.ceil((x1 - x0) / step)) : 1, nz = step && typeof y === 'function' ? Math.max(1, Math.ceil((z1 - z0) / step)) : 1;
    for (let i = 0; i < nx; i++) {
      const a = x0 + (x1 - x0) * i / nx, b = x0 + (x1 - x0) * (i + 1) / nx;
      for (let j = 0; j < nz; j++) {
        const c = z0 + (z1 - z0) * j / nz, d = z0 + (z1 - z0) * (j + 1) / nz;
        this.quad([a, h(a, c), c], [a, h(a, d), d], [b, h(b, d), d], [b, h(b, c), c], color);
      }
    }
    return this;
  }

  // A vertical face standing on the ground line p0 → p1 ([x, z]), from yb to yt at
  // each end (numbers or [y0, y1]); its front faces the right-hand side of p0 → p1.
  wall(p0, p1, yb, yt, color) {
    const [b0, b1] = Array.isArray(yb) ? yb : [yb, yb];
    const [t0, t1] = Array.isArray(yt) ? yt : [yt, yt];
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    return this.quad([p0[0], b0, p0[1]], [p1[0], b1, p1[1]], [p1[0], t1, p1[1]], [p0[0], t0, p0[1]], color,
      [[0, b0], [L, b1], [L, t1], [0, t0]]);
  }

  // A vertical face along a profile: points [{x, z}] with heights yb(p), yt(p).
  wallAlong(points, yb, yt, color) {
    for (let i = 0; i + 1 < points.length; i++) {
      const p = points[i], q = points[i + 1];
      this.wall([p.x, p.z], [q.x, q.z], [yb(p), yb(q)], [yt(p), yt(q)], color);
    }
    return this;
  }

  // An axis-aligned box from its base centre; faces listed in `skip` are left out
  // ('bottom' by default — boxes stand on something).
  box(cx, y0, cz, sx, sy, sz, color, skip = ['bottom']) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2, y1 = y0 + sy;
    if (!skip.includes('top')) this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], color);
    if (!skip.includes('bottom')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color);
    if (!skip.includes('n')) this.wall([x1, z0], [x0, z0], y0, y1, color);
    if (!skip.includes('s')) this.wall([x0, z1], [x1, z1], y0, y1, color);
    if (!skip.includes('w')) this.wall([x0, z0], [x0, z1], y0, y1, color);
    if (!skip.includes('e')) this.wall([x1, z1], [x1, z0], y0, y1, color);
    return this;
  }

  // A box rotated about y by `rotY` (radians, the town's heading convention:
  // local +x points along heading).
  orientedBox(cx, y0, cz, along, sy, across, heading, color) {
    const c = Math.cos(heading), s = Math.sin(heading);
    const P = (lx, lz) => [cx + lx * c - lz * s, cz + lx * s + lz * c];
    const a = P(-along / 2, -across / 2), b = P(along / 2, -across / 2), d = P(along / 2, across / 2), e = P(-along / 2, across / 2);
    const y1 = y0 + sy;
    this.quad([a[0], y1, a[1]], [e[0], y1, e[1]], [d[0], y1, d[1]], [b[0], y1, b[1]], color);
    this.wall(b, a, y0, y1, color); this.wall(a, e, y0, y1, color); this.wall(e, d, y0, y1, color); this.wall(d, b, y0, y1, color);
    return this;
  }

  // A beam between two 3D points with a w (horizontal) × h (vertical) section.
  beam(p, q, w, h, color, caps = false) {
    const dx = q[0] - p[0], dz = q[2] - p[2], L = Math.hypot(dx, dz) || 1;
    const sx = -dz / L * w / 2, sz = dx / L * w / 2, hh = h / 2;
    const c = (o, s, u) => [o[0] + s * sx, o[1] + u * hh, o[2] + s * sz];
    const p00 = c(p, -1, -1), p10 = c(p, 1, -1), p11 = c(p, 1, 1), p01 = c(p, -1, 1);
    const q00 = c(q, -1, -1), q10 = c(q, 1, -1), q11 = c(q, 1, 1), q01 = c(q, -1, 1);
    this.quad(p01, p11, q11, q01, color);          // top
    this.quad(p00, q00, q10, p10, color);          // bottom
    this.quad(p10, q10, q11, p11, color);          // right side
    this.quad(p00, p01, q01, q00, color);          // left side
    if (caps) { this.quad(p00, p10, p11, p01, color); this.quad(q00, q01, q11, q10, color); }
    return this;
  }

  // A flat polygon facing up (a convex or star-shaped outline, fanned from its centroid).
  fan(points, y, color) {
    const h = typeof y === 'function' ? y : () => y;
    let cx = 0, cz = 0;
    for (const p of points) { cx += p.x; cz += p.z; }
    cx /= points.length; cz /= points.length;
    const c = [cx, h(cx, cz), cz];
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length];
      this.tri(c, [q.x, h(q.x, q.z), q.z], [p.x, h(p.x, p.z), p.z], color);
    }
    return this;
  }

  // A band of width w along a polyline, facing up (paths, lines); `y(x, z)` height.
  ribbon(points, w, y, color, closed = false) {
    const h = typeof y === 'function' ? y : () => y;
    const n = points.length, last = closed ? n : n - 1;
    const side = i => {
      const prev = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], next = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      let dx = next.x - prev.x, dz = next.z - prev.z;
      const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      return { x: -dz * w / 2, z: dx * w / 2 };
    };
    const sides = points.map((_, i) => side(i));
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % n, p = points[i], q = points[j], sp = sides[i], sq = sides[j];
      const a = [p.x - sp.x, 0, p.z - sp.z], b = [p.x + sp.x, 0, p.z + sp.z], c = [q.x + sq.x, 0, q.z + sq.z], d = [q.x - sq.x, 0, q.z - sq.z];
      for (const v of [a, b, c, d]) v[1] = h(v[0], v[2]);
      this.quad(a, b, c, d, color);
    }
    return this;
  }

  // Merge in any THREE geometry under a matrix (used for the odd rounded part).
  geometry(geometry, matrix, color) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = g.attributes.position, v = new THREE.Vector3();
    const pts = [];
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(matrix); pts.push([v.x, v.y, v.z]); }
    for (let i = 0; i + 2 < pts.length; i += 3) this.tri(pts[i], pts[i + 1], pts[i + 2], color);
    if (g !== geometry) g.dispose();
    geometry.dispose();
    return this;
  }

  // Box standing on y with width w (x), height h, depth d (z).
  block(x, y, z, w, h, d, color) { return this.box(x, y, z, w, h, d, color); }
  cylinder(x, yc, z, rt, rb, h, color, segments = 8) {
    return this.geometry(new THREE.CylinderGeometry(rt, rb, h, segments), new THREE.Matrix4().makeTranslation(x, yc, z), color);
  }
  cone(x, yc, z, r, h, color, segments = 8, rotation = [0, 0, 0]) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, yc, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1));
    return this.geometry(new THREE.ConeGeometry(r, h, segments), m, color);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
