import type { CloudService, CloudStatus, ConflictChoice } from '../cloud/CloudService';
import { feedbackStatus } from '../cloud/feedbackTransport';
import type { SentLog } from '../cloud/feedbackTransport';
import type { BoardRow, BoardView, Leaderboards } from '../cloud/Leaderboards';
import { PAGE_SIZE } from '../cloud/Leaderboards';
import { validateDisplayName } from '../cloud/names';
import type { PayloadSummary } from '../cloud/payload';
import type { PrivacyStore } from '../cloud/privacy';
import type { DraftStore } from '../services/feedback';
import type { SaveStore } from '../storage/SaveStore';
import { formatTime } from '../gameplay/RaceSession';

export interface CloudUIDeps {
  host: HTMLElement;
  cloud: CloudService;
  leaderboards: Leaderboards;
  privacy: PrivacyStore;
  store: SaveStore;
  drafts: DraftStore;
  sent: SentLog;
  /** Campaign order. */
  levels: () => { id: string; name: string }[];
  vehicleName: (id: string) => string;
  /** Developer tools (the heatmap) are shown only when the game was opened with ?dev=1. */
  dev: boolean;
  click: (back?: boolean) => void;
  onOpenFeedback: () => void;
  onOpenHeatmap: () => void;
  /** Opens the settings screen on its Privacy tab. */
  onOpenPrivacy: () => void;
  /** Called after any of these screens closes so the caller can restore focus. */
  onClose: () => void;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const MEDAL_LABEL: Record<string, string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze', none: '' };

const CONNECTION_LABEL: Record<CloudStatus['connection'], string> = {
  disabled: 'Online features are off in this build',
  local: 'Playing offline',
  offline: 'Offline',
  connecting: 'Connecting...',
  guest: 'Online as a guest',
  account: 'Signed in',
};

const SYNC_LABEL: Record<CloudStatus['sync'], string> = {
  idle: 'Nothing to sync',
  pending: 'Changes waiting to sync',
  syncing: 'Syncing...',
  synced: 'Progress saved online',
  failed: 'Sync failed, will retry',
  conflict: 'Two saves found: your choice needed',
};

/** A short line for menus: "Guest · Synced". Pure, so it can be tested. */
export function statusLine(s: CloudStatus): string {
  if (s.connection === 'disabled') return 'Offline game';
  const who = s.connection === 'account' ? s.displayName : s.connection === 'guest' ? 'Guest' : s.connection === 'connecting' ? 'Connecting' : 'Offline';
  const sync = s.connection === 'local' || s.connection === 'connecting' ? '' : s.sync === 'synced' ? 'Saved online' : s.sync === 'pending' ? 'Sync pending' : s.sync === 'syncing' ? 'Syncing' : s.sync === 'failed' ? 'Sync failed' : s.sync === 'conflict' ? 'Choose a save' : '';
  return sync ? `${who} · ${sync}` : who;
}

function ago(at: number | null): string {
  if (!at) return 'not yet';
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(at).toLocaleDateString();
}

const timeText = (ms: number): string => formatTime(ms / 1000);

/**
 * Profile, sign-in, save-conflict choice, leaderboard and privacy screens. All of them are optional corners of the
 * game: nothing here is reached at start-up, and every screen works (and says so) when the game is offline.
 */
export class CloudUI {
  private readonly profile: HTMLElement;
  private readonly conflict: HTMLElement;
  private readonly board: HTMLElement;
  private authMode: 'signin' | 'register' | 'reset' | null = null;
  private authMessage: { kind: 'error' | 'ok'; text: string } | null = null;
  private busy = false;
  /** The e-mail address typed in the form: kept when the form is redrawn after an error (the password never is). */
  private authEmail = '';
  private privMsg = '';
  private boardLevel = '';
  private boardLimit = PAGE_SIZE;
  private boardToken = 0;
  private conflictShown = false;
  private privacyPane: HTMLElement | null = null;
  private readonly offStatus: () => void;

  constructor(private readonly d: CloudUIDeps) {
    const mk = (id: string, label: string): HTMLElement => {
      const el = document.createElement('div');
      el.className = 'modal cloud';
      el.id = id;
      el.dataset.screen = '1';
      el.hidden = true;
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', label);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          this.close(el);
        }
      });
      d.host.appendChild(el);
      return el;
    };
    this.profile = mk('screen-profile', 'Driver profile');
    this.conflict = mk('screen-conflict', 'Choose which progress to keep');
    this.board = mk('screen-board', 'Leaderboard');
    this.offStatus = d.cloud.onStatus((s) => this.onStatus(s));
  }

  get isOpen(): boolean {
    return !this.profile.hidden || !this.conflict.hidden || !this.board.hidden;
  }

  /** Closes the front-most cloud screen. Returns true if one was open. */
  closeTop(): boolean {
    for (const el of [this.conflict, this.board, this.profile]) {
      if (!el.hidden) {
        this.close(el);
        return true;
      }
    }
    return false;
  }

  private close(el: HTMLElement): void {
    if (el.hidden) return;
    // A save conflict stays pending until the player chooses; closing the screen just postpones the question.
    el.hidden = true;
    this.d.onClose();
  }

  dispose(): void {
    this.offStatus();
    for (const el of [this.profile, this.conflict, this.board]) el.remove();
  }

  private onStatus(s: CloudStatus): void {
    if (!this.profile.hidden && !this.busy) this.renderProfile();
    if (s.sync === 'conflict' && s.conflict && this.conflict.hidden && !this.conflictShown) this.maybeShowConflict();
    if (s.sync !== 'conflict') this.conflictShown = false;
    if (!this.conflict.hidden && s.sync !== 'conflict') this.close(this.conflict);
    else if (!this.conflict.hidden) this.renderConflict();
  }

  // ------------------------------------------------------------------------------------------ profile

  openProfile(): void {
    this.authMode = null;
    this.authMessage = null;
    this.renderProfile();
    this.profile.hidden = false;
    requestAnimationFrame(() => this.profile.querySelector<HTMLElement>('#pf-close')?.focus({ preventScroll: true }));
  }

  private renderProfile(): void {
    const { cloud, store } = this.d;
    const s = cloud.status;
    const initials = (s.displayName.match(/[A-Za-z0-9]/g) ?? ['D']).slice(0, 2).join('').toUpperCase();
    const disabled = s.connection === 'disabled';
    const signedIn = !!s.user;
    const email = s.user?.email;
    const done = Object.values(store.progress.levels).filter((l) => l.completions > 0);
    const medals = { gold: 0, silver: 0, bronze: 0 };
    for (const l of done) if (l.medal !== 'none') medals[l.medal]++;
    const fav = this.favouriteVehicle();
    const fb = feedbackStatus(this.d.drafts, this.d.sent);
    const records = this.d.levels()
      .map((l) => ({ name: l.name, rec: store.levelRecord(l.id) }))
      .filter((x) => x.rec.completions > 0)
      .map((x) => ({ name: x.name, time: Math.min(...Object.values(x.rec.vehicles).map((v) => v.bestTime ?? Infinity)), medal: x.rec.medal }))
      .filter((x) => Number.isFinite(x.time))
      .sort((a, b) => a.time - b.time)
      .slice(0, 4);
    const statusClass = s.sync === 'failed' || s.sync === 'conflict' ? 'warn' : s.sync === 'synced' ? 'ok' : '';
    const backups = cloud.backups;
    this.profile.innerHTML = `<div class="panel wide cl-panel">
      <header class="fb-head"><h2 id="pf-title">Driver profile</h2>
        <button class="icon-btn" type="button" id="pf-close" data-back aria-label="Close profile">&times;</button></header>
      <section class="cl-id" aria-label="Identity">
        <span class="cl-avatar" aria-hidden="true">${esc(initials)}</span>
        <div class="cl-id-main">
          <label class="cl-name" for="pf-name"><span class="hud-label">Display name</span>
            <span class="cl-name-row"><input id="pf-name" type="text" maxlength="20" autocomplete="off" value="${esc(s.displayName)}" aria-describedby="pf-name-help"${disabled ? ' disabled' : ''} />
            <button class="btn" type="button" id="pf-name-save"${disabled ? ' disabled' : ''}>Save</button></span></label>
          <small id="pf-name-help">Shown on leaderboards. 3 to 20 letters, numbers, spaces, dots, dashes or underscores. Your email is never shown to other players.</small>
          <p class="cl-line"><b>${esc(CONNECTION_LABEL[s.connection])}</b>${email ? ` · ${esc(email)}${s.user?.emailVerified ? ' (verified)' : ' (not verified yet)'}` : signedIn ? ' · no account yet' : ''}</p>
          <p class="cl-line cl-sync ${statusClass}" role="status" aria-live="polite">${esc(SYNC_LABEL[s.sync])}${s.lastSyncedAt ? ` · last saved ${esc(ago(s.lastSyncedAt))}` : ''}${s.message ? `<br><span>${esc(s.message)}</span>` : ''}</p>
        </div>
      </section>
      ${disabled ? '<p class="fb-note">Online features (account, cloud save, leaderboards) are switched off in this build. Everything else works as usual.</p>' : ''}
      ${s.sync === 'conflict' ? '<div class="stack"><button class="btn primary" type="button" id="pf-conflict">Choose which progress to keep</button></div>' : ''}
      <div class="cl-actions" role="group" aria-label="Account actions">
        ${!disabled && !signedIn && s.connection !== 'connecting' ? '<button class="btn" type="button" id="pf-guest">Play online as a guest</button>' : ''}
        ${!disabled && s.user?.isAnonymous ? '<button class="btn primary" type="button" data-auth="register">Create account</button><button class="btn" type="button" data-auth="signin">Sign in</button>' : ''}
        ${!disabled && !signedIn ? '<button class="btn" type="button" data-auth="signin">Sign in</button><button class="btn" type="button" data-auth="register">Create account</button>' : ''}
        ${s.user && !s.user.isAnonymous ? `<button class="btn" type="button" id="pf-sync">Sync now</button>${s.user.emailVerified ? '' : '<button class="btn" type="button" id="pf-verify">Send verification email</button>'}<button class="btn" type="button" id="pf-signout">Sign out</button>` : ''}
        ${s.user?.isAnonymous ? '<button class="btn" type="button" id="pf-sync">Sync now</button>' : ''}
      </div>
      ${this.authMode ? this.authForm() : ''}
      <section class="cl-stats" aria-label="Your records">
        <h3>Your progress</h3>
        <div class="cl-grid">
          <div><b>${done.length}/${this.d.levels().length}</b><span>missions</span></div>
          <div><b>${medals.gold}/${medals.silver}/${medals.bronze}</b><span>gold / silver / bronze</span></div>
          <div><b>${store.credits.toLocaleString('en-US')}</b><span>credits</span></div>
          <div><b>${esc(fav ?? '-')}</b><span>favourite vehicle</span></div>
        </div>
        ${records.length ? `<ol class="cl-records">${records.map((r) => `<li><span>${esc(r.name)}</span><b>${formatTime(r.time)}</b><i>${esc(MEDAL_LABEL[r.medal] ?? '')}</i></li>`).join('')}</ol>` : '<p class="muted">Finish a mission to set your first record.</p>'}
      </section>
      <section class="cl-stats" aria-label="Feedback status">
        <h3>Feedback</h3>
        <p class="muted">${fb.pending ? `${fb.pending} waiting to be delivered (sent automatically when online). ` : ''}${fb.failed ? `${fb.failed} could not be delivered. ` : ''}${fb.drafts ? `${fb.drafts} saved on this device only. ` : ''}${fb.lastSentAt ? `Last delivered ${esc(new Date(fb.lastSentAt).toLocaleDateString())}.` : !fb.pending && !fb.failed && !fb.drafts ? 'Nothing sent yet.' : ''}</p>
      </section>
      ${backups.length ? `<details class="cl-backups"><summary>Saved copies on this device (${backups.length})</summary><p class="muted">Kept automatically before progress from your account replaced anything. You can put one back.</p><ul>${backups.map((b, i) => `<li><span>${esc(new Date(b.at).toLocaleString())} · ${b.missions} missions, ${b.credits} credits <small>(${esc(b.reason)})</small></span><button class="btn" type="button" data-restore="${i}">Restore</button></li>`).join('')}</ul></details>` : ''}
      <div class="stack cl-foot">
        <button class="btn" type="button" id="pf-board">Leaderboards</button>
        <button class="btn" type="button" id="pf-privacy">Privacy &amp; data</button>
        <button class="btn" type="button" id="pf-feedback">Share feedback</button>
        <button class="btn primary" type="button" id="pf-done" data-back>Done</button>
      </div></div>`;
    this.bindProfile();
  }

  private authForm(): string {
    const m = this.authMode as 'signin' | 'register' | 'reset';
    const guest = this.d.cloud.status.user?.isAnonymous;
    const title = m === 'register' ? 'Create an account' : m === 'reset' ? 'Reset your password' : 'Sign in';
    const note =
      m === 'register'
        ? guest
          ? 'Your progress on this device stays with you: the account is attached to it.'
          : 'An account lets you keep your progress across devices and appear on leaderboards under your name.'
        : m === 'signin'
          ? this.d.cloud.status.user?.isAnonymous
            ? 'If the account already has progress, you will be asked which progress to keep. Nothing is overwritten without your say-so.'
            : 'Sign in to continue with your saved progress.'
          : 'We will email you a link to choose a new password.';
    return `<form class="cl-auth" id="pf-form" novalidate aria-labelledby="pf-form-title">
      <h3 id="pf-form-title">${title}</h3>
      <p class="muted">${note}</p>
      <label class="fb-field" for="pf-email"><span>Email address</span><input id="pf-email" type="email" inputmode="email" autocomplete="${m === 'register' ? 'email' : 'username'}" value="${esc(this.authEmail)}" required /></label>
      ${m === 'reset' ? '' : `<label class="fb-field" for="pf-pass"><span>Password</span><input id="pf-pass" type="password" autocomplete="${m === 'register' ? 'new-password' : 'current-password'}" minlength="6" required />${m === 'register' ? '<small>At least 6 characters. A longer phrase is safer. We never see or store your password: it goes straight to the sign-in service.</small>' : ''}</label>`}
      <p class="${this.authMessage?.kind === 'error' ? 'fb-err' : 'fb-note'}" id="pf-msg" role="alert" aria-live="assertive">${this.authMessage ? esc(this.authMessage.text) : ''}</p>
      <div class="stack"><button class="btn primary" type="submit" id="pf-submit"${this.busy ? ' disabled' : ''}>${m === 'register' ? 'Create account' : m === 'reset' ? 'Send reset email' : 'Sign in'}</button>
        ${m === 'signin' ? '<button class="btn ghost" type="button" data-auth="reset">Forgot password?</button>' : ''}
        <button class="btn ghost" type="button" id="pf-cancel-auth">Cancel</button></div></form>`;
  }

  private bindProfile(): void {
    const q = <T extends HTMLElement>(sel: string): T | null => this.profile.querySelector<T>(sel);
    const { cloud } = this.d;
    const click = (sel: string, fn: () => void): void => q(sel)?.addEventListener('click', () => {
      this.d.click();
      fn();
    });
    const closeProfile = (): void => {
      this.d.click(true);
      this.close(this.profile);
    };
    q('#pf-close')?.addEventListener('click', closeProfile);
    q('#pf-done')?.addEventListener('click', closeProfile);
    click('#pf-board', () => this.openBoard());
    click('#pf-privacy', () => {
      this.close(this.profile);
      this.d.onOpenPrivacy();
    });
    click('#pf-feedback', () => {
      this.close(this.profile);
      this.d.onOpenFeedback();
    });
    click('#pf-conflict', () => this.maybeShowConflict(true));
    click('#pf-guest', () => void this.run(() => cloud.playOnlineAsGuest(), 'Connecting...'));
    click('#pf-sync', () => void this.run(() => cloud.syncNow('manual'), 'Syncing...'));
    click('#pf-verify', () => void this.run(async () => { await cloud.resendVerification(); this.authMessage = { kind: 'ok', text: 'Verification email sent. Check your inbox (and spam folder).' }; }));
    click('#pf-signout', () => void this.run(() => cloud.signOut()));
    this.profile.querySelectorAll<HTMLElement>('[data-auth]').forEach((b) =>
      b.addEventListener('click', () => {
        this.d.click();
        this.authMode = b.dataset.auth as 'signin' | 'register' | 'reset';
        this.authMessage = null;
        this.authEmail = q<HTMLInputElement>('#pf-email')?.value ?? this.authEmail;
        this.renderProfile();
        q<HTMLElement>('#pf-email')?.focus();
      }),
    );
    click('#pf-cancel-auth', () => {
      this.authMode = null;
      this.authMessage = null;
      this.authEmail = '';
      this.renderProfile();
    });
    this.profile.querySelectorAll<HTMLElement>('[data-restore]').forEach((b) =>
      b.addEventListener('click', () => {
        if (!confirm('Put this saved copy back? Your current progress on this device is saved as another copy first.')) return;
        this.d.click();
        cloud.restoreBackup(Number(b.dataset.restore));
        this.renderProfile();
      }),
    );
    q<HTMLButtonElement>('#pf-name-save')?.addEventListener('click', () => {
      const input = q<HTMLInputElement>('#pf-name') as HTMLInputElement;
      const v = validateDisplayName(input.value);
      if (!v.ok) {
        this.authMessage = { kind: 'error', text: v.message };
        input.setCustomValidity(v.message);
        input.reportValidity();
        input.setCustomValidity('');
        return;
      }
      this.d.click();
      void this.run(async () => {
        await cloud.setDisplayName(v.name);
        this.authMessage = { kind: 'ok', text: 'Name saved.' };
      });
    });
    q<HTMLFormElement>('#pf-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submitAuth();
    });
  }

  private async submitAuth(): Promise<void> {
    const email = (this.profile.querySelector<HTMLInputElement>('#pf-email')?.value ?? '').trim();
    const passEl = this.profile.querySelector<HTMLInputElement>('#pf-pass');
    const pass = passEl?.value ?? '';
    const mode = this.authMode;
    this.authEmail = email;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return this.fail('Please enter a valid email address.');
    if (mode !== 'reset' && pass.length < 6) return this.fail('Please enter a password of at least 6 characters.');
    const { cloud } = this.d;
    this.busy = true;
    this.authMessage = { kind: 'ok', text: 'Working...' };
    this.renderProfile();
    try {
      if (mode === 'register') await cloud.register(email, pass);
      else if (mode === 'signin') await cloud.signIn(email, pass);
      else if (mode === 'reset') await cloud.sendPasswordReset(email);
      if (passEl) passEl.value = ''; // never keep a password around
      this.authMode = null;
      this.authMessage = {
        kind: 'ok',
        text: mode === 'reset' ? 'If that address has an account, a reset email is on its way.' : mode === 'register' ? 'Account created. We sent a verification email to confirm your address.' : 'Signed in.',
      };
    } catch (e) {
      this.authMessage = { kind: 'error', text: (e as Error).message || 'Something went wrong.' };
    } finally {
      this.busy = false;
      this.renderProfile();
      this.profile.querySelector<HTMLElement>(this.authMode ? '#pf-email' : '#pf-done')?.focus();
    }
  }

  private fail(text: string): void {
    this.authMessage = { kind: 'error', text };
    const m = this.profile.querySelector('#pf-msg');
    if (m) {
      m.textContent = text;
      m.className = 'fb-err';
    }
  }

  private async run(fn: () => Promise<void>, working?: string): Promise<void> {
    this.busy = true;
    if (working) this.authMessage = { kind: 'ok', text: working };
    try {
      await fn();
    } catch (e) {
      this.authMessage = { kind: 'error', text: (e as Error).message || 'Something went wrong.' };
    } finally {
      this.busy = false;
      this.renderProfile();
    }
  }

  private favouriteVehicle(): string | null {
    const counts = new Map<string, number>();
    for (const l of Object.values(this.d.store.progress.levels)) for (const [vid, v] of Object.entries(l.vehicles)) counts.set(vid, (counts.get(vid) ?? 0) + v.completions);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? this.d.vehicleName(top[0]) : null;
  }

  // ------------------------------------------------------------------------------------------ conflict

  /** Opens the "which progress to keep" screen (automatically once per conflict, or when the player asks). */
  maybeShowConflict(force = false): void {
    const s = this.d.cloud.status;
    if (s.sync !== 'conflict' || !s.conflict) return;
    if (this.conflictShown && !force) return;
    this.conflictShown = true;
    this.renderConflict();
    this.conflict.hidden = false;
    requestAnimationFrame(() => this.conflict.querySelector<HTMLElement>('#cf-cloud')?.focus({ preventScroll: true }));
  }

  private card(title: string, c: PayloadSummary | null, note: string): string {
    if (!c) return `<div class="cl-card"><h3>${title}</h3><p class="muted">${esc(note)}</p></div>`;
    return `<div class="cl-card"><h3>${title}</h3><ul>
      <li><b>${c.missions}</b> missions finished</li>
      <li><b>${c.medals.gold}/${c.medals.silver}/${c.medals.bronze}</b> gold / silver / bronze</li>
      <li><b>${c.credits.toLocaleString('en-US')}</b> credits</li>
      <li><b>${c.vehicles}</b> vehicles, <b>${c.upgrades}</b> upgrade levels</li></ul><p class="muted">${esc(note)}</p></div>`;
  }

  private renderConflict(): void {
    const c = this.d.cloud.status.conflict;
    if (!c) return;
    const unreadable = c.kind === 'unreadable';
    this.conflict.innerHTML = `<div class="panel wide cl-panel">
      <header class="fb-head"><h2 id="cf-title">${unreadable ? 'Your online copy could not be read' : 'Two saves found'}</h2></header>
      <p>${unreadable
        ? 'The progress stored online is damaged or was written by a newer version of the game, so it was left untouched. You can keep it as it is, or replace it with the progress on this device.'
        : 'This device and your account both have progress the other does not. Nothing has been changed yet. A copy of this device\'s progress is saved before anything is replaced, and you can put it back from your profile.'}</p>
      <div class="cl-cards">${this.card('On this device', c.local, '')}${unreadable ? this.card('Online', null, 'Unreadable. Left alone.') : this.card('In your account', c.cloud, '')}</div>
      ${!unreadable && !c.canCombine ? `<p class="fb-note warn" role="note">Combining is not offered: ${esc(c.combineReason ?? '')}</p>` : ''}
      <div class="stack cl-foot">
        ${unreadable ? '<button class="btn primary" type="button" id="cf-cloud">Keep the online copy as it is</button>' : '<button class="btn primary" type="button" id="cf-cloud">Use my account\'s progress</button>'}
        <button class="btn" type="button" id="cf-device">${unreadable ? 'Replace it with this device' : 'Use this device\'s progress'}</button>
        ${!unreadable ? `<button class="btn" type="button" id="cf-combine"${c.canCombine ? '' : ' disabled'}>Combine both</button>` : ''}
        <button class="btn ghost" type="button" id="cf-later">Decide later</button>
      </div>
      <p class="muted" id="cf-status" aria-live="polite">${unreadable ? '' : '"Combine both" keeps every finished mission, the best times and medals, and every vehicle and upgrade from both. Credits are counted once: what you earned on each side is added to what you both started with, and never duplicated.'}</p></div>`;
    const choose = (choice: ConflictChoice): void => {
      this.d.click();
      const st = this.conflict.querySelector('#cf-status');
      if (st) st.textContent = 'Working...';
      this.conflict.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
      void this.d.cloud.resolveConflict(choice).then(() => {
        if (this.d.cloud.status.sync !== 'conflict') this.close(this.conflict);
        else this.renderConflict();
      });
    };
    this.conflict.querySelector('#cf-cloud')?.addEventListener('click', () => choose('cloud'));
    this.conflict.querySelector('#cf-device')?.addEventListener('click', () => choose('device'));
    this.conflict.querySelector('#cf-combine')?.addEventListener('click', () => choose('combine'));
    this.conflict.querySelector('#cf-later')?.addEventListener('click', () => {
      this.d.click(true);
      this.close(this.conflict);
    });
  }

  // ----------------------------------------------------------------------------------------- leaderboard

  openBoard(levelId?: string): void {
    const levels = this.d.levels();
    this.boardLevel = levelId && levels.some((l) => l.id === levelId) ? levelId : this.boardLevel || levels[0]?.id || '';
    this.boardLimit = PAGE_SIZE;
    this.board.hidden = false;
    void this.refreshBoard(false);
    requestAnimationFrame(() => this.board.querySelector<HTMLElement>('#lb-level')?.focus({ preventScroll: true }));
  }

  private async refreshBoard(force: boolean): Promise<void> {
    const token = ++this.boardToken;
    this.renderBoard(null);
    const view = await this.d.leaderboards.loadBoard(this.boardLevel, { force, limit: this.boardLimit });
    if (token !== this.boardToken || this.board.hidden) return; // a newer request or a closed screen
    this.renderBoard(view);
  }

  private rowHtml(r: BoardRow, you = r.isYou): string {
    return `<tr${you ? ' class="you" aria-current="true"' : ''}><td class="rk">${r.rank || '-'}</td><td class="nm">${esc(r.name)}${you ? ' <small>(you)</small>' : ''}</td><td class="tm">${timeText(r.timeMs)}</td><td class="vh">${esc(this.d.vehicleName(r.vehicleId))}</td><td class="cd">${esc(r.conditions.replace('-', ' '))}</td></tr>`;
  }

  private renderBoard(view: BoardView | null): void {
    const levels = this.d.levels();
    const i = Math.max(0, levels.findIndex((l) => l.id === this.boardLevel));
    const options = levels.map((l) => `<option value="${esc(l.id)}"${l.id === this.boardLevel ? ' selected' : ''}>${esc(l.name)}</option>`).join('');
    let body: string;
    if (!view) body = '<p class="muted" role="status">Loading...</p>';
    else {
      const notice = view.message ? `<p class="fb-note${view.state === 'ready' || view.state === 'empty' ? '' : ' warn'}" role="status">${esc(view.message)}${view.stale && view.fetchedAt ? ` (as of ${esc(ago(view.fetchedAt))})` : ''}</p>` : '';
      const rows = view.rows.length
        ? `<div class="cl-table-wrap"><table class="cl-table"><caption class="sr-only">Best times</caption><thead><tr><th scope="col">#</th><th scope="col">Driver</th><th scope="col">Time</th><th scope="col">Vehicle</th><th scope="col">Conditions</th></tr></thead><tbody>${view.rows.map((r) => this.rowHtml(r)).join('')}</tbody></table></div>`
        : '';
      const mine = view.mine
        ? `<p class="cl-mine"><b>Your best online:</b> ${timeText(view.mine.row.timeMs)} with ${esc(this.d.vehicleName(view.mine.row.vehicleId))} · rank ${view.mine.rank === null ? 'beyond 100' : `#${view.mine.rank}`}</p>`
        : this.d.cloud.status.user
          ? '<p class="cl-mine muted">You have no time posted for this mission yet.</p>'
          : '<p class="cl-mine muted">Play online as a guest or create an account to post your times.</p>';
      const more = view.state === 'ready' && view.rows.length >= this.boardLimit && this.boardLimit < 100 ? '<button class="btn" type="button" id="lb-more">Show more</button>' : '';
      const pending = this.d.leaderboards.pendingCount;
      body = `${notice}${rows}${mine}${pending ? `<p class="muted">${pending} time${pending === 1 ? '' : 's'} waiting to be posted when you are online.</p>` : ''}<div class="stack">${more}</div>`;
    }
    this.board.innerHTML = `<div class="panel wide cl-panel">
      <header class="fb-head"><h2 id="lb-title">Leaderboard <span class="cl-beta">beta</span></h2>
        <button class="icon-btn" type="button" id="lb-close" data-back aria-label="Close leaderboard">&times;</button></header>
      <p class="muted">Best time per player on each mission. Times come from players' own devices and are <b>not verified</b>, so treat them as friendly competition.</p>
      <div class="cl-lb-pick">
        <button class="icon-btn" type="button" id="lb-prev" aria-label="Previous mission"${i === 0 ? ' disabled' : ''}>&#8249;</button>
        <label class="sr-only" for="lb-level">Mission</label><select id="lb-level">${options}</select>
        <button class="icon-btn" type="button" id="lb-next" aria-label="Next mission"${i >= levels.length - 1 ? ' disabled' : ''}>&#8250;</button>
        <button class="btn" type="button" id="lb-refresh">Refresh</button></div>
      <div id="lb-body" aria-live="polite">${body}</div></div>`;
    const q = <T extends HTMLElement>(sel: string): T | null => this.board.querySelector<T>(sel);
    const go = (level: string): void => {
      this.boardLevel = level;
      this.boardLimit = PAGE_SIZE;
      void this.refreshBoard(false);
    };
    q('#lb-close')?.addEventListener('click', () => {
      this.d.click(true);
      this.close(this.board);
    });
    q<HTMLSelectElement>('#lb-level')?.addEventListener('change', (e) => go((e.target as HTMLSelectElement).value));
    q('#lb-prev')?.addEventListener('click', () => levels[i - 1] && go(levels[i - 1].id));
    q('#lb-next')?.addEventListener('click', () => levels[i + 1] && go(levels[i + 1].id));
    q('#lb-refresh')?.addEventListener('click', () => {
      this.d.click();
      void this.refreshBoard(true);
    });
    q('#lb-more')?.addEventListener('click', () => {
      this.boardLimit = Math.min(100, this.boardLimit + 25);
      void this.refreshBoard(true);
    });
  }

  // -------------------------------------------------------------------------------------------- privacy

  /** Fills the Privacy tab of the settings screen. */
  mountPrivacy(el: HTMLElement): void {
    this.privacyPane = el;
    this.renderPrivacy();
    this.d.privacy.onChange(() => this.renderPrivacy());
    this.d.cloud.onStatus(() => this.renderPrivacy());
  }

  private renderPrivacy(): void {
    const el = this.privacyPane;
    if (!el) return;
    const on = this.d.privacy.analytics;
    const s = this.d.cloud.status;
    el.innerHTML = `
      <div class="field"><label for="set-analytics">Share anonymous gameplay statistics</label><input id="set-analytics" type="checkbox"${on ? ' checked' : ''} aria-describedby="priv-what" /></div>
      <div id="priv-what" class="cl-priv">
        <p><b>Off unless you turn it on.</b> You can change your mind at any time; turning it off stops collection and discards anything not yet sent.</p>
        <p><b>What is shared:</b> which missions and vehicles are played, completion and failure counts, how long runs take, upgrades bought, a coarse device class (desktop, phone or tablet), your graphics quality, and where on a mission's road drivers crash, get stuck, run out of fuel, recover or give up, as a position from 0 to 100 percent along the road.</p>
        <p><b>What is never shared:</b> your name, email address, password, location, IP address stored by us, keyboard or touch input, or anything you type.</p>
        <p class="muted">These summaries help balance the missions. They are sent as one small summary per session, not as a stream. Signing in and saving your progress online work whether this is on or off.</p>
      </div>
      <h3>Your online data</h3>
      <p class="muted">${s.user ? 'Your progress is stored under an anonymous player id' + (s.user.email ? ' linked to your sign-in' : '') + '. Leaderboard entries show your display name.' : 'Nothing about you is stored online right now.'}</p>
      <div class="stack"><button class="btn" type="button" id="priv-delete"${s.user ? '' : ' disabled'}>Remove my online progress and leaderboard times</button></div>
      <p class="muted" id="priv-msg" role="status" aria-live="polite">${esc(this.privMsg)}</p>
      ${this.d.dev ? '<h3>Developer</h3><div class="stack"><button class="btn" type="button" id="priv-heatmap">Open the incident heatmap</button></div>' : ''}`;
    el.querySelector<HTMLInputElement>('#set-analytics')?.addEventListener('change', (e) => {
      this.d.privacy.setAnalytics((e.target as HTMLInputElement).checked);
    });
    el.querySelector('#priv-delete')?.addEventListener('click', () => {
      if (!confirm('Remove your online progress and leaderboard times? This cannot be undone. The progress on this device is not touched.')) return;
      void this.d.cloud.deleteOnlineData().then(
        () => {
          this.privMsg = 'Removed.';
          this.renderPrivacy();
        },
        (e: Error) => {
          this.privMsg = e.message;
          this.renderPrivacy();
        },
      );
    });
    el.querySelector('#priv-heatmap')?.addEventListener('click', () => this.d.onOpenHeatmap());
  }

  // ---------------------------------------------------------------------------------------- menu card

  /** The one-time, non-blocking question on the main menu. Returns the markup, or '' once answered. */
  privacyCardHtml(): string {
    if (this.d.privacy.decided || this.d.cloud.status.connection === 'disabled') return '';
    return `<div class="cl-card-ask" id="privacy-card" role="region" aria-label="Optional statistics">
      <p><b>Help improve the game?</b> Share anonymous statistics about how missions go. Off by default; no names, emails or locations. Change it any time in Settings, Privacy.</p>
      <div class="stack"><button class="btn" type="button" id="privacy-yes">Yes, share</button><button class="btn ghost" type="button" id="privacy-no">No thanks</button></div></div>`;
  }

  /** Renders the status chip and the privacy question into the menu slot. */
  renderMenuSlot(slot: HTMLElement): void {
    const s = this.d.cloud.status;
    slot.innerHTML = `<button class="cl-chip ${s.sync === 'conflict' || s.sync === 'failed' ? 'warn' : s.connection === 'guest' || s.connection === 'account' ? 'ok' : ''}" type="button" id="btn-menu-profile" aria-label="Profile and online status: ${esc(statusLine(s))}"><span class="dot" aria-hidden="true"></span><span>${esc(statusLine(s))}</span></button>${this.privacyCardHtml()}`;
    slot.querySelector('#btn-menu-profile')?.addEventListener('click', () => {
      this.d.click();
      this.openProfile();
    });
    slot.querySelector('#privacy-yes')?.addEventListener('click', () => {
      this.d.click();
      this.d.privacy.setAnalytics(true);
      this.renderMenuSlot(slot);
    });
    slot.querySelector('#privacy-no')?.addEventListener('click', () => {
      this.d.click(true);
      this.d.privacy.setAnalytics(false);
      this.renderMenuSlot(slot);
    });
  }
}
