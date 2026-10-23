// Words for the info sheet: what someone is doing, their shift, their days off and the
// facts listed under their name.

import { ACTIVITY_LABELS, STATE_LABELS, DAY_NAMES, STATUS_ROLES, STUDENT_ROLES } from './labels.js';
import { SHIFTS } from './rules.js';

// Hours of ordinary day jobs, for the 班別 line (shifts come from rules.SHIFTS).
const DAY_HOURS = {
  office: '09:00–18:00（彈性上下班）', workshop: '08:00–17:00（彈性上下班）', depot: '08:00–17:00（彈性上下班）', driver: '08:00–17:00',
  teacher: '07:30–17:00', 'school-admin': '08:00–17:00', 'hosp-admin': '08:30–17:30（彈性上下班）', bank: '08:30–17:30', civic: '08:30–17:30',
  zoo: '07:30–16:30（餵完動物才開園）', aircrew: '依航班排班，一天飛兩趟來回',
  mayor: '08:30–17:30', president: '全天候，依行程', primary: '08:00–16:00', secondary: '07:30–17:00，晚自習到 20:30', university: '依課表上課'
};

export function createDescribe({ world, byId, week, strays = [] }) {
  const siteName = id => (id && world.site(id) ? world.site(id).name : null);

  const activity = seg => (seg ? ACTIVITY_LABELS[seg.activity] || STATE_LABELS[seg.state] || '' : '');

  function shift(id) {
    const r = byId.get(id);
    if (!r) return null;
    const key = week.shiftKey(r);
    const s = key && SHIFTS[key];
    if (s) return `${s.label} ${s.from}–${s.to}${s.note ? `（${s.note}）` : ''}`;
    return DAY_HOURS[r.kind] || null;
  }

  function rest(id) {
    const r = byId.get(id);
    if (!r) return null;
    if (r.kind === 'president' || r.kind === 'transit') return '全年無休';
    if (r.kind === 'aircrew') return '依航班輪休（大約飛兩天休一天）';
    if (STUDENT_ROLES.has(r.role) || r.kind === 'mayor') return '週六、週日';
    if (r.role === 'patient' || r.role === 'preschooler' || r.role === 'retiree' || r.role === 'senior' || r.role === 'unemployed') return null;
    const days = week.restDays(r);
    return days.length ? days.map(d => DAY_NAMES[d]).join('、') : '全年無休';
  }

  function facts(id) {
    const r = byId.get(id);
    if (!r) return [];
    const out = [];
    if (r.role === 'stray') {
      // 牠 has no job, shifts or days off: an identity and a nest.
      out.push(['身分', r.job]);
      const nest = strays.find(n => n.id === r.home);
      const park = nest && siteName(nest.site);
      if (park) out.push(['窩', park]);
      return out;
    }
    const status = STATUS_ROLES.has(r.role);
    out.push([status ? '身分' : '職業', r.org && !status ? `${r.job}（${r.org}）` : r.job]);
    const work = siteName(r.work);
    if (work && r.role === 'preschooler') out.push(['就讀', work + '（附設幼兒園）']);
    else if (work) out.push([STUDENT_ROLES.has(r.role) ? '就讀' : r.role === 'patient' ? '住院' : '工作地點', work]);
    const home = siteName(r.home);
    if (home && r.role !== 'patient') out.push(['住在', home]);
    const shiftText = r.role === 'patient' ? null : shift(id);
    if (shiftText) out.push(['班別', shiftText]);
    const off = rest(id);
    if (off) out.push(['休假', off]);
    const hangout = siteName(r.hangout);
    if (hangout) out.push(['常去', hangout]);
    if (r.dog) out.push(['養狗', r.dog]);
    if (r.birthMonth) out.push(['生日', `${r.birthMonth} 月`]);
    return out;
  }

  return { activity, shift, rest, facts };
}
