// Gestures on the town and the keyboard. Moves the orbit rig directly (src/ui/camera.js)
// and reports taps, pans and keys to the UI through callbacks.
//
//   mouse   left-drag pans (the ground point under the cursor stays under it),
//           right- or middle-drag turns and tilts, the wheel zooms about the cursor
//   touch   one finger pans; two fingers pinch to zoom and twist to turn about their
//           midpoint, or slide up and down together to tilt
//   Safari  trackpad pinch and rotate arrive as gesture events
//   keys    Esc, / or Ctrl+K, arrows pan, + and − zoom
import { groundAt, clamp, TAN, PITCH_MIN, PITCH_MAX, DIST_MIN } from './camera.js';

const TAP_MOVE = 6, TAP_MS = 600;            // a tap moves less than this, this quickly
const ROTATE_SPEED = 0.0065, TILT_SPEED = 0.005, TOUCH_TILT_SPEED = 0.006;

export function bindInput({ canvas, rig, viewport, locked = () => false, enabled = () => true,
  onTap = () => {}, onPan = () => {}, onEscape = () => {}, onSearch = () => {} }) {
  const pointers = new Map();
  let gesture = null;
  const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const cam = rig.state;
  const distMax = () => rig.bounds.distMax;

  function startGesture() {
    const list = [...pointers.values()], c0 = { ...cam };
    if (!list.length) { gesture = null; return; }
    if (list.length === 1) {
      const p = list[0], turn = p.type === 'mouse' && (p.button === 2 || p.button === 1 || p.shift);
      gesture = { kind: turn ? 'turn' : 'pan', c0, start: { x: p.x, y: p.y }, anchor: turn ? null : groundAt(c0, viewport(), p.x, p.y), moved: false };
      return;
    }
    const [a, b] = list, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    gesture = { kind: 'pinch', mode: null, c0, mid0: mid, dist0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      ang0: Math.atan2(b.y - a.y, b.x - a.x), a0: { x: a.x, y: a.y }, b0: { x: b.x, y: b.y }, anchor: groundAt(c0, viewport(), mid.x, mid.y) };
  }

  function applyGesture() {
    const g = gesture;
    if (!g) return;
    const list = [...pointers.values()], vp = viewport(), c0 = g.c0;
    if (g.kind === 'pan') {
      const p = list[0];
      if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) < 3) return;
      if (!g.moved) { g.moved = true; onPan(); }
      const hit = g.anchor && groundAt(c0, vp, p.x, p.y);
      if (hit) { cam.x = c0.x + g.anchor.x - hit.x; cam.z = c0.z + g.anchor.z - hit.z; }
      else {
        // Above the horizon: pan by screen distance at the pivot's depth.
        const perPixel = 2 * TAN * c0.distance / vp.h, dx = (p.x - g.start.x) * perPixel, dy = (p.y - g.start.y) * perPixel;
        const s = Math.sin(c0.yaw), co = Math.cos(c0.yaw);
        cam.x = c0.x - co * dx - s * dy; cam.z = c0.z + s * dx - co * dy;
      }
    } else if (g.kind === 'turn') {
      const p = list[0];
      cam.yaw = c0.yaw - (p.x - g.start.x) * ROTATE_SPEED;
      cam.pitch = clamp(c0.pitch + (p.y - g.start.y) * TILT_SPEED, PITCH_MIN, PITCH_MAX);
    } else if (g.kind === 'pinch' && list.length >= 2) {
      const [a, b] = list, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      let dAng = Math.atan2(b.y - a.y, b.x - a.x) - g.ang0;
      dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
      if (!g.mode) {
        const da = { x: a.x - g.a0.x, y: a.y - g.a0.y }, db = { x: b.x - g.b0.x, y: b.y - g.b0.y };
        if (Math.hypot(da.x, da.y) + Math.hypot(db.x, db.y) < 14) return;
        // Both fingers sliding the same way up or down, keeping their spacing, tilts.
        const vertical = d => Math.abs(d.y) > Math.abs(d.x) * 1.4;
        const together = da.y * db.y > 0 && vertical(da) && vertical(db);
        g.mode = together && Math.abs(dist / g.dist0 - 1) < 0.1 && Math.abs(dAng) < 0.12 ? 'tilt' : 'transform';
      }
      if (g.mode === 'tilt') {
        cam.pitch = clamp(c0.pitch + (mid.y - g.mid0.y) * TOUCH_TILT_SPEED, PITCH_MIN, PITCH_MAX);
        return;
      }
      // Turning the fingers clockwise turns the ground clockwise under them.
      cam.yaw = c0.yaw + dAng;
      cam.distance = clamp(c0.distance * g.dist0 / dist, DIST_MIN, distMax());
      if (locked()) return;                        // keep the followed one centred
      // Keep the ground point first under the fingers' midpoint under it now: this pans,
      // and makes zoom and twist pivot about the fingers rather than the screen centre.
      const rel = g.anchor && groundAt({ ...cam, x: 0, z: 0, y: c0.y }, vp, mid.x, mid.y, c0.y);
      if (rel) {
        if (!g.moved && Math.hypot(mid.x - g.mid0.x, mid.y - g.mid0.y) > 8) { g.moved = true; onPan(); }
        cam.x = g.anchor.x - rel.x; cam.z = g.anchor.z - rel.z;
      }
    }
    rig.clamp();
  }

  function zoomAround(px, py, factor) {
    const next = clamp(cam.distance * factor, DIST_MIN, distMax()), k = next / cam.distance;
    if (k === 1) return;
    const hit = locked() ? null : groundAt(cam, viewport(), px, py);
    if (hit) { cam.x = hit.x + (cam.x - hit.x) * k; cam.z = hit.z + (cam.z - hit.z) * k; }
    cam.distance = next;
    rig.clamp();
  }

  // ---------------------------------------------------------------- pointers
  const onDown = e => {
    if (!enabled() || pointers.size >= 2) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
    const p = local(e);
    pointers.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), button: e.button, type: e.pointerType, shift: e.shiftKey });
    rig.stop();
    canvas.classList.add('is-dragging');
    startGesture();
  };
  const onMove = e => {
    const tracked = pointers.get(e.pointerId);
    if (!tracked) return;
    const p = local(e);
    tracked.x = p.x; tracked.y = p.y;
    applyGesture();
  };
  const onUp = e => {
    const tracked = pointers.get(e.pointerId);
    if (!tracked) return;
    pointers.delete(e.pointerId);
    const single = gesture && gesture.kind !== 'pinch' && pointers.size === 0;
    const still = Math.hypot(tracked.x - tracked.sx, tracked.y - tracked.sy) < TAP_MOVE && performance.now() - tracked.t < TAP_MS;
    if (e.type === 'pointerup' && single && still && tracked.button === 0 && !tracked.shift) onTap(tracked.x, tracked.y, tracked.type);
    if (!pointers.size) canvas.classList.remove('is-dragging');
    startGesture();
  };
  const onWheel = e => {
    e.preventDefault();
    if (!enabled()) return;
    rig.stop();
    const p = local(e), unit = e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? 400 : 1;
    // A trackpad pinch arrives as ctrl + wheel with small deltas.
    zoomAround(p.x, p.y, Math.exp(e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0014)));
  };
  // Safari: trackpad pinch and rotate as gesture events (instead of ctrl + wheel).
  let gScale = 1, gRotation = 0;
  const onGestureStart = e => { e.preventDefault(); gScale = 1; gRotation = 0; rig.stop(); };
  const onGestureChange = e => {
    e.preventDefault();
    if (!enabled()) return;
    const p = local(e);
    zoomAround(p.x, p.y, gScale / e.scale);
    cam.yaw += (e.rotation - gRotation) * Math.PI / 180;
    gScale = e.scale; gRotation = e.rotation;
  };
  const onBlur = () => { pointers.clear(); gesture = null; canvas.classList.remove('is-dragging'); };
  const noMenu = e => e.preventDefault();

  // ---------------------------------------------------------------- keys
  const typing = t => !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
  const onKey = e => {
    if (e.isComposing || !enabled()) return;
    if (e.key === 'Escape') { onEscape(e); return; }
    if (typing(e.target)) return;
    if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); onSearch(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Arrows and +/− only when nothing else (a slider, a list) has the keyboard.
    if (e.target && e.target !== document.body && e.target !== canvas) return;
    const step = cam.distance * 0.08, s = Math.sin(cam.yaw), co = Math.cos(cam.yaw);
    const pan = (dx, dy) => { onPan(); rig.stop(); cam.x += co * dx + s * dy; cam.z += -s * dx + co * dy; rig.clamp(); };
    switch (e.key) {
      case 'ArrowLeft': pan(-step, 0); break;
      case 'ArrowRight': pan(step, 0); break;
      case 'ArrowUp': pan(0, -step); break;
      case 'ArrowDown': pan(0, step); break;
      case '+': case '=': rig.stop(); zoomAround(viewport().w / 2, viewport().h / 2, 0.8); break;
      case '-': case '_': rig.stop(); zoomAround(viewport().w / 2, viewport().h / 2, 1.25); break;
      default: return;
    }
    e.preventDefault();
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('lostpointercapture', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('gesturestart', onGestureStart);
  canvas.addEventListener('gesturechange', onGestureChange);
  canvas.addEventListener('contextmenu', noMenu);
  window.addEventListener('blur', onBlur);
  document.addEventListener('keydown', onKey);

  return {
    get busy() { return pointers.size > 0; },
    zoomAround,
    dispose() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('lostpointercapture', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('gesturestart', onGestureStart);
      canvas.removeEventListener('gesturechange', onGestureChange);
      canvas.removeEventListener('contextmenu', noMenu);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('keydown', onKey);
    }
  };
}
