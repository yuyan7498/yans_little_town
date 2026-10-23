// The 更多資訊 sheet for the selected resident: who they are, what they are doing now,
// profile, facts, relations that jump to that person, and today's timeline with 現在.
import { html, esc, avatar } from './dom.js';
import { ICON } from './icons.js';
import { format } from '../core/clock.js';

const GROUPS = [['family', '家人'], ['friends', '朋友'], ['work', '同事同學'], ['care', '照顧的對象']];
const PET_BADGE = { cat: '流浪貓', dog: '流浪狗' };

function badgeOf(r, j) {
  if (r.species) return { text: j.title || PET_BADGE[r.species] || '小動物', cls: 'is-animal' };
  if (r.schedule === 'mayor') return { text: '鎮長', cls: 'is-owner' };
  if (j.family === 'president' || j.title === '總統') return { text: '總統', cls: 'is-president' };
  return { text: '小鎮居民', cls: '' };
}

export function createInfoSheet({ root, town, actions }) {
  const layer = html(`
    <div class="info-layer" hidden>
      <div class="backdrop"></div>
      <section class="panel info-sheet glass" role="dialog" aria-label="居民資料">
        <div class="is-grip" aria-hidden="true"></div>
        <button class="icon-btn is-close" type="button" aria-label="關閉">${ICON.close}</button>
        <div class="is-scroll scroll"></div>
      </section>
    </div>`);
  root.appendChild(layer);
  const scroller = layer.querySelector('.is-scroll');
  let id = null, token = 0, statusEl = null, listEl = null, lastNow = -1, lastStatus = '';

  const close = () => actions.close('info');
  layer.querySelector('.backdrop').addEventListener('click', close);
  layer.querySelector('.is-close').addEventListener('click', close);
  scroller.addEventListener('click', e => {
    const p = e.target.closest('[data-person]');
    if (p) { actions.selectPerson(p.dataset.person); return; }
    const s = e.target.closest('.secret');
    if (s) s.classList.toggle('is-open');
  });

  function build(personId) {
    id = personId; lastNow = -1; lastStatus = '';
    const r = town.resident(id) || { name: id }, j = town.job(id) || {}, badge = badgeOf(r, j);
    const rel = town.relationsOf(id) || [];
    // Relations by group; an animal's caretakers read 照顧牠的人, a caretaker's animals 照顧的對象.
    const known = new Set(GROUPS.map(g => g[0]));
    const groups = GROUPS.map(([g, label]) => [g, r.species && g === 'care' ? '照顧牠的人' : label]);
    const relHtml = groups.map(([g, label]) => {
      const list = rel.filter(x => x.group === g || (g === 'care' && !known.has(x.group)));
      if (!list.length) return '';
      return `<div class="rel-group"><h4>${label}</h4><div class="chips">${list.map(x => {
        const o = town.resident(x.id) || { name: x.id };
        return `<button type="button" class="chip chip-person" data-person="${esc(x.id)}">${avatar(x.id, o.name, 'xs', o.species)}<span class="chip-name">${esc(o.name)}</span>${x.label && x.label !== label ? `<small>${esc(x.label)}</small>` : ''}</button>`;
      }).join('')}</div></div>`;
    }).join('');
    // A resident's dog shows as a fact unless the town's own facts already say so.
    const rows = (town.facts(id) || []).slice();
    if (r.dog && !rows.some(([k, v]) => /狗/.test(k) || v === r.dog || String(v).includes(r.dog))) rows.push(['愛犬', r.dog]);
    const facts = rows.map(([k, v]) => `<div class="fact"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
    scroller.innerHTML = `
      <header class="is-head">
        ${avatar(id, r.name, 'xl', r.species)}
        <div class="is-who">
          <h2>${esc(r.name)}</h2>
          <p class="is-job">${esc([j.title, j.org].filter(Boolean).join('・'))}${r.age ? `<span class="is-age">${esc(r.age)} 歲</span>` : ''}</p>
          <div class="is-badges"><span class="badge ${badge.cls}">${esc(badge.text)}</span></div>
        </div>
      </header>
      <p class="is-status"><span class="live-dot"></span><span class="is-status-text"></span></p>
      <div class="is-bio is-loading"><span></span><span></span><span></span></div>
      ${facts ? `<dl class="facts">${facts}</dl>` : ''}
      ${relHtml ? `<section class="is-block"><h3>${r.species ? '身邊的人' : '人際關係'}</h3>${relHtml}</section>` : ''}
      <div class="is-profile"></div>
      <section class="is-block"><h3>今天的行程</h3><ol class="timeline scroll"></ol></section>`;
    statusEl = scroller.querySelector('.is-status-text');
    listEl = scroller.querySelector('.timeline');
    renderTimeline(true);
    scroller.scrollTop = 0;
    const mine = ++token;
    Promise.resolve(town.profile(id)).then(p => { if (mine === token) fillProfile(p || {}); }, () => { if (mine === token) fillProfile({}); });
  }

  function fillProfile(p) {
    const bio = scroller.querySelector('.is-bio');
    if (bio) { bio.classList.remove('is-loading'); bio.innerHTML = p.bio ? esc(p.bio) : ''; bio.hidden = !p.bio; }
    const chips = (title, list) => list && list.length ? `<section class="is-block"><h3>${title}</h3><div class="chips tags">${list.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></section>` : '';
    const quote = (title, text) => text ? `<section class="is-block"><h3>${title}</h3><p class="quote">${esc(text)}</p></section>` : '';
    const secret = p.secret ? `<section class="is-block"><h3>小祕密</h3><button type="button" class="secret" aria-label="點一下看小祕密"><span class="secret-text">${esc(p.secret)}</span><span class="secret-hint">${ICON.eye}點一下偷看</span></button></section>` : '';
    scroller.querySelector('.is-profile').innerHTML = chips('個性', p.traits) + chips('興趣', p.hobbies) + quote('口頭禪', p.motto) + quote('最近的小目標', p.goal) + secret;
  }

  function renderTimeline(force) {
    const m = town.clock.moment(), now = Math.floor(m.minute);
    const entries = town.dayEntries(id) || [];
    const idx = entries.findIndex(e => now >= e.start && now < e.end);
    if (!force && idx === lastNow) return;
    lastNow = idx;
    listEl.innerHTML = entries.map((e, i) => `<li class="tl${i === idx ? ' is-now' : ''}${e.walk ? ' is-walk' : ''}${now >= e.end ? ' is-past' : ''}"><time>${format(e.start)}<small>${format(e.end % 1440)}</small></time><span class="tl-dot"></span><span class="tl-text">${esc(e.text)}${i === idx ? '<em>現在</em>' : ''}</span></li>`).join('');
    // The timeline is its own scroll box; open it at the current entry.
    if (force) requestAnimationFrame(() => { const n = listEl.querySelector('.is-now'); if (n) listEl.scrollTop = Math.max(0, n.offsetTop - 70); });
  }

  let tick = 0;
  return {
    el: layer,
    get isOpen() { return !layer.hidden; },
    get personId() { return id; },
    open(personId) { build(personId); layer.hidden = false; requestAnimationFrame(() => layer.classList.add('is-open')); },
    show(personId) { if (personId !== id) build(personId); },
    close() { layer.classList.remove('is-open'); layer.hidden = true; },
    update(dt) {
      if (layer.hidden || !id) return;
      tick += dt;
      if (tick < 0.4) return;
      tick = 0;
      const s = town.statusOf(id) || '';
      if (s !== lastStatus) { lastStatus = s; statusEl.textContent = s; }
      renderTimeline(false);
    },
    dispose() { layer.remove(); }
  };
}
