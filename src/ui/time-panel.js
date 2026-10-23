// The time panel under the title: a slider across the day (its track is the sky's colours),
// this week's days as chips, and previous / next day.
import { html, esc } from './dom.js';
import { ICON } from './icons.js';
import { DAY_NAMES, MINUTES_PER_DAY, format, toDaySeconds } from '../core/clock.js';

const PART = m => (m < 330 ? '深夜' : m < 540 ? '早晨' : m < 690 ? '上午' : m < 810 ? '中午' : m < 1050 ? '下午' : m < 1140 ? '傍晚' : '夜晚');

export function createTimePanel({ root, town, actions }) {
  const panel = html(`
    <section class="panel time-panel glass" role="dialog" aria-label="小鎮時間" hidden>
      <div class="tp-head">
        <div class="tp-big"><b class="tp-clock">09:00</b><span class="tp-part">上午</span></div>
        <div class="tp-nav">
          <button class="icon-btn tp-prev" type="button" aria-label="前一天">${ICON.prev}</button>
          <span class="tp-date"></span>
          <button class="icon-btn tp-next" type="button" aria-label="後一天">${ICON.next}</button>
        </div>
      </div>
      <div class="tp-slider">
        <div class="tp-track" aria-hidden="true"></div>
        <input class="tp-range" type="range" min="0" max="${MINUTES_PER_DAY - 1}" step="1" aria-label="一天中的時間">
        <div class="tp-ticks" aria-hidden="true"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
      </div>
      <div class="tp-week" role="group" aria-label="這週的每一天"></div>
    </section>`);
  root.appendChild(panel);
  const $ = s => panel.querySelector(s);
  const range = $('.tp-range'), clock = $('.tp-clock'), part = $('.tp-part'), date = $('.tp-date'), week = $('.tp-week');
  let dragging = false, weekKey = -1;

  const setTime = (day, minute) => {
    town.clock.daySeconds = toDaySeconds(day, minute);
    actions.timeChanged();
  };
  const current = () => town.clock.moment();

  range.addEventListener('pointerdown', () => { dragging = true; });
  const end = () => { if (dragging) { dragging = false; actions.timeChanged(true); } };
  range.addEventListener('pointerup', end);
  range.addEventListener('change', () => { dragging = false; actions.timeChanged(true); });
  range.addEventListener('input', () => { const m = current(); setTime(m.day, Number(range.value)); });
  $('.tp-prev').addEventListener('click', () => { const m = current(); if (m.day > 1) { setTime(m.day - 1, m.minute); actions.timeChanged(true); } });
  $('.tp-next').addEventListener('click', () => { const m = current(); setTime(m.day + 1, m.minute); actions.timeChanged(true); });
  week.addEventListener('click', e => {
    const b = e.target.closest('[data-day]');
    if (b) { const m = current(); setTime(Number(b.dataset.day), m.minute); actions.timeChanged(true); }
  });

  function renderWeek(m) {
    const first = Math.floor((m.day - 1) / 7) * 7 + 1;
    if (weekKey !== first) {
      weekKey = first;
      week.innerHTML = DAY_NAMES.map((n, i) => `<button type="button" class="tp-day${i >= 5 ? ' is-weekend' : ''}" data-day="${first + i}"><span>${n.slice(1)}</span><small>第 ${first + i} 天</small></button>`).join('');
    }
    for (const b of week.children) b.classList.toggle('is-on', Number(b.dataset.day) === m.day);
  }

  return {
    el: panel,
    get isOpen() { return !panel.hidden; },
    open() { panel.hidden = false; requestAnimationFrame(() => panel.classList.add('is-open')); this.update(true); },
    close() { panel.classList.remove('is-open'); panel.hidden = true; },
    update() {
      if (panel.hidden) return;
      const m = current();
      clock.textContent = format(m.minute);
      part.textContent = PART(m.minute);
      date.textContent = `第 ${m.day} 天 · ${DAY_NAMES[m.dow]}`;
      if (!dragging && document.activeElement !== range) range.value = String(Math.floor(m.minute));
      else if (!dragging) range.value = String(Math.floor(m.minute));
      range.style.setProperty('--p', (m.minute / (MINUTES_PER_DAY - 1) * 100).toFixed(2) + '%');
      renderWeek(m);
    },
    dispose() { panel.remove(); }
  };
}
