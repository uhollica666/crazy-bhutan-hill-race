import { EN } from './en';
import type { CastMember, LevelStory, StoryBook } from './types';

export type { CastMember, LevelStory, PortraitSpec, StoryBook } from './types';

/** Registered story languages. Add `fr.ts` etc. here; anything missing falls back to English. */
const BOOKS: Record<string, Partial<StoryBook>> = { en: EN };

export const DEFAULT_LOCALE = 'en';

export function getStory(levelId: string, locale: string = DEFAULT_LOCALE): LevelStory | null {
  return BOOKS[locale]?.levels?.[levelId] ?? EN.levels[levelId] ?? null;
}

export function getCast(key: string, locale: string = DEFAULT_LOCALE): CastMember | null {
  return BOOKS[locale]?.cast?.[key] ?? EN.cast[key] ?? null;
}

export const listStoryLocales = (): string[] => Object.keys(BOOKS);
