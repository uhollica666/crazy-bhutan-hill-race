import type { Chip } from '../tutorial/lessons';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface TutorialCardState {
  /** "Lesson 3 of 10" etc. (null while between lessons). */
  lesson: { num: number; total: number; title: string; essential: boolean } | null;
  stepText: string;
  stepIndex: number;
  stepTotal: number;
  chips: Chip[];
  /** A paused explanation: shown big, with a "Got it" button, while the simulation is held. */
  hold: { title: string; text: string } | null;
  /** Between lessons: "Drive on to ...". */
  hint: string | null;
  canRetry: boolean;
  canSkip: boolean;
  canFinish: boolean;
}

export interface TutorialActions {
  ok(): void;
  retry(): void;
  replay(): void;
  skip(): void;
  finish(): void;
}

export interface CompleteModel {
  firstTime: boolean;
  essentialDone: number;
  essentialTotal: number;
  lessonsDone: number;
  lessonsTotal: number;
}

/** The Driver's Academy overlay: a small instruction card while driving, a paused card for explanations, and two modals. */
export class TutorialUI {
  readonly root: HTMLElement;
  private readonly card: HTMLElement;
  private readonly modal: HTMLElement;
  private touch = false;

  constructor(
    host: HTMLElement,
    private readonly a: TutorialActions,
  ) {
    const root = (this.root = document.createElement('div'));
    root.id = 'academy';
    root.hidden = true;
    root.innerHTML = `<div class="tut-card" id="tut-card" role="region" aria-label="Driver's Academy lesson" aria-live="polite"></div>`;
    host.appendChild(root);
    this.card = root.querySelector('#tut-card') as HTMLElement;
    const modal = (this.modal = document.createElement('div'));
    modal.className = 'modal tut-modal';
    modal.id = 'academy-modal';
    modal.dataset.screen = '1';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    host.appendChild(modal);
    this.card.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button[data-act]') as HTMLElement | null;
      if (!b) return;
      const act = b.dataset.act as keyof TutorialActions;
      this.a[act]();
    });
  }

  setTouch(on: boolean): void {
    this.touch = on;
    this.root.classList.toggle('touch', on);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  render(s: TutorialCardState): void {
    this.root.hidden = false;
    const holding = !!s.hold;
    this.root.classList.toggle('holding', holding);
    const pips = s.stepTotal > 0 ? Array.from({ length: s.stepTotal }, (_, i) => `<i class="${i < s.stepIndex ? 'done' : i === s.stepIndex ? 'now' : ''}"></i>`).join('') : '';
    const head = s.lesson
      ? `<div class="tut-head"><span class="tut-badge${s.lesson.essential ? '' : ' adv'}">Lesson ${s.lesson.num}/${s.lesson.total}${s.lesson.essential ? '' : ' &middot; practice'}</span><b class="tut-title">${esc(s.lesson.title)}</b><span class="tut-pips" aria-hidden="true">${pips}</span></div>`
      : `<div class="tut-head"><span class="tut-badge">Driver's Academy</span></div>`;
    const chips = s.chips
      .map((c) => `<span class="tut-chip" data-chip="${c.id}"><kbd>${esc(this.touch ? c.touch : c.keys)}</kbd><em>${esc(c.label)}</em></span>`)
      .join('');
    let body: string;
    if (holding) {
      body = `<h3 class="tut-hold-title">${esc(s.hold!.title)}</h3><p class="tut-text">${esc(s.hold!.text)}</p>${chips ? `<div class="tut-chips">${chips}</div>` : ''}
        <div class="tut-actions"><button class="btn primary" type="button" data-act="ok" id="tut-ok">Got it</button></div>`;
    } else if (s.hint) {
      body = `<p class="tut-text">${esc(s.hint)}</p>`;
    } else {
      body = `<p class="tut-text">${esc(s.stepText)}</p>${chips ? `<div class="tut-chips">${chips}</div>` : ''}`;
    }
    const actions = holding
      ? ''
      : `<div class="tut-actions small">
          <button class="tut-link" type="button" data-act="replay" title="Show the explanation again">Replay tip</button>
          ${s.canRetry ? '<button class="tut-link" type="button" data-act="retry" title="Start this lesson again">Retry lesson</button>' : ''}
          ${s.canSkip ? '<button class="tut-link" type="button" data-act="skip" title="This lesson is optional practice">Skip lesson</button>' : ''}
          ${s.canFinish ? '<button class="btn primary tut-finish" type="button" data-act="finish" id="tut-finish">Done, start the game</button>' : ''}
        </div>`;
    this.card.innerHTML = head + body + actions;
    if (holding) (this.card.querySelector('#tut-ok') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  /** Lights the chips whose controls are being pressed right now. */
  setActive(ids: ReadonlySet<string>): void {
    for (const el of this.card.querySelectorAll<HTMLElement>('[data-chip]')) el.classList.toggle('on', ids.has(el.dataset.chip ?? ''));
  }

  hide(): void {
    this.root.hidden = true;
    this.hideModal();
    document.body.classList.remove('tut-glow-on');
    for (const el of document.querySelectorAll('.tut-glow')) el.classList.remove('tut-glow');
  }

  /** Pulses the named HUD controls. */
  highlight(selectors: readonly string[]): void {
    for (const el of document.querySelectorAll('.tut-glow')) el.classList.remove('tut-glow');
    for (const sel of selectors) for (const el of document.querySelectorAll(sel)) el.classList.add('tut-glow');
  }

  hideModal(): void {
    this.modal.hidden = true;
    this.modal.innerHTML = '';
  }

  get modalOpen(): boolean {
    return !this.modal.hidden;
  }

  /** The automatic first-play introduction for fresh players. */
  showWelcome(onStart: () => void, onSkip: () => void): void {
    this.modal.innerHTML = `<div class="panel tut-panel" aria-labelledby="tut-welcome-title">
      <div class="result-stamp ok">Route 0</div>
      <h2 id="tut-welcome-title">Driver's Academy</h2>
      <p class="tut-lead">New here? A short, relaxed training drive teaches everything the ten routes will ask of you. No clock, nothing to fail, retry anything.</p>
      <ul class="tut-list"><li>Steering, braking and recovering</li><li>Passengers, fuel and repairs</li><li>Surfaces, water, rockfalls and wildlife</li><li>Rain, fog and night driving</li></ul>
      <div class="stack fb-actions">
        <button class="btn primary" type="button" id="tut-start">Start training</button>
        <button class="btn ghost" type="button" id="tut-skip-intro">Skip for now</button></div></div>`;
    this.modal.hidden = false;
    (this.modal.querySelector('#tut-start') as HTMLElement).addEventListener('click', () => {
      this.hideModal();
      onStart();
    });
    (this.modal.querySelector('#tut-skip-intro') as HTMLElement).addEventListener('click', () => {
      this.hideModal();
      onSkip();
    });
    (this.modal.querySelector('#tut-start') as HTMLElement).focus({ preventScroll: true });
  }

  /** Shown when the route is finished: graduate, or practise again. */
  showComplete(m: CompleteModel, onDone: () => void, onAgain: () => void, onMenu: () => void): void {
    this.root.hidden = true;
    this.modal.innerHTML = `<div class="panel tut-panel" aria-labelledby="tut-done-title">
      <div class="result-stamp ok">Academy complete</div>
      <h2 id="tut-done-title">Ready for the road</h2>
      <p class="tut-lead">${m.firstTime ? 'You have the skills for all ten routes.' : 'Practice makes perfect.'} Lessons finished this drive: ${m.lessonsDone} of ${m.lessonsTotal}.</p>
      <div class="stack fb-actions">
        <button class="btn primary" type="button" id="tut-go">Done, start the game</button>
        <button class="btn" type="button" id="tut-again">Practice again</button>
        <button class="btn ghost" type="button" id="tut-menu">Main menu</button></div></div>`;
    this.modal.hidden = false;
    const wire = (id: string, fn: () => void): void =>
      (this.modal.querySelector(id) as HTMLElement).addEventListener('click', () => {
        this.hideModal();
        fn();
      });
    wire('#tut-go', onDone);
    wire('#tut-again', onAgain);
    wire('#tut-menu', onMenu);
    (this.modal.querySelector('#tut-go') as HTMLElement).focus({ preventScroll: true });
  }

  dispose(): void {
    this.hide();
    this.root.remove();
    this.modal.remove();
  }
}
