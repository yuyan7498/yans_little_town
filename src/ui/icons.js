// Inline SVG icons (24 × 24, stroked with currentColor).
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const ICON = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  people: svg('<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19c.5-3.4 3-5.2 6-5.2s5.5 1.8 6 5.2"/><path d="M16 5.6a3 3 0 0 1 0 5.8M18 14.2c1.8.6 2.8 2.2 3 4.3"/>'),
  locate: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="7.5"/>'),
  info: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 7.7v.1"/>'),
  chevron: svg('<path d="M9 5l7 7-7 7"/>'),
  sun: svg('<circle cx="12" cy="12" r="3.6"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>'),
  moon: svg('<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>'),
  eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  bus: svg('<rect x="4.5" y="4" width="15" height="12.5" rx="2.5"/><path d="M4.5 11h15M8 19.5v-3M16 19.5v-3"/>'),
  prev: svg('<path d="M14.5 6l-6 6 6 6"/>'),
  next: svg('<path d="M9.5 6l6 6-6 6"/>')
};
