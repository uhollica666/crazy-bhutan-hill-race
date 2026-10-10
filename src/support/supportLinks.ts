/**
 * Voluntary support for Novarah Interactives: which payment channels may be shown, and how external links are opened.
 *
 * The config (`public/support.json`, also read by the launch site) ships with every channel "pending". Nothing is shown as a payment
 * control until the developer verifies a real destination, and even then only if the link passes the rules below. The game never builds
 * a payment form, never sees card or bank details, and never ties anything in the game to a contribution.
 *
 * `public/download/support-core.js` holds the same rules for the website; tests/support.test.ts runs the same cases against both.
 */
export interface SupportChannel {
  id: string;
  region?: string;
  type: 'link' | 'qr';
  title: string;
  description?: string;
  recurring?: boolean;
  oneTime?: boolean;
  status: string;
  verifiedOn?: string | null;
  url?: string | null;
  qrImage?: string | null;
}

export interface SupportConfig {
  schema: 1;
  allowedHosts: string[];
  channels: SupportChannel[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const QR_PATH = /^support\/[A-Za-z0-9._-]+\.(png|webp|jpg)$/;

/** Why a channel is not (yet) active, or an empty list when it is. */
export function channelProblems(channel: unknown, allowedHosts: unknown): string[] {
  const problems: string[] = [];
  if (!channel || typeof channel !== 'object') return ['not an object'];
  const c = channel as Record<string, unknown>;
  if (c.status !== 'verified') problems.push('status is not "verified"');
  if (typeof c.verifiedOn !== 'string' || !DATE.test(c.verifiedOn)) problems.push('no verifiedOn date');
  if (c.type === 'link') {
    let url: URL | null = null;
    try {
      url = new URL(String(c.url));
    } catch {
      problems.push('no valid URL');
    }
    if (url) {
      if (url.protocol !== 'https:') problems.push('URL is not https');
      if (url.username || url.password) problems.push('URL contains credentials');
      if (!Array.isArray(allowedHosts) || !allowedHosts.includes(url.hostname.toLowerCase())) problems.push('host is not on the allow-list');
    }
  } else if (c.type === 'qr') {
    if (typeof c.qrImage !== 'string' || !QR_PATH.test(c.qrImage)) problems.push('no valid QR image path');
  } else {
    problems.push('unknown channel type');
  }
  return problems;
}

export const isChannelActive = (channel: unknown, allowedHosts: unknown): boolean => channelProblems(channel, allowedHosts).length === 0;

const usable = (config: unknown): config is SupportConfig =>
  !!config && typeof config === 'object' && (config as SupportConfig).schema === 1 && Array.isArray((config as SupportConfig).channels);

/** Channels that may be shown as active, in config order. Anything malformed is simply absent. */
export function activeChannels(config: unknown): SupportChannel[] {
  return usable(config) ? config.channels.filter((c) => isChannelActive(c, config.allowedHosts)) : [];
}

/** Channels still being set up (shown as "coming", never as a button). */
export function pendingChannels(config: unknown): SupportChannel[] {
  return usable(config) ? config.channels.filter((c) => c && typeof c === 'object' && !isChannelActive(c, config.allowedHosts)) : [];
}

/** True when a URL may be opened as a support link: https, no credentials, host on the allow-list. */
export function isSafeSupportUrl(raw: string, allowedHosts: string[]): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password && allowedHosts.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

let cached: Promise<SupportConfig | null> | null = null;

/** Loads the shipped support config once. Offline or malformed means `null` (the screen then says support is not available). */
export function loadSupportConfig(base: string): Promise<SupportConfig | null> {
  cached ??= fetch(`${base}support.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (usable(j) ? j : null))
    .catch(() => null);
  return cached;
}

interface TauriInternals {
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Opens an external link the right way for where the game is running:
 *  - Windows (Tauri) and Android (Tauri): through the opener plugin, which hands the URL to the system browser (a bare
 *    window.open is silently ignored inside the app webview);
 *  - the browser or PWA: a new tab with `noopener,noreferrer`.
 * Only https URLs whose host is allowed are opened. Returns false when the link was refused or could not be opened.
 */
export async function openExternal(url: string, allowedHosts: string[], win: Window = window): Promise<boolean> {
  if (!isSafeSupportUrl(url, allowedHosts)) return false;
  const internals = (win as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  if (internals?.invoke) {
    try {
      await internals.invoke('plugin:opener|open_url', { url });
      return true;
    } catch {
      // Fall through to the web path (an older native build without the plugin).
    }
  }
  // With noopener a browser always returns null from window.open, so success cannot be observed: a blocked pop-up is the only failure.
  win.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
