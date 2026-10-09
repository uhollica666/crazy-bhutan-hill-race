/**
 * Player feedback: payload schema, validation and the submission seam.
 *
 * Honesty rules (see docs/ARCHITECTURE.md, "Feedback"):
 *  - A submission is reported as `sent` only when a configured transport really delivered it.
 *  - With no endpoint configured the game offers LOCAL options only (save a draft, export a file, copy the
 *    text) and says plainly that nothing has been sent to Novarah.
 *  - Nothing is transmitted silently: device details and a contact address are opt-in fields the player sees.
 */

export const FEEDBACK_SCHEMA = 'cbhr.feedback' as const;
export const FEEDBACK_SCHEMA_VERSION = 1 as const;
export const FEEDBACK_DRAFTS_KEY = 'cbhr.feedback.drafts';
export const MAX_TEXT = 1200;
export const MAX_DRAFTS = 20;

export type Difficulty = 'tooEasy' | 'aboutRight' | 'tooDifficult';
export type PriceRange = 'none' | 'under5' | '5to10' | '10to20' | '20to40' | 'over40';

export interface FeedbackDevice {
  userAgent: string;
  platform: string;
  language: string;
  screen: string;
  viewport: string;
  pixelRatio: number;
  touch: boolean;
  quality: string;
  appVersion: string;
}

export interface FeedbackInterest {
  playLargerVersion: boolean | null;
  considerPurchasingFullGame: boolean | null;
  priceRange: PriceRange | null;
  voluntarySupport: boolean | null;
}

/** What the form edits. Every field except `rating` is optional. */
export interface FeedbackForm {
  rating: number;
  gameplay: string;
  controls: string;
  performance: string;
  difficulty: Difficulty | null;
  favourite: string;
  improve: string;
  add: string;
  bugs: string;
  /** Voluntary contact (email or handle) so Novarah could reply. Never required. */
  contact: string;
  includeDevice: boolean;
  interest: FeedbackInterest;
}

/** The versioned document handed to a transport. */
export interface FeedbackPayload {
  schema: typeof FEEDBACK_SCHEMA;
  schemaVersion: typeof FEEDBACK_SCHEMA_VERSION;
  createdAt: string;
  appVersion: string;
  /** Where in the game the form was opened from. */
  origin: 'menu' | 'settings' | 'results' | 'about';
  rating: number;
  gameplay: string;
  controls: string;
  performance: string;
  difficulty: Difficulty | null;
  favourite: string;
  improve: string;
  add: string;
  bugs: string;
  contact: string | null;
  device: FeedbackDevice | null;
  interest: FeedbackInterest;
}

export const emptyInterest = (): FeedbackInterest => ({
  playLargerVersion: null,
  considerPurchasingFullGame: null,
  priceRange: null,
  voluntarySupport: null,
});

export const emptyForm = (): FeedbackForm => ({
  rating: 0,
  gameplay: '',
  controls: '',
  performance: '',
  difficulty: null,
  favourite: '',
  improve: '',
  add: '',
  bugs: '',
  contact: '',
  includeDevice: false,
  interest: emptyInterest(),
});

export interface ValidationResult {
  ok: boolean;
  /** Field name -> message. */
  errors: Record<string, string>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HANDLE = /^[@\w.-]{2,40}$/;
const DIFFICULTIES: Difficulty[] = ['tooEasy', 'aboutRight', 'tooDifficult'];
const PRICES: PriceRange[] = ['none', 'under5', '5to10', '10to20', '20to40', 'over40'];
// Deliberately remove non-printing control characters from exported feedback.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Strips control characters and caps the length. Never throws. */
export function cleanText(v: unknown, max = MAX_TEXT): string {
  if (typeof v !== 'string') return '';
  return v.replace(CONTROL_CHARACTERS, '').trim().slice(0, max);
}

export function validateFeedback(form: FeedbackForm): ValidationResult {
  const errors: Record<string, string> = {};
  if (!Number.isInteger(form.rating) || form.rating < 1 || form.rating > 5)
    errors.rating = 'Please choose a star rating from 1 to 5.';
  for (const key of ['gameplay', 'controls', 'performance', 'favourite', 'improve', 'add', 'bugs'] as const) {
    if (form[key].length > MAX_TEXT) errors[key] = `Please keep this under ${MAX_TEXT} characters.`;
  }
  if (form.difficulty !== null && !DIFFICULTIES.includes(form.difficulty))
    errors.difficulty = 'Please choose one of the options.';
  const contact = form.contact.trim();
  if (contact && !EMAIL.test(contact) && !HANDLE.test(contact))
    errors.contact = 'That does not look like an email address. You can leave it empty.';
  if (form.interest.priceRange !== null && !PRICES.includes(form.interest.priceRange))
    errors.priceRange = 'Please choose one of the options.';
  const anything =
    form.gameplay.trim() ||
    form.controls.trim() ||
    form.performance.trim() ||
    form.favourite.trim() ||
    form.improve.trim() ||
    form.add.trim() ||
    form.bugs.trim();
  if (!errors.rating && !anything && form.rating < 1) errors.rating = 'Please choose a star rating.';
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Builds the versioned payload. Throws only if the form is invalid; callers validate first. */
export function buildPayload(
  form: FeedbackForm,
  ctx: { appVersion: string; origin: FeedbackPayload['origin']; device: FeedbackDevice | null; now?: Date },
): FeedbackPayload {
  const v = validateFeedback(form);
  if (!v.ok) throw new Error(`Invalid feedback: ${Object.values(v.errors).join(' ')}`);
  const contact = cleanText(form.contact, 120);
  return {
    schema: FEEDBACK_SCHEMA,
    schemaVersion: FEEDBACK_SCHEMA_VERSION,
    createdAt: (ctx.now ?? new Date()).toISOString(),
    appVersion: ctx.appVersion,
    origin: ctx.origin,
    rating: form.rating,
    gameplay: cleanText(form.gameplay),
    controls: cleanText(form.controls),
    performance: cleanText(form.performance),
    difficulty: form.difficulty,
    favourite: cleanText(form.favourite),
    improve: cleanText(form.improve),
    add: cleanText(form.add),
    bugs: cleanText(form.bugs),
    contact: contact || null,
    // Only included when the player ticked the box.
    device: form.includeDevice ? ctx.device : null,
    interest: { ...form.interest },
  };
}

/** Reads the device facts shown to the player in the disclosure. Nothing here identifies a person or place. */
export function collectDevice(appVersion: string, quality: string, win: Window = window): FeedbackDevice {
  const nav = win.navigator;
  return {
    userAgent: nav.userAgent,
    platform: nav.platform || 'unknown',
    language: nav.language,
    screen: `${win.screen.width}x${win.screen.height}`,
    viewport: `${win.innerWidth}x${win.innerHeight}`,
    pixelRatio: Math.round(win.devicePixelRatio * 100) / 100,
    touch: (nav.maxTouchPoints ?? 0) > 0,
    quality,
    appVersion,
  };
}

/** Plain-English summary of the device block, shown before the player decides to include it. */
export function describeDevice(d: FeedbackDevice): string {
  return `Browser: ${d.userAgent}\nPlatform: ${d.platform}\nLanguage: ${d.language}\nScreen: ${d.screen} (viewport ${d.viewport}, pixel ratio ${d.pixelRatio})\nTouch screen: ${d.touch ? 'yes' : 'no'}\nGraphics quality: ${d.quality}\nGame version: ${d.appVersion}`;
}

// ------------------------------------------------------------------------------ transports

export type SubmitResult =
  { status: 'sent'; via: string; reference?: string } | { status: 'not-sent'; reason: string };

export interface FeedbackTransport {
  /** Short name for logs ("http-endpoint"). */
  readonly id: string;
  /** True when this transport can really deliver to a remote service. */
  readonly delivers: boolean;
  submit(payload: FeedbackPayload): Promise<SubmitResult>;
}

/** Used when nothing is configured: it never delivers and says so. */
export class NoRemoteTransport implements FeedbackTransport {
  readonly id = 'none';
  readonly delivers = false;
  async submit(): Promise<SubmitResult> {
    return { status: 'not-sent', reason: 'No feedback service is configured in this build.' };
  }
}

/**
 * POSTs the payload as JSON to a configured HTTPS endpoint. `sent` is returned only for a 2xx response.
 * No credentials are embedded; the endpoint must accept anonymous, rate-limited submissions server-side
 * (see docs/ARCHITECTURE.md for the intended Firebase adapter, which is NOT part of Stage 3).
 */
export class HttpEndpointTransport implements FeedbackTransport {
  readonly id = 'http-endpoint';
  readonly delivers = true;
  constructor(
    private readonly endpoint: string,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
    private readonly timeoutMs = 10000,
  ) {}

  async submit(payload: FeedbackPayload): Promise<SubmitResult> {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), this.timeoutMs) : null;
    try {
      const res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: ctl?.signal,
      });
      if (!res.ok)
        return { status: 'not-sent', reason: `The feedback service answered with an error (${res.status}).` };
      return { status: 'sent', via: this.id };
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      return {
        status: 'not-sent',
        reason: aborted
          ? 'The feedback service did not answer in time.'
          : 'Could not reach the feedback service. Check your connection.',
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export interface FeedbackConfig {
  /** HTTPS URL that accepts the JSON payload, or null. */
  endpoint: string | null;
  /** Mail address for the optional "email it yourself" action, or null. */
  mailto: string | null;
}

/** Reads build-time configuration. Both values are absent unless the publisher sets them in the build env. */
export function readFeedbackConfig(env: Record<string, string | boolean | undefined>): FeedbackConfig {
  const endpoint = typeof env.VITE_FEEDBACK_ENDPOINT === 'string' ? env.VITE_FEEDBACK_ENDPOINT.trim() : '';
  const mailto = typeof env.VITE_FEEDBACK_MAILTO === 'string' ? env.VITE_FEEDBACK_MAILTO.trim() : '';
  return {
    endpoint: /^https:\/\/[^\s]+$/.test(endpoint) ? endpoint : null,
    mailto: EMAIL.test(mailto) ? mailto : null,
  };
}

export function createTransport(cfg: FeedbackConfig, fetchImpl?: typeof fetch): FeedbackTransport {
  return cfg.endpoint ? new HttpEndpointTransport(cfg.endpoint, fetchImpl) : new NoRemoteTransport();
}

// ----------------------------------------------------------------------------- local drafts

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface Draft {
  id: string;
  savedAt: string;
  payload: FeedbackPayload;
}

/** Locally stored feedback. These are NOT sent anywhere; the UI always labels them as saved on this device. */
export class DraftStore {
  private memory: Draft[] = [];
  private serial = 0;
  persisted = false;
  constructor(private readonly storage: StorageLike | null) {
    this.memory = this.read();
  }

  private read(): Draft[] {
    try {
      const raw = this.storage?.getItem(FEEDBACK_DRAFTS_KEY);
      if (!raw) return [];
      const arr: unknown = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter(isDraft).slice(-MAX_DRAFTS);
    } catch {
      return [];
    }
  }

  list(): Draft[] {
    return [...this.memory];
  }

  add(payload: FeedbackPayload, now = new Date()): Draft {
    let id: string;
    do {
      id = `${now.getTime().toString(36)}-${this.serial++}`;
    } while (this.memory.some((d) => d.id === id));
    const draft: Draft = { id, savedAt: now.toISOString(), payload };
    this.memory = [...this.memory, draft].slice(-MAX_DRAFTS);
    this.write();
    return draft;
  }

  remove(id: string): void {
    this.memory = this.memory.filter((d) => d.id !== id);
    this.write();
  }

  clear(): void {
    this.memory = [];
    this.write();
  }

  /** Returns false if the browser refused the write (the in-memory copy still holds it until reload). */
  private write(): boolean {
    try {
      if (!this.storage) return (this.persisted = false);
      this.storage.setItem(FEEDBACK_DRAFTS_KEY, JSON.stringify(this.memory));
      return (this.persisted = true);
    } catch {
      return (this.persisted = false);
    }
  }
}

function isDraft(v: unknown): v is Draft {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Draft;
  return typeof d.id === 'string' && typeof d.savedAt === 'string' && d.payload?.schema === FEEDBACK_SCHEMA;
}

// ------------------------------------------------------------------------------ export text

/** A readable text rendering for copy/paste and for a mail body. */
export function feedbackAsText(p: FeedbackPayload): string {
  const L: string[] = [];
  const add = (label: string, v: string | null | number | boolean): void => {
    if (v === null || v === '' || v === false) return;
    L.push(`${label}: ${v === true ? 'yes' : v}`);
  };
  L.push(`Crazy Bhutan Hill Race feedback (v${p.appVersion}, ${p.createdAt})`);
  add('Overall rating (1-5)', p.rating);
  add('Gameplay', p.gameplay);
  add('Controls', p.controls);
  add('Graphics / performance', p.performance);
  add('Difficulty', p.difficulty);
  add('Favourite feature', p.favourite);
  add('To improve', p.improve);
  add('To add', p.add);
  add('Bugs', p.bugs);
  add('Contact (voluntary)', p.contact);
  const i = p.interest;
  if (i.playLargerVersion !== null) add('Would play a larger version', i.playLargerVersion ? 'yes' : 'no');
  if (i.considerPurchasingFullGame !== null)
    add('Would consider buying a future full game', i.considerPurchasingFullGame ? 'yes' : 'no');
  add('Reasonable price', i.priceRange);
  if (i.voluntarySupport !== null)
    add('Might voluntarily support development', i.voluntarySupport ? 'yes' : 'no');
  if (p.device) L.push('', 'Device:', describeDevice(p.device));
  return L.join('\n');
}

/** mailto: URL for the optional "email it" action. Returns null when no recipient is configured. */
export function mailtoUrl(cfg: FeedbackConfig, p: FeedbackPayload): string | null {
  if (!cfg.mailto) return null;
  const subject = encodeURIComponent(`Crazy Bhutan Hill Race feedback (${p.rating}/5)`);
  const body = encodeURIComponent(feedbackAsText(p).slice(0, 1800));
  return `mailto:${cfg.mailto}?subject=${subject}&body=${body}`;
}

export function exportFileName(p: FeedbackPayload): string {
  return `cbhr-feedback-${p.createdAt.slice(0, 10)}.json`;
}
