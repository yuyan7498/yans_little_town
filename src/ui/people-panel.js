// The people panel under the headcount button.
//   whole town   occupation families → names
//   a building   who is inside now: by family when 20 or more (by job title when the
//                whole crowd is one family), else straight names
//   a vehicle    the driver and the passengers
import { html, esc, avatar, toneOf } from './dom.js';
import { ICON } from './icons.js';

const SPLIT_AT = 20;

export function createPeoplePanel({ root, town, actions }) {
  const panel = html(`
    <section class="panel people-panel glass" role="dialog" aria-label="居民名單" hidden>
      <header class="pp-head">
        <button class="icon-btn pp-back" type="button" aria-label="上一層" hidden>${ICON.back}</button>
        <div class="pp-titles"><h2 class="pp-title"></h2><p class="pp-sub"></p></div>
        <button class="icon-btn pp-close" type="button" aria-label="關閉">${ICON.close}</button>
      </header>
      <div class="pp-body scroll"></div>
    </section>`);
  root.appendChild(panel);
  const $ = s => panel.querySelector(s);
  const body = $('.pp-body'), title = $('.pp-title'), sub = $('.pp-sub'), backBtn = $('.pp-back');
  let target = { mode: 'town', id: null }, level = null, signature = '';

  $('.pp-close').addEventListener('click', () => actions.close('people'));
  backBtn.addEventListener('click', () => { level = null; render(true); body.scrollTop = 0; });
  body.addEventListener('click', e => {
    const g = e.target.closest('[data-group]');
    if (g) { level = g.dataset.group; render(true); body.scrollTop = 0; return; }
    const p = e.target.closest('[data-person]');
    if (p) actions.selectPerson(p.dataset.person, { fromPanel: true });
  });

  const jobOf = id => town.job(id) || {};
  const nameOf = id => (town.resident(id) || {}).name || id;

  // The rows the current target has: {kind:'people', ids, roles?} or {kind:'groups', groups:[{key,label,ids}]}.
  function model() {
    if (target.mode === 'vehicle') {
      const v = town.vehicleInfo(target.id) || { people: [] };
      return { title: v.label || '車輛', sub: v.sub || '', kind: 'people', ids: v.people.map(p => p.id), roles: Object.fromEntries(v.people.map(p => [p.id, p.role])) };
    }
    const ids = target.mode === 'site' ? town.presentAt(target.id) : town.residents.map(r => r.id);
    const place = target.mode === 'site' ? (town.site(target.id) || {}).name || '' : '全鎮';
    const head = target.mode === 'site' ? { title: place, sub: ids.length ? `此刻有 ${ids.length} 人在裡面` : '此刻沒有人在裡面' } : { title: '全鎮居民', sub: `${ids.length} 位居民，先選職業再找人` };
    if (target.mode === 'site' && ids.length < SPLIT_AT) return { ...head, kind: 'people', ids };
    const byFamily = new Map();
    for (const id of ids) { const j = jobOf(id), key = j.family || '?'; if (!byFamily.has(key)) byFamily.set(key, { key, label: j.familyLabel || '其他', ids: [] }); byFamily.get(key).ids.push(id); }
    let groups = [...byFamily.values()];
    const order = (town.people && town.people.families) || [];
    groups.sort((a, b) => (order.findIndex(f => f.id === a.key) + 1 || 99) - (order.findIndex(f => f.id === b.key) + 1 || 99));
    // A building full of one profession lists job titles instead.
    if (target.mode === 'site' && groups.length === 1) {
      const byTitle = new Map();
      for (const id of ids) { const t = jobOf(id).title || '其他'; if (!byTitle.has(t)) byTitle.set(t, { key: t, label: t, ids: [] }); byTitle.get(t).ids.push(id); }
      groups = [...byTitle.values()].sort((a, b) => b.ids.length - a.ids.length);
    }
    return { ...head, kind: 'groups', groups };
  }

  const personRow = (id, role) => {
    const r = town.resident(id) || { name: id }, j = jobOf(id);
    const line = [role, j.title, j.org].filter(Boolean).join('・');
    return `<button type="button" class="row person-row" data-person="${esc(id)}">${avatar(id, r.name, '', r.species)}<span class="row-text"><b>${esc(r.name)}</b><small>${esc(line)}</small></span>${ICON.chevron}</button>`;
  };

  function render(force = false) {
    const m = model();
    let inner = '', head = m.title, subtitle = m.sub, canBack = false;
    if (m.kind === 'groups') {
      const g = level !== null ? m.groups.find(x => x.key === level) : null;
      if (level !== null && !g) level = null;
      if (g) {
        canBack = true; head = g.label; subtitle = `${g.ids.length} 人`;
        inner = g.ids.map(id => personRow(id)).join('');
      } else {
        inner = m.groups.map((x, i) => `<button type="button" class="row group-row" data-group="${esc(x.key)}" style="--i:${Math.min(i, 14)}"><span class="group-dot" data-tone="${toneOf(x.key)}"></span><span class="row-text"><b>${esc(x.label)}</b></span><span class="count">${x.ids.length}</span>${ICON.chevron}</button>`).join('');
      }
    } else {
      inner = m.ids.length ? m.ids.map(id => personRow(id, m.roles && m.roles[id])).join('') : '<p class="empty">這裡現在沒有人</p>';
    }
    const sig = `${target.mode}:${target.id}:${level}:${head}:${subtitle}:${inner.length}:${inner.slice(0, 4000)}`;
    if (!force && sig === signature) return;
    signature = sig;
    const top = body.scrollTop;
    title.textContent = head; sub.textContent = subtitle; backBtn.hidden = !canBack;
    // Rows slide in when the list is opened or changed by a tap, not when someone
    // walks in or out while it is open.
    body.classList.toggle('is-live', !force);
    body.innerHTML = inner;
    body.scrollTop = top;
  }

  let tick = 0;
  return {
    el: panel,
    get isOpen() { return !panel.hidden; },
    open(next) { target = next; level = null; signature = ''; panel.hidden = false; render(true); body.scrollTop = 0; requestAnimationFrame(() => panel.classList.add('is-open')); },
    retarget(next) { if (next.mode !== target.mode || next.id !== target.id) { target = next; level = null; signature = ''; render(true); body.scrollTop = 0; } },
    close() { panel.classList.remove('is-open'); panel.hidden = true; },
    update(dt) { if (panel.hidden) return; tick += dt; if (tick > 0.8) { tick = 0; render(); } },
    dispose() { panel.remove(); }
  };
}
