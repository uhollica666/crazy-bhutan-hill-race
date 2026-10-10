import { activeChannels, loadSupportConfig, openExternal, pendingChannels } from '../support/supportLinks';
import type { SupportChannel, SupportConfig } from '../support/supportLinks';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface SupportDeps {
  host: HTMLElement;
  /** Base URL of the app (for support.json and QR images). */
  base: string;
  click: (back?: boolean) => void;
  onClose: () => void;
  /** Opens the in-game feedback form (the "tell us you would like to help" route). */
  openFeedback: () => void;
}

/**
 * "Support Novarah Interactives": a warm, plain explanation and, only when the developer has verified a real channel, the ways to
 * contribute. The game is fully playable without any contribution and nothing here unlocks anything.
 */
export class SupportScreen {
  readonly el: HTMLElement;
  private config: SupportConfig | null = null;

  constructor(private readonly d: SupportDeps) {
    const el = (this.el = document.createElement('div'));
    el.className = 'modal support';
    el.id = 'screen-support';
    el.dataset.screen = '1';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'support-title');
    el.innerHTML = `<div class="panel wide support-panel">
      <header class="fb-head"><h2 id="support-title">Support Novarah Interactives</h2>
        <button class="icon-btn" type="button" id="support-close" data-back aria-label="Close">&times;</button></header>
      <div class="support-body">
        <p class="support-lede">Crazy Bhutan Hill Race is free to play, with no ads and nothing for sale. If it made you smile and you would like to help us make more Bhutan-inspired games, voluntary support is warmly welcome, and entirely optional.</p>
        <ul class="support-promises">
          <li>The game stays fully playable without any contribution.</li>
          <li>Contributing never unlocks gameplay advantages, vehicles or content.</li>
          <li>The game never asks for card or bank details: payment happens on the provider's own page.</li>
          <li>Contributions are gifts to a small studio, not tax-deductible donations.</li>
        </ul>
        <div class="support-channels" id="support-channels" aria-live="polite"><p class="muted">Loading...</p></div>
      </div>
      <div class="stack fb-actions">
        <button class="btn" type="button" id="support-feedback">Tell us how it went</button>
        <button class="btn primary" type="button" id="support-done" data-back>Close</button></div></div>`;
    d.host.appendChild(el);
    const close = (): void => {
      d.click(true);
      this.close();
    };
    el.querySelector('#support-close')?.addEventListener('click', close);
    el.querySelector('#support-done')?.addEventListener('click', close);
    el.querySelector('#support-feedback')?.addEventListener('click', () => {
      d.click();
      this.close(true);
      d.openFeedback();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    });
    el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-support-url]');
      if (!a) return;
      e.preventDefault();
      d.click();
      void openExternal(a.dataset.supportUrl ?? '', this.config?.allowedHosts ?? []);
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.el.hidden = false;
    this.el.querySelector<HTMLElement>('#support-done')?.focus({ preventScroll: true });
    void loadSupportConfig(this.d.base).then((cfg) => {
      this.config = cfg;
      this.render();
    });
  }

  close(silent = false): void {
    if (this.el.hidden) return;
    this.el.hidden = true;
    if (!silent) this.d.onClose();
  }

  private card(c: SupportChannel, active: boolean): string {
    const how = [c.recurring ? 'monthly' : '', c.oneTime ? 'one-time' : ''].filter(Boolean).join(' or ');
    const region = c.region ? `<span class="tag">${esc(c.region)}</span>` : '';
    if (!active) return `<div class="support-opt pending">${region}<b>${esc(c.title)}</b><small>Being set up. Not available yet${how ? ` (${esc(how)})` : ''}.</small></div>`;
    if (c.type === 'qr') {
      return `<div class="support-opt">${region}<b>${esc(c.title)}</b><img src="${esc(this.d.base)}download/${esc(c.qrImage ?? '')}" alt="${esc(c.title)} code" width="180" height="180" /><small>${esc(c.description ?? 'Scan with your banking app.')}</small></div>`;
    }
    return `<div class="support-opt">${region}<b>${esc(c.title)}</b><small>${esc(c.description ?? 'You will leave the game and pay on the provider’s own page.')}${how ? ` Available as ${esc(how)}.` : ''}</small><button class="btn primary" type="button" data-support-url="${esc(c.url ?? '')}">Support on ${esc(c.title)}</button></div>`;
  }

  private render(): void {
    const box = this.el.querySelector('#support-channels');
    if (!box) return;
    if (!this.config) {
      box.innerHTML = '<p class="muted">Support options could not be loaded right now. Nothing is needed from you: enjoy the game.</p>';
      return;
    }
    const active = activeChannels(this.config);
    const pending = pendingChannels(this.config);
    box.innerHTML = `${active.length ? '' : '<p class="muted">We are verifying our payment channels before switching anything on, so there is nothing to pay or scan yet. If you would like to hear when support opens, tell us in the feedback form.</p>'}${active.map((c) => this.card(c, true)).join('')}${pending.map((c) => this.card(c, false)).join('')}`;
  }

  dispose(): void {
    this.el.remove();
  }
}
