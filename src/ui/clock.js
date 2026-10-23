// Where the town clock starts and how it carries over between visits.
//
// A visit opens where the last one left off: the clock is saved to localStorage each
// time the town hour turns (and when the time panel jumps to another hour). Test links
// pin it instead and are never saved: ?minute=1230 (20:30), ?day=6 (day 6, a Saturday),
// ?dayspeed=8 (the town runs 8 times faster). index.html's inline script reads the same
// key to paint the welcome card in day or night colours before anything loads.
import { MINUTES_PER_DAY, SECONDS_PER_MINUTE, toDaySeconds } from '../core/clock.js';

export const CLOCK_KEY = 'yans-town:clock';
const MAX_DAY_SPEED = 60;

function readStorage(storage) {
  try { return storage ? storage.getItem(CLOCK_KEY) : null; } catch { return null; }
}

// → { daySeconds, pinned, speed }. `start` is data/town.js `start` ({day, minute}).
export function startTime({ search = globalThis.location ? location.search : '', storage = globalThis.localStorage, start = { day: 1, minute: 540 } } = {}) {
  const q = new URLSearchParams(search);
  const int = (key, lo, hi) => {
    const v = q.get(key);
    return v !== null && /^\d{1,5}(\.\d+)?$/.test(v) ? Math.max(lo, Math.min(hi, Number(v))) : null;
  };
  const minute = int('minute', 0, MINUTES_PER_DAY - 1), day = int('day', 1, 9999), speed = int('dayspeed', 1, MAX_DAY_SPEED);
  const pinned = minute !== null || day !== null;
  let daySeconds = toDaySeconds(start.day || 1, start.minute ?? 540);
  if (pinned) daySeconds = toDaySeconds(Math.floor(day ?? start.day ?? 1), minute ?? start.minute ?? 540);
  else {
    const saved = Number(readStorage(storage));
    if (Number.isFinite(saved) && saved > 0) daySeconds = saved;
  }
  return { daySeconds, pinned, speed: speed ?? 1 };
}

// Saves the clock once each town hour (never for a pinned test link).
export function createClockSaver({ pinned = false, storage = globalThis.localStorage } = {}) {
  let savedHour = null;
  return {
    save(daySeconds, force = false) {
      if (pinned) return false;
      const hour = Math.floor(daySeconds / SECONDS_PER_MINUTE / 60);
      if (savedHour === null) { savedHour = hour; if (!force) return false; }
      if (hour === savedHour && !force) return false;
      savedHour = hour;
      try { storage.setItem(CLOCK_KEY, String(Math.round(daySeconds * 100) / 100)); return true; } catch { return false; }
    }
  };
}
