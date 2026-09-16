/* 一笔画符号库 + 应用图标（移植自 desktop/apps.js，macOS 的细线圆头语言） */
export const GLYPHS = {
  sidebar: '<rect x="3" y="4.5" width="18" height="15" rx="3.2"/><path d="M9.5 4.5v15"/>',
  'arrow-left': '<path d="M19 12H5.6M11.2 5.8 5 12l6.2 6.2"/>',
  'arrow-right': '<path d="M5 12h13.4M12.8 5.8 19 12l-6.2 6.2"/>',
  'chevron-down': '<path d="m6 9.5 6 6 6-6"/>',
  'chevron-right': '<path d="m9.5 5.5 6 6.5-6 6.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m15.8 15.8 4.2 4.2"/>',
  ellipsis: '<path d="M5.2 12h.01M12 12h.01M18.8 12h.01" stroke-width="2.6"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  xmark: '<path d="m6.6 6.6 10.8 10.8M17.4 6.6 6.6 17.4"/>',
  minus: '<path d="M6 12h12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.9v2.3M12 18.8v2.3M2.9 12h2.3M18.8 12h2.3M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6"/>',
  moon: '<path d="M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8z"/>',
  contrast: '<circle cx="12" cy="12" r="8.4"/><path d="M12 3.6a8.4 8.4 0 0 1 0 16.8z" fill="currentColor" stroke="none"/>',
  grid: '<rect x="3.6" y="3.6" width="7.2" height="7.2" rx="2"/><rect x="13.2" y="3.6" width="7.2" height="7.2" rx="2"/><rect x="3.6" y="13.2" width="7.2" height="7.2" rx="2"/><rect x="13.2" y="13.2" width="7.2" height="7.2" rx="2"/>',
  list: '<path d="M8.4 6.4h12M8.4 12h12M8.4 17.6h12M4.2 6.4h.01M4.2 12h.01M4.2 17.6h.01"/>',
  book: '<path d="M4.6 5.4c0-1 .8-1.9 1.9-1.9h12.9v14.1H6.5c-1 0-1.9.8-1.9 1.9z"/><path d="M4.6 19.5c0-1.1.8-1.9 1.9-1.9h12.9"/>',
  database: '<ellipse cx="12" cy="6" rx="7.4" ry="2.9"/><path d="M4.6 6v6c0 1.6 3.3 2.9 7.4 2.9s7.4-1.3 7.4-2.9V6"/><path d="M4.6 12v6c0 1.6 3.3 2.9 7.4 2.9s7.4-1.3 7.4-2.9v-6"/>',
  layers: '<path d="m12 3.4 8.4 4.4L12 12.2 3.6 7.8z"/><path d="m3.6 12.2 8.4 4.4 8.4-4.4"/><path d="m3.6 16.4 8.4 4.4 8.4-4.4"/>',
  share: '<circle cx="6" cy="12" r="2.6"/><circle cx="17.6" cy="6" r="2.6"/><circle cx="17.6" cy="18" r="2.6"/><path d="m8.4 10.8 6.8-3.5M8.4 13.2l6.8 3.5"/>',
  bolt: '<path d="M13.6 2.6 5.2 13.4h5.6l-1 8 8.6-11h-5.8z"/>',
  shield: '<path d="M12 3.1 5.2 5.6v5.7c0 4.2 2.8 7.6 6.8 9.1 4-1.5 6.8-4.9 6.8-9.1V5.6z"/>',
  blueprint: '<rect x="3.6" y="4.6" width="16.8" height="14.8" rx="2.6"/><path d="M3.6 9.4h16.8M9.2 9.4v10"/>',
  toolbox: '<rect x="3.2" y="7.4" width="17.6" height="12" rx="2.6"/><path d="M8.6 7.4V5.6a2 2 0 0 1 2-1.9h2.8a2 2 0 0 1 2 1.9v1.8M3.2 12.6h17.6"/>',
  cpu: '<rect x="6.6" y="6.6" width="10.8" height="10.8" rx="2.4"/><path d="M9.8 3.4v3.2M14.2 3.4v3.2M9.8 17.4v3.2M14.2 17.4v3.2M3.4 9.8h3.2M3.4 14.2h3.2M17.4 9.8h3.2M17.4 14.2h3.2"/>',
  sparkle: '<path d="m11 3.4 1.9 4.5 4.5 1.9-4.5 1.9L11 16.2l-1.9-4.5-4.5-1.9 4.5-1.9z"/><path d="m18.2 14.6.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
  terminal: '<rect x="3" y="4.6" width="18" height="14.8" rx="3.2"/><path d="m7.2 10 2.8 2.8-2.8 2.8M12.8 16.2h4.4"/>',
  globe: '<circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8M12 3.6c2.4 2.4 3.6 5.2 3.6 8.4s-1.2 6-3.6 8.4c-2.4-2.4-3.6-5.2-3.6-8.4S9.6 6 12 3.6z"/>',
  envelope: '<rect x="3" y="5.6" width="18" height="12.8" rx="2.6"/><path d="m3.9 7.4 8.1 5.9 8.1-5.9"/>',
  cloud: '<path d="M7.6 18.6a4.6 4.6 0 0 1-.5-9.2 6.1 6.1 0 0 1 11.6 1.3 4 4 0 0 1-.6 7.9z"/>',
  code: '<path d="m8.6 7.6-5 4.4 5 4.4M15.4 7.6l5 4.4-5 4.4M13.4 4.4l-2.8 15.2"/>',
  cube: '<path d="m12 3 8.2 4.5v9L12 21l-8.2-4.5v-9z"/><path d="M12 12.2 20.2 7.5M12 12.2 3.8 7.5M12 12.2V21"/>',
  bulb: '<path d="M9.6 17.4h4.8M10.4 20.4h3.2"/><path d="M12 3.4a6 6 0 0 0-3.4 10.9c.6.5 1 1.2 1 2h4.8c0-.8.4-1.5 1-2A6 6 0 0 0 12 3.4z"/>',
  person: '<circle cx="12" cy="8" r="3.8"/><path d="M4.6 20.4a7.4 7.4 0 0 1 14.8 0"/>',
  question: '<circle cx="12" cy="12" r="8.4"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.7.3-1 .9-1 1.7v.4"/><path d="M12 17.2h.01"/>',
  command: '<rect x="7.4" y="7.4" width="9.2" height="9.2" rx="1.6"/><path d="M5.9 5.9l1.5 1.5M16.6 7.4l1.5-1.5M5.9 18.1l1.5-1.5M16.6 16.6l1.5 1.5"/><path d="M4.4 4.4h.01M19.6 4.4h.01M4.4 19.6h.01M19.6 19.6h.01" stroke-width="2.6"/>',
  'tile-left': '<rect x="3" y="4.6" width="18" height="14.8" rx="2.8"/><rect x="4.8" y="6.4" width="7.4" height="11.2" rx="1.6" fill="currentColor" stroke="none"/>',
  'tile-right': '<rect x="3" y="4.6" width="18" height="14.8" rx="2.8"/><rect x="11.8" y="6.4" width="7.4" height="11.2" rx="1.6" fill="currentColor" stroke="none"/>',
  'tile-all': '<rect x="3" y="4.6" width="18" height="14.8" rx="2.8"/><path d="M12 4.6v14.8"/>',
  expand: '<path d="M8.4 15.6 4 20M4 20v-4.4M4 20h4.4M15.6 8.4 20 4M20 4v4.4M20 4h-4.4"/>',
  trash: '<path d="M4.6 7h14.8M9.6 7V4.6h4.8V7M6.6 7l1 13.2h8.8L17.4 7M10.2 10.6v6.4M13.8 10.6v6.4"/>',
  reload: '<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20.4 4.2v4.6h-4.6"/>',
  checkmark: '<path d="m5.2 12.6 4.4 4.4L18.8 7"/>',
  external: '<path d="M14 4.4h5.6V10M19.4 4.6 11.8 12.2"/><path d="M18 14.6v4.2a2.2 2.2 0 0 1-2.2 2.2H6.4a2.2 2.2 0 0 1-2.2-2.2V9.4a2.2 2.2 0 0 1 2.2-2.2h4"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 6.9v5.4l3.4 2"/>',
  folder: '<path d="M3.6 7.2a2.6 2.6 0 0 1 2.6-2.6h3.2l2.1 2.6h6.7a2.6 2.6 0 0 1 2.6 2.6v7.6a2.6 2.6 0 0 1-2.6 2.6H6.2a2.6 2.6 0 0 1-2.6-2.6z"/>',
  window: '<rect x="3" y="4.6" width="18" height="14.8" rx="3"/><path d="M3 9.2h18"/><path d="M6.2 6.9h.01M8.6 6.9h.01" stroke-width="2.4"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.9v2.5M12 18.6v2.5M4.7 4.7l1.8 1.8M17.5 17.5l1.8 1.8M2.9 12h2.5M18.6 12h2.5M4.7 19.3l1.8-1.8M17.5 6.5l1.8 1.8"/>',
  flag: '<path d="M5.4 20.6V3.8h13l-2.6 4.6 2.6 4.6h-13"/>',
  coffee: '<path d="M4 8.4h12.2v5.4a4.6 4.6 0 0 1-4.6 4.6H8.6A4.6 4.6 0 0 1 4 13.8z"/><path d="M16.2 9.6h1.7a2.6 2.6 0 0 1 0 5.2h-1.7"/><path d="M6.8 2.9v2.2M10.1 2.9v2.2M13.4 2.9v2.2M3.6 21.1h13"/>',
  rocket: '<path d="M12 3.6c2 1.9 3 4.5 3 7.3 0 1.8-.4 3.6-1.1 5.1h-3.8c-.7-1.5-1.1-3.3-1.1-5.1 0-2.8 1-5.4 3-7.3z"/><circle cx="12" cy="9.6" r="1.5"/><path d="m9.2 13.8-2.5 3.8 3-1.1M14.8 13.8l2.5 3.8-3-1.1M10.9 18.2c.2 1.5.6 2.6 1.1 3.6.5-1 .9-2.1 1.1-3.6"/>',
  launchpad: '<rect x="4" y="4" width="6.4" height="6.4" rx="1.8"/><rect x="13.6" y="4" width="6.4" height="6.4" rx="1.8"/><rect x="4" y="13.6" width="6.4" height="6.4" rx="1.8"/><rect x="13.6" y="13.6" width="6.4" height="6.4" rx="3.2"/>',
};

export function gl(name, sw = 1.7) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[name] || GLYPHS.list}</svg>`;
}

/* 应用图标：56~64 视口的圆角矩形瓦片（移植自 apps.js） */
export const APP_ICONS = {
  javaguide: () => `<svg viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="ico-jg-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f3e9d2"/><stop offset="1" stop-color="#d2c2a0"/>
    </linearGradient></defs>
    <rect width="64" height="64" rx="14" fill="url(#ico-jg-bg)"/>
    <path d="M14.5 14.5h24l9 9v26h-33z" fill="#fbf8f1" stroke="#bfb494" stroke-width="1.2"/>
    <path d="M38.5 14.5v9h9z" fill="#cfc3a1"/>
    <g stroke="#7d766a" stroke-width="2" stroke-linecap="round"><path d="M20.5 29.5h16M20.5 35.5h16M20.5 41.5h10"/></g>
    <g transform="rotate(-14 44.5 42.5)"><rect x="38.5" y="36.5" width="12" height="12" rx="2.4" fill="#b0492f"/>
    <path d="m41.5 42.5 2.2 2.4 4.8-5" fill="none" stroke="#fdf6ec" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></g>
  </svg>`,
  jbl: () => `<svg viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="ico-jbl-bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#182543"/><stop offset="1" stop-color="#070b16"/>
      </linearGradient>
      <linearGradient id="ico-jbl-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#eef4ff"/><stop offset="1" stop-color="#9fb3d9"/>
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="14" fill="url(#ico-jbl-bg)"/>
    <circle cx="24" cy="47" r="1" fill="#dce6f6" opacity=".55"/><circle cx="48" cy="13" r="1.2" fill="#dce6f6" opacity=".7"/>
    <circle cx="52" cy="40" r=".9" fill="#dce6f6" opacity=".45"/>
    <g transform="translate(32 33) translate(-24 -24)">
      <circle cx="24" cy="24" r="21" fill="none" stroke="#ff6a3d" stroke-width="1.8" opacity=".9"/>
      <circle cx="24" cy="24" r="17.5" fill="none" stroke="#2a3c63" stroke-width="1" stroke-dasharray="2 3"/>
      <path d="M24 8c3.6 3.4 5.4 8 5.4 13.2 0 3.4-.8 6.6-2.2 9.4h-6.4c-1.4-2.8-2.2-6-2.2-9.4C18.6 16 20.4 11.4 24 8z" fill="url(#ico-jbl-body)" stroke="#0b1120" stroke-width="1"/>
      <circle cx="24" cy="18.6" r="2.5" fill="#59c2ff"/>
      <path d="M18.9 27.5 15 33.5l4.6-1.6M29.1 27.5 33 33.5l-4.6-1.6" fill="#ff6a3d" stroke="#0b1120" stroke-width=".8" stroke-linejoin="round"/>
      <path d="M22 31.5c.3 2.8 1 4.6 2 6.5 1-1.9 1.7-3.7 2-6.5z" fill="#ffb454"/>
    </g>
  </svg>`,
  launchpad: () => `<svg viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="ico-lp-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6f6f8"/><stop offset="1" stop-color="#d9dadf"/>
    </linearGradient></defs>
    <rect width="64" height="64" rx="14" fill="url(#ico-lp-bg)"/>
    <g fill="#3a7bd5">
      <rect x="14" y="14" width="15" height="15" rx="4"/>
      <rect x="35" y="14" width="15" height="15" rx="4" opacity=".55"/>
      <rect x="14" y="35" width="15" height="15" rx="4" opacity=".55"/>
    </g>
    <rect x="35" y="35" width="15" height="15" rx="7.5" fill="#ff6a3d"/>
  </svg>`,
  workbench: () => `<svg viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="16" fill="#101b30"/>
    <circle cx="32" cy="32" r="19" fill="none" stroke="#ff6a3d" stroke-width="2"/>
    <path d="M32 13c3 2.9 4.6 6.8 4.6 11.2 0 2.9-.7 5.6-1.9 8h-5.4c-1.2-2.4-1.9-5.1-1.9-8C27.4 19.8 29 15.9 32 13z" fill="#dce6f6"/>
    <circle cx="32" cy="22" r="2.1" fill="#59c2ff"/>
    <path d="M29.4 33.4c.2 2.3.8 3.9 1.7 5.5.9-1.6 1.5-3.2 1.7-5.5z" fill="#ffb454"/>
  </svg>`,
};

export const CH_COLORS = {
  "01": "#7a4fae", "02": "#2f6db0", "03": "#23703f", "04": "#8a5a1f",
  "05": "#1f6e6e", "06": "#a04818", "07": "#9a2f6d", "08": "#5a6e2f",
  "09": "#55606a", "10": "#2f4f8a", "11": "#8a2fb0", "12": "#8a4a7a",
};
export const chColor = (code) => CH_COLORS[code] || "#55606a";

export const JG_CHAPTER_ICONS = {
  "01": "flag", "02": "coffee", "03": "database", "04": "layers",
  "05": "share", "06": "bolt", "07": "shield", "08": "blueprint",
  "09": "toolbox", "10": "cpu", "11": "sparkle", "12": "terminal",
};
export const JBL_CHAPTER_ICONS = {
  BAS: "book", DB: "database", WEB: "globe", SPRG: "layers", RDS: "bolt",
  MQ: "envelope", CLD: "cloud", ES: "search", LNX: "terminal", FE: "code",
  PRJ: "cube", AI: "sparkle", SCN: "bulb", HR: "person",
};
