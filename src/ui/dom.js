// Tiny DOM helpers shared by the panels: escaping, element creation, small formatters.
import { format } from '../core/clock.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

// Builds an element from an HTML string (the first element in it).
export function html(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

export function el(tag, className = '', attrs = null) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

// A stable colour slot (0–5) for an id, for avatars and family dots.
export function toneOf(id) {
  let h = 2166136261;
  for (let i = 0; i < String(id).length; i++) h = Math.imul(h ^ String(id).charCodeAt(i), 16777619);
  return (h >>> 0) % 6;
}

// The letter shown in an avatar: the first character of a handle that is a letter or digit.
export function initialOf(name) {
  const m = String(name || '?').match(/[\p{L}\p{N}]/u);
  return (m ? m[0] : '?').toUpperCase();
}

// Animals (species 'cat' | 'dog') wear an emoji instead of an initial.
export const PET_EMOJI = { cat: '🐱', dog: '🐶' };
export const avatar = (id, name, size = '', species = '') => species && PET_EMOJI[species]
  ? `<span class="avatar is-animal ${size}" data-tone="${toneOf(id)}" aria-hidden="true">${PET_EMOJI[species]}</span>`
  : `<span class="avatar ${size}" data-tone="${toneOf(id)}" aria-hidden="true">${esc(initialOf(name))}</span>`;
export const clockText = minute => format(minute);

// Calls fn at most every `ms` while `active()` is true; returns the ticker to call each frame.
export function throttle(fn, ms) {
  let acc = ms;
  return (dt, force = false) => {
    acc += dt * 1000;
    if (acc >= ms || force) { acc = 0; fn(); }
  };
}
