import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listLevels } from '../src/data/levels';
import { getCast, getStory } from '../src/data/story';

const UI = join(__dirname, '..', 'src', 'ui');
const css = readdirSync(UI)
  .filter((f) => f.endsWith('.css'))
  .map((f) => ({ f, text: readFileSync(join(UI, f), 'utf8') }));

describe('briefings read at a glance', () => {
  it('every level has a one-line problem, job and challenge that fit a card', () => {
    for (const l of listLevels()) {
      const s = getStory(l.id);
      expect(s, l.id).not.toBeNull();
      for (const key of ['problem', 'goal', 'challenge'] as const) {
        const line = s!.quick[key];
        expect(line.length, `${l.id}.${key}`).toBeGreaterThan(10);
        expect(line.length, `${l.id}.${key} too long for a card`).toBeLessThanOrEqual(72);
        expect(line, `${l.id}.${key} should be one sentence`).not.toMatch(/\.\s+[A-Z]/);
      }
      for (const p of s!.passengers) expect(getCast(p), `${l.id} cast ${p}`).not.toBeNull();
    }
  });
});

describe('brand colour system', () => {
  it('defines the Pass 5.5 tokens: charcoal surfaces, off-white text, magenta and orange accents', () => {
    const root = css.find((c) => c.f === 'styles.css')!.text;
    expect(root).toMatch(/--indigo-deep:\s*#0b0d13/i);
    expect(root).toMatch(/--maroon:\s*#d12c88/i); // magenta accent
    expect(root).toMatch(/--saffron:\s*#ff8a2a/i); // orange accent
    expect(root).toMatch(/--ink:\s*#eef0f7/i);
  });

  it('no stylesheet still uses the old parchment / brown / amber palette', () => {
    const legacy = /#(f6ecd2|e6d5ab|3a1d15|fbf1d8|e8a317|dca72c|7d2a21|5a1a14|33261b|1b140f|3e2f22|54402c|fff9e8|fff7e6)\b/i;
    for (const c of css) expect(c.text, `${c.f} contains legacy warm colours`).not.toMatch(legacy);
  });

  it('the main menu uses the supplied game logo and the studio logo stays separate', () => {
    const ui = readFileSync(join(UI, 'UI.ts'), 'utf8');
    expect(ui).toContain('brand/cbhr-logo.webp');
    expect(ui).toContain('brand/novarah-symbol.webp');
  });
});

describe('start-up intro', () => {
  const splash = readFileSync(join(UI, 'Splash.ts'), 'utf8');
  it('is skippable by key, click or tap, remembers launches, and honours reduced motion', () => {
    expect(splash).toContain("addEventListener('keydown'");
    expect(splash).toContain("addEventListener('pointerdown'");
    expect(splash).toContain('prefers-reduced-motion');
    expect(splash).toContain('cbhr.intro.launched');
  });
  it('never shows third-party logos: only the studio and the game artwork', () => {
    const imgs = [...splash.matchAll(/brand\/([a-z-]+)\.webp/g)].map((m) => m[1]);
    expect(new Set(imgs)).toEqual(new Set(['novarah-logo', 'cbhr-logo']));
  });
});
