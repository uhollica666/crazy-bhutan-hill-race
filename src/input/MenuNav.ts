type Dir = 'left' | 'right' | 'up' | 'down';

const FOCUSABLE = 'button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard-arrow and gamepad navigation for the menu screens. Screens are plain DOM with real buttons, so
 * Tab / Enter / Space already work; this adds spatial arrow movement, Escape/B for "back" and A to activate.
 */
export class MenuNav {
  private prevPad: boolean[] = [];
  private repeatAt = 0;
  private lastDir: Dir | null = null;

  constructor(
    private readonly root: HTMLElement,
    /** True while a menu (not the HUD) is on screen. */
    private readonly isActive: () => boolean,
  ) {
    window.addEventListener('keydown', this.onKey);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
  }

  /** The foremost visible screen: later `data-screen` elements (modals) sit above earlier ones. */
  private topScreen(): HTMLElement | null {
    const screens = Array.from(this.root.querySelectorAll<HTMLElement>('[data-screen]')).filter(
      (s) => !s.hidden,
    );
    return screens.length ? screens[screens.length - 1] : null;
  }

  private items(screen: HTMLElement): HTMLElement[] {
    return Array.from(screen.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) =>
        el.getClientRects().length > 0 &&
        !el.hasAttribute('hidden') &&
        el.getAttribute('aria-disabled') !== 'true',
    );
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.isActive() || e.ctrlKey || e.metaKey || e.altKey) return;
    const dir: Dir | null =
      e.key === 'ArrowLeft'
        ? 'left'
        : e.key === 'ArrowRight'
          ? 'right'
          : e.key === 'ArrowUp'
            ? 'up'
            : e.key === 'ArrowDown'
              ? 'down'
              : null;
    if (!dir) return;
    const a = document.activeElement as HTMLElement | null;
    // Sliders and dropdowns keep their own arrow behaviour.
    if (a instanceof HTMLSelectElement) return;
    if (a instanceof HTMLInputElement && a.type === 'range' && (dir === 'left' || dir === 'right')) return;
    if (this.move(dir)) e.preventDefault();
  };

  /** Moves focus to the nearest control in a direction. Returns true if focus changed. */
  move(dir: Dir): boolean {
    const screen = this.topScreen();
    if (!screen) return false;
    const items = this.items(screen);
    if (!items.length) return false;
    const current = document.activeElement as HTMLElement | null;
    if (!current || !items.includes(current)) {
      items[0].focus({ preventScroll: false });
      return true;
    }
    const c = current.getBoundingClientRect();
    const cx = c.left + c.width / 2;
    const cy = c.top + c.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of items) {
      if (el === current) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx;
      const dy = r.top + r.height / 2 - cy;
      const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      if (along <= 1) continue;
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (!best) return false;
    best.focus({ preventScroll: false });
    best.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    return true;
  }

  /** Clicks the current screen's back control (Escape on screens that do not handle it themselves, B on a pad). */
  back(): boolean {
    const screen = this.topScreen();
    const btn = screen?.querySelector<HTMLElement>('[data-back]');
    if (!btn) return false;
    btn.click();
    return true;
  }

  /** Call once per frame while menus are shown. */
  pollGamepad(now: number): void {
    if (!this.isActive() || typeof navigator.getGamepads !== 'function') return;
    const pad = Array.from(navigator.getGamepads()).find((p) => p && p.connected);
    if (!pad) return;
    const down = pad.buttons.map((b) => b.pressed);
    const edge = (i: number): boolean => !!down[i] && !this.prevPad[i];
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    let dir: Dir | null = null;
    if (down[14] || ax < -0.6) dir = 'left';
    else if (down[15] || ax > 0.6) dir = 'right';
    else if (down[12] || ay < -0.6) dir = 'up';
    else if (down[13] || ay > 0.6) dir = 'down';
    if (dir) {
      if (dir !== this.lastDir || now >= this.repeatAt) {
        this.move(dir);
        this.repeatAt = now + (dir !== this.lastDir ? 380 : 140);
      }
    }
    this.lastDir = dir;
    if (edge(0)) (document.activeElement as HTMLElement | null)?.click?.();
    if (edge(1)) this.back();
    this.prevPad = down;
  }
}
