// Traffic lights at the town's junctions and mid-block crossings, drawn as instanced
// low-poly models in the Taiwanese style: a dark pole on each corner, a mast arm reaching
// over the lanes with a horizontal three-lamp head (red nearest the middle of the road), and
// pedestrian heads with the little red man and the walking green man, who hurries and
// blinks when the green is about to end. (This project's own model, ported from the old
// town-signals.js; only the inputs and the API changed.)
//
// Model space for a head: +x faces the traffic or people it shows to, +z runs along the
// mast arm toward the middle of the road, +y is up; the pole stands at the origin.

import * as THREE from 'three';

const T = THREE;

var POLE = '#2c4446', HOUSING = '#1b1f21', VISOR = '#141618', CONCRETE = '#b9b4aa', CABINET = '#8f989d', STRIPE = '#eeeeea';
var LIT = { red: '#ff2b1c', amber: '#ffb000', green: '#12e08a' };
var DIM = { red: '#3a1311', amber: '#3a2b0e', green: '#0d2e22' };
// Heights: the mast arm clears a bus with room to spare.
var ARM_Y = 8.6, HEAD_Y = 7.85, HEAD_Z = 3.5, PED_Y = 4.9;
var LAMP_GAP = .78;

function merge(T, parts) {
  var pos = [], nor = [], col = [], color = new T.Color();
  parts.forEach(function (part) {
    var g = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    g.applyMatrix4(part.matrix);
    var a = g.attributes.position, n = g.attributes.normal;
    color.set(part.color);
    for (var i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(color.r, color.g, color.b);
    }
    g.dispose(); part.geo.dispose();
  });
  var out = new T.BufferGeometry();
  out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

// The pictograms on the pedestrian heads, drawn once: the standing red man, and the
// walking green man in two strides; unlit, each shows faintly behind its lens.
function figure(T, color, pose) {
  var c = document.createElement('canvas');
  c.width = c.height = 64;
  var g = c.getContext('2d');
  g.fillStyle = '#0a0b0c'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
  function limb(points, width) { g.lineWidth = width; g.beginPath(); g.moveTo(points[0], points[1]); for (var i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]); g.stroke(); }
  if (pose === 'stand') {
    g.beginPath(); g.arc(32, 12, 6.5, 0, Math.PI * 2); g.fill();
    limb([32, 22, 32, 40], 11);
    limb([24, 24, 23, 40], 5); limb([40, 24, 41, 40], 5);
    limb([28.5, 40, 28.5, 58], 6); limb([35.5, 40, 35.5, 58], 6);
  } else {
    var wide = pose === 'walkA';
    g.beginPath(); g.arc(34, 11, 6, 0, Math.PI * 2); g.fill();
    limb([33, 20, 30, 38], 9);
    if (wide) { limb([32, 23, 40, 31, 45, 30], 4.5); limb([31, 23, 24, 31, 20, 37], 4.5); limb([30, 38, 38, 47, 42, 57], 5.5); limb([30, 38, 25, 48, 17, 54], 5.5); }
    else { limb([32, 23, 36, 32, 39, 37], 4.5); limb([31, 23, 27, 32, 26, 38], 4.5); limb([30, 38, 34, 48, 35, 58], 5.5); limb([30, 38, 27, 48, 23, 57], 5.5); }
  }
  var tex = new T.CanvasTexture(c);
  if ('colorSpace' in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function glowTexture(T) {
  var c = document.createElement('canvas');
  c.width = c.height = 64;
  var g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(.25, 'rgba(255,255,255,.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
}

function parts(T) {
  var q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), one = new T.Vector3(1, 1, 1);
  function at(geo, x, y, z, color, rx, ry, rz) {
    e.set(rx || 0, ry || 0, rz || 0); q.setFromEuler(e);
    return { geo: geo, matrix: new T.Matrix4().compose(v.set(x, y, z), q, one), color: color };
  }
  function box(w, h, d, x, y, z, color) { return at(new T.BoxGeometry(w, h, d), x, y, z, color); }
  // A rod between two points.
  function rod(r, a, b, color) {
    var dir = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = dir.length();
    var m = new T.Matrix4().compose(new T.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2),
      new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize()), one);
    return { geo: new T.CylinderGeometry(r, r, len, 8), matrix: m, color: color };
  }
  // A hood over a lamp facing +x: the top half of a short tube.
  function visor(r, len, x, y, z) { return at(new T.CylinderGeometry(r, r, len, 12, 1, true, Math.PI, Math.PI), x + len / 2, y, z, VISOR, 0, 0, -Math.PI / 2); }

  // The pole: a footing, a slim octagonal shaft, a cap, a control cabinet and a push button.
  var pole = [at(new T.CylinderGeometry(.42, .5, .36, 8), 0, .18, 0, CONCRETE), at(new T.CylinderGeometry(.13, .18, 9.4, 8), 0, 4.95, 0, POLE),
    at(new T.CylinderGeometry(.16, .13, .22, 8), 0, 9.72, 0, POLE), box(.32, .62, .44, .3, 2.3, 0, CABINET), box(.06, .5, .32, .47, 2.3, 0, '#7c858a'),
    box(.14, .26, .18, -.2, 1.45, 0, '#d9c44a')];

  // The mast arm and the head hung from it, for one approach: the housing with a hood
  // over each lamp, nothing behind it.
  var arm = [at(new T.CylinderGeometry(.21, .21, .5, 10), 0, ARM_Y, 0, POLE), rod(.1, [0, ARM_Y, .1], [0, ARM_Y, 5.4], POLE),
    at(new T.SphereGeometry(.12, 8, 6), 0, ARM_Y, 5.4, POLE), rod(.045, [0, ARM_Y + .95, .1], [0, ARM_Y + .02, 2.7], POLE),
    at(new T.CylinderGeometry(.17, .17, .3, 10), 0, ARM_Y + .95, 0, POLE),
    rod(.04, [0, ARM_Y, HEAD_Z - .9], [0, HEAD_Y + .41, HEAD_Z - .9], POLE), rod(.04, [0, ARM_Y, HEAD_Z + .9], [0, HEAD_Y + .41, HEAD_Z + .9], POLE),
    box(.62, .82, 2.5, 0, HEAD_Y, HEAD_Z, HOUSING)];
  for (var k = -1; k <= 1; k++) arm.push(visor(.33, .46, .31, HEAD_Y, HEAD_Z + k * LAMP_GAP));

  // A pedestrian head on a bracket, its two lenses one above the other.
  var ped = [box(.5, .12, .12, .3, PED_Y + .45, 0, POLE), box(.5, .12, .12, .3, PED_Y - .45, 0, POLE),
    box(.38, 1.36, .78, .6, PED_Y, 0, HOUSING),
    box(.3, .05, .72, .93, PED_Y + .66, 0, VISOR), box(.3, .05, .72, .93, PED_Y + .02, 0, VISOR)];
  return { pole: pole, arm: arm, ped: ped };
}

/* corners: [{x, y, z, out: [ox, oz] (away from the road, for the cabinet), junction (id), approach:
 * null | {facing: [fx, fz] toward the oncoming traffic, along: [ax, az] the arm's way
 * over the lanes, axis 'ns' | 'ew'}, peds: [{facing: [fx, fz], axis}]}].
 * paint: [{x, y, z, w, d}] extra road markings (zebra stripes, stop lines). */
function create(T, corners, paint) {
  var group = new T.Group();
  group.name = 'traffic-signals';
  var shapes = parts(T), m = new T.Matrix4(), basis = new T.Matrix4(), v = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3(1, 1, 1);
  var up = new T.Vector3(0, 1, 0), fx = new T.Vector3(), fz = new T.Vector3(), zero = new T.Matrix4().makeScale(0, 0, 0);
  var solid = new T.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .62, metalness: .25, side: T.DoubleSide });
  var owned = [solid];
  function mesh(geo, material, n, name) {
    var out = new T.InstancedMesh(geo, material, Math.max(1, n));
    out.count = n; out.name = name; group.add(out);
    return out;
  }
  // A frame from a facing direction and the way the arm runs (both on the ground).
  function frame(c, facing, along) {
    fx.set(facing[0], 0, facing[1]); fz.set(along[0], 0, along[1]);
    basis.makeBasis(fx, up, fz);
    return m.copy(basis).setPosition(c.x, c.y, c.z);
  }

  var poles = corners, heads = [], peds = [];
  corners.forEach(function (c) {
    if (c.approach) heads.push({ c: c, axis: c.approach.axis, junction: c.junction, matrix: frame(c, c.approach.facing, c.approach.along).clone() });
    c.peds.forEach(function (p) { peds.push({ c: c, axis: p.axis, junction: c.junction, matrix: frame(c, p.facing, [-p.facing[1], p.facing[0]]).clone() }); });
  });
  var poleMesh = mesh(merge(T, shapes.pole), solid, poles.length, 'signal-poles');
  poles.forEach(function (c, i) { poleMesh.setMatrixAt(i, frame(c, c.out, [-c.out[1], c.out[0]])); });
  var armMesh = mesh(merge(T, shapes.arm), solid, heads.length, 'signal-arms');
  heads.forEach(function (h, i) { armMesh.setMatrixAt(i, h.matrix); });
  var pedMesh = mesh(merge(T, shapes.ped), solid, peds.length, 'signal-ped-heads');
  peds.forEach(function (p, i) { pedMesh.setMatrixAt(i, p.matrix); });
  [poleMesh, armMesh, pedMesh].forEach(function (x) { x.castShadow = true; x.receiveShadow = true; });

  // Lamps: three per approach, lit or dark by colour, each with a soft glow in front
  // when lit.
  var lampGeo = new T.CylinderGeometry(.29, .29, .06, 12).rotateZ(-Math.PI / 2);
  var lampMat = new T.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  var glowTex = glowTexture(T), glowGeo = new T.PlaneGeometry(1, 1).rotateY(Math.PI / 2);
  var glowMat = new T.MeshBasicMaterial({ map: glowTex, color: '#ffffff', transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });
  owned.push(lampGeo, lampMat, glowTex, glowGeo, glowMat);
  var lamps = mesh(lampGeo, lampMat, heads.length * 3, 'signal-lamps'), glows = mesh(glowGeo, glowMat, heads.length * 3, 'signal-glow');
  var colours = ['red', 'amber', 'green'], local = new T.Matrix4(), color = new T.Color();
  heads.forEach(function (h, i) {
    colours.forEach(function (name, j) {
      var n = i * 3 + j, z = HEAD_Z + (1 - j) * LAMP_GAP;     // red at the far end of the arm
      lamps.setMatrixAt(n, local.compose(v.set(.33, HEAD_Y, z), q.identity(), s.setScalar(1)).premultiply(h.matrix));
      glows.setMatrixAt(n, local.compose(v.set(.41, HEAD_Y, z), q.identity(), s.setScalar(2.3)).premultiply(h.matrix));
      lamps.setColorAt(n, color.set(DIM[name])); glows.setColorAt(n, color.set('#000000'));
    });
  });
  glows.renderOrder = 2;

  // Pedestrian lenses: one instanced plane per look, shown or folded away per head.
  var panelGeo = new T.PlaneGeometry(.58, .58).rotateY(Math.PI / 2);
  owned.push(panelGeo);
  var looks = {};
  [['redOn', '#ff3a2e', 'stand'], ['redOff', '#3b1714', 'stand'], ['walkA', '#19e38a', 'walkA'], ['walkB', '#19e38a', 'walkB'], ['greenOff', '#10301f', 'walkA']].forEach(function (spec) {
    var tex = figure(T, spec[1], spec[2]), mat = new T.MeshBasicMaterial({ map: tex, toneMapped: false });
    owned.push(tex, mat);
    looks[spec[0]] = mesh(panelGeo, mat, peds.length, 'signal-ped-' + spec[0]);
  });
  Object.keys(looks).forEach(function (k) { for (var i = 0; i < peds.length; i++) looks[k].setMatrixAt(i, zero); });
  var panelAt = peds.map(function (p) {
    return { top: new T.Matrix4().makeTranslation(.8, PED_Y + .34, 0).premultiply(p.matrix), bottom: new T.Matrix4().makeTranslation(.8, PED_Y - .32, 0).premultiply(p.matrix) };
  });

  // Extra road paint where the ground left a crossing or stop line out.
  if (paint && paint.length) {
    var stripeGeo = new T.BoxGeometry(1, .02, 1), stripeMat = new T.MeshStandardMaterial({ color: STRIPE, roughness: .9 });
    owned.push(stripeGeo, stripeMat);
    var stripes = mesh(stripeGeo, stripeMat, paint.length, 'signal-road-paint');
    paint.forEach(function (p, i) { stripes.setMatrixAt(i, local.compose(v.set(p.x, p.y, p.z), q.identity(), s.set(p.w, 1, p.d))); });
    stripes.receiveShadow = true;
  }

  function lightFor(state, axis) {
    if (!state || !state.stage || state.phase !== axis) return 'red';
    return state.stage === 'amber' ? 'amber' : state.stage === 'red' ? 'red' : 'green';
  }
  function pedFor(state) {
    return !state ? 'stop' : state.stage === 'walk' ? 'walk' : state.stage === 'flash' ? 'hurry' : 'stop';
  }
  var lastKey = '';
  /* states: Map junction id -> {phase, stage}; now: ms. The little green man strides
   * twice a second, and when the green is ending hurries at twice that and blinks. */
  function update(states, now) {
    var stride = Math.floor(now / 260) % 2, hurry = Math.floor(now / 130) % 2, blink = Math.floor(now / 200) % 2;
    var key = stride + '' + hurry + blink + heads.map(function (h) { return lightFor(states.get(h.junction), h.axis).charAt(0); }).join('')
      + peds.map(function (p) { return pedFor(states.get(p.junction), p.axis).charAt(0); }).join('');
    if (key === lastKey) return;
    lastKey = key;
    heads.forEach(function (h, i) {
      var on = lightFor(states.get(h.junction), h.axis);
      colours.forEach(function (name, j) {
        lamps.setColorAt(i * 3 + j, color.set(name === on ? LIT[name] : DIM[name]));
        glows.setColorAt(i * 3 + j, color.set(name === on ? LIT[name] : '#000000'));
      });
    });
    peds.forEach(function (p, i) {
      var state = pedFor(states.get(p.junction), p.axis), at = panelAt[i];
      var green = state === 'walk' ? (stride ? 'walkA' : 'walkB') : state === 'hurry' ? (blink ? (hurry ? 'walkA' : 'walkB') : 'greenOff') : 'greenOff';
      looks.redOn.setMatrixAt(i, state === 'stop' ? at.top : zero); looks.redOff.setMatrixAt(i, state === 'stop' ? zero : at.top);
      ['walkA', 'walkB', 'greenOff'].forEach(function (look) { looks[look].setMatrixAt(i, look === green ? at.bottom : zero); });
    });
    lamps.instanceColor.needsUpdate = true; glows.instanceColor.needsUpdate = true;
    Object.keys(looks).forEach(function (k) { looks[k].instanceMatrix.needsUpdate = true; });
  }
  function dispose() {
    group.traverse(function (o) { if (o.isInstancedMesh && o.geometry && owned.indexOf(o.geometry) < 0) o.geometry.dispose(); });
    owned.forEach(function (x) { x.dispose(); });
    group.removeFromParent();
  }
  return { object: group, update: update, dispose: dispose, info: function () { return { poles: poles.length, heads: heads.length, peds: peds.length }; } };
}


// ---------------------------------------------------------------------------------
// World adapter. Where the poles stand: on every corner of a junction with lights, just off
// the carriageway; at a crossing, one each side of the road. Each carries the head for the
// traffic coming at it across the junction (far side, on its right) and the pedestrian
// heads for the zebras that start opposite.
function cornersOf(world) {
  const out = [];
  const place = J => {
    for (const c of J.corners) {
      const { sx, sz, x, z } = c;
      // This corner is ahead on the right of traffic heading d.
      const d = sx === sz ? [sx, 0] : [0, sz];
      const from = d[0] ? (d[0] > 0 ? 'nx' : 'px') : (d[1] > 0 ? 'nz' : 'pz');
      const arms = J.arms || { px: true, nx: true, pz: false, nz: false };
      const approach = arms[from] ? { facing: [-d[0], -d[1]], along: [d[1], -d[0]], axis: d[0] ? 'ew' : 'ns' } : null;
      const peds = [];
      if (arms[sx > 0 ? 'px' : 'nx']) peds.push({ facing: [0, -sz], axis: 'ns' });
      if (arms[sz > 0 ? 'pz' : 'nz']) peds.push({ facing: [-sx, 0], axis: 'ew' });
      out.push({ junction: J.id, x, y: world.heightAt(x, z, 'foot'), z, out: [sx / Math.SQRT2, sz / Math.SQRT2], approach, peds });
    }
  };
  for (const J of world.junctions) if (J.signal) place(J);
  for (const X of world.crossings || []) if (X.signal) place(X);
  return out;
}

export function createSignals(world) {
  const signals = create(THREE, cornersOf(world), []);
  return {
    object: signals.object,
    update(states, time) { signals.update(states, (time || 0) * 1000); },
    dispose: signals.dispose,
    info: signals.info,
  };
}

// Showroom: every signalled junction and crossing of the town cycling through its states.
export function preview(ctx) {
  const world = ctx.world, signals = createSignals(world);
  const ids = [...world.junctions.filter(j => j.signal), ...(world.crossings || [])].map(j => j.id);
  const cycle = [['ns', 'green', 6], ['ns', 'amber', 2], ['ew', 'green', 6], ['ew', 'amber', 2], ['walk', 'walk', 5], ['walk', 'flash', 3]];
  const fixed = new URLSearchParams(location.search).get('stage');       // e.g. stage=ns:green
  return {
    group: signals.object,
    update(frame) {
      let t = frame.time % cycle.reduce((s, c) => s + c[2], 0), pick = cycle[0];
      for (const c of cycle) { pick = c; if (t < c[2]) break; t -= c[2]; }
      if (fixed) pick = [...fixed.split(':')];
      const states = new Map(ids.map(id => [id, { phase: pick[0], stage: pick[1] }]));
      signals.update(states, frame.time);
    },
  };
}
