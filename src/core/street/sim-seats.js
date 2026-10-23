// Sitting down: the night market's stools and the benches and chess tables (a spot:
// {seats: [Seat], door, stand: [{x, z, heading}]}, a world stall or a furniture spot).
// Someone whose trip there has arrived walks from the spot's door to a free seat beside
// their party, sits until a couple of minutes before the trip away leaves, and walks
// back to the door. With every seat taken they stand at the stall front.
// Also: the stall holders on shift, behind their counters.

export const ENTER = 2;            // town minutes from the door to the seat (and back)
const MAX_EARLY = 30, MAX_LATE = 40;
const VIA_OUT = 2.6;               // round a table: this far out to the side of its middle

export function createSeating() {
  const seated = new Map();        // resident id -> {stay, spot, seat, since, via}
  const now = new Set();
  const vias = new WeakMap();      // seat -> a point beside the table to walk round by

  // Seats on the far side of a table are reached round its end, not through it.
  function viaOf(spot, seat) {
    if (vias.has(seat)) return vias.get(seat);
    let via = null;
    if (spot.type === 'table' && spot.seats.length >= 3) {
      let cx = 0, cz = 0;
      for (const s of spot.seats) { cx += s.x; cz += s.z; }
      cx /= spot.seats.length; cz /= spot.seats.length;
      const d = spot.door, dx = seat.x - d.x, dz = seat.z - d.z, len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((cx - d.x) * dx + (cz - d.z) * dz) / len2));
      if (Math.hypot(d.x + dx * t - cx, d.z + dz * t - cz) < 1.1) {
        // Beside the table, on the seat's side of the line from the door through its middle.
        const ux = cx - d.x, uz = cz - d.z, l = Math.hypot(ux, uz) || 1, side = Math.sign(-(seat.x - cx) * uz / l + (seat.z - cz) * ux / l) || 1;
        via = { x: cx + (-uz / l) * side * VIA_OUT, z: cz + (ux / l) * side * VIA_OUT };
      }
    }
    vias.set(seat, via);
    return via;
  }

  function takeSeat(stay, spot, since) {
    const taken = new Map();
    for (const v of seated.values()) if (v.spot === spot) taken.set(v.seat, v.stay.party);
    const free = spot.seats.filter(s => !taken.has(s));
    let seat = null;
    if (free.length) {
      // Beside the party: the free seat nearest one of them.
      const mates = [];
      for (const [s, party] of taken) if (party && party === stay.party) mates.push(s);
      const near = s => Math.min(...mates.map(m => Math.hypot(m.x - s.x, m.z - s.z)));
      seat = mates.length ? free.reduce((best, s) => (near(s) < near(best) ? s : best), free[0]) : free[0];
    } else seat = (spot.stand || []).find(s => !taken.has(s)) || null;
    if (!seat) return null;
    return { stay, spot, seat, since, via: free.length ? viaOf(spot, seat) : null, standing: !free.length };
  }

  // Who is at a spot at absolute minute `abs`. `minuteOf(trip)` gives abs in the trip's
  // own day minutes; `skip(id)` is true for someone the street already draws;
  // `arrived(trip, m)`. Calls emit(held, point) for each.
  function update(stays, abs, minuteOf, skip, arrived, emit) {
    now.clear();
    for (const stay of stays) {
      const id = stay.resident.id;
      if (!stay.spot || !stay.in || skip(id)) continue;
      const m = minuteOf(stay.in);
      if (m > stay.end + MAX_LATE || m < stay.start - MAX_EARLY) continue;
      if (!arrived(stay.in, m) || (stay.out && minuteOf(stay.out) >= stay.out.depart)) continue;
      let held = seated.get(id);
      if (!held || held.stay !== stay) {
        held = takeSeat(stay, stay.spot, Math.min(m, Math.max(stay.in.arrive, m - ENTER)));
        if (!held) continue;
        seated.set(id, held);
      }
      now.add(id);
      emit(held, m, stay.out ? minuteOf(stay.out) : null);
    }
    for (const id of seated.keys()) if (!now.has(id)) seated.delete(id);
  }

  // The seat, or a walk between the door and the seat (round the table if need be),
  // into `out`: {x, z, heading, walking, distance}.
  function seatPoint(held, m, outMinute, out) {
    const { seat, spot, stay } = held, door = spot.door;
    const enter = (m - held.since) / ENTER;
    const leave = stay.out && outMinute !== null ? (stay.out.depart - outMinute) / ENTER : Infinity;
    const t = enter < 1 ? enter : leave < 1 ? leave : -1;
    out.walking = t >= 0;
    if (t < 0) { out.x = seat.x; out.z = seat.z; out.heading = seat.heading; out.distance = 0; return out; }
    const a = door, mid = held.via, b = seat;
    const l1 = mid ? Math.hypot(mid.x - a.x, mid.z - a.z) : Math.hypot(b.x - a.x, b.z - a.z), l2 = mid ? Math.hypot(b.x - mid.x, b.z - mid.z) : 0;
    const total = l1 + l2 || 1, s = Math.max(0, Math.min(1, t)) * total, inward = enter < 1;
    let p, q, k;
    if (!mid || s <= l1) { p = a; q = mid || b; k = l1 ? s / l1 : 1; }
    else { p = mid; q = b; k = l2 ? (s - l1) / l2 : 1; }
    out.x = p.x + (q.x - p.x) * k; out.z = p.z + (q.z - p.z) * k;
    out.heading = inward ? Math.atan2(q.z - p.z, q.x - p.x) : Math.atan2(p.z - q.z, p.x - q.x);
    out.distance = (inward ? t : 1 - t) * total;
    return out;
  }

  return { update, seatPoint, seated, reset: () => seated.clear() };
}

// Night-market stall holders: which stall each one keeps. A stall whose name is in the
// holder's job title is theirs (滷味攤老闆 keeps 滷味); the rest take the free stalls in order.
export function assignStalls(stalls, holders) {
  const out = new Map(), taken = new Set();
  const sorted = [...holders].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const r of sorted) {
    const stall = stalls.find(s => !taken.has(s) && r.job && r.job.includes(s.name));
    if (stall) { out.set(r.id, stall); taken.add(stall); }
  }
  for (const r of sorted) {
    if (out.has(r.id)) continue;
    const stall = stalls.find(s => !taken.has(s));
    if (!stall) break;
    out.set(r.id, stall); taken.add(stall);
  }
  return out;
}

// Where a stall holder stands: behind the counter, at the booth's front, facing out.
export function behindCounter(stall) {
  const b = stall.booth, h = stall.counterFacing, ux = Math.cos(h), uz = Math.sin(h);
  const reach = Math.abs(ux) * b.w / 2 + Math.abs(uz) * b.d / 2;
  return { x: b.x + ux * (reach - 0.9), z: b.z + uz * (reach - 0.9), heading: h };
}
