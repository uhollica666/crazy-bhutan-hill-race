import type { DraftStore, FeedbackPayload, FeedbackTransport, SubmitResult } from '../services/feedback';
import type { CloudService } from './CloudService';

/** The document the rules accept (see `feedback/{id}` in firestore.rules). The server adds uid and createdAt. */
export function toFeedbackDoc(p: FeedbackPayload): Record<string, unknown> {
  return {
    clientAt: Date.parse(p.createdAt) || Date.now(),
    appVersion: p.appVersion,
    origin: p.origin,
    rating: p.rating,
    gameplay: p.gameplay,
    controls: p.controls,
    graphics: p.graphics,
    performance: p.performance,
    difficulty: p.difficulty,
    favourite: p.favourite,
    improve: p.improve,
    add: p.add,
    bugs: p.bugs,
    contact: p.contact,
    device: p.device ? { ...p.device } : null,
    interest: { ...p.interest },
  };
}

const timeout = <T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve('timeout'), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });

/**
 * Sends feedback to Firestore. "sent" means the SERVER accepted the document: the backend resolves only after the
 * server's acknowledgement, never on a local-cache write, and a timeout is reported as not sent (retryable), never as
 * success. The submission id doubles as the document id, so a retry cannot create a second copy.
 */
export class FirestoreFeedbackTransport implements FeedbackTransport {
  readonly id = 'firestore';
  readonly delivers = true;

  constructor(
    private readonly cloud: CloudService,
    private readonly opts: { timeoutMs?: number; waitForUserMs?: number } = {},
  ) {}

  /** True only when the server confirms it holds this submission (never guessed). */
  private async delivered(backend: NonNullable<CloudService['backendRef']>, id: string): Promise<boolean> {
    try {
      return await backend.feedbackExists(id);
    } catch {
      return false;
    }
  }

  async submit(p: FeedbackPayload): Promise<SubmitResult> {
    const backend = this.cloud.backendRef;
    if (!backend) return { status: 'not-sent', reason: 'Online features are not available in this build.', retryable: false };
    const user = await this.cloud.whenUser(this.opts.waitForUserMs ?? 6000);
    if (!user) {
      return {
        status: 'not-sent',
        reason: this.cloud.status.online ? 'Not connected to the online service yet.' : 'You are offline.',
        retryable: true,
      };
    }
    try {
      const r = await timeout(backend.submitFeedback(p.submissionId, toFeedbackDoc(p)), this.opts.timeoutMs ?? 20_000);
      if (r === 'timeout') {
        // The confirmation may have been lost on the way back: ask the server directly before saying anything.
        if (await this.delivered(backend, p.submissionId)) return { status: 'sent', via: this.id, reference: p.submissionId };
        return { status: 'not-sent', reason: 'The online service did not confirm in time.', retryable: true };
      }
      return { status: 'sent', via: this.id, reference: p.submissionId };
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'offline' || code === 'unknown') return { status: 'not-sent', reason: code === 'offline' ? 'You are offline.' : 'The online service had a problem.', retryable: true };
      // A refusal of an id we already tried can mean the first attempt actually arrived: check before reporting failure.
      if (await this.delivered(backend, p.submissionId)) return { status: 'sent', via: this.id, reference: p.submissionId };
      return { status: 'not-sent', reason: 'The online service did not accept this feedback.', retryable: false };
    }
  }
}

// ---------------------------------------------------------------------------------------- the outbox

export const FEEDBACK_SENT_KEY = 'cbhr.feedback.sent';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** A short log of what has been delivered (ids and times only, never the text). */
export class SentLog {
  private items: { id: string; at: string }[] = [];

  constructor(private readonly storage: StorageLike | null) {
    try {
      const raw = storage?.getItem(FEEDBACK_SENT_KEY);
      const arr: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) this.items = arr.filter((x) => x && typeof x.id === 'string' && typeof x.at === 'string').slice(-10);
    } catch {
      /* corrupt: start empty */
    }
  }

  add(id: string, at = new Date()): void {
    this.items = [...this.items.filter((x) => x.id !== id), { id, at: at.toISOString() }].slice(-10);
    try {
      this.storage?.setItem(FEEDBACK_SENT_KEY, JSON.stringify(this.items));
    } catch {
      /* storage unavailable */
    }
  }

  get last(): string | null {
    return this.items.at(-1)?.at ?? null;
  }

  has(id: string): boolean {
    return this.items.some((x) => x.id === id);
  }

  get count(): number {
    return this.items.length;
  }
}

export interface FeedbackStatus {
  /** Saved on this device only (no service, or the player chose not to send). */
  drafts: number;
  /** Waiting for the network or the service. */
  pending: number;
  /** The service refused them. */
  failed: number;
  lastSentAt: string | null;
}

export function feedbackStatus(drafts: DraftStore, sent: SentLog): FeedbackStatus {
  const list = drafts.list();
  return {
    drafts: list.filter((d) => (d.status ?? 'draft') === 'draft').length,
    pending: list.filter((d) => d.status === 'pending').length,
    failed: list.filter((d) => d.status === 'failed').length,
    lastSentAt: sent.last,
  };
}

/**
 * Tries to deliver every queued copy, one at a time, oldest first. A copy leaves the device only after the server
 * confirmed it; a network problem leaves it queued for the next attempt.
 */
export async function flushFeedbackOutbox(drafts: DraftStore, transport: FeedbackTransport, sent: SentLog): Promise<number> {
  let delivered = 0;
  for (const d of drafts.pending()) {
    if (sent.has(d.payload.submissionId)) {
      drafts.remove(d.id); // already delivered earlier (the confirmation arrived after the draft was kept)
      continue;
    }
    const r = await transport.submit(d.payload);
    if (r.status === 'sent') {
      sent.add(d.payload.submissionId);
      drafts.remove(d.id);
      delivered++;
    } else if (r.retryable) {
      drafts.update(d.id, { attempts: (d.attempts ?? 0) + 1, lastError: r.reason });
      break; // the network or service is struggling: stop and try again later
    } else {
      drafts.update(d.id, { status: 'failed', attempts: (d.attempts ?? 0) + 1, lastError: r.reason });
    }
  }
  return delivered;
}
