// A uniform grid over the ground for "who is near here" questions. Cells keep their
// arrays between rebuilds (only their lengths are reset), so a frame allocates nothing
// once the town has warmed up.

export function createGrid(cell) {
  const cells = new Map(), used = [];
  const key = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

  function clear() {
    for (let i = 0; i < used.length; i++) used[i].length = 0;
    used.length = 0;
  }
  function put(item, x, z) {
    const k = key(Math.floor(x / cell), Math.floor(z / cell));
    let list = cells.get(k);
    if (!list) cells.set(k, list = []);
    if (!list.length) used.push(list);
    list.push(item);
  }
  // Something with a footprint of radius r goes into every cell it touches.
  function putWide(item, x, z, r) {
    const cx0 = Math.floor((x - r) / cell), cx1 = Math.floor((x + r) / cell), cz0 = Math.floor((z - r) / cell), cz1 = Math.floor((z + r) / cell);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const k = key(cx, cz);
      let list = cells.get(k);
      if (!list) cells.set(k, list = []);
      if (!list.length) used.push(list);
      list.push(item);
    }
  }
  // Everything in the cells overlapping the box, appended to `out` (cleared first).
  // Items put with putWide may come more than once.
  function gather(x0, z0, x1, z1, out) {
    out.length = 0;
    const cx0 = Math.floor(x0 / cell), cx1 = Math.floor(x1 / cell), cz0 = Math.floor(z0 / cell), cz1 = Math.floor(z1 / cell);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const list = cells.get(key(cx, cz));
      if (list) for (let i = 0; i < list.length; i++) out.push(list[i]);
    }
    return out;
  }
  return { clear, put, putWide, gather, cell };
}
