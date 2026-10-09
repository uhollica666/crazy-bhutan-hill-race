const ADJECTIVES = ['Swift', 'Brave', 'Mighty', 'Calm', 'Lucky', 'Bold', 'Snowy', 'Misty', 'Golden', 'Clever', 'Steady', 'Nimble', 'Sunny', 'Wild', 'Quiet', 'Proud'];
const ANIMALS = ['Yak', 'Takin', 'Dragon', 'Crane', 'Tiger', 'Eagle', 'Panda', 'Marmot', 'Falcon', 'Ibex', 'Pika', 'Monal', 'Leopard', 'Raven', 'Bear', 'Ram'];

/** A short stable hash of any text (FNV-1a), used only to pick words. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A friendly default display name derived from the player id, such as "Swift Yak 42". Never derived from an email. */
export function generateName(seed: string): string {
  const h = hash(seed);
  return `${ADJECTIVES[h % ADJECTIVES.length]} ${ANIMALS[(h >>> 8) % ANIMALS.length]} ${10 + ((h >>> 16) % 90)}`;
}

export const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*[A-Za-z0-9]$/;

/** Validates a name the player typed: 3-20 characters, letters, digits, spaces and . _ - only. */
export function validateDisplayName(raw: string): { ok: true; name: string } | { ok: false; message: string } {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < 3 || name.length > 20) return { ok: false, message: 'Use 3 to 20 characters.' };
  if (!NAME_PATTERN.test(name)) return { ok: false, message: 'Use letters, numbers, spaces, dots, dashes and underscores only.' };
  return { ok: true, name };
}
