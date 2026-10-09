import type { Medal } from '../data/types';

const svg = (inner: string, extra = ''): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" ${extra}>${inner}</svg>`;

export const ICONS = {
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  recover: svg('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>'),
  settings: svg(
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  ),
  play: svg('<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor" stroke="none"/>'),
  home: svg('<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>'),
  resume: svg('<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor" stroke="none"/>'),
  left: svg(
    '<path d="M15 4l-8 8 8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  right: svg(
    '<path d="M9 4l8 8-8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
};

/** Decorative endless-knot roundel used on panels. */
export const KNOT = `<svg class="knot" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <circle cx="24" cy="24" r="22" fill="#7d2a21" stroke="#dca72c" stroke-width="2.5"/>
  <path d="M24 9l15 15-15 15L9 24z" fill="none" stroke="#dca72c" stroke-width="3" stroke-linejoin="round"/>
  <path d="M24 15l9 9-9 9-9-9z" fill="none" stroke="#f6c452" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M17 17l14 14M31 17L17 31" stroke="#dca72c" stroke-width="2.5" stroke-linecap="round" opacity=".85"/>
</svg>`;

const FLAGS: [number, number, string][] = [
  [26, 31.2, '#2f6fd0'],
  [45, 24.3, '#f6f4ee'],
  [64, 22, '#d6322b'],
  [83, 24.3, '#2e9c4f'],
  [102, 31.2, '#f0c23a'],
];

/** Project mark: a prayer-flag arch over a hairpin road climbing into the mountains. */
export function logoSvg(id = 'lg'): string {
  const flags = FLAGS.map(([x, y, c]) => `<path d="M${x - 4.5} ${y}h9v11l-4.5-3-4.5 3z" fill="${c}"/>`).join(
    '',
  );
  return `<svg class="mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Crazy Bhutan Hill Race">
  <defs>
    <clipPath id="${id}-c"><circle cx="64" cy="64" r="57"/></clipPath>
    <linearGradient id="${id}-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f6fb5"/><stop offset=".7" stop-color="#9ac7e2"/><stop offset="1" stop-color="#f6e7c8"/></linearGradient>
  </defs>
  <circle cx="64" cy="64" r="63" fill="#7d2a21"/>
  <circle cx="64" cy="64" r="59" fill="#dca72c"/>
  <g clip-path="url(#${id}-c)">
    <rect width="128" height="128" fill="url(#${id}-s)"/>
    <circle cx="94" cy="48" r="11" fill="#e8a317"/>
    <path d="M0 88L28 56l16 14L70 32l24 32 14-10 20 24v48H0z" fill="#8fa9c4"/>
    <path d="M70 32l-9 12 8-4 5 5 3-5z" fill="#f6f4ee"/>
    <path d="M0 104l24-22 28 14 28-26 28 24 20-8v44H0z" fill="#2c5a3a"/>
    <path d="M44 132l46-24-52-12 46-12-34-10 26-8" fill="none" stroke="#f6ecd2" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M44 132l46-24-52-12 46-12-34-10 26-8" fill="none" stroke="#4a4745" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <path d="M14 38Q64 6 114 38" fill="none" stroke="#3a1d15" stroke-width="1.6"/>
  ${flags}
  <circle cx="64" cy="64" r="57" fill="none" stroke="#7d2a21" stroke-width="2"/>
</svg>`;
}

const MEDAL_COLORS: Record<Medal, [string, string]> = {
  gold: ['#f6c452', '#c8901a'],
  silver: ['#e4e8ee', '#9aa3b2'],
  bronze: ['#e0a070', '#a8602e'],
  none: ['#d9cdb0', '#a8987a'],
};

export function medalSvg(medal: Medal): string {
  const [a, b] = MEDAL_COLORS[medal];
  return `<svg class="medal" viewBox="0 0 96 96" role="img" aria-label="${medal === 'none' ? 'Finisher' : medal + ' medal'}">
  <path d="M30 4h14l8 30H38z" fill="#d6322b"/><path d="M66 4H52l-8 30h14z" fill="#2f6fd0"/>
  <circle cx="48" cy="60" r="31" fill="${b}"/>
  <circle cx="48" cy="60" r="27" fill="${a}"/>
  <path d="M48 36l17 17-17 17-17-17z" fill="none" stroke="${b}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M48 44l9 9-9 9-9-9z" fill="none" stroke="${b}" stroke-width="3" stroke-linejoin="round"/>
</svg>`;
}
