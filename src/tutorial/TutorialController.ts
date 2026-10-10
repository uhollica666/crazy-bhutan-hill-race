import type { Scene } from 'three';
import type { ConditionsDef, SurfaceId } from '../data/types';
import type { MissionRuntime } from '../gameplay/MissionRuntime';
import type { VehicleInput } from '../physics/types';
import { TutorialView } from '../render/TutorialView';
import type { TutorialUI } from '../ui/TutorialUI';
import { CHIPS, ESSENTIAL_IDS, LESSONS } from './lessons';
import type { EventCounts, Lesson, LessonHost, Step, StepCtx } from './lessons';
import type { TutorialStore } from './TutorialStore';

export interface TutorialHost {
  scene: Scene;
  toast(text: string): void;
  flash(title: string, sub?: string): void;
  /** Teleport the car to `m` metres from the start line, facing along the road. */
  placeAt(m: number): void;
  setConditions(c: Pick<ConditionsDef, 'weather' | 'time'>): void;
  highlight(selectors: readonly string[]): void;
  sound(kind: 'step' | 'lesson'): void;
}

const BARRIER_AHEAD = 6;
/** Progress past this does not count while a lesson is open: it sits just short of the next lesson's checkpoint. */
const CAP_AHEAD = 10;

/**
 * Drives the Driver's Academy. It reads the real mission state every frame, so every step succeeds only when the player
 * actually does the thing, and it never decides the outcome of the run: the race session still reports the finish.
 * It holds the simulation (via `holding`) while an explanation card is open, and keeps a closed barrier ahead of the
 * current lesson so the road cannot be skipped through.
 */
export class TutorialController {
  /** True while an explanation card is open: the game freezes the car until "Got it". */
  holding = false;
  private li = 0;
  private si = 0;
  private entered = false;
  private done = new Set<string>();
  private lf: Record<string, number> = {};
  private sf: Record<string, number> = {};
  private barrierIds: number[] = [];
  private readonly view: TutorialView;
  private readonly offs: (() => void)[] = [];
  private cardText: { title: string; text: string } | null = null;
  private active = new Set<string>();
  private lastRender = '';
  private lastActive = '';
  private ended = false;
  private readonly ev: EventCounts = {
    recovered: 0,
    touched: 0,
    impacts: 0,
    paused: 0,
    resumed: 0,
    boarded: new Set(),
    refuelled: 0,
    repaired: 0,
    gone: new Set(),
  };
  private readonly lessonHost: LessonHost;

  constructor(
    private readonly rt: MissionRuntime,
    private readonly host: TutorialHost,
    private readonly ui: TutorialUI,
    private readonly store: TutorialStore,
  ) {
    this.view = new TutorialView(host.scene, rt.course);
    this.lessonHost = {
      toast: (t) => host.toast(t),
      placeAt: (m) => host.placeAt(m),
      setConditions: (c) => host.setConditions(c),
      resetHazards: (ids) => rt.hazards?.resetIds(ids),
    };
    const e = rt.events;
    this.offs.push(
      e.on('recovered', () => this.ev.recovered++),
      e.on('touched', () => this.ev.touched++),
      e.on('impact', () => this.ev.impacts++),
      e.on('boarded', (b) => this.ev.boarded.add(b.stop.def.id)),
      e.on('serviceDone', (s) => (s.kind === 'refuel' ? this.ev.refuelled++ : this.ev.repaired++)),
      e.on('hazard', (h) => {
        if (h.type === 'gone') this.ev.gone.add(h.hazard.def.id);
      }),
    );
    this.beginLesson(0, false);
  }

  // ---------------------------------------------------------------- queries

  /** For the debug API and tests. */
  snapshot(): { lesson: string | null; step: string | null; entered: boolean; holding: boolean; essentialsDone: boolean; done: string[]; canFinish: boolean } {
    const lesson = this.lesson;
    return {
      lesson: lesson?.id ?? null,
      step: lesson?.steps[this.si]?.id ?? null,
      entered: this.entered,
      holding: this.holding,
      essentialsDone: this.essentialsDone,
      done: [...this.done],
      canFinish: this.canFinish,
    };
  }

  get lesson(): Lesson | null {
    return LESSONS[this.li] ?? null;
  }

  get essentialsDone(): boolean {
    return ESSENTIAL_IDS.every((id) => this.done.has(id));
  }

  get lessonsDone(): number {
    return this.done.size;
  }

  /** "Done, start the game" is available once the essentials are done (or the Academy was completed before). */
  get canFinish(): boolean {
    return this.essentialsDone || this.store.completed;
  }

  private get start(): number {
    return this.rt.course.startS;
  }

  /** Short text for the HUD objective pill (the route has no single objective: it has lessons). */
  objectiveLabel(): string {
    const lesson = this.lesson;
    if (this.ended) return 'Academy complete';
    if (!lesson) return 'Finish the route: Academy graduation';
    return `Lesson ${this.li + 1} of ${LESSONS.length}: ${lesson.title}`;
  }

  // ------------------------------------------------------------------ flow

  private ctx(dt: number, cmd: VehicleInput): StepCtx {
    const rt = this.rt;
    return {
      m: rt.s - this.start,
      dt,
      speedKmh: Math.abs(rt.body.speed) * 3.6,
      speed: rt.body.speed,
      cmd,
      rt,
      sf: this.sf,
      lf: this.lf,
      ev: this.ev,
      host: this.lessonHost,
      onSurface: (id: SurfaceId) => rt.body.wheels.some((w) => w.inContact && w.surface.id === id),
    };
  }

  /** Puts lesson `i` in place: its barrier, progress cap and (once the car arrives) its introduction. */
  private beginLesson(i: number, retry: boolean): void {
    this.li = i;
    this.si = 0;
    this.entered = false;
    this.lf = {};
    this.sf = {};
    const lesson = LESSONS[i];
    if (!lesson) return;
    this.raiseBarrier(lesson);
    if (retry) {
      this.lessonHost.resetHazards(lesson.hazards ?? []);
      this.lessonHost.placeAt(lesson.from);
      this.enterLesson(false);
    }
    this.lastRender = '';
  }

  private raiseBarrier(lesson: Lesson): void {
    this.clearBarrier();
    // The last lesson has no barrier: finishing the route is its end.
    if (lesson === LESSONS[LESSONS.length - 1]) {
      this.rt.progressCap = Infinity;
      return;
    }
    const s = this.start + lesson.to + BARRIER_AHEAD;
    this.rt.progressCap = this.start + lesson.to + CAP_AHEAD;
    this.view.raise(s);
    const { road, obstacles } = this.rt.course;
    const p = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
    road.at(s, p);
    const half = road.wallOffset;
    const n = Math.ceil((half * 2) / 2.1);
    for (let k = 0; k < n; k++) {
      const lat = -half + (k + 0.5) * ((half * 2) / n);
      const id = obstacles.add(p.x - p.tz * lat, p.z + p.tx * lat, 1.3, { push: 1, restitution: 0.05, tag: 'gate' });
      if (id >= 0) this.barrierIds.push(id);
    }
  }

  private clearBarrier(): void {
    for (const id of this.barrierIds) this.rt.course.obstacles.remove(id);
    this.barrierIds = [];
  }

  private lowerBarrier(): void {
    for (const id of this.barrierIds) this.rt.course.obstacles.remove(id);
    this.barrierIds = [];
    this.view.lower();
  }

  private enterLesson(withCard = true): void {
    const lesson = this.lesson;
    if (!lesson) return;
    this.entered = true;
    this.si = 0;
    this.sf = {};
    this.lf = {};
    lesson.setup?.(this.ctx(0, { steer: 0, throttle: 0, brake: 0 }));
    if (withCard) this.openCard(`Lesson ${this.li + 1}: ${lesson.title}`, lesson.intro);
    this.beginStep(false);
  }

  private beginStep(withCard = true): void {
    const lesson = this.lesson;
    const step = lesson?.steps[this.si];
    if (!lesson || !step) return;
    this.sf = {};
    step.enter?.(this.ctx(0, { steer: 0, throttle: 0, brake: 0 }));
    this.host.highlight(step.highlight ?? []);
    if (withCard && step.card) this.openCard(lesson.title, step.card);
    this.lastRender = '';
  }

  private openCard(title: string, text: string): void {
    this.cardText = { title, text };
    this.holding = true;
    this.lastRender = '';
  }

  /** "Got it": resume driving. */
  dismissCard(): void {
    this.cardText = null;
    this.holding = false;
    this.lastRender = '';
  }

  /** Shows the current explanation again (the lesson introduction, or the step's card if it has one). */
  replayTip(): void {
    const lesson = this.lesson;
    if (!lesson) return;
    const step = lesson.steps[this.si];
    if (this.entered && step?.card) this.openCard(lesson.title, step.card);
    else this.openCard(`Lesson ${this.li + 1}: ${lesson.title}`, lesson.intro);
  }

  retryLesson(): void {
    const lesson = this.lesson;
    if (!lesson || this.ended) return;
    this.cardText = null;
    this.holding = false;
    this.beginLesson(this.li, true);
    this.host.flash('Lesson restarted', 'Take your time');
  }

  /** Optional practice only: leaves the lesson as if it were finished. */
  skipLesson(): void {
    const lesson = this.lesson;
    if (!lesson || lesson.essential || this.ended) return;
    this.finishLesson(lesson, true);
  }

  notePause(): void {
    this.ev.paused++;
  }

  noteResume(): void {
    this.ev.resumed++;
  }

  private finishLesson(lesson: Lesson, skipped: boolean): void {
    lesson.cleanup?.(this.rt, this.lessonHost);
    if (!skipped) {
      this.done.add(lesson.id);
      this.store.markLesson(lesson.id);
      this.host.sound('lesson');
      this.host.flash(`Lesson ${this.li + 1} complete`, lesson.title);
    } else {
      this.host.flash('Lesson skipped', 'You can replay it any time');
    }
    this.host.highlight([]);
    this.lowerBarrier();
    this.cardText = null;
    this.holding = false;
    this.li++;
    this.si = 0;
    this.entered = false;
    this.lf = {};
    this.sf = {};
    const next = LESSONS[this.li];
    if (next) this.raiseBarrier(next);
    this.lastRender = '';
  }

  // ------------------------------------------------------------------ per frame

  /** Called once per rendered frame while the run is in progress. `dt` is real time (seconds). */
  update(dt: number, cmd: VehicleInput): void {
    this.view.update(dt);
    if (this.ended) return;
    this.updateActive(cmd);
    if (this.holding) {
      this.render();
      return;
    }
    const lesson = this.lesson;
    if (!lesson) {
      this.render();
      return;
    }
    const m = this.rt.s - this.start;
    if (!this.entered) {
      if (m >= lesson.from - 4) this.enterLesson(true);
      this.render();
      return;
    }
    const step = lesson.steps[this.si];
    if (!step) return;
    const c = this.ctx(dt, cmd);
    step.tick?.(c);
    const failure = step.fail?.(c);
    if (failure) {
      this.softRetry(step, failure);
      return;
    }
    if (step.done(c)) {
      this.nextStep(lesson);
      return;
    }
    this.render();
  }

  private softRetry(step: Step, message: string): void {
    this.host.toast(message);
    if (step.retryFrom !== undefined) this.lessonHost.placeAt(step.retryFrom);
    this.lessonHost.resetHazards(this.lesson?.hazards ?? []);
    this.beginStep(false);
  }

  private nextStep(lesson: Lesson): void {
    this.host.sound('step');
    this.si++;
    if (this.si >= lesson.steps.length) {
      this.finishLesson(lesson, false);
      this.render();
      return;
    }
    this.host.flash('Nice!', lesson.steps[this.si].text.split('.')[0]);
    this.beginStep(true);
    this.render();
  }

  private updateActive(cmd: VehicleInput): void {
    const a = this.active;
    a.clear();
    if (cmd.throttle > 0.3) a.add('throttle');
    if (cmd.brake > 0.3) a.add('brake');
    if (cmd.steer < -0.3) a.add('left');
    if (cmd.steer > 0.3) a.add('right');
    if (this.rt.body.driveMode === '4x4') a.add('drive');
    const key = [...a].join(',');
    if (key !== this.lastActive) {
      this.lastActive = key;
      this.ui.setActive(a);
    }
  }

  private render(): void {
    const lesson = this.lesson;
    const step = lesson?.steps[this.si];
    const key = [this.li, this.si, this.entered, this.holding, this.cardText?.text, this.canFinish].join('|');
    if (key === this.lastRender) return;
    this.lastRender = key;
    const chips = (step?.chips ?? []).map((id) => CHIPS[id]);
    const ahead = !this.entered && lesson;
    this.lastActive = '';
    this.ui.render({
      lesson: lesson ? { num: this.li + 1, total: LESSONS.length, title: lesson.title, essential: lesson.essential } : null,
      stepText: step?.text ?? '',
      stepIndex: this.si,
      stepTotal: lesson?.steps.length ?? 0,
      chips,
      hold: this.cardText,
      hint: ahead ? `Drive on to the next lesson: ${lesson!.title}.` : lesson ? null : 'All lessons complete: finish the route.',
      canRetry: !!lesson && this.entered,
      canSkip: !!lesson && this.entered && !lesson.essential,
      canFinish: this.canFinish,
    });
  }

  /** The route's finish line was crossed: stop reacting and let the game show the graduation screen. */
  end(): void {
    this.ended = true;
    this.holding = false;
    this.done.add('delivery');
    this.store.markLesson('delivery');
    this.host.highlight([]);
  }

  dispose(): void {
    this.offs.forEach((o) => o());
    this.clearBarrier();
    this.view.dispose();
    this.host.highlight([]);
    this.rt.progressCap = Infinity;
  }
}
