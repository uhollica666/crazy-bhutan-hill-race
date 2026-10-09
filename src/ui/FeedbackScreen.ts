import {
  DraftStore,
  buildPayload,
  newSubmissionId,
  collectDevice,
  describeDevice,
  emptyForm,
  exportFileName,
  feedbackAsText,
  mailtoUrl,
  validateFeedback,
} from '../services/feedback';
import type { SentLog } from '../cloud/feedbackTransport';
import type {
  Difficulty,
  FeedbackConfig,
  FeedbackForm,
  FeedbackPayload,
  FeedbackTransport,
  PriceRange,
} from '../services/feedback';

export interface FeedbackDeps {
  host: HTMLElement;
  appVersion: string;
  config: FeedbackConfig;
  transport: FeedbackTransport;
  drafts: DraftStore;
  /** Log of what the service has confirmed (ids and times only). */
  sent: SentLog;
  /** Called once a submission has been confirmed by the service (statistics, if the player agreed to them). */
  onSent?: (rating: number) => void;
  quality: () => string;
  click: (back?: boolean) => void;
  /** Called after the screen closes so the caller can restore its own focus/state. */
  onClose: () => void;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const TEXT_FIELDS: {
  key: 'gameplay' | 'controls' | 'graphics' | 'performance' | 'favourite' | 'improve' | 'add' | 'bugs';
  label: string;
  hint: string;
}[] = [
  { key: 'gameplay', label: 'How was the gameplay?', hint: 'Missions, pickups, fuel, the story...' },
  { key: 'controls', label: 'How do the driving controls feel?', hint: 'Keyboard, touch or gamepad' },
  { key: 'graphics', label: 'How do the graphics look?', hint: 'Vehicles, scenery, weather, the HUD' },
  { key: 'performance', label: 'How is the performance?', hint: 'Smoothness, loading, battery, anything that stuttered' },
  { key: 'favourite', label: 'What is your favourite feature?', hint: '' },
  { key: 'improve', label: 'What should we improve?', hint: '' },
  { key: 'add', label: 'What would you like us to add?', hint: '' },
  { key: 'bugs', label: 'Did you find any bugs?', hint: 'What happened, and what were you doing?' },
];

const YES_NO = (id: string, label: string): string =>
  `<label class="fb-field" for="${id}"><span>${label}</span>
    <select id="${id}"><option value="">No answer</option><option value="yes">Yes</option><option value="no">No</option></select></label>`;

/**
 * The feedback form. It tells the truth about what happens to the answers: with no remote service configured
 * it only offers "save on this device", "download" and "copy", and the result text says nothing was sent.
 */
export class FeedbackScreen {
  readonly el: HTMLElement;
  private form: FeedbackForm = emptyForm();
  private origin: FeedbackPayload['origin'] = 'menu';
  private lastPayload: FeedbackPayload | null = null;
  private busy = false;
  private draftId: string | null = null;
  private readonly liveDevice: string;

  constructor(private readonly d: FeedbackDeps) {
    const el = (this.el = document.createElement('div'));
    el.className = 'modal feedback';
    el.id = 'screen-feedback';
    el.dataset.screen = '1';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'fb-title');
    this.liveDevice = describeDevice(collectDevice(d.appVersion, d.quality()));
    d.host.appendChild(el);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(origin: FeedbackPayload['origin']): void {
    this.origin = origin;
    this.form = emptyForm();
    this.lastPayload = null;
    this.renderForm();
    this.el.hidden = false;
    this.el.querySelector<HTMLElement>('[data-star="1"]')?.focus({ preventScroll: true });
  }

  close(): void {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.d.onClose();
  }

  dispose(): void {
    this.el.remove();
  }

  private banner(): string {
    return this.d.transport.delivers
      ? `<p class="fb-note">Your answers are sent to Novarah when you press Send. If you are offline they are kept on this device and sent automatically later; you will always be told which of those happened. You choose what is included.</p>`
      : `<p class="fb-note warn" role="note"><b>No feedback server is connected in this build.</b> You can save your feedback on this device, download it as a file or copy it, but it will <b>not</b> be sent to Novarah automatically.</p>`;
  }

  private renderForm(errors: Record<string, string> = {}): void {
    const f = this.form;
    const stars = [1, 2, 3, 4, 5]
      .map(
        (n) =>
          `<button type="button" class="star${f.rating >= n ? ' on' : ''}" data-star="${n}" role="radio" aria-checked="${f.rating === n}" aria-label="${n} star${n === 1 ? '' : 's'}">&#9733;</button>`,
      )
      .join('');
    const texts = TEXT_FIELDS.map(
      (t) => `<label class="fb-field" for="fb-${t.key}"><span>${t.label}</span>
        <textarea id="fb-${t.key}" rows="2" maxlength="1200" placeholder="${esc(t.hint)}" data-text="${t.key}">${esc(f[t.key])}</textarea>
        ${errors[t.key] ? `<em class="fb-err">${esc(errors[t.key])}</em>` : ''}</label>`,
    ).join('');
    const primary = this.d.transport.delivers ? 'Send feedback' : 'Save on this device';
    this.el.innerHTML = `<div class="panel wide fb-panel">
      <header class="fb-head"><h2 id="fb-title">Share feedback</h2>
        <button class="icon-btn" type="button" id="fb-close" data-back aria-label="Close feedback">&times;</button></header>
      ${this.banner()}
      <form id="fb-form" novalidate>
        <fieldset class="fb-rating"><legend>Overall, how was the ride?</legend>
          <div class="stars" role="radiogroup" aria-label="Overall rating">${stars}</div>
          ${errors.rating ? `<em class="fb-err" role="alert">${esc(errors.rating)}</em>` : ''}</fieldset>
        ${texts}
        <label class="fb-field" for="fb-difficulty"><span>How is the difficulty?</span>
          <select id="fb-difficulty"><option value="">No answer</option>
            <option value="tooEasy"${f.difficulty === 'tooEasy' ? ' selected' : ''}>Too easy</option>
            <option value="aboutRight"${f.difficulty === 'aboutRight' ? ' selected' : ''}>About right</option>
            <option value="tooDifficult"${f.difficulty === 'tooDifficult' ? ' selected' : ''}>Too difficult</option></select></label>
        <details class="fb-more"><summary>Would you want a bigger version? (optional research questions)</summary>
          <p class="fb-note">These are just questions to help us plan. Nothing can be bought in this game and we never ask for payment details.</p>
          ${YES_NO('fb-larger', 'Would you play a larger version of this game?')}
          ${YES_NO('fb-buy', 'Would you consider buying a future full game?')}
          <label class="fb-field" for="fb-price"><span>What would feel like a reasonable price?</span>
            <select id="fb-price"><option value="">No answer</option><option value="none">I would only play free games</option>
              <option value="under5">Under $5</option><option value="5to10">$5 to $10</option><option value="10to20">$10 to $20</option>
              <option value="20to40">$20 to $40</option><option value="over40">More than $40</option></select></label>
          ${YES_NO('fb-support', 'Might you voluntarily support development in the future?')}
        </details>
        <label class="fb-field" for="fb-contact"><span>Contact (optional, voluntary)</span>
          <input id="fb-contact" type="text" inputmode="email" autocomplete="off" maxlength="120" value="${esc(f.contact)}" placeholder="Leave blank to stay anonymous" />
          <small>Only add this if you would like a reply.</small>
          ${errors.contact ? `<em class="fb-err">${esc(errors.contact)}</em>` : ''}</label>
        <div class="fb-device"><label class="check"><input id="fb-device" type="checkbox"${f.includeDevice ? ' checked' : ''} />
          <span>Include my device details to help fix bugs</span></label>
          <details><summary>See exactly what would be included</summary><pre>${esc(this.liveDevice)}</pre>
            <small>No location, name or device identifier is collected.</small></details></div>
        <div class="stack fb-actions">
          <button class="btn primary" type="submit" id="fb-submit"${this.busy ? ' disabled' : ''}>${primary}</button>
          <button class="btn ghost" type="button" id="fb-cancel" data-back>Cancel</button>
        </div>
      </form></div>`;
    this.bindForm();
  }

  private bindForm(): void {
    const q = <T extends HTMLElement>(sel: string): T => this.el.querySelector<T>(sel) as T;
    q('#fb-close').addEventListener('click', () => {
      this.d.click(true);
      this.close();
    });
    q('#fb-cancel').addEventListener('click', () => {
      this.d.click(true);
      this.close();
    });
    this.el.querySelectorAll<HTMLButtonElement>('[data-star]').forEach((b) =>
      b.addEventListener('click', () => {
        this.form.rating = Number(b.dataset.star);
        this.d.click();
        this.el.querySelectorAll<HTMLButtonElement>('[data-star]').forEach((s) => {
          const n = Number(s.dataset.star);
          s.classList.toggle('on', n <= this.form.rating);
          s.setAttribute('aria-checked', String(n === this.form.rating));
        });
        this.el.querySelector('.fb-rating .fb-err')?.remove();
      }),
    );
    this.el.querySelectorAll<HTMLTextAreaElement>('[data-text]').forEach((t) =>
      t.addEventListener('input', () => {
        this.form[t.dataset.text as (typeof TEXT_FIELDS)[number]['key']] = t.value;
      }),
    );
    q<HTMLSelectElement>('#fb-difficulty').addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      this.form.difficulty = v ? (v as Difficulty) : null;
    });
    const yn = (
      id: string,
      key: 'playLargerVersion' | 'considerPurchasingFullGame' | 'voluntarySupport',
    ): void => {
      q<HTMLSelectElement>(id).addEventListener('change', (e) => {
        const v = (e.target as HTMLSelectElement).value;
        this.form.interest[key] = v === '' ? null : v === 'yes';
      });
    };
    yn('#fb-larger', 'playLargerVersion');
    yn('#fb-buy', 'considerPurchasingFullGame');
    yn('#fb-support', 'voluntarySupport');
    q<HTMLSelectElement>('#fb-price').addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      this.form.interest.priceRange = v ? (v as PriceRange) : null;
    });
    q<HTMLInputElement>('#fb-contact').addEventListener('input', (e) => {
      this.form.contact = (e.target as HTMLInputElement).value;
    });
    q<HTMLInputElement>('#fb-device').addEventListener('change', (e) => {
      this.form.includeDevice = (e.target as HTMLInputElement).checked;
    });
    q<HTMLFormElement>('#fb-form').addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
  }

  private async submit(): Promise<void> {
    if (this.busy) return;
    const v = validateFeedback(this.form);
    if (!v.ok) {
      this.renderForm(v.errors);
      this.el.querySelector<HTMLElement>('.fb-err')?.scrollIntoView?.({ block: 'center' });
      return;
    }
    const payload = buildPayload(this.form, {
      appVersion: this.d.appVersion,
      origin: this.origin,
      device: this.form.includeDevice ? collectDevice(this.d.appVersion, this.d.quality()) : null,
    });
    this.lastPayload = payload;
    if (!this.d.transport.delivers) {
      this.d.drafts.add(payload);
      this.renderResult('local');
      return;
    }
    this.busy = true;
    this.renderForm();
    // Saved on this device BEFORE any attempt to send: nothing the player wrote can be lost to a network failure.
    const draft = this.d.drafts.add(payload, new Date(), 'pending');
    this.draftId = draft.id;
    await this.deliver(payload, draft.id);
  }

  /** One delivery attempt. "Delivered" is claimed only when the transport reports the service's confirmation. */
  private async deliver(payload: FeedbackPayload, draftId: string): Promise<void> {
    this.busy = true;
    const res = await this.d.transport.submit(payload);
    this.busy = false;
    if (res.status === 'sent') {
      this.d.sent.add(payload.submissionId);
      this.d.drafts.remove(draftId);
      this.d.onSent?.(payload.rating);
      this.renderResult('sent');
    } else if (res.retryable) {
      this.d.drafts.update(draftId, { status: 'pending', attempts: 1, lastError: res.reason });
      this.renderResult('pending', res.reason);
    } else {
      this.d.drafts.update(draftId, { status: 'failed', attempts: 1, lastError: res.reason });
      this.renderResult('failed', res.reason);
    }
  }

  private renderResult(kind: 'sent' | 'local' | 'pending' | 'failed', reason = ''): void {
    const p = this.lastPayload as FeedbackPayload;
    const mail = mailtoUrl(this.d.config, p);
    const saved = this.d.drafts.persisted;
    const localCopy = saved
      ? 'A copy is saved in this browser on this device.'
      : 'Browser storage is unavailable. This copy lasts only until you close or reload the page; download it to keep it.';
    const title =
      kind === 'sent'
        ? 'Thank you! Delivered'
        : kind === 'local'
          ? saved
            ? 'Saved on this device only'
            : 'Not saved permanently'
          : kind === 'pending'
            ? 'Saved, not delivered yet'
            : 'Not delivered';
    const body =
      kind === 'sent'
        ? '<p>The online service confirmed it received your feedback. Thank you for helping us make the game better.</p>'
        : kind === 'local'
          ? `<p class="fb-note warn"><b>This has NOT been sent to Novarah.</b> ${localCopy} You can download or copy it and send it yourself.</p>`
          : kind === 'pending'
            ? `<p class="fb-note warn"><b>Not delivered yet.</b> ${esc(reason)} Your feedback is saved on this device and will be sent automatically when the connection is back. You can also try again now or export it.</p>`
            : `<p class="fb-note warn"><b>Your feedback was not delivered.</b> ${esc(reason)} ${localCopy} You can try again with a new copy or export it.</p>`;
    this.el.innerHTML = `<div class="panel wide fb-panel" role="status">
      <header class="fb-head"><h2 id="fb-title">${title}</h2></header>
      ${body}
      <div class="stack fb-actions">
        ${kind !== 'sent' ? '<button class="btn" type="button" id="fb-download">Download as a file</button><button class="btn" type="button" id="fb-copy">Copy text</button>' : ''}
        ${kind !== 'sent' && mail ? `<a class="btn" id="fb-mail" href="${esc(mail)}">Open an email draft</a>` : ''}
        ${kind === 'failed' || kind === 'pending' ? `<button class="btn" type="button" id="fb-retry">${kind === 'pending' ? 'Send now' : 'Try sending again'}</button>` : ''}
        <button class="btn primary" type="button" id="fb-done" data-back>Done</button>
      </div>
      <p class="fb-status" id="fb-status" aria-live="polite"></p></div>`;
    const q = <T extends HTMLElement>(sel: string): T | null => this.el.querySelector<T>(sel);
    q('#fb-done')?.addEventListener('click', () => {
      this.d.click(true);
      this.close();
    });
    q('#fb-download')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFileName(p);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      this.status('File downloaded. Nothing was sent.');
    });
    q('#fb-copy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(feedbackAsText(p));
        this.status('Copied to the clipboard.');
      } catch {
        this.status('Your browser blocked copying. Use Download instead.');
      }
    });
    q('#fb-retry')?.addEventListener('click', async () => {
      if (this.busy) return;
      this.status('Sending...');
      if (kind === 'failed') {
        // The service refused that copy: send a fresh one under a new id rather than reuse the refused one.
        const fresh: FeedbackPayload = { ...p, submissionId: newSubmissionId() };
        if (this.draftId) this.d.drafts.remove(this.draftId);
        this.lastPayload = fresh;
        this.draftId = this.d.drafts.add(fresh, new Date(), 'pending').id;
        await this.deliver(fresh, this.draftId);
      } else if (this.draftId) {
        await this.deliver(p, this.draftId);
      }
    });
    requestAnimationFrame(() => q<HTMLElement>('#fb-done')?.focus({ preventScroll: true }));
  }

  private status(text: string): void {
    const s = this.el.querySelector('#fb-status');
    if (s) s.textContent = text;
  }
}
