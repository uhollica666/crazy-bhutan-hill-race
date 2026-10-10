// Voluntary-support links: the rules that decide whether a payment channel may be shown as ACTIVE.
// Shared by the launch site (this folder). The game keeps an equivalent copy in src/support/supportLinks.ts; tests/support.test.ts runs
// the same cases against both so they cannot drift apart.
//
// A channel is active only when ALL of these hold; otherwise it is shown as "being set up" and no payment control is rendered:
//   - status is exactly "verified" and a verifiedOn date (YYYY-MM-DD) is recorded by the developer;
//   - link channels: an https URL whose host is in the config's allowedHosts (no other scheme, no credentials in the URL, no raw IP);
//   - QR channels: an image path under support/ in this site (png, webp or jpg), supplied and verified by the developer.
// Nothing here ever builds a payment form or asks for card or bank details.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const QR_PATH = /^support\/[A-Za-z0-9._-]+\.(png|webp|jpg)$/;

/** Why a channel is not (yet) active, or an empty list when it is. */
export function channelProblems(channel, allowedHosts) {
  const problems = [];
  if (!channel || typeof channel !== 'object') return ['not an object'];
  if (channel.status !== 'verified') problems.push('status is not "verified"');
  if (typeof channel.verifiedOn !== 'string' || !DATE.test(channel.verifiedOn)) problems.push('no verifiedOn date');
  if (channel.type === 'link') {
    let url = null;
    try {
      url = new URL(String(channel.url));
    } catch {
      problems.push('no valid URL');
    }
    if (url) {
      if (url.protocol !== 'https:') problems.push('URL is not https');
      if (url.username || url.password) problems.push('URL contains credentials');
      if (!Array.isArray(allowedHosts) || !allowedHosts.includes(url.hostname.toLowerCase())) problems.push('host is not on the allow-list');
    }
  } else if (channel.type === 'qr') {
    if (typeof channel.qrImage !== 'string' || !QR_PATH.test(channel.qrImage)) problems.push('no valid QR image path');
  } else {
    problems.push('unknown channel type');
  }
  return problems;
}

export const isChannelActive = (channel, allowedHosts) => channelProblems(channel, allowedHosts).length === 0;

/** The channels that may be shown as active, in config order. Anything malformed is simply absent. */
export function activeChannels(config) {
  if (!config || config.schema !== 1 || !Array.isArray(config.channels)) return [];
  return config.channels.filter((c) => isChannelActive(c, config.allowedHosts));
}

/** Channels still being set up (shown as "coming", never as a button). */
export function pendingChannels(config) {
  if (!config || config.schema !== 1 || !Array.isArray(config.channels)) return [];
  return config.channels.filter((c) => c && typeof c === 'object' && !isChannelActive(c, config.allowedHosts));
}
