// The search sheet: building chips grouped by kind with live headcounts, and search by
// resident name (account-style handles), job title, occupation or building.
// Enter picks the first result.
import { html, esc, avatar } from './dom.js';
import { ICON } from './icons.js';
import { DAY_NAMES, format } from '../core/clock.js';

const MAX_PEOPLE = 40;
const TIP_ICON = ICON.search.replace('width="20" height="20"', 'width="18" height="18"');

export function createSearchPanel({ root, town, actions }) {
  const sheet = html(`
    <div class="search-layer" hidden>
      <div class="backdrop"></div>
      <section class="panel search-sheet glass" role="dialog" aria-label="搜尋">
        <form class="ss-field" role="search" autocomplete="off">
          <span class="ss-glass">${ICON.search}</span>
          <input class="ss-input" type="search" inputmode="search" enterkeyhint="go" placeholder="搜尋居民、職稱或建築" aria-label="搜尋居民、職稱或建築" autocomplete="off" autocapitalize="off" spellcheck="false">
          <button class="icon-btn ss-clear" type="button" aria-label="清除" hidden>${ICON.close}</button>
          <button class="ss-cancel" type="button">取消</button>
        </form>
        <p class="ss-clock"><span class="live-dot"></span><span class="ss-clock-text"></span></p>
        <div class="ss-body scroll"></div>
      </section>
    </div>`);
  root.appendChild(sheet);
  const $ = s => sheet.querySelector(s);
  const input = $('.ss-input'), body = $('.ss-body'), clear = $('.ss-clear'), clockText = $('.ss-clock-text');
  let query = '', first = null, example = '';
  const names = town.residents.filter(r => !r.species).map(r => r.name);

  const close = () => actions.close('search');
  $('.backdrop').addEventListener('click', close);
  $('.ss-cancel').addEventListener('click', close);
  clear.addEventListener('click', () => { input.value = ''; onInput(); input.focus(); });
  $('.ss-field').addEventListener('submit', e => { e.preventDefault(); if (first) pick(first); });
  const onInput = () => { query = input.value.trim(); clear.hidden = !input.value; render(); body.scrollTop = 0; };
  input.addEventListener('input', onInput);
  body.addEventListener('click', e => {
    const t = e.target.closest('[data-try]');
    if (t) { input.value = '@' + t.dataset.try; onInput(); input.focus(); return; }
    const s = e.target.closest('[data-site]'), p = e.target.closest('[data-person]');
    if (s) pick({ site: s.dataset.site }); else if (p) pick({ person: p.dataset.person });
  });
  function pick(x) { close(); if (x.person) actions.selectPerson(x.person); else actions.selectSite(x.site); }

  const chip = s => {
    const n = town.presentAt(s.id).length;
    return `<button type="button" class="chip" data-site="${esc(s.id)}"><span class="chip-name">${esc(s.name)}</span><span class="count${n ? '' : ' is-zero'}">${n}</span></button>`;
  };
  const personRow = id => {
    const r = town.resident(id) || { name: id }, j = town.job(id) || {};
    return `<button type="button" class="row person-row" data-person="${esc(id)}">${avatar(id, r.name, '', r.species)}<span class="row-text"><b>${esc(r.name)}</b><small>${esc([j.title, j.org].filter(Boolean).join('・'))}</small></span><span class="row-status">${esc(town.statusOf(id) || '')}</span></button>`;
  };

  const showClock = () => {
    const m = town.clock.moment();
    clockText.textContent = `現在 ${DAY_NAMES[m.dow]} ${format(m.minute)}，數字是此刻在裡面的人數`;
  };

  // The list is built when the query changes; after that only the numbers and statuses
  // change, in place, so the list neither replays its entrance nor loses its scroll.
  function refresh() {
    showClock();
    for (const el of body.querySelectorAll('.chip[data-site]')) {
      const n = town.presentAt(el.dataset.site).length, count = el.querySelector('.count');
      if (count.textContent !== String(n)) { count.textContent = n; count.classList.toggle('is-zero', !n); }
    }
    for (const el of body.querySelectorAll('.person-row[data-person]')) {
      const status = el.querySelector('.row-status'), text = town.statusOf(el.dataset.person) || '';
      if (status.textContent !== text) status.textContent = text;
    }
  }

  function render() {
    showClock();
    let out = '';
    first = null;
    if (!query) {
      out += `<div class="ss-tip"><span class="ss-tip-icon">${TIP_ICON}</span><p>每位居民都有一個帳號風格的名字，輸入名字的一部分就找得到；大小寫、點和底線打錯也沒關係</p>${example ? `<button type="button" class="chip ss-try" data-try="${esc(example)}">試試 @${esc(example)}</button>` : ''}</div>`;
      const groups = new Map();
      for (const s of town.sites) { if (!s.group) continue; if (!groups.has(s.group)) groups.set(s.group, []); groups.get(s.group).push(s); }
      let i = 0;
      for (const [g, list] of groups) out += `<div class="chip-group" style="--i:${i++}"><h3>${esc(g)}</h3><div class="chips">${list.map(chip).join('')}</div></div>`;
      first = null;
    } else {
      const r = town.search(query) || { sites: [], people: [] };
      const people = r.people.slice(0, MAX_PEOPLE), sites = r.sites;
      if (people.length) { out += `<div class="chip-group"><h3>居民${r.people.length > MAX_PEOPLE ? `（前 ${MAX_PEOPLE} 位，共 ${r.people.length}）` : ` ${people.length}`}</h3><div class="rows">${people.map(p => personRow(p.id || p)).join('')}</div></div>`; first = { person: people[0].id || people[0] }; }
      if (sites.length) { out += `<div class="chip-group"><h3>建築</h3><div class="chips">${sites.map(chip).join('')}</div></div>`; if (!first) first = { site: sites[0].id }; }
      if (!out) out = r.query && r.query.account
        ? `<p class="empty">小鎮裡還沒有叫「@${esc(r.query.text)}」的居民<br><small>檢查一下拼字，或只輸入名字的一部分試試</small></p>`
        : `<p class="empty">找不到「${esc(query)}」<br><small>試試居民名字、職稱（例如「工程師」）或建築名稱</small></p>`;
    }
    body.innerHTML = out;
  }

  let tick = 0;
  return {
    el: sheet,
    get isOpen() { return !sheet.hidden; },
    open() {
      sheet.hidden = false; input.value = ''; query = ''; clear.hidden = true;
      example = names.length ? names[Math.floor(Math.random() * names.length)] : '';
      render();
      requestAnimationFrame(() => { sheet.classList.add('is-open'); input.focus({ preventScroll: true }); });
    },
    close() { sheet.classList.remove('is-open'); sheet.hidden = true; input.blur(); },
    update(dt) { if (sheet.hidden) return; tick += dt; if (tick > 1) { tick = 0; refresh(); } },
    dispose() { sheet.remove(); }
  };
}
