// The sky's state at one moment: where the sun and moon are, the colours of the sky,
// the sun or moon light, the ambient light, fog and exposure. Pure maths on THREE
// colours and vectors; the sky dome and the lights read the same object, so the
// picture always agrees with itself.

import * as THREE from 'three';

// The sun's centre crosses the horizon at these town minutes (06:00 and 19:00), so it
// sits on the horizon when clock.daylight is about half.
export const SUNRISE = 360;
export const SUNSET = 1140;
// The sun's arc leans this far (radians) toward the south: noon elevation is 90° minus it.
const SUN_LEAN = 0.6;
// The key light never comes in flatter than this (radians), so dusk shadows stay readable.
const KEY_MIN_ELEVATION = 0.24;
// Moonlight comes in steeper than the (low, visible) moon so night shadows stay short
// and the town stays readable.
const MOON_KEY_MIN_ELEVATION = 0.6;
// The moon rises in the east at dusk and sets in the west after dawn.
const MOONRISE = 1110;
const MOONSET = 1440 + 400;
const MOON_LEAN = 1.27; // the moon stays low (about 17° at most) so the low camera sees it

// Colour keys (sRGB). Day and night blend by clock.daylight; the warm key is mixed in
// around sunset (clock.dusk) and sunrise. `ground` is the haze low over the land, which
// tints the fog.
const KEYS = {
  day: {
    zenith: '#3b78c4', horizon: '#c9dcea', ground: '#c3d0d6',
    light: '#fff3e2', lightI: 3.4, hemiSky: '#e2e9ef', hemiGround: '#a89b85', hemiI: 1.6,
    env: 0.35, exposure: 1.0
  },
  warm: {
    zenith: '#34457a', horizon: '#f4a46a', ground: '#b98a74',
    light: '#ffa45c', lightI: 2.3, hemiSky: '#e3ab8c', hemiGround: '#6a5444', hemiI: 0.9,
    env: 0.35, exposure: 1.08
  },
  night: {
    zenith: '#03060e', horizon: '#18233c', ground: '#121a2b',
    light: '#c2cde6', lightI: 0.45, hemiSky: '#5d6a86', hemiGround: '#23252d', hemiI: 1.25,
    env: 0.25, exposure: 1.45
  }
};
const SUN_GLOW = '#ffd7a8';
const SUN_DISC_HIGH = new THREE.Color('#fff4e0'), SUN_DISC_LOW = new THREE.Color('#ff8a3c');
const SUN_GLOW_HIGH = new THREE.Color(SUN_GLOW), SUN_GLOW_LOW = new THREE.Color('#ff9a55');
const WARM_SKY = '#ff8b4c';

const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mod = (v, n) => ((v % n) + n) % n;

const linear = hex => new THREE.Color(hex); // THREE converts sRGB strings to the linear working space
const COLOR_KEYS = ['zenith', 'horizon', 'ground', 'light', 'hemiSky', 'hemiGround'];
const KEY_COLORS = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, Object.fromEntries(COLOR_KEYS.map(c => [c, linear(v[c])]))]));

// Direction of a body on a tilted arc: east at phase 0, highest at 0.5, west at 1.
function arc(phase, lean, out) {
  const a = Math.PI * phase;
  const up = Math.sin(a);
  return out.set(Math.cos(a), up * Math.cos(lean), up * Math.sin(lean)).normalize();
}

// A fresh state object; atmosphere() fills it in place each frame (no allocation).
export function createAtmosphere() {
  const s = {
    minute: 0, daylight: 1, dusk: 0, warm: 0, night: 0,
    sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), keyDir: new THREE.Vector3(),
    sunUp: 0, moonUp: 0, keyIsMoon: false,
    lightColor: new THREE.Color(), lightIntensity: 0,
    zenith: new THREE.Color(), horizon: new THREE.Color(), ground: new THREE.Color(), fog: new THREE.Color(),
    hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiIntensity: 1,
    sunColor: new THREE.Color(), sunGlow: new THREE.Color(SUN_GLOW), warmSky: new THREE.Color(WARM_SKY), moonColor: new THREE.Color('#e9eef8'),
    sunDisc: 26, env: 0.5, exposure: 1, stars: 0, siderealHours: 0
  };
  return s;
}


export function atmosphere(frame, s) {
  const m = mod(frame.minute, 1440);
  const daylight = frame.daylight, dusk = frame.dusk;
  const dawn = smooth(320, 365, m) * (1 - smooth(395, 450, m));
  const warm = Math.max(dusk, dawn * 0.85);
  s.minute = m; s.daylight = daylight; s.dusk = dusk; s.warm = warm;
  s.night = 1 - daylight;

  // Sun and moon.
  arc((m - SUNRISE) / (SUNSET - SUNRISE), SUN_LEAN, s.sunDir);
  const moonPhase = (mod(m - MOONRISE, 1440)) / (MOONSET - MOONRISE);
  arc(moonPhase, MOON_LEAN, s.moonDir);
  s.sunUp = smooth(-0.04, 0.03, s.sunDir.y);
  s.moonUp = moonPhase <= 1 ? smooth(-0.02, 0.05, s.moonDir.y) : 0;

  // Blend the colour keys: night → day by daylight, then toward warm around sunset.
  const D = KEY_COLORS.day, N = KEY_COLORS.night, W = KEY_COLORS.warm;
  const w = warm * (0.35 + 0.65 * daylight);
  for (const c of COLOR_KEYS) {
    if (c === 'light') continue;
    s[c].copy(N[c]).lerp(D[c], daylight).lerp(W[c], w);
  }
  // The fog (and the sky at and below the horizon) is the horizon's haze, so the board's edge
  // and the far plain melt into the sky without a seam.
  s.fog.copy(s.horizon).lerp(s.ground, 0.25);
  const blend = k => (KEYS.night[k] + (KEYS.day[k] - KEYS.night[k]) * daylight) * (1 - w) + KEYS.warm[k] * w;
  s.hemiIntensity = blend('hemiI');
  s.env = blend('env');
  s.exposure = blend('exposure');
  s.stars = smooth(0.35, 0.0, daylight);

  // The key light: the sun by day, the moon by night. The swap happens while both are
  // faint, so the shadows never jump.
  const SWAP = 0.08;
  if (daylight > SWAP) {
    s.keyIsMoon = false;
    s.keyDir.copy(s.sunDir);
    const sunWarm = 1 - smooth(0.06, 0.55, s.sunDir.y);
    s.lightColor.copy(D.light).lerp(W.light, Math.max(sunWarm, warm * 0.7));
    s.lightIntensity = KEYS.day.lightI * smooth(SWAP, 0.6, daylight) * (1 - 0.25 * warm);
  } else {
    s.keyIsMoon = true;
    s.keyDir.copy(s.moonDir);
    s.lightColor.copy(N.light);
    s.lightIntensity = KEYS.night.lightI * smooth(SWAP, 0.0, daylight) * (0.35 + 0.65 * s.moonUp);
  }
  // Keep the key light above its lowest elevation (and above the horizon at all).
  const lowest = s.keyIsMoon ? MOON_KEY_MIN_ELEVATION : KEY_MIN_ELEVATION;
  const minY = Math.sin(lowest);
  if (s.keyDir.y < minY) {
    const hx = s.keyDir.x, hz = s.keyDir.z, hl = Math.hypot(hx, hz) || 1, c = Math.cos(lowest);
    s.keyDir.set(hx / hl * c, minY, hz / hl * c);
  }

  // The sun's disc: white-gold high up, deep orange at the horizon.
  const low = 1 - smooth(0.0, 0.4, s.sunDir.y);
  s.sunColor.copy(SUN_DISC_HIGH).lerp(SUN_DISC_LOW, low);
  s.sunGlow.copy(SUN_GLOW_HIGH).lerp(SUN_GLOW_LOW, low);
  s.sunDisc = 3 + 23 * (1 - low) * (1 - low);

  // Sidereal time for the stars: the Milky Way's core stands due south just before 21:00.
  s.siderealHours = 17.9 + (m - 1260) / 60 * 1.0027;
  return s;
}
