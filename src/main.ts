import './ui/styles.css';
import './ui/stage2.css';
import './ui/stage3.css';
import './ui/hud.css';
import './ui/cloud.css';
import './ui/brand.css';
import './ui/tutorial.css';
import { Game } from './app/Game';
import { registerServiceWorker } from './pwa/register';
import { isWebGLAvailable } from './render/GameRenderer';
import { detectDefaultQuality } from './render/quality';
import { SaveStore, openBrowserStorage } from './storage/SaveStore';
import { showSplash } from './ui/Splash';

function fatal(host: HTMLElement, title: string, message: string, detail = ''): void {
  host.innerHTML = `<section class="screen" style="background:#1b140f;z-index:99"><div class="panel loader" style="text-align:center">
    <h2>${title}</h2><p>${message}</p><div class="detail" style="font:12px monospace;opacity:.7;word-break:break-word">${detail}</div>
    <div class="stack" style="margin-top:16px"><button class="btn primary" onclick="location.reload()">Reload</button></div></div></section>`;
}

async function boot(): Promise<void> {
  const uiHost = document.getElementById('ui') as HTMLElement;
  const viewport = document.getElementById('viewport') as HTMLElement;
  const params = new URLSearchParams(location.search);
  const base = import.meta.env.BASE_URL;
  // The studio splash starts straight away, on top of everything; the game loads behind it.
  const splash = showSplash(document.body, base, { skip: params.has('nosplash'), hold: params.has('splashhold') });

  if (!isWebGLAvailable()) {
    fatal(
      uiHost,
      'WebGL is not available',
      'This game draws its 3D world with WebGL, which your browser or device has disabled or does not support. Try a current version of Chrome, Edge, Firefox or Safari, and make sure hardware acceleration is turned on.',
    );
    return;
  }

  const forced = params.get('quality');
  const store = new SaveStore(openBrowserStorage(), detectDefaultQuality(window));
  if (forced === 'low' || forced === 'medium' || forced === 'high') store.updateSettings({ quality: forced });

  let game: Game | null = null;
  try {
    game = new Game({
      viewport,
      uiHost,
      store,
      debug: params.has('debug'),
      autodrive: params.has('autodrive'),
      fixedResolution: params.has('noadapt') || params.has('debug'),
      splash,
      base,
    });
    await game.init();
    if (params.has('debug')) {
      (window as unknown as { __cbhr: unknown }).__cbhr = game.debugApi();
      game.ui.setDebug('');
    }
    registerServiceWorker(() =>
      game?.ui.toast('A new version of the game is ready.', 'Reload', () => location.reload(), 20000),
    );
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : String(err);
    if (game)
      game.ui.showError('Could not start the game', 'Something went wrong while building the world.', msg);
    else fatal(uiHost, 'Could not start the game', 'Something went wrong while starting up.', msg);
  }
}

void boot();
