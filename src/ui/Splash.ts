/**
 * Start-up sequence: Novarah Interactives (studio card) -> Crazy Bhutan Hill Race (title reveal) -> menu.
 *
 * - First launch on a device: both cards (about 4 s). Later launches: the title card only (about 1.6 s).
 *   A reload in the same session: a quick title flash (about 0.9 s).
 * - Any key, click or tap skips straight to the menu. `prefers-reduced-motion` gets still cards, no movement.
 * - Third-party tools and services are credited in About, never as splash logos.
 *
 * The official artwork is `public/brand/novarah-logo.webp` and `public/brand/cbhr-logo.webp` (derived from the
 * supplied PNGs, which are kept untouched at the repository root).
 */
const SESSION_KEY = 'cbhr.splash.seen';
const LAUNCH_KEY = 'cbhr.intro.launched';

export interface SplashOptions {
  /** Do not show at all (tests, ?nosplash). */
  skip?: boolean;
  /** Stay on the first card until a key or tap (used by tests that need to inspect the splash). */
  hold?: boolean;
}

function read(store: 'session' | 'local', key: string): boolean {
  try {
    return (store === 'session' ? sessionStorage : localStorage).getItem(key) === '1';
  } catch {
    return false;
  }
}

function write(store: 'session' | 'local', key: string): void {
  try {
    (store === 'session' ? sessionStorage : localStorage).setItem(key, '1');
  } catch {
    /* private mode */
  }
}

/** Resolves when the intro has finished or been skipped (and removed from the DOM). */
export function showSplash(host: HTMLElement, base: string, opts: SplashOptions = {}): Promise<void> {
  if (opts.skip) return Promise.resolve();
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const sameSession = read('session', SESSION_KEY);
  const returning = read('local', LAUNCH_KEY);
  const short = sameSession;
  const studioCard = !returning && !sameSession;
  const el = document.createElement('div');
  el.id = 'splash';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Novarah Interactives presents Crazy Bhutan Hill Race');
  el.className = ['studio-splash', short ? 'short' : '', reduced ? 'still' : '', studioCard ? 'stage-studio' : 'stage-title']
    .filter(Boolean)
    .join(' ');
  el.innerHTML = `
    <div class="splash-glow"></div>
    <div class="splash-streaks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="splash-card splash-studio">
      <img class="splash-logo" src="${base}brand/novarah-logo.webp" alt="" width="468" height="133" decoding="async" />
      <div class="splash-name">Novarah Interactives</div>
      <div class="splash-parent">A creative studio of Novarah Technologies</div>
    </div>
    <div class="splash-card splash-title">
      <img class="splash-game" src="${base}brand/cbhr-logo.webp" alt="" width="360" height="360" decoding="async" />
      <div class="splash-tag">Deliver your guests. Beat the mist.</div>
    </div>
    <div class="splash-skip" aria-hidden="true">Tap or press any key to skip</div>`;
  host.appendChild(el);

  return new Promise<void>((resolve) => {
    let done = false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number): void => {
      timers.push(window.setTimeout(fn, ms));
    };
    const finish = (): void => {
      if (done) return;
      done = true;
      write('session', SESSION_KEY);
      write('local', LAUNCH_KEY);
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('keydown', finish);
      // The key that skipped the intro must not also press whatever button the menu focuses next (Space/Enter
      // activate a focused button on key release).
      const swallow = (e: KeyboardEvent): void => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      window.addEventListener('keyup', swallow, true);
      window.setTimeout(() => window.removeEventListener('keyup', swallow, true), 700);
      el.removeEventListener('pointerdown', finish);
      el.classList.add('out');
      window.setTimeout(() => {
        el.remove();
        resolve();
      }, 380);
    };
    window.addEventListener('keydown', finish);
    el.addEventListener('pointerdown', finish);
    if (opts.hold) return;
    if (studioCard) {
      later(() => {
        el.classList.remove('stage-studio');
        el.classList.add('stage-title');
      }, reduced ? 1500 : 1900);
      later(finish, reduced ? 3000 : 4100);
    } else {
      later(finish, short ? 900 : reduced ? 1200 : 1700);
    }
  });
}
