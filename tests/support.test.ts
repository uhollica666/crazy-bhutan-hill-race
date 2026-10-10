import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { activeChannels, channelProblems, isSafeSupportUrl, openExternal, pendingChannels } from '../src/support/supportLinks';

// The launch site keeps an equivalent copy of the rules; both must agree on every case below.
const sitePath = '../public/download/support-core.js';
const site = (await import(/* @vite-ignore */ sitePath)) as {
  activeChannels: (c: unknown) => unknown[];
  pendingChannels: (c: unknown) => unknown[];
  channelProblems: (c: unknown, hosts: unknown) => string[];
};

const HOSTS = ['patreon.com', 'www.patreon.com', 'ko-fi.com'];
const link = (over: Record<string, unknown> = {}) => ({ id: 'x', type: 'link', title: 'Patreon', status: 'verified', verifiedOn: '2026-10-12', url: 'https://www.patreon.com/novarah', ...over });
const qr = (over: Record<string, unknown> = {}) => ({ id: 'q', type: 'qr', title: 'Bhutan QR', status: 'verified', verifiedOn: '2026-10-12', qrImage: 'support/bhutan-qr.png', ...over });

describe('support links: a channel is active only when it is verified and safe', () => {
  it('accepts a verified https link on an allowed host and a verified QR image', () => {
    expect(channelProblems(link(), HOSTS)).toEqual([]);
    expect(channelProblems(qr(), HOSTS)).toEqual([]);
  });

  it.each([
    ['pending status', link({ status: 'pending' })],
    ['no verification date', link({ verifiedOn: null })],
    ['a malformed date', link({ verifiedOn: '12/10/2026' })],
    ['no url', link({ url: null })],
    ['http, not https', link({ url: 'http://www.patreon.com/novarah' })],
    ['a javascript: url', link({ url: 'javascript:alert(1)' })],
    ['a data: url', link({ url: 'data:text/html,<script>alert(1)</script>' })],
    ['credentials in the url', link({ url: 'https://user:pass@www.patreon.com/novarah' })],
    ['a look-alike host', link({ url: 'https://patreon.com.evil.example/novarah' })],
    ['a host that merely contains an allowed one', link({ url: 'https://evilpatreon.com/novarah' })],
    ['a raw IP address', link({ url: 'https://203.0.113.9/pay' })],
    ['an unlisted provider', link({ url: 'https://paypal.example/pay' })],
    ['an unknown channel type', { ...link(), type: 'card-form' }],
    ['a QR path outside support/', qr({ qrImage: '../secrets/qr.png' })],
    ['a QR path with a bad extension', qr({ qrImage: 'support/qr.svg' })],
    ['a QR from a remote url', qr({ qrImage: 'https://example.com/support/qr.png' })],
    ['no QR image', qr({ qrImage: null })],
  ])('refuses %s', (_name, channel) => {
    expect(channelProblems(channel, HOSTS).length).toBeGreaterThan(0);
    expect(site.channelProblems(channel, HOSTS).length).toBeGreaterThan(0);
  });

  it('a host check is case-insensitive and exact', () => {
    expect(channelProblems(link({ url: 'https://WWW.PATREON.COM/novarah' }), HOSTS)).toEqual([]);
    expect(channelProblems(link({ url: 'https://sub.patreon.com/novarah' }), HOSTS)).not.toEqual([]);
  });

  it('shipped configuration is inactive: every channel pending, no payment control, nothing active', () => {
    const cfg = JSON.parse(readFileSync('public/support.json', 'utf8'));
    expect(cfg.schema).toBe(1);
    expect(cfg.channels.length).toBeGreaterThan(0);
    expect(activeChannels(cfg)).toEqual([]);
    expect(site.activeChannels(cfg)).toEqual([]);
    expect(pendingChannels(cfg)).toHaveLength(cfg.channels.length);
    for (const c of cfg.channels) {
      expect(c.status).toBe('pending');
      expect(c.url ?? null).toBeNull();
      expect(c.qrImage ?? null).toBeNull();
      expect(c.verifiedOn ?? null).toBeNull();
    }
    for (const host of cfg.allowedHosts) expect(host).toMatch(/^[a-z0-9.-]+$/);
  });

  it('config handling is strict: wrong schema, junk and missing lists yield nothing active', () => {
    for (const bad of [null, undefined, 5, 'x', {}, { schema: 2, channels: [link()] }, { schema: 1 }, { schema: 1, channels: 'no' }]) {
      expect(activeChannels(bad)).toEqual([]);
      expect(site.activeChannels(bad)).toEqual([]);
      expect(pendingChannels(bad)).toEqual([]);
    }
    const cfg = { schema: 1, allowedHosts: HOSTS, channels: [link({ id: 'a' }), link({ id: 'b', status: 'pending' }), null, qr({ id: 'c' })] };
    expect(activeChannels(cfg).map((c) => c.id)).toEqual(['a', 'c']);
    expect(site.activeChannels(cfg)).toHaveLength(2);
    expect(pendingChannels(cfg).map((c) => c.id)).toEqual(['b']);
    expect(site.pendingChannels(cfg)).toHaveLength(1);
  });

  it('the site and the game agree on every case', () => {
    const cases = [link(), qr(), link({ status: 'pending' }), link({ url: 'http://www.patreon.com/x' }), link({ url: 'https://evil.example' }), qr({ qrImage: 'x.png' }), { type: 'link' }];
    for (const c of cases) expect(site.channelProblems(c, HOSTS)).toEqual(channelProblems(c, HOSTS));
  });
});

describe('opening external links', () => {
  it('only safe, allowed urls are opened', () => {
    expect(isSafeSupportUrl('https://www.patreon.com/novarah', HOSTS)).toBe(true);
    expect(isSafeSupportUrl('http://www.patreon.com/novarah', HOSTS)).toBe(false);
    expect(isSafeSupportUrl('https://evil.example/', HOSTS)).toBe(false);
    expect(isSafeSupportUrl('not a url', HOSTS)).toBe(false);
  });

  it('in a browser it opens a new tab with noopener,noreferrer', async () => {
    const open = vi.fn(() => null);
    const win = { open } as unknown as Window;
    expect(await openExternal('https://www.patreon.com/novarah', HOSTS, win)).toBe(true);
    expect(open).toHaveBeenCalledWith('https://www.patreon.com/novarah', '_blank', 'noopener,noreferrer');
    expect(await openExternal('https://evil.example/', HOSTS, win)).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('in the Windows and Android apps (Tauri) it hands the url to the opener plugin and does not open a webview window', async () => {
    const invoke = vi.fn(() => Promise.resolve());
    const open = vi.fn();
    const win = { open, __TAURI_INTERNALS__: { invoke } } as unknown as Window;
    expect(await openExternal('https://ko-fi.com/novarah', HOSTS, win)).toBe(true);
    expect(invoke).toHaveBeenCalledWith('plugin:opener|open_url', { url: 'https://ko-fi.com/novarah' });
    expect(open).not.toHaveBeenCalled();
  });

  it('an older app build without the plugin falls back to a new tab instead of failing silently', async () => {
    const invoke = vi.fn(() => Promise.reject(new Error('plugin missing')));
    const open = vi.fn(() => null);
    const win = { open, __TAURI_INTERNALS__: { invoke } } as unknown as Window;
    expect(await openExternal('https://ko-fi.com/novarah', HOSTS, win)).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('the support promises are not contradicted anywhere in the game data', () => {
  it('no source file ties gameplay to a contribution or asks for card details', () => {
    const files = ['src/ui/SupportScreen.ts', 'src/support/supportLinks.ts', 'public/download/index.html', 'public/download/site.js'];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/card number|cvv|cvc|expiry|iban|account number|routing number/i);
    }
    const page = readFileSync('public/download/index.html', 'utf8');
    expect(page).toMatch(/not tax-deductible/i);
    expect(page).toMatch(/no advantage for anyone who contributes/i);
    expect(page).toMatch(/never collect card or bank details/i);
  });
});
