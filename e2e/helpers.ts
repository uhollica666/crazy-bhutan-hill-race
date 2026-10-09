import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface GameState {
  flow: string;
  menu: string;
  phase: string | null;
  time: number;
  speed: number;
  checkpoints: number;
  position: [number, number, number];
  grounded: number;
  progress: number;
  fps: number;
  cpuMs: number;
  quality: string;
  levelId: string;
  vehicleId: string;
  comfort: number | null;
  pixelRatio: number;
  stats: { calls: number; triangles: number; geometries: number; textures: number };
  fuel: number;
  health: number;
  onboard: number;
  party: number;
  gate: string | null;
  objective: { kind: string; label: string; distance: number } | null;
  driveMode: string;
  credits: number;
  servicesUsed: number;
  weather: string;
  time_of_day: string;
  loaner: boolean;
  lights: boolean;
}

type Api = {
  state(): unknown;
  autodrive(on: boolean): void;
  warp(s: number): void;
  course(): unknown;
  setFuel(f: number): void;
  grantCredits(n: number): void;
  analytics(): { name: string }[];
};

export const state = (page: Page): Promise<GameState> => page.evaluate(() => (window as unknown as { __cbhr: Api }).__cbhr.state() as never);

export const NAMES: Record<string, string> = {
  'dzo-hatch': 'Dzo Hatch',
  'tourist-coaster': 'Tourist Coaster',
  'druk-ranger': 'Druk Ranger',
  'dragon-cruiser': 'Dragon Cruiser',
};

export const SAVE_KEY = 'cbhr.v3.save';

export interface SaveOptions {
  /** Missions that count as completed. */
  finished?: string[];
  owned?: string[];
  credits?: number;
  /** Story briefings already read. Defaults to every mission so tests go straight to the road. */
  storySeen?: string[] | 'all';
  upgrades?: Record<string, Record<string, number>>;
}

const ALL_LEVELS = ['pass-run', 'thimphu-pickup', 'airport-dash', 'chelela-climb', 'remote-expedition'];

/** A v3 save document. */
export function makeSave(o: SaveOptions = {}): string {
  const levels: Record<string, unknown> = {};
  for (const id of o.finished ?? []) {
    levels[id] = {
      completions: 1,
      medal: 'bronze',
      vehicles: {
        'dzo-hatch': { bestTime: 130, bestScore: 40, bestComfort: null, medal: 'bronze', completions: 1 },
      },
    };
  }
  return JSON.stringify({
    version: 3,
    settings: {
      masterVolume: 0.8,
      musicVolume: 0,
      sfxVolume: 0.9,
      muted: true,
      quality: 'medium',
      touchControls: 'auto',
      touchSensitivity: 1,
      reducedMotion: false,
    },
    progress: { levels },
    selection: { levelId: null, vehicleId: null },
    history: [],
    wallet: { credits: o.credits ?? 0 },
    garage: { owned: o.owned ?? ['dzo-hatch'], upgrades: o.upgrades ?? {} },
    story: { seen: o.storySeen === undefined || o.storySeen === 'all' ? ALL_LEVELS : o.storySeen },
    stats: { missionsPlayed: 0, creditsEarned: 0 },
  });
}

/** Seeds localStorage before the game boots (only on the first navigation, so reloads keep real saves). */
export async function seedSave(page: Page, json: string): Promise<void> {
  await page.addInitScript(
    ([key, s]) => {
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.setItem(key, s);
        sessionStorage.setItem('__seeded', '1');
      }
    },
    [SAVE_KEY, json],
  );
}

/** Opens the game with the debug API and collects console errors. The studio splash is skipped unless asked for. */
export async function openGame(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()))
      errors.push(`console: ${m.text()}`);
  });
  await page.goto(`/?debug=1${query.includes('splash') ? '' : '&nosplash=1'}${query}`);
  await page.waitForFunction(() => !!(window as unknown as { __cbhr?: unknown }).__cbhr, undefined, {
    timeout: 90_000,
  });
  await expect(page.locator('#btn-start')).toBeVisible({ timeout: 30_000 });
  return errors;
}

export async function waitForPhase(page: Page, phase: string, timeout = 30_000): Promise<void> {
  await expect.poll(async () => (await state(page)).phase, { timeout }).toBe(phase);
}

/** Goes Drive -> mission card -> (optional vehicle) -> garage, without launching. */
export async function openGarage(page: Page, levelId: string, vehicleId?: string): Promise<void> {
  await page.locator('#btn-start').click();
  await expect(page.locator('#screen-levels')).toBeVisible();
  await page.locator(`button[data-level="${levelId}"]`).click();
  await expect(page.locator('#screen-garage')).toBeVisible({ timeout: 30_000 });
  if (vehicleId) {
    for (let i = 0; i < 5 && (await page.locator('#veh-name').textContent()) !== NAMES[vehicleId]; i++) {
      await page.locator('#btn-veh-next').click();
    }
    await expect(page.locator('#veh-name')).toHaveText(NAMES[vehicleId]);
    await expect.poll(async () => (await state(page)).vehicleId).toBe(vehicleId);
  }
}

/** Full UI path into a running mission (dismisses the story briefing if it appears). */
export async function startMission(page: Page, levelId: string, vehicleId?: string): Promise<void> {
  await openGarage(page, levelId, vehicleId);
  await page.locator('#btn-launch').click();
  const brief = page.locator('#brief-go');
  if (await brief.isVisible().catch(() => false)) await brief.click();
  await expect(page.locator('#hud')).toBeVisible();
  await waitForPhase(page, 'running', 30_000);
}

export const drive = (page: Page, on = true): Promise<void> => page.evaluate((v) => (window as unknown as { __cbhr: Api }).__cbhr.autodrive(v), on);

export const warp = (page: Page, s: number): Promise<void> => page.evaluate((v) => (window as unknown as { __cbhr: Api }).__cbhr.warp(v), s);

export const setFuel = (page: Page, f: number): Promise<void> => page.evaluate((v) => (window as unknown as { __cbhr: Api }).__cbhr.setFuel(v), f);

export const grantCredits = (page: Page, n: number): Promise<void> => page.evaluate((v) => (window as unknown as { __cbhr: Api }).__cbhr.grantCredits(v), n);

export const analyticsEvents = (page: Page): Promise<{ name: string }[]> => page.evaluate(() => (window as unknown as { __cbhr: Api }).__cbhr.analytics());

export interface CourseInfo {
  length: number;
  startS: number;
  finishS: number;
  checkpointS: number[];
  stops: { id: string; kind: string; s: number }[];
}

export const courseInfo = (page: Page): Promise<CourseInfo> =>
  page.evaluate(() => (window as unknown as { __cbhr: Api }).__cbhr.course() as never);

export const storedSave = async (page: Page): Promise<Record<string, any>> => // eslint-disable-line @typescript-eslint/no-explicit-any
  JSON.parse((await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY)) as string);
