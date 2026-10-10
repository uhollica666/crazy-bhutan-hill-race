/**
 * Route 0 progress, kept in its own small localStorage document so it never touches the game save, the cloud payload or
 * Firebase. It records only that the Academy was completed (or skipped) and which lessons were finished.
 */
export const TUTORIAL_KEY = 'cbhr.tutorial.v1';

export interface TutorialData {
  schema: 1;
  /** "Done, start the game" was pressed at least once. */
  completed: boolean;
  completedAt: number | null;
  /** A fresh player chose "Skip for now": do not offer the Academy automatically again. */
  skipped: boolean;
  /** Lesson ids finished at least once. */
  lessons: string[];
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const fresh = (): TutorialData => ({ schema: 1, completed: false, completedAt: null, skipped: false, lessons: [] });

export class TutorialStore {
  data: TutorialData = fresh();

  constructor(private readonly storage: StorageLike | null) {
    try {
      const raw = storage?.getItem(TUTORIAL_KEY);
      if (raw) {
        const o = JSON.parse(raw) as Partial<TutorialData>;
        if (o && o.schema === 1) {
          this.data = {
            schema: 1,
            completed: o.completed === true,
            completedAt: typeof o.completedAt === 'number' ? o.completedAt : null,
            skipped: o.skipped === true,
            lessons: Array.isArray(o.lessons) ? o.lessons.filter((x): x is string => typeof x === 'string').slice(0, 20) : [],
          };
        }
      }
    } catch {
      /* corrupt: start again */
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(TUTORIAL_KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable: the choice lasts until the page closes */
    }
  }

  get completed(): boolean {
    return this.data.completed;
  }

  markLesson(id: string): void {
    if (this.data.lessons.includes(id)) return;
    this.data.lessons.push(id);
    this.save();
  }

  markCompleted(now = Date.now()): void {
    this.data.completed = true;
    this.data.completedAt = this.data.completedAt ?? now;
    this.data.skipped = false;
    this.save();
  }

  markSkipped(): void {
    this.data.skipped = true;
    this.save();
  }

  /** Developer reset: back to a brand-new player. */
  reset(): void {
    this.data = fresh();
    try {
      this.storage?.removeItem(TUTORIAL_KEY);
    } catch {
      /* ignore */
    }
  }

  /** Offer the Academy automatically: only to a player who has never completed or skipped it and has no mission records. */
  shouldOffer(hasProgress: boolean): boolean {
    return !this.data.completed && !this.data.skipped && !hasProgress;
  }
}
