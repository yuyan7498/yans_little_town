// Builds the world model from data/town.js and data/buildings.js: the one place a
// coordinate is worked out. Pure data, no THREE. See docs/CONTRACTS.md §World for the
// shape of what comes back.

import { Y, BOX_MARGIN, ZEBRA, STOP_BACK, MIDBLOCK, DOOR, carLanes, twoWheelLane, kerbLane, walkLine } from './geometry.js';

const EPS = 1e-6;
const SIDES = ['n', 's', 'e', 'w'];
const NORMAL = { n: { x: 0, z: -1 }, s: { x: 0, z: 1 }, e: { x: 1, z: 0 }, w: { x: -1, z: 0 } };
const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

class WorldError extends Error {}

// Free intervals of [lo, hi] once each [a, b] in `cuts` is taken out.
function freeIntervals(lo, hi, cuts) {
  let out = [[lo, hi]];
  for (const [a, b] of cuts) {
    const next = [];
    for (const [p, q] of out) {
      if (b <= p || a >= q) { next.push([p, q]); continue; }
      if (a > p) next.push([p, a]);
      if (b < q) next.push([b, q]);
    }
    out = next;
  }
  return out;
}

const rect = (x0, x1, z0, z1) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, x0, x1, z0, z1 });
const rectOf = (x, z, w, d) => rect(x - w / 2, x + w / 2, z - d / 2, z + d / 2);

export function buildWorld(town, buildingList) {
  const problems = [];
  const fail = message => problems.push(message);
  const board = { halfX: town.board.halfX, halfZ: town.board.halfZ, minX: -town.board.halfX, maxX: town.board.halfX, minZ: -town.board.halfZ, maxZ: town.board.halfZ };
  const margin = town.board.edgeMargin;
  const pavement = town.pavement;

  // ------------------------------------------------------------------ the canal
  const R = town.river, bankX = R.halfWidth, promenadeEdge = bankX + R.promenade, stripEdge = promenadeEdge + R.strip;
  const river = {
    x0: -bankX, x1: bankX, halfWidth: bankX, minZ: board.minZ, maxZ: board.maxZ, waterY: Y.water,
    banks: [-1, 1].map(side => ({
      side,
      promenade: { x0: Math.min(side * bankX, side * promenadeEdge), x1: Math.max(side * bankX, side * promenadeEdge), walkX: side * (bankX + R.walkInset) },
      strip: { x0: Math.min(side * promenadeEdge, side * stripEdge), x1: Math.max(side * promenadeEdge, side * stripEdge) }
    }))
  };
  const walkX = bankX + R.walkInset;

  // ------------------------------------------------------------------ roads
  const roads = [];
  for (const a of town.avenues) {
    roads.push({ id: a.id, name: a.name, axis: 'z', x: a.x, from: a.from ?? board.minZ, to: a.to ?? board.maxZ, width: a.width, half: a.width / 2, lanes: a.lanes,
      kind: a.lanes > 1 ? 'trunk' : 'street' });
  }
  for (const s of town.streets) {
    roads.push({ id: s.id, name: s.name, axis: 'x', z: s.z, from: s.from, to: s.to, width: s.width, half: s.width / 2, lanes: s.lanes,
      kind: s.lanes > 1 ? 'trunk' : 'street', river: s.river || null, pedestrian: s.pedestrian || null });
  }
  const roadById = new Map(roads.map(r => [r.id, r]));
  const avenues = roads.filter(r => r.axis === 'z').sort((p, q) => p.x - q.x);
  const streets = roads.filter(r => r.axis === 'x').sort((p, q) => p.z - q.z);
  for (const r of roads) {
    r.lanesAt = { car: carLanes(r), two: twoWheelLane(r), kerb: kerbLane(r), walk: walkLine(r) };
  }
  // Is x on street s a stretch closed to traffic?
  const pedestrianAt = (s, x) => !!s.pedestrian && x > s.pedestrian[0] + EPS && x < s.pedestrian[1] - EPS;
  const streetCovers = (s, x) => x >= s.from - EPS && x <= s.to + EPS && (s.river || Math.abs(x) >= walkX - EPS);
  const avenueCovers = (a, z) => z >= a.from - EPS && z <= a.to + EPS;

  // ------------------------------------------------------------------ nodes and segments
  // Nodes: where roads meet each other, where a street meets a promenade, and road ends.
  // Segments: the stretches between them, flagged for who may use them.
  const nodes = [], nodeIndex = new Map();
  const node = (x, z) => {
    const key = x.toFixed(3) + ',' + z.toFixed(3);
    if (!nodeIndex.has(key)) { nodeIndex.set(key, nodes.length); nodes.push({ id: 'n' + nodes.length, index: nodes.length, x, z, roads: new Set(), kind: 'end' }); }
    return nodes[nodeIndex.get(key)];
  };
  const segments = [];
  const tunnel = town.tunnel;
  function addSegment(road, a, b) {
    if (Math.hypot(b.x - a.x, b.z - a.z) < EPS) return;
    const mid = road.axis === 'x' ? (a.x + b.x) / 2 : (a.z + b.z) / 2;
    let over = 'land';
    if (road.axis === 'x' && Math.abs(mid) < bankX + EPS) over = road.river === 'tunnel' ? 'tunnel' : 'bridge';
    const pedestrian = road.axis === 'x' && pedestrianAt(road, mid);
    const seg = { id: 's' + segments.length, index: segments.length, road: road.id, axis: road.axis, a: a.index, b: b.index,
      x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z),
      length: Math.hypot(b.x - a.x, b.z - a.z), width: road.width, lanes: road.lanes, over,
      vehicles: !pedestrian, pedestrian, covered: over === 'tunnel' };
    segments.push(seg);
    a.roads.add(road.id); b.roads.add(road.id);
  }
  for (const a of avenues) {
    const zs = new Set([a.from, a.to]);
    for (const s of streets) if (streetCovers(s, a.x) && avenueCovers(a, s.z)) zs.add(s.z);
    const list = [...zs].sort((p, q) => p - q);
    for (let i = 0; i + 1 < list.length; i++) addSegment(a, node(a.x, list[i]), node(a.x, list[i + 1]));
  }
  for (const s of streets) {
    const xs = new Set();
    // A street stops at the promenade on a bank it does not cross.
    const reach = s.river ? [[s.from, s.to]] : [[s.from, -walkX], [walkX, s.to]];
    for (const [lo, hi] of reach) {
      if (hi - lo < EPS) continue;
      const here = new Set([lo, hi]);
      for (const a of avenues) if (a.x > lo + EPS && a.x < hi - EPS && avenueCovers(a, s.z)) here.add(a.x);
      if (s.pedestrian) for (const x of s.pedestrian) if (x > lo + EPS && x < hi - EPS) here.add(x);
      // Where the promenades meet it (and, for a crossing street, the two banks).
      for (const x of [-walkX, walkX]) if (x > lo - EPS && x < hi + EPS) here.add(x);
      if (s.river) for (const x of [-bankX, bankX]) here.add(x);
      const list = [...here].sort((p, q) => p - q);
      for (let i = 0; i + 1 < list.length; i++) addSegment(s, node(list[i], s.z), node(list[i + 1], s.z));
      list.forEach(x => xs.add(x));
    }
  }
  // Classify nodes: a junction where an avenue meets a street.
  for (const n of nodes) {
    const ids = [...n.roads];
    const av = ids.map(id => roadById.get(id)).find(r => r.axis === 'z');
    const st = ids.map(id => roadById.get(id)).find(r => r.axis === 'x');
    n.avenue = av ? av.id : null; n.street = st ? st.id : null;
    n.kind = av && st ? 'junction' : Math.abs(Math.abs(n.x) - walkX) < EPS && st ? 'promenade' : Math.abs(Math.abs(n.x) - bankX) < EPS ? 'bank' : n.roads.size > 1 ? 'joint' : 'end';
    n.roads = ids;
  }
  const segmentsAt = n => segments.filter(s => s.a === n.index || s.b === n.index);

  // ------------------------------------------------------------------ junctions
  const junctions = [];
  for (const n of nodes) {
    if (n.kind !== 'junction') continue;
    const av = roadById.get(n.avenue), st = roadById.get(n.street);
    const arms = { px: false, nx: false, pz: false, nz: false }, walkArms = { px: false, nx: false, pz: false, nz: false };
    for (const s of segmentsAt(n)) {
      const other = nodes[s.a === n.index ? s.b : s.a];
      const key = s.axis === 'x' ? (other.x > n.x ? 'px' : 'nx') : (other.z > n.z ? 'pz' : 'nz');
      if (s.vehicles) arms[key] = true; else walkArms[key] = true;
    }
    const degree = Object.values(arms).filter(Boolean).length;
    const hx = av.half + BOX_MARGIN, hz = st.half + BOX_MARGIN;
    const quiet = (town.unsignalled || []).includes(av.id + '/' + st.id);
    const J = { id: 'j:' + av.id + '/' + st.id, name: av.name + '・' + st.name, node: n.index, avenue: av.id, street: st.id, x: n.x, z: n.z, hx, hz,
      arms, walkArms, degree, signal: degree >= 3 && !quiet, zebras: [], stopLines: [], corners: [] };
    // Zebras across each vehicle arm; people on one walk along `walk`.
    const ax = av.half, az = st.half;
    for (const sgn of [1, -1]) {
      if (arms[sgn > 0 ? 'px' : 'nx']) J.zebras.push({ arm: sgn > 0 ? 'px' : 'nx', walk: 'z', ...rect(...[n.x + sgn * (ax + ZEBRA.near), n.x + sgn * (ax + ZEBRA.far)].sort((p, q) => p - q), n.z - az, n.z + az) });
      if (arms[sgn > 0 ? 'pz' : 'nz']) J.zebras.push({ arm: sgn > 0 ? 'pz' : 'nz', walk: 'x', ...rect(n.x - ax, n.x + ax, ...[n.z + sgn * (az + ZEBRA.near), n.z + sgn * (az + ZEBRA.far)].sort((p, q) => p - q)) });
    }
    // Stop lines: across the inbound half of each vehicle arm (traffic keeps right).
    for (const [arm, on] of Object.entries(arms)) {
      if (!on) continue;
      const along = arm[1] === 'x', sgn = arm[0] === 'p' ? 1 : -1, back = (along ? hx : hz) + STOP_BACK;
      // Inbound traffic on the +x arm heads west, so it keeps to the north (-z) half.
      if (along) J.stopLines.push({ arm, ...rect(n.x + sgn * back - 0.16, n.x + sgn * back + 0.16, ...(sgn > 0 ? [n.z - az, n.z] : [n.z, n.z + az])) });
      else J.stopLines.push({ arm, ...rect(...(sgn > 0 ? [n.x, n.x + ax] : [n.x - ax, n.x]), n.z + sgn * back - 0.16, n.z + sgn * back + 0.16) });
    }
    for (const sx of [1, -1]) for (const sz of [1, -1]) J.corners.push({ sx, sz, x: n.x + sx * (hx + 0.1), z: n.z + sz * (hz + 0.1) });
    junctions.push(J);
  }
  // Mid-block crossings: a promenade over a street that carries traffic over the canal.
  const crossings = [];
  for (const s of streets) {
    if (s.river !== 'bridge') continue;
    for (const x of [-walkX, walkX]) {
      const n = nodes[nodeIndex.get(x.toFixed(3) + ',' + s.z.toFixed(3))];
      const hx = MIDBLOCK.halfWidth, hz = s.half + BOX_MARGIN;
      crossings.push({ id: 'x:' + s.id + (x < 0 ? '-w' : '-e'), name: s.name + (x < 0 ? '西岸' : '東岸') + '行人穿越道', node: n ? n.index : null, street: s.id, x, z: s.z, hx, hz,
        signal: true, midblock: true, zebra: rect(x - hx, x + hx, s.z - s.half, s.z + s.half),
        stopLines: [1, -1].map(sgn => ({ arm: sgn > 0 ? 'px' : 'nx', ...rect(x + sgn * (hx + MIDBLOCK.stopBack) - 0.16, x + sgn * (hx + MIDBLOCK.stopBack) + 0.16, ...(sgn > 0 ? [s.z - s.half, s.z] : [s.z, s.z + s.half])) })),
        corners: [1, -1].map(sz => ({ sx: -sz * Math.sign(x || 1), sz, x: x - sz * Math.sign(x || 1) * (hx + 0.6), z: s.z + sz * (hz + 0.1) })) });
    }
  }

  // ------------------------------------------------------------------ bridges and tunnels
  const bridges = [], tunnels = [];
  for (const s of streets) {
    if (s.river === 'bridge') bridges.push({ id: 'bridge:' + s.id, name: s.name + '橋', street: s.id, kind: 'road', z: s.z, x0: -bankX, x1: bankX, abutment: bankX + 8,
      width: s.width + 2 * 3, carriageway: s.width, rise: 1.6 });
    if (s.river === 'tunnel') tunnels.push({ id: 'tunnel:' + s.id, name: s.name + '隧道', street: s.id, z: s.z, halfD: s.half, portalX: tunnel.portalX, coverX: tunnel.coverX, drop: tunnel.drop });
  }
  for (const f of town.footbridges) bridges.push({ id: 'bridge:' + f.id, name: f.name, kind: 'foot', z: f.z, x0: -bankX, x1: bankX, abutment: bankX + 2, width: f.width, rise: 2.4 });
  // Promenades: the riverside walking lines, the whole length of the town.
  const promenades = river.banks.map(b => ({ side: b.side, x: b.promenade.walkX, from: board.minZ + margin, to: board.maxZ - margin, band: b.promenade }));

  // ------------------------------------------------------------------ heights
  function heightAt(x, z, layer = 'foot') {
    for (const b of bridges) {
      if (Math.abs(z - b.z) > b.width / 2 || Math.abs(x) >= b.abutment) continue;
      if (b.kind === 'foot' && layer !== 'foot') continue;
      const c = Math.cos(Math.PI * x / (2 * b.abutment));
      return (b.kind === 'road' && layer === 'road' ? Y.road : Y.kerb) + b.rise * c * c;
    }
    if (layer === 'road') {
      for (const t of tunnels) {
        if (Math.abs(z - t.z) > t.halfD || Math.abs(x) >= t.portalX) continue;
        return Y.road - t.drop * smooth(t.portalX, t.coverX, Math.abs(x));
      }
      return Y.road;
    }
    return Y.kerb;
  }

  // ------------------------------------------------------------------ lots
  const xCuts = [[-stripEdge, stripEdge], ...avenues.map(a => [a.x - a.half, a.x + a.half])];
  const zCuts = streets.map(s => [s.z - s.half, s.z + s.half]);
  const inset = (lo, hi, isEdgeLo, isEdgeHi) => [lo + (isEdgeLo ? margin : pavement), hi - (isEdgeHi ? margin : pavement)];
  const columns = freeIntervals(board.minX, board.maxX, xCuts)
    .map(([lo, hi]) => inset(lo, hi, lo <= board.minX + EPS, hi >= board.maxX - EPS)).filter(([lo, hi]) => hi - lo >= 30);
  const rows = freeIntervals(board.minZ, board.maxZ, zCuts)
    .map(([lo, hi]) => inset(lo, hi, lo <= board.minZ + EPS, hi >= board.maxZ - EPS)).filter(([lo, hi]) => hi - lo >= 30);
  const colLabel = i => String.fromCharCode(65 + i);
  // What lies beyond each side of a lot: the nearest road (or the promenade, or the edge).
  function findSides(lot) {
    const { x0, x1, z0, z1 } = lot;
    lot.sides = {};
    for (const side of SIDES) {
      const n = NORMAL[side], edge = n.x ? (n.x > 0 ? x1 : x0) : (n.z > 0 ? z1 : z0);
      let best = null;
      const candidates = n.x ? avenues.map(a => ({ road: a, at: a.x, half: a.half })) : streets.map(s => ({ road: s, at: s.z, half: s.half }));
      for (const c of candidates) {
        const sign = n.x || n.z, gap = (c.at - sign * c.half - edge) * sign;
        if (gap < -EPS || gap > pavement + 2) continue;
        const covers = n.x ? avenueCovers(c.road, lot.z) : (c.road.from <= x0 && c.road.to >= x1) || (c.road.from <= lot.x && c.road.to >= lot.x);
        if (covers && (!best || gap < best.gap)) best = { gap, road: c.road };
      }
      if (best) {
        const ped = best.road.axis === 'x' && pedestrianAt(best.road, lot.x);
        lot.sides[side] = { kind: ped ? 'pedestrian' : 'road', road: best.road.id, centre: best.road.axis === 'x' ? best.road.z : best.road.x, half: best.road.half };
      } else if (n.x && Math.abs(Math.abs(edge) - stripEdge) <= pavement + EPS) lot.sides[side] = { kind: 'promenade', road: null, centre: Math.sign(edge) * walkX, half: 0 };
      else lot.sides[side] = { kind: 'edge', road: null };
    }
  }
  let lots = [];
  rows.forEach(([z0, z1], row) => columns.forEach(([x0, x1], col) => {
    const lot = { id: colLabel(col) + (row + 1), col, row, ...rect(x0, x1, z0, z1), site: null, sides: {} };
    findSides(lot);
    lots.push(lot);
  }));
  // Lots joined in data/town.js (`'A3+A4'`): one lot over both and the ground between,
  // where no road may run.
  for (const key of Object.keys(town.lots)) {
    if (!key.includes('+')) continue;
    const parts = key.split('+').map(id => lots.find(l => l.id === id));
    if (parts.length !== 2 || parts.some(p => !p)) { fail(`data/town.js lots: ${key} 要是兩個相鄰的地塊，像 A3+A4`); continue; }
    const [a, b] = parts.sort((p, q) => p.row - q.row || p.col - q.col);
    const stacked = a.col === b.col && b.row === a.row + 1, beside = a.row === b.row && b.col === a.col + 1;
    if (!stacked && !beside) { fail(`data/town.js lots: ${key} 的兩個地塊不相鄰`); continue; }
    const crossing = stacked
      ? streets.find(s => s.z > a.z1 && s.z < b.z0 && s.from < a.x1 && s.to > a.x0)
      : avenues.find(v => v.x > a.x1 && v.x < b.x0 && avenueCovers(v, a.z));
    if (crossing) { fail(`data/town.js lots: ${key} 中間有 ${crossing.name}（${crossing.id}）經過，要先讓道路停在地塊外`); continue; }
    const joined = { id: key, col: a.col, row: a.row, joins: [a.id, b.id], ...rect(a.x0, b.x1, a.z0, b.z1), site: null, sides: {} };
    findSides(joined);
    lots = lots.filter(l => l !== a && l !== b).concat(joined);
  }
  lots.sort((p, q) => p.row - q.row || p.col - q.col);
  const lotById = new Map(lots.map(l => [l.id, l]));

  // ------------------------------------------------------------------ sites
  const catalog = new Map();
  for (const b of buildingList) {
    if (catalog.has(b.id)) fail(`data/buildings.js: 同一個 id 出現兩次：${b.id}`);
    catalog.set(b.id, b);
  }
  const sites = new Map(), placed = new Map();
  const place = (id, where) => {
    if (placed.has(id)) fail(`${id} 被放在兩個地方：${placed.get(id)} 和 ${where}`);
    placed.set(id, where);
  };
  for (const [lotId, siteId] of Object.entries(town.lots)) {
    if (!lotById.has(lotId)) { fail(`data/town.js lots: 沒有 ${lotId} 這個地塊（現有 ${lots.map(l => l.id).join(' ')}）`); continue; }
    if (!catalog.has(siteId)) { fail(`data/town.js lots.${lotId}: data/buildings.js 裡沒有 ${siteId}`); continue; }
    place(siteId, 'lot ' + lotId);
    lotById.get(lotId).site = siteId;
  }
  for (const w of town.waterfront || []) {
    if (!catalog.has(w.site)) { fail(`data/town.js waterfront: data/buildings.js 裡沒有 ${w.site}`); continue; }
    place(w.site, 'waterfront');
  }
  const market = town.nightMarket;
  if (market && catalog.has(market.site)) place(market.site, 'night market');

  // The side a site faces: given in the data (`front`), else the street side (north
  // or south) on a pedestrian street, else on the wider street, else the nearer one;
  // failing those any side with a road.
  function frontOf(lot, record) {
    if (record.front && lot.sides[record.front] && lot.sides[record.front].kind !== 'edge') return record.front;
    const lanes = s => (roadById.get(lot.sides[s].road) || {}).lanes || 0;
    const options = ['n', 's'].filter(s => lot.sides[s].kind === 'road' || lot.sides[s].kind === 'pedestrian')
      .sort((p, q) => (lot.sides[q].kind === 'pedestrian') - (lot.sides[p].kind === 'pedestrian') || lanes(q) - lanes(p) ||
        Math.abs(lot.sides[p].centre - lot.z) - Math.abs(lot.sides[q].centre - lot.z) || (p < q ? -1 : 1));
    if (options.length) return options[0];
    return SIDES.find(s => lot.sides[s].kind !== 'edge') || 's';
  }
  // A door on `side` of box r, at fraction t (-1..1) along that side.
  function doorOn(r, side, t = 0, pause = DOOR.pause, extra = {}) {
    const n = NORMAL[side], alongX = !n.x;
    const x = n.x ? (n.x > 0 ? r.x1 : r.x0) : r.x + t * r.w / 2 * 0.8;
    const z = n.z ? (n.z > 0 ? r.z1 : r.z0) : r.z + t * r.d / 2 * 0.8;
    const out = extra.out || DOOR.approach;
    return { x, z, nx: n.x, nz: n.z, side, pause, approach: { x: x + n.x * out, z: z + n.z * out }, facing: Math.atan2(-n.z, -n.x), alongX, ...extra };
  }
  // Footprints by kind, inside lot l facing `front`: [w, d, push back from front].
  const OPEN = new Set(['park', 'plaza', 'amusement', 'sports', 'station', 'airport', 'zoo', 'gas']);
  const OPEN_HEIGHT = { park: 12, plaza: 26, amusement: 56, sports: 8, station: 12, airport: 40, zoo: 16, gas: 9 };
  // Open ground entered only from its front: a runway and an animal park are not walked across.
  const FRONT_ONLY = new Set(['airport', 'zoo']);
  function footprintOf(record, l, front) {
    const depthAxis = NORMAL[front].x ? 'w' : 'd', widthAxis = depthAxis === 'w' ? 'd' : 'w';
    const across = l[widthAxis], deep = l[depthAxis];
    let size;
    switch (record.kind) {
      case 'housing': size = [across - 4, deep - 4, 0]; break;
      case 'tower': size = [Math.min(32, across - 14), Math.min(34, deep - 16), 0]; break;
      case 'mall': size = [across - 8, deep - 12, -2]; break;
      case 'hospital': size = [across - 10, deep * 0.62, deep * 0.12]; break;
      case 'primary': case 'secondary': case 'university': size = [across - 10, deep * 0.46, deep * 0.2]; break;
      case 'workshop': case 'depot': case 'market': size = [across - 12, deep * 0.5, deep * 0.16]; break;
      // The engine bays open onto an apron in front.
      case 'fire': size = [across - 10, deep * 0.55, deep * 0.18]; break;
      case 'cinema': size = [across - 10, deep - 16, 0]; break;
      // The temple's halls stand at the back of the walled court.
      case 'temple': size = [across - 14, deep * 0.42, deep * 0.2]; break;
      default: size = OPEN.has(record.kind) ? [across, deep, 0] : [across - 12, deep - 18, 0];
    }
    const [w, d, back] = size, n = NORMAL[front];
    const cx = l.x - n.x * back, cz = l.z - n.z * back;
    return depthAxis === 'd' ? rectOf(cx, cz, w, d) : rectOf(cx, cz, d, w);
  }
  const heightOf = record => record.floors ? record.floors * 6 : OPEN_HEIGHT[record.kind] || 10;
  const base = record => ({ id: record.id, name: record.name, kind: record.kind, group: record.group || null, capacity: record.capacity || 0,
    open: record.open || 'daily', hours: record.hours || null, floors: record.floors || 0, style: record.style || null, type: record.type || null,
    compound: !!record.compound, helipad: !!record.helipad, record, annexes: [] });

  for (const lot of lots) {
    if (!lot.site) continue;
    const record = catalog.get(lot.site), front = frontOf(lot, record);
    const footprint = footprintOf(record, lot, front);
    const site = { ...base(record), place: 'lot', lot: lot.id, area: rect(lot.x0, lot.x1, lot.z0, lot.z1), footprint, front, height: heightOf(record), open_air: OPEN.has(record.kind) };
    if (site.open_air) {
      // Open ground: entered from the front, and from any other side on a road.
      site.doors = [doorOn(site.area, front, 0, DOOR.openPause)];
      if (!FRONT_ONLY.has(record.kind)) site.doors.push(...SIDES.filter(s => s !== front && lot.sides[s].kind !== 'edge').map(s => doorOn(site.area, s, 0, DOOR.openPause)));
    } else if (record.compound) {
      // A walled compound: a gate on the lot's front edge; the building's own door behind it.
      site.gate = doorOn(site.area, front, 0, DOOR.gatePause, { gate: true });
      site.entrance = doorOn(footprint, front, 0);
      site.doors = [site.gate];
    } else {
      site.doors = [doorOn(footprint, front, 0)];
    }
    site.door = site.doors[0];
    site.roof = { y: site.height + 1.4, x: footprint.x, z: footprint.z, w: footprint.w, d: footprint.d };
    sites.set(site.id, site);
  }
  for (const w of town.waterfront || []) {
    const record = catalog.get(w.site);
    if (!record) continue;
    const strip = river.banks.find(b => b.side === w.bank).strip;
    const area = rect(strip.x0, strip.x1, w.z0, w.z1), footprint = rect(strip.x0 + 0.5, strip.x1 - 0.5, w.z0 + 0.5, w.z1 - 0.5);
    const front = w.bank < 0 ? 'e' : 'w';
    const site = { ...base(record), place: 'waterfront', bank: w.bank, lot: null, area, footprint, front, height: heightOf(record) };
    site.doors = [doorOn(footprint, front, 0)]; site.door = site.doors[0];
    site.roof = { y: site.height + 1.4, x: footprint.x, z: footprint.z, w: footprint.w, d: footprint.d };
    sites.set(site.id, site);
  }
  // Annexes stand on their host's lot.
  for (const record of buildingList) {
    if (!record.host) continue;
    const host = sites.get(record.host);
    if (!catalog.has(record.host)) { fail(`${record.id}: host ${record.host} 不在 data/buildings.js`); continue; }
    if (!host) { fail(`${record.id}: 它的 host ${record.host} 沒有放在任何地塊上`); continue; }
    place(record.id, 'annex of ' + record.host);
    const f = host.footprint, a = host.area, n = NORMAL[host.front];
    // Toward the river along the front.
    const towardRiver = n.x ? (a.z < 0 ? 1 : -1) : (a.x < 0 ? 1 : -1);
    let footprint, door, height = heightOf(record);
    if (record.placement === 'podium') {
      footprint = rect(f.x0, f.x1, f.z0, f.z1);
      door = doorOn(f, host.front, towardRiver * 0.7);
    } else if (record.placement === 'ground-floor') {
      const w = 12, d = 8;
      const cx = n.x ? (n.x > 0 ? f.x1 - d / 2 : f.x0 + d / 2) : f.x + towardRiver * (f.w / 2 - w / 2 - 2);
      const cz = n.z ? (n.z > 0 ? f.z1 - d / 2 : f.z0 + d / 2) : f.z + towardRiver * (f.d / 2 - w / 2 - 2);
      footprint = n.x ? rectOf(cx, cz, d, w) : rectOf(cx, cz, w, d);
      door = doorOn(footprint, host.front, 0);
      height = 6;
    } else {
      // 'corner': a small building of its own at the host lot's front corner, toward the river.
      const s = 13;
      const cx = n.x ? (n.x > 0 ? a.x1 - s / 2 - 1 : a.x0 + s / 2 + 1) : a.x + towardRiver * (a.w / 2 - s / 2 - 1);
      const cz = n.z ? (n.z > 0 ? a.z1 - s / 2 - 1 : a.z0 + s / 2 + 1) : a.z + towardRiver * (a.d / 2 - s / 2 - 1);
      footprint = rectOf(cx, cz, s, s);
      door = doorOn(footprint, host.front, 0);
    }
    const site = { ...base(record), place: 'annex', host: host.id, placement: record.placement || 'corner', lot: host.lot, area: footprint, footprint, front: host.front,
      height, doors: [door], door };
    site.roof = { y: height + 1.4, x: footprint.x, z: footprint.z, w: footprint.w, d: footprint.d };
    host.annexes.push(site.id);
    sites.set(site.id, site);
  }

  // ------------------------------------------------------------------ the night market
  const stalls = [];
  if (market && catalog.has(market.site)) {
    const keepOut = [];
    for (const s of streets) keepOut.push([s.z - s.half - (s.river === 'bridge' ? 3 : 2), s.z + s.half + (s.river === 'bridge' ? 3 : 2)]);
    for (const f of town.footbridges) keepOut.push([f.z - f.width / 2 - 2, f.z + f.width / 2 + 2]);
    const pitch = market.length + market.gap;
    const slots = [];
    for (const bank of river.banks) {
      const cuts = keepOut.concat((town.waterfront || []).filter(w => w.bank === bank.side).map(w => [w.z0 - 2, w.z1 + 2]));
      for (const [lo, hi] of freeIntervals(board.minZ + margin, board.maxZ - margin, cuts)) {
        const n = Math.floor((hi - lo + market.gap) / pitch);
        const start = (lo + hi) / 2 - (n * pitch - market.gap) / 2 + market.length / 2;
        for (let i = 0; i < n; i++) slots.push({ side: bank.side, z: start + i * pitch, bank });
      }
    }
    const order = side => slots.filter(s => s.side === side).sort((p, q) => Math.abs(p.z) - Math.abs(q.z) || p.z - q.z).slice(0, market.perBank);
    const west = order(-1), east = order(1), names = market.stalls || [];
    if (west.length < market.perBank || east.length < market.perBank) fail(`夜市：河岸放不下每邊 ${market.perBank} 攤（西岸 ${west.length}、東岸 ${east.length}）`);
    const placedSlots = [];
    for (let i = 0; i < Math.max(west.length, east.length); i++) { if (west[i]) placedSlots.push(west[i]); if (east[i]) placedSlots.push(east[i]); }
    placedSlots.forEach((slot, i) => {
      const [name, type] = names[i] || ['小吃攤', i % 3 ? 'counter' : 'table'];
      const s = slot.side, inner = promenadeEdge, outer = stripEdge, z = slot.z, L = market.length;
      const at = u => s * u;                    // distance from the canal centre -> x on this bank
      const toBooth = s > 0 ? 0 : Math.PI;      // heading from the seats toward the booth
      const seats = [];
      if (type === 'table') {
        const cx = inner + 2.9;
        for (let k = 0; k < 5; k++) {
          const a = Math.PI / 2 + k * Math.PI * 2 / 5, px = at(cx) + s * Math.cos(a) * 1.15, pz = z + Math.sin(a) * 1.55;
          seats.push({ x: px, z: pz, heading: Math.atan2(z - pz, at(cx) - px), y: 1.35, kind: 'stool' });
        }
      } else {
        for (let k = 0; k < 4; k++) seats.push({ x: at(inner + 3.8), z: z + (k - 1.5) * 1.4, heading: toBooth, y: 1.35, kind: 'stool' });
      }
      const door = doorOn(rect(Math.min(at(inner + 0.4), at(outer)), Math.max(at(inner + 0.4), at(outer)), z - L / 2, z + L / 2), s > 0 ? 'w' : 'e', 0, DOOR.openPause, { out: 1.4 });
      stalls.push({ id: 'stall-' + i, index: i, name, type, bank: s, x: at((inner + outer) / 2), z, w: outer - inner, d: L,
        plot: rect(Math.min(at(inner), at(outer)), Math.max(at(inner), at(outer)), z - L / 2, z + L / 2),
        booth: rect(Math.min(at(inner + 5.5), at(outer)), Math.max(at(inner + 5.5), at(outer)), z - L / 2 + 0.3, z + L / 2 - 0.3),
        counterFacing: s > 0 ? Math.PI : 0, seats, door,
        stand: [-2, 0, 2].map(dz => ({ x: at(inner + 0.9), z: z + dz, heading: toBooth })) });
    });
    const record = catalog.get(market.site);
    const xs = stalls.map(st => st.x), zs = stalls.map(st => st.z);
    const area = stalls.length ? rect(Math.min(...xs) - 5, Math.max(...xs) + 5, Math.min(...zs) - 4, Math.max(...zs) + 4) : rect(-1, 1, -1, 1);
    sites.set(record.id, { ...base(record), place: 'night-market', lot: null, area, footprint: area, front: null, height: 6, stalls: stalls.map(st => st.id),
      doors: stalls.map(st => st.door), door: stalls[0] ? stalls[0].door : null, roof: { y: 6, x: area.x, z: area.z, w: area.w, d: area.d } });
  }

  for (const record of buildingList) if (!placed.has(record.id)) fail(`${record.id}（${record.name}）沒有地方放：在 data/town.js 的 lots 或 waterfront 指定位置，或在 data/buildings.js 給它 host`);
  if (problems.length) throw new WorldError('小鎮地圖有問題：\n- ' + problems.join('\n- '));

  // ------------------------------------------------------------------ lookups
  const siteList = [...sites.values()];
  const junctionById = new Map(junctions.map(j => [j.id, j]));
  const junctionAt = (avenueId, streetId) => junctionById.get('j:' + avenueId + '/' + streetId) || null;
  const tallest = Math.max(...siteList.map(s => s.height));
  return {
    seed: town.seed, config: town, board, river, roads, roadById, avenues, streets, nodes, segments, junctions, crossings, bridges, tunnels, promenades,
    lots, lotById, sites, siteList, stalls, junctionAt, heightAt, tallest,
    site: id => sites.get(id) || null,
    // The rectangle a camera frames for a site, with its height.
    boxOf: id => { const s = sites.get(id); return s ? { ...s.footprint, height: s.height } : null; }
  };
}

export { WorldError };
