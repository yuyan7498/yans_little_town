// The always-on controls: the title bar (back, title, town clock chip), the headcount
// button, the recenter button, the bottom search / 更多資訊 button and the floating name tag.
import { html, esc } from './dom.js';
import { ICON } from './icons.js';
import { DAY_NAMES, format } from '../core/clock.js';

export function createHud({ root, actions }) {
  const layer = html(`
    <div class="ui-layer hud-layer">
      <header class="hud">
        <div class="hud-title glass">
          <button class="hud-back icon-btn" type="button" aria-label="返回全鎮" hidden>${ICON.back}</button>
          <div class="hud-name"><h1>彥彥的小鎮</h1><p class="hud-sub" hidden></p></div>
          <button class="hud-time" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="調整小鎮時間">
            <span class="hud-time-icon">${ICON.sun}</span><b class="hud-time-text">09:00</b><span class="hud-time-day">週一</span>
          </button>
        </div>
        <button class="hud-count glass" type="button" aria-haspopup="dialog" aria-expanded="false">
          <span class="hud-count-dot live-dot"></span><span class="hud-count-text"></span>${ICON.chevron}
        </button>
      </header>
      <button class="fab-recenter glass" type="button" aria-label="回到他身邊" hidden>${ICON.locate}</button>
      <div class="fab-bar">
        <button class="fab fab-search" type="button" aria-label="搜尋居民或建築">
          <span class="fab-ring"></span>
          <span class="fab-icon">${ICON.search}</span>
          <span class="fab-label">更多資訊</span>
        </button>
      </div>
      <div class="nametag" hidden><b></b><span></span></div>
    </div>`);
  root.appendChild(layer);
  const $ = s => layer.querySelector(s);
  const back = $('.hud-back'), title = $('.hud-name h1'), sub = $('.hud-sub'), timeBtn = $('.hud-time');
  const timeText = $('.hud-time-text'), timeDay = $('.hud-time-day'), timeIcon = $('.hud-time-icon');
  const count = $('.hud-count'), countText = $('.hud-count-text'), recenter = $('.fab-recenter');
  const fab = $('.fab-search'), fabLabel = $('.fab-label'), tag = $('.nametag');
  const tagName = tag.querySelector('b'), tagStatus = tag.querySelector('span');

  back.addEventListener('click', () => actions.clear());
  timeBtn.addEventListener('click', () => actions.toggle('time'));
  count.addEventListener('click', () => actions.toggle('people'));
  recenter.addEventListener('click', () => actions.recenter());
  fab.addEventListener('click', () => actions.fab());

  let last = {};
  const set = (key, value, apply) => { if (last[key] !== value) { last[key] = value; apply(value); } };

  return {
    layer, timeBtn, countBtn: count, fab,
    // mode: 'town' | 'site' | 'person' | 'vehicle'
    setSelection({ mode, name, sub: subtitle, countHtml, live }) {
      set('mode', mode, m => { layer.dataset.mode = m; back.hidden = m === 'town'; fab.dataset.mode = m === 'person' ? 'info' : 'search'; });
      set('name', name, v => { title.textContent = v; });
      set('sub', subtitle || '', v => { sub.hidden = !v; sub.textContent = v; });
      set('count', countHtml, v => { countText.innerHTML = v; });
      set('live', !!live, v => { count.classList.toggle('is-live', v); });
      set('fabLabel', mode === 'person', p => { fabLabel.textContent = p ? '更多資訊' : '搜尋'; fab.setAttribute('aria-label', p ? '更多資訊' : '搜尋居民或建築'); });
    },
    setClock(m) {
      const text = format(m.minute);
      set('clock', text, v => { timeText.textContent = v; });
      set('dow', m.dow, v => { timeDay.textContent = DAY_NAMES[v]; });
      set('night', m.daylight < 0.5, night => { timeIcon.innerHTML = night ? ICON.moon : ICON.sun; });
    },
    setRecenter(visible) { set('recenter', visible, v => { recenter.hidden = !v; }); },
    setOpen({ time, people, search, info }) {
      timeBtn.setAttribute('aria-expanded', String(!!time)); timeBtn.classList.toggle('is-open', !!time);
      count.setAttribute('aria-expanded', String(!!people)); count.classList.toggle('is-open', !!people);
      layer.classList.toggle('is-covered', !!(search || info));
    },
    // Puts the name tag at screen point (x, y) or hides it.
    setTag(person, x, y) {
      if (!person) { if (!tag.hidden) tag.hidden = true; return; }
      if (tag.hidden) tag.hidden = false;
      set('tagName', person.name, v => { tagName.textContent = v; });
      set('tagStatus', person.status || '', v => { tagStatus.textContent = v; tagStatus.hidden = !v; });
      tag.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -100%)`;
    },
    // Where the HUD ends, in px from the top of the window (for camera framing).
    insets() {
      const h = layer.querySelector('.hud').getBoundingClientRect();
      return { top: Math.round(h.bottom + 6), bottom: 96, left: 0, right: 0 };
    },
    dispose() { layer.remove(); }
  };
}
