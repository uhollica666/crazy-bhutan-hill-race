import { describe, expect, it } from 'vitest';
import { listLevels } from '../src/data/levels';
import { MAP_PINS, MAP_VIEW, pinFor, routePath } from '../src/data/mapLayout';
import { listVehicles } from '../src/data/vehicles';
import { MAX_UPGRADE_LEVEL, applyUpgrades, upgradePreview } from '../src/data/upgrades';
import { VOICES, voiceFor } from '../src/audio/voices';
import { defaultSettings, parseSettings } from '../src/storage/SaveStore';
import { renderCampaignMap, renderMapPreview } from '../src/ui/CampaignMap';
import type { LevelCardModel } from '../src/ui/UI';

const card = (id: string, i: number, over: Partial<LevelCardModel> = {}): LevelCardModel => ({
  id,
  name: `Mission ${i + 1}`,
  subtitle: 'sub',
  difficulty: 2,
  missionLabel: 'Mountain run',
  locked: false,
  lockText: '',
  medal: 'none',
  bestTime: null,
  isNew: false,
  vehicleNames: ['Dzo Hatch'],
  selected: false,
  reward: 100,
  region: 'Paro & Thimphu',
  recommended: 'Dzo Hatch',
  challenge: 'Rain · Low fuel',
  isNext: false,
  ...over,
});

describe('campaign map layout', () => {
  const levels = listLevels();

  it('places every campaign mission on the map, inside the frame, without overlapping pins', () => {
    const pts = levels.map((l, i) => pinFor(l.id, i));
    for (const l of levels) expect(MAP_PINS[l.id], l.id).toBeDefined();
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(40);
      expect(p.x).toBeLessThan(MAP_VIEW.width - 40);
      expect(p.y).toBeGreaterThan(40);
      expect(p.y).toBeLessThan(MAP_VIEW.height - 40);
    }
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThan(70);
  });

  it('a mission without a hand-placed pin still gets a position', () => {
    const p = pinFor('some-future-level', 11);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });

  it('the road path passes through every pin in order', () => {
    const pts = levels.map((l, i) => pinFor(l.id, i));
    const d = routePath(pts);
    expect(d.startsWith(`M${pts[0].x} ${pts[0].y}`)).toBe(true);
    expect((d.match(/Q/g) ?? []).length).toBe(pts.length - 1);
    expect(routePath([pts[0]])).toBe('');
  });
});

describe('campaign map markup', () => {
  const levels = listLevels();
  const cards = levels.map((l, i) => card(l.id, i, { locked: i > 2, lockText: 'Finish the previous mission', isNext: i === 2, bestTime: i < 2 ? 80 + i : null, medal: i === 0 ? 'gold' : i === 1 ? 'silver' : 'none' }));

  it('renders one real button per mission with an accessible label, and marks locks, completion and the next mission', () => {
    const html = renderCampaignMap(cards, cards[2].id);
    expect((html.match(/data-pin="/g) ?? []).length).toBe(10);
    expect((html.match(/<button class="map-pin/g) ?? []).length).toBe(10);
    expect(html).toContain('aria-label="1. Mission 1, completed, gold medal"');
    expect(html).toContain('next mission');
    expect(html).toContain('locked: Finish the previous mission');
    expect((html.match(/ locked"/g) ?? []).length).toBe(7);
    expect(html).toContain('class="map-pin next selected"');
  });

  it('escapes mission text', () => {
    const html = renderCampaignMap([card('pass-run', 0, { name: '<img src=x onerror=alert(1)>' })], null);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('the preview shows lock text for locked missions and disables the button', () => {
    const locked = renderMapPreview(cards[5], false);
    expect(locked).toContain('Finish the previous mission');
    expect(locked).toContain('disabled');
    const open = renderMapPreview(cards[1], true);
    expect(open).toContain('Best 1:21.00');
    expect(open).toContain('silver medal');
    expect(open).not.toContain('disabled');
  });
});

describe('garage upgrade preview', () => {
  const hatch = listVehicles().find((v) => v.id === 'dzo-hatch')!;

  it('reports the same numbers the physics will use', () => {
    const rows = upgradePreview(hatch, {}, 'engine')!;
    const next = applyUpgrades(hatch, { engine: 1 });
    expect(rows[0].label).toBe('Top speed');
    expect(rows[0].before).toBe(`${Math.round(hatch.engine.topSpeed * 3.6)} km/h`);
    expect(rows[0].after).toBe(`${Math.round(next.engine.topSpeed * 3.6)} km/h`);
    expect(rows[0].before).not.toBe(rows[0].after);
  });

  it('every available upgrade of every vehicle shows a real change; maxed ones show nothing', () => {
    for (const v of listVehicles()) {
      for (const id of v.upgrades) {
        const rows = upgradePreview(v, {}, id)!;
        expect(rows.length, `${v.id}/${id}`).toBeGreaterThan(0);
        expect(rows.some((r) => r.before !== r.after), `${v.id}/${id}`).toBe(true);
        expect(upgradePreview(v, { [id]: MAX_UPGRADE_LEVEL }, id)).toBeNull();
      }
    }
  });
});

describe('engine voices', () => {
  it('the four vehicles have clearly different recipes', () => {
    const ids = ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser'];
    const idle = ids.map((i) => VOICES[i].idleHz);
    expect(new Set(idle).size).toBe(4);
    // The hatch is the highest and lightest, the cruiser the heaviest.
    expect(VOICES['dzo-hatch'].idleHz).toBeGreaterThan(VOICES['druk-ranger'].idleHz);
    expect(VOICES['dragon-cruiser'].sub).toBeGreaterThan(VOICES['dzo-hatch'].sub);
    expect(VOICES['dragon-cruiser'].whine).toBeGreaterThan(VOICES['dzo-hatch'].whine);
    expect(VOICES['tourist-coaster'].gain).toBeGreaterThan(VOICES['dzo-hatch'].gain);
  });

  it('an unknown vehicle gets a neutral voice built from its audio profile', () => {
    const v = voiceFor('nope', { idleHz: 50, rangeHz: 90, cutoff: 700, harsh: 0.4, rumble: 0.2 });
    expect(v.idleHz).toBe(50);
    expect(v.cutoff).toBe(700);
  });
});

describe('Pass 4.5 settings', () => {
  it('defaults are the established look and feel', () => {
    const s = defaultSettings('medium');
    expect(s.touchSteer).toBe('bar');
    expect(s.touchMirror).toBe(false);
    expect(s.touchLarge).toBe(false);
    expect(s.levelsView).toBe('map');
    expect(s.ambientVolume).toBeGreaterThan(0);
    expect(s.hudMode).toBe('standard');
  });

  it('older saves without the new fields still load, and bad values fall back', () => {
    const fb = defaultSettings('medium');
    const old = parseSettings({ masterVolume: 0.3, quality: 'low' }, fb);
    expect(old.masterVolume).toBe(0.3);
    expect(old.touchSteer).toBe('bar');
    expect(old.levelsView).toBe('map');
    const bad = parseSettings({ touchSteer: 'joystick', levelsView: 7, touchMirror: 'yes', ambientVolume: 9, hudMode: 'x' }, fb);
    expect(bad.touchSteer).toBe('bar');
    expect(bad.levelsView).toBe('map');
    expect(bad.touchMirror).toBe(false);
    expect(bad.ambientVolume).toBeLessThanOrEqual(1);
    expect(bad.hudMode).toBe('standard');
    const good = parseSettings({ touchSteer: 'wheel', levelsView: 'list', touchMirror: true, touchLarge: true, hudMode: 'telemetry' }, fb);
    expect(good).toMatchObject({ touchSteer: 'wheel', levelsView: 'list', touchMirror: true, touchLarge: true, hudMode: 'telemetry' });
  });
});
