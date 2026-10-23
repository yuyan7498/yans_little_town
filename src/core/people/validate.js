// Is a plan fit to be walked? Checks coverage, order, legal states and moves, and the
// seam at midnight against what the day before really ended with (not as if a day
// repeated itself: a night worker's last night differs from tonight).

import { DAY, STREET } from './timeline.js';
import { format } from '../clock.js';

const STATES = new Set(['HOME', 'SLEEPING', 'COMMUTE', 'AT_WORK', 'LEISURE', 'MEDICAL', 'SHOPPING', 'DINING']);
const hhmm = m => (m >= DAY ? '24:00' : format(m));

export function validatePlan(plan, previous = null) {
  const problems = [];
  const who = plan && plan.owner ? plan.owner : '?';
  const segs = plan && plan.segments;
  const say = (text) => problems.push(`${who} 第 ${plan.day} 天：${text}`);
  if (!Array.isArray(segs) || !segs.length) { problems.push(`${who}：這一天沒有任何行程`); return { ok: false, problems }; }

  if (segs[0].start !== 0) say(`第一段從 ${hhmm(segs[0].start)} 開始，應該是 00:00`);
  if (segs[segs.length - 1].end !== DAY) say(`最後一段到 ${hhmm(segs[segs.length - 1].end)} 結束，應該是 24:00`);
  segs.forEach((s, i) => {
    const at = `${hhmm(s.start)}–${hhmm(s.end)}`;
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end <= s.start) say(`${at} 的時間不合理`);
    if (!STATES.has(s.state)) say(`${at} 的狀態「${s.state}」不認得`);
    if (typeof s.place !== 'string' || !s.place) say(`${at} 沒有地點`);
    if (s.state === 'COMMUTE' && s.place !== STREET) say(`${at} 是移動中，地點卻是 ${s.place}`);
    if (s.state === 'SLEEPING' && s.place === STREET) say(`${at} 睡在路上`);
    const next = segs[i + 1];
    if (!next) return;
    if (next.start !== s.end) say(`${at} 和下一段之間${next.start > s.end ? '有空檔' : '重疊'}（${hhmm(s.end)} → ${hhmm(next.start)}）`);
    if (s.place !== next.place && s.place !== STREET && next.place !== STREET) say(`${hhmm(s.end)} 從 ${s.place} 直接到 ${next.place}，中間沒有走路`);
  });
  const first = segs[0], last = segs[segs.length - 1];
  if (first.place === STREET) say('一天從路上開始');
  if (last.place === STREET) say('一天在路上結束');

  // The seam: where yesterday ended is where today begins.
  if (previous && previous.segments && previous.segments.length) {
    const end = previous.segments[previous.segments.length - 1];
    if (end.place !== first.place && end.place !== STREET && first.place !== STREET) {
      problems.push(`${who} 第 ${plan.day} 天：昨天結束在 ${end.place}，今天卻從 ${first.place} 開始（午夜接不上）`);
    }
  }
  return { ok: problems.length === 0, problems };
}
