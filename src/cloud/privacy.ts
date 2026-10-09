/**
 * The player's privacy choices. Optional gameplay statistics are OFF until the player turns them on, can be turned
 * off again at any time, and are separate from what a signed-in account needs to work (sign-in and cloud saves).
 */
export interface PrivacyPrefs {
  schema: 1;
  /** Share anonymous gameplay statistics (mission results, vehicles, where drivers struggle). */
  analytics: boolean;
  /** The player has seen the question and answered it (yes or no). */
  decided: boolean;
  decidedAt: number | null;
}

export const PRIVACY_KEY = 'cbhr.v1.privacy';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export class PrivacyStore {
  private prefs: PrivacyPrefs = { schema: 1, analytics: false, decided: false, decidedAt: null };
  private readonly listeners = new Set<(p: PrivacyPrefs) => void>();

  constructor(private readonly storage: StorageLike | null) {
    try {
      const raw = storage?.getItem(PRIVACY_KEY);
      if (raw) {
        const o = JSON.parse(raw) as Partial<PrivacyPrefs>;
        if (o && o.schema === 1) this.prefs = { schema: 1, analytics: o.analytics === true, decided: o.decided === true, decidedAt: typeof o.decidedAt === 'number' ? o.decidedAt : null };
      }
    } catch {
      /* corrupt: the safe default (off, undecided) applies */
    }
  }

  get analytics(): boolean {
    return this.prefs.analytics;
  }

  get decided(): boolean {
    return this.prefs.decided;
  }

  get value(): PrivacyPrefs {
    return { ...this.prefs };
  }

  setAnalytics(on: boolean, now = Date.now()): void {
    this.prefs = { schema: 1, analytics: on, decided: true, decidedAt: now };
    try {
      this.storage?.setItem(PRIVACY_KEY, JSON.stringify(this.prefs));
    } catch {
      /* storage unavailable: the choice holds for this session */
    }
    for (const l of this.listeners) l(this.value);
  }

  /** Records "ask me no more" without turning anything on. */
  dismiss(now = Date.now()): void {
    if (this.prefs.decided) return;
    this.setAnalytics(false, now);
  }

  onChange(l: (p: PrivacyPrefs) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
