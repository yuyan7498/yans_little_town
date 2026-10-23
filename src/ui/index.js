// The user interface: the camera rig and gestures, selection and following, the HUD and
// its panels, the clock, and the welcome flow. Everything it needs from the town is the
// facade in docs/CONTRACTS.md §7; everything it needs from the scene is `view`
// (add, remove, setCamera, resize, renderer.domElement).
//
//   const ui = createUI({ town, view, welcome });   // welcome: createWelcome() made early
//   ui.ready();                                     // the town is built: offer 進入小鎮
//   each frame: ui.update(dt) → town.step() → view.render(makeFrame(...))
import { createRig, homeFor, boundsFor, boxView, pointView, frameOf, project, rayAt, pickBox, pixelsPerUnit, basis, TAN } from './camera.js';
import { bindInput } from './input.js';
import { startTime, createClockSaver } from './clock.js';
import { createWelcome } from './welcome.js';
import { createHud } from './hud.js';
import { createTimePanel } from './time-panel.js';
import { createPeoplePanel } from './people-panel.js';
import { createSearchPanel } from './search-panel.js';
import { createInfoSheet } from './info-sheet.js';
import { create as createMarkers } from '../render/markers.js';
import { esc } from './dom.js';

const WIDE = 900;          // windows at least this wide put the info sheet beside the town

export function createUI({ town, view, root = document.body, canvas = view.renderer.domElement, welcome = null, start = { day: 1, minute: 540 } }) {
  const world = town.world;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rig = createRig({ world, reducedMotion: reduced });
  const markers = createMarkers({ world });
  view.add(markers);
  const boxes = world.siteList.map(s => { const b = world.boxOf(s.id); return { id: s.id, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y0: 0, y1: b.height }; });
  const welcomeCtl = welcome || createWelcome();

  // ---------------------------------------------------------------- state
  let entered = false, sel = null, follow = null, home = null, sky = '';
  const scratch = {};
  const clockStart = startTime({ start });
  town.clock.daySeconds = clockStart.daySeconds;
  const saver = createClockSaver({ pinned: clockStart.pinned });
  const dayspeed = clockStart.speed;

  const viewport = () => ({ w: canvas.clientWidth || window.innerWidth, h: canvas.clientHeight || window.innerHeight });

  // ---------------------------------------------------------------- actions (shared with the panels)
  const actions = {
    clear, selectPerson, selectSite, selectVehicle,
    toggle(name) { (name === 'time' ? timePanel : peoplePanel).isOpen ? closePanel(name) : openPanel(name); },
    close: closePanel,
    fab() { if (sel && sel.kind === 'person') openSheet('info'); else openSheet('search'); },
    recenter() { if (follow) { follow.paused = false; follow.lastSite = undefined; } else flyHome(); },
    timeChanged(force = false) { saver.save(town.clock.daySeconds, force); }
  };
  const hud = createHud({ root, actions });
  const timePanel = createTimePanel({ root: hud.layer, town, actions });
  const peoplePanel = createPeoplePanel({ root: hud.layer, town, actions });
  const searchPanel = createSearchPanel({ root, town, actions });
  const infoSheet = createInfoSheet({ root, town, actions });
  for (const layer of [searchPanel.el, infoSheet.el]) layer.classList.add('ui-layer');

  function closeDropdowns() { if (timePanel.isOpen) timePanel.close(); if (peoplePanel.isOpen) peoplePanel.close(); syncOpen(); }
  function openPanel(name) {
    closeDropdowns();
    if (name === 'time') timePanel.open();
    else {
      if (sel && sel.kind === 'person') return;
      peoplePanel.open(peopleTarget());
    }
    syncOpen();
  }
  function closePanel(name) {
    if (name === 'time') timePanel.close(); else if (name === 'people') peoplePanel.close();
    else if (name === 'search') searchPanel.close();
    else if (name === 'info') { infoSheet.close(); refocus(); }
    syncOpen();
  }
  function openSheet(name) {
    closeDropdowns();
    if (name === 'search') { infoSheet.close(); searchPanel.open(); }
    else { searchPanel.close(); infoSheet.open(sel.id); refocus(); }
    syncOpen();
  }
  function syncOpen() {
    hud.setOpen({ time: timePanel.isOpen, people: peoplePanel.isOpen, search: searchPanel.isOpen, info: infoSheet.isOpen });
    document.documentElement.toggleAttribute('data-sheet', infoSheet.isOpen || searchPanel.isOpen);
  }
  const peopleTarget = () => (sel && sel.kind === 'site' ? { mode: 'site', id: sel.id } : sel && sel.kind === 'vehicle' ? { mode: 'vehicle', id: sel.id } : { mode: 'town', id: null });

  // ---------------------------------------------------------------- camera helpers
  // The part of the window the town can be seen in: under the title bar, clear of the
  // info sheet (beside the town on wide windows, over its lower part on phones).
  function insets() {
    const i = hud.insets(), vp = viewport();
    if (infoSheet.isOpen) { if (vp.w >= WIDE) i.right = 440; else i.bottom = Math.round(vp.h * 0.62); }
    return i;
  }
  // The same room on both sides: the distance that fits a building is worked out for a
  // centred frame, then framed() slides the pivot into the free part.
  function symmetric() {
    const i = insets(), v = Math.max(i.top, i.bottom), h = Math.max(i.left || 0, i.right || 0);
    return { top: v, bottom: v, left: h, right: h };
  }
  // Shifts a pivot so that the thing at the goal shows in the middle of the free part of the window.
  function framed(goal) {
    const vp = viewport(), f = frameOf(vp, insets());
    const dx = (f.x0 + f.x1) / 2 - vp.w / 2, dy = (f.y0 + f.y1) / 2 - vp.h / 2;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return goal;
    const c = { ...rig.state, ...goal }, b = basis(c), unit = 2 * TAN * c.distance / vp.h;
    const gl = Math.hypot(b.fwd.x, b.fwd.z) || 1, sin = Math.max(0.25, Math.sin(c.pitch));
    const right = -dx * unit, toward = dy * unit / sin;
    return { ...goal, x: goal.x + b.right.x * right - (b.fwd.x / gl) * toward, z: goal.z + b.right.z * right - (b.fwd.z / gl) * toward };
  }
  const offsetNow = () => { const g = framed({ x: 0, z: 0 }); return { x: g.x, z: g.z }; };
  function flyHome(duration = 1.4) {
    home = homeFor(world, viewport(), { insets: insets() });
    rig.setBounds(boundsFor(world, home));
    rig.flyTo(home, duration);
  }
  function viewSite(id, duration) {
    const b = world.boxOf(id);
    if (b) rig.flyTo(framed(boxView(b, rig.state, viewport(), { insets: symmetric(), bounds: rig.bounds })), duration);
  }
  function refocus() {
    if (!sel || !entered) return;
    if (sel.kind === 'site') viewSite(sel.id, 0.7);
    else if (follow && !follow.paused) follow.lastSite = undefined;
  }

  // ---------------------------------------------------------------- selection
  function setMarkers(siteId, point) { markers.setBuilding(siteId); markers.setPerson(point); }
  function clear() {
    sel = null; follow = null; setMarkers(null, null);
    if (searchPanel.isOpen) searchPanel.close();
    if (infoSheet.isOpen) infoSheet.close();
    closeDropdowns();
  }
  function selectSite(id) {
    if (!world.site(id)) return;
    sel = { kind: 'site', id }; follow = null;
    setMarkers(id, null); searchPanel.close(); infoSheet.close(); closeDropdowns();
    viewSite(id);
  }
  function selectPerson(id) {
    if (!town.resident(id)) return;
    sel = { kind: 'person', id };
    follow = { kind: 'person', id, paused: false, lastSite: undefined };
    searchPanel.close(); if (infoSheet.isOpen) infoSheet.show(id);
    closeDropdowns();
  }
  function selectVehicle(id) {
    sel = { kind: 'vehicle', id }; follow = { kind: 'vehicle', id, paused: false, lastSite: undefined };
    searchPanel.close(); infoSheet.close(); closeDropdowns();
  }

  // Each frame: keep the camera on the followed person or vehicle.
  function followStep(dt) {
    if (!follow) return;
    if (follow.kind === 'vehicle') {
      const v = town.vehicleInfo(follow.id);
      if (!v) { clear(); return; }
      // The helicopter flies: the camera rises with it once it is up.
      const high = !!v.aloft, vy = high ? v.y || 0 : 0;
      setMarkers(null, { x: v.x, y: v.y || 0, z: v.z });
      if (follow.paused) return;
      if (follow.lastSite === undefined || follow.high !== high) {
        follow.lastSite = null; follow.high = high;
        rig.flyTo(framed({ ...pointView({ ...v, y: vy }, rig.state, { vehicle: true, aloft: high }), x: v.x, z: v.z, y: vy }));
      } else { const o = offsetNow(); rig.track({ x: v.x + o.x, z: v.z + o.z }, dt, vy); }
      return;
    }
    const w = town.whereIs(follow.id);
    if (!w) return;
    if (w.inside) {
      setMarkers(w.site, null);
      if (follow.paused) return;
      if (follow.lastSite !== w.site) { follow.lastSite = w.site; viewSite(w.site); }
      return;
    }
    setMarkers(null, { x: w.x, y: w.y || 0, z: w.z });
    if (follow.paused) return;
    if (follow.lastSite !== null) {
      follow.lastSite = null;
      rig.flyTo(framed({ ...pointView(w, rig.state, { aloft: !!w.aloft }), x: w.x, z: w.z, y: w.aloft ? w.y : 0 }));
    } else {
      const o = offsetNow();
      rig.track({ x: w.x + o.x, z: w.z + o.z }, dt, w.aloft ? w.y : 0);
      rig.keepInSight({ x: w.x, y: (w.y || 0) + 3, z: w.z }, dt, boxes);
    }
  }

  // ---------------------------------------------------------------- taps
  function pickAt(px, py, touch) {
    const vp = viewport(), reach = touch ? 32 : 16;
    let best = null, bestScore = Infinity;
    for (const t of town.tapTargets()) {
      const s = project(rig.state, vp, { x: t.x, y: (t.y || 0) + (t.kind === 'vehicle' ? 2 : 2.2), z: t.z }, scratch);
      if (!s) continue;
      const r = Math.max(reach, (t.radius || 0) * pixelsPerUnit(vp, s.depth)), d = Math.hypot(s.x - px, s.y - py);
      if (d <= r && d / r < bestScore) { bestScore = d / r; best = t; }
    }
    if (best) return { kind: best.kind, id: best.id };
    const hit = pickBox(rayAt(rig.state, vp, px, py), boxes);
    return hit ? { kind: 'site', id: hit.box.id } : null;
  }
  function onTap(x, y, type) {
    if (!entered) return;
    closeDropdowns();
    const hit = pickAt(x, y, type !== 'mouse');
    if (!hit) { if (sel && sel.kind === 'site') clear(); return; }
    if (hit.kind === 'site') selectSite(hit.id);
    else if (hit.kind === 'vehicle') selectVehicle(hit.id);
    else selectPerson(hit.id);
  }

  const input = bindInput({
    canvas, rig, viewport,
    enabled: () => entered,
    onTap,
    onPan() { if (follow) follow.paused = true; },
    onEscape() {
      if (searchPanel.isOpen) closePanel('search');
      else if (infoSheet.isOpen) closePanel('info');
      else if (peoplePanel.isOpen || timePanel.isOpen) closeDropdowns();
      else if (sel) clear();
    },
    onSearch() { openSheet('search'); }
  });
  // A press anywhere outside a dropdown (and its button) closes it.
  const onDocDown = e => {
    for (const [panel, btn, name] of [[timePanel, hud.timeBtn, 'time'], [peoplePanel, hud.countBtn, 'people']]) {
      if (panel.isOpen && !panel.el.contains(e.target) && !btn.contains(e.target)) closePanel(name);
    }
  };
  document.addEventListener('pointerdown', onDocDown, true);

  // ---------------------------------------------------------------- size and welcome
  const wideView = () => {
    home = homeFor(world, viewport(), { insets: hud.insets() });
    rig.setBounds(boundsFor(world, home));
    rig.set({ ...home, distance: home.distance * 1.3, yaw: home.yaw + 0.45 });
  };
  const onResize = () => { const v = viewport(); view.resize(v.w, v.h); if (!entered) wideView(); };
  addEventListener('resize', onResize);
  wideView();

  function enter() {
    if (entered) return;
    entered = true;
    flyHome(2.6);
  }
  welcomeCtl.onEnter(enter);

  // ---------------------------------------------------------------- per frame
  let hudTick = 1;
  function describe() {
    if (sel && sel.kind === 'site') {
      const s = town.site(sel.id) || {}, n = town.presentAt(sel.id).length;
      return { mode: 'site', name: s.name || '', sub: s.group || '', countHtml: `<b>${n}</b>&nbsp;人在裡面` };
    }
    if (sel && sel.kind === 'vehicle') {
      const v = town.vehicleInfo(sel.id) || { people: [] };
      return { mode: 'vehicle', name: v.label || '車輛', sub: v.sub || '', countHtml: `${v.kind === 'helicopter' || v.kind === 'plane' ? '機上' : '車上'} <b>${v.people.length}</b> 人` };
    }
    if (sel && sel.kind === 'person') {
      const r = town.resident(sel.id) || {}, j = town.job(sel.id) || {};
      return { mode: 'person', name: r.name || sel.id, sub: [j.title, j.org].filter(Boolean).join('・'), countHtml: `<span class="status-line">${esc(town.statusOf(sel.id) || '')}</span>`, live: true };
    }
    return { mode: 'town', name: '彥彥的小鎮', sub: '', countHtml: `<b>${town.residents.length}</b>&nbsp;位居民` };
  }

  function update(dt) {
    dt = Math.min(dt, 0.1);
    if (entered) { town.clock.daySeconds += dt * (town.clock.speed ?? 1) * dayspeed; saver.save(town.clock.daySeconds); }
    const m = town.clock.moment();
    const next = m.daylight < 0.5 ? 'night' : 'day';
    if (next !== sky) {
      sky = next; document.documentElement.dataset.sky = next;
      const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = next === 'night' ? '#0b141e' : '#dce7ee';
    }
    hud.setClock(m);

    if (!entered) rig.state.yaw += dt * 0.025;       // the town turns slowly behind the welcome card
    else followStep(dt);
    rig.step(dt);
    if (!rig.flying) rig.escape(boxes);
    view.setCamera(rig.state);

    hudTick += dt;
    if (hudTick > 0.2) {
      hudTick = 0;
      hud.setSelection(describe());
      const nearHome = home && rig.state.distance > home.distance * 0.85 && Math.hypot(rig.state.x - home.x, rig.state.z - home.z) < 60;
      hud.setRecenter(entered && (follow ? follow.paused : !nearHome));
    }
    // The floating name tag over a followed person who is out on the street.
    let tagged = false;
    if (follow && follow.kind === 'person' && !(infoSheet.isOpen && viewport().w < WIDE)) {
      const w = town.whereIs(follow.id);
      if (w && !w.inside) {
        const s = project(rig.state, viewport(), { x: w.x, y: (w.y || 0) + 5.4, z: w.z }, scratch);
        if (s) { const r = town.resident(follow.id) || {}; hud.setTag({ name: r.name, status: town.statusOf(follow.id) }, s.x, s.y - 6); tagged = true; }
      }
    }
    if (!tagged) hud.setTag(null);

    timePanel.update(); peoplePanel.update(dt); searchPanel.update(dt); infoSheet.update(dt);
  }

  hud.setSelection(describe());
  update(0);

  return {
    update, enter, ready: () => welcomeCtl.ready(), welcome: welcomeCtl,
    select(s) { if (!s) clear(); else if (s.person) selectPerson(s.person); else if (s.site) selectSite(s.site); else if (s.vehicle) selectVehicle(s.vehicle); },
    open(name) {
      if (name === 'search') openSheet('search');
      else if (name === 'info') { if (sel && sel.kind === 'person') openSheet('info'); }
      else openPanel(name);
    },
    close: closePanel, clear, home: flyHome, markers,
    get camera() { return rig.state; }, rig, get entered() { return entered; }, get selection() { return sel; }, get following() { return follow; },
    get moment() { return town.clock.moment(); },
    dispose() {
      input.dispose(); removeEventListener('resize', onResize); document.removeEventListener('pointerdown', onDocDown, true);
      hud.dispose(); timePanel.dispose(); peoplePanel.dispose(); searchPanel.dispose(); infoSheet.dispose();
      view.remove(markers); markers.dispose();
    }
  };
}
