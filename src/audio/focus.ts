/**
 * Knows whether the game is "in the background": the tab is hidden, the window has lost focus or is minimised, or the page has been
 * frozen or put in the back-forward cache. Everything the game can hear is silenced while this is true (see AudioEngine.setBackground
 * and MusicManager.setBackground).
 *
 * Sources, all through standard events so one code path serves the browser, Windows (Tauri/WebView2) and Android (WebView):
 *  - `visibilitychange` (tab switch, minimise, Android activity pause, screen off);
 *  - window `blur` / `focus` (another window or the dev tools took the focus; WebView2 raises these when the native window does);
 *  - `pagehide` / `pageshow` and the Page Lifecycle `freeze` / `resume`;
 *  - Tauri's own `tauri://blur` / `tauri://focus` window events when the Tauri global is present (a belt for the braces above).
 */
export interface FocusEnv {
  win: Window;
  doc: Document;
}

type Listener = (background: boolean) => void;

interface TauriGlobal {
  event?: { listen?: (name: string, cb: () => void) => Promise<() => void> };
}

export class AudioFocus {
  private hidden = false;
  private blurred = false;
  private frozen = false;
  private tauriBlurred = false;
  private last = false;
  private readonly listeners = new Set<Listener>();
  private readonly disposers: (() => void)[] = [];

  constructor(env: FocusEnv = { win: window, doc: document }) {
    const { win, doc } = env;
    this.hidden = doc.visibilityState === 'hidden';
    this.blurred = typeof doc.hasFocus === 'function' ? !doc.hasFocus() : false;
    this.last = this.background;
    const on = <T extends EventTarget>(target: T, type: string, fn: (e: Event) => void): void => {
      target.addEventListener(type, fn);
      this.disposers.push(() => target.removeEventListener(type, fn));
    };
    on(doc, 'visibilitychange', () => this.set({ hidden: doc.visibilityState === 'hidden' }));
    on(win, 'blur', () => this.set({ blurred: true }));
    on(win, 'focus', () => this.set({ blurred: false }));
    on(win, 'pagehide', () => this.set({ frozen: true }));
    on(win, 'pageshow', () => this.set({ frozen: false, hidden: doc.visibilityState === 'hidden', blurred: typeof doc.hasFocus === 'function' ? !doc.hasFocus() : false }));
    on(doc, 'freeze', () => this.set({ frozen: true }));
    on(doc, 'resume', () => this.set({ frozen: false }));
    const tauri = (win as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
    const listen = tauri?.event?.listen;
    if (listen) {
      void listen('tauri://blur', () => this.set({ tauriBlurred: true })).then((off) => this.disposers.push(off), () => undefined);
      void listen('tauri://focus', () => this.set({ tauriBlurred: false })).then((off) => this.disposers.push(off), () => undefined);
    }
  }

  /** True when nothing should be audible. */
  get background(): boolean {
    return this.hidden || this.blurred || this.frozen || this.tauriBlurred;
  }

  /** Calls back whenever the answer changes (not on every event). */
  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(next: Partial<{ hidden: boolean; blurred: boolean; frozen: boolean; tauriBlurred: boolean }>): void {
    if (next.hidden !== undefined) this.hidden = next.hidden;
    if (next.blurred !== undefined) this.blurred = next.blurred;
    if (next.frozen !== undefined) this.frozen = next.frozen;
    if (next.tauriBlurred !== undefined) this.tauriBlurred = next.tauriBlurred;
    const now = this.background;
    if (now === this.last) return;
    this.last = now;
    for (const fn of [...this.listeners]) fn(now);
  }

  dispose(): void {
    for (const d of this.disposers.splice(0)) d();
    this.listeners.clear();
  }
}
