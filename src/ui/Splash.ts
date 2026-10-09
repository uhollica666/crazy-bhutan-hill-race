/**
 * Novarah Interactives studio splash. Plays once per app start, can be skipped by any key, click or tap, is
 * shortened on later loads in the same browser session, and respects prefers-reduced-motion.
 * The official artwork is `public/brand/novarah-logo.webp` (derived from the supplied novarah-logo.png).
 */
const SESSION_KEY = 'cbhr.splash.seen';

export interface SplashOptions {
  /** Do not show at all (tests, ?nosplash). */
  skip?: boolean;
}

function seenThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* private mode */
  }
}

/** Resolves when the splash has finished or been skipped (and removed from the DOM). */
export function showSplash(host: HTMLElement, base: string, opts: SplashOptions = {}): Promise<void> {
  if (opts.skip) return Promise.resolve();
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const short = seenThisSession() || reduced;
  const el = document.createElement('div');
  el.id = 'splash';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Novarah Interactives, a Novarah Technologies studio');
  el.className = short ? 'studio-splash short' : 'studio-splash';
  el.innerHTML = `
    <div class="splash-glow"></div>
    <div class="splash-inner">
      <img class="splash-logo" src="${base}brand/novarah-logo.webp" alt="" width="468" height="133" decoding="async" />
      <div class="splash-name">Novarah Interactives</div>
      <div class="splash-parent">A creative studio of Novarah Technologies</div>
    </div>
    <div class="splash-skip" aria-hidden="true">Tap or press any key to skip</div>`;
  host.appendChild(el);

  return new Promise<void>((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      markSeen();
      window.removeEventListener('keydown', finish);
      el.removeEventListener('pointerdown', finish);
      el.classList.add('out');
      window.setTimeout(() => {
        el.remove();
        resolve();
      }, 380);
    };
    window.addEventListener('keydown', finish);
    el.addEventListener('pointerdown', finish);
    window.setTimeout(finish, short ? 1100 : 3000);
  });
}
