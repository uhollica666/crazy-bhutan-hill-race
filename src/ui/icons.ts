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
  <circle cx="24" cy="24" r="22" fill="#d12c88" stroke="#ff8a2a" stroke-width="2.5"/>
  <path d="M24 9l15 15-15 15L9 24z" fill="none" stroke="#ff8a2a" stroke-width="3" stroke-linejoin="round"/>
  <path d="M24 15l9 9-9 9-9-9z" fill="none" stroke="#ffc247" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M17 17l14 14M31 17L17 31" stroke="#ff8a2a" stroke-width="2.5" stroke-linecap="round" opacity=".85"/>
</svg>`;

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
