import type { ConditionsDef, TimeOfDay, WeatherKind } from './types';

export interface WeatherPreset {
  label: string;
  /** 0..1: how wet the road is (switches asphalt to wet asphalt, dirt to mud at >= 0.5). */
  wetness: number;
  /** Multiplier on fog distance (smaller = thicker). */
  visibility: number;
  /** 0..1 rain intensity (drives particles and sound). */
  rain: number;
  /** Sideways gust strength (m/s^2 equivalent at 20 m/s) applied to tall vehicles. */
  wind: number;
  /** 0..1 how much it darkens and greys the sky. */
  gloom: number;
  snow: boolean;
  thunder: boolean;
}

export const WEATHER: Record<WeatherKind, WeatherPreset> = {
  clear: { label: 'Clear', wetness: 0, visibility: 1, rain: 0, wind: 0.2, gloom: 0, snow: false, thunder: false },
  cloudy: { label: 'Cloudy', wetness: 0, visibility: 0.9, rain: 0, wind: 0.8, gloom: 0.3, snow: false, thunder: false },
  rain: { label: 'Rain', wetness: 0.85, visibility: 0.62, rain: 0.55, wind: 1.2, gloom: 0.55, snow: false, thunder: false },
  heavyRain: { label: 'Heavy rain', wetness: 1, visibility: 0.42, rain: 1, wind: 2, gloom: 0.75, snow: false, thunder: true },
  fog: { label: 'Fog', wetness: 0.2, visibility: 0.26, rain: 0, wind: 0.2, gloom: 0.35, snow: false, thunder: false },
  denseFog: { label: 'Dense fog', wetness: 0.25, visibility: 0.085, rain: 0, wind: 0.2, gloom: 0.5, snow: false, thunder: false },
  snow: { label: 'Snow', wetness: 0.3, visibility: 0.7, rain: 0, wind: 1, gloom: 0.4, snow: true, thunder: false },
};

export interface TimePreset {
  label: string;
  /** Sun intensity multiplier and warm/cool tint (hex). */
  sun: number;
  sunColor: number;
  hemi: number;
  /** Sky tint blended over the level's own palette (hex) and how strongly (0..1). */
  skyTint: number;
  skyMix: number;
  /** Fog colour blended with the level's own. */
  fogTint: number;
  fogMix: number;
  /** Sun direction offset (lower sun for dusk). */
  sunHeight: number;
  headlights: boolean;
  lamps: boolean;
}

export const TIME: Record<TimeOfDay, TimePreset> = {
  day: { label: 'Day', sun: 1, sunColor: 0xfff0cf, hemi: 1, skyTint: 0xffffff, skyMix: 0, fogTint: 0xffffff, fogMix: 0, sunHeight: 1, headlights: false, lamps: false },
  dusk: { label: 'Dusk', sun: 0.55, sunColor: 0xff9a52, hemi: 0.62, skyTint: 0xe9825a, skyMix: 0.55, fogTint: 0xd89a86, fogMix: 0.6, sunHeight: 0.35, headlights: true, lamps: true },
  night: { label: 'Night', sun: 0.14, sunColor: 0x8fb0ff, hemi: 0.3, skyTint: 0x10151b, skyMix: 0.9, fogTint: 0x12171d, fogMix: 0.9, sunHeight: 0.8, headlights: true, lamps: true },
};

export const conditionsLabel = (c: ConditionsDef): string =>
  `${WEATHER[c.weather].label}${c.time === 'day' ? '' : ` · ${TIME[c.time].label}`}`;

/** Grip multiplier applied on top of the surface: heavy rain also slicks dry-looking surfaces a little. */
export const weatherGripFactor = (w: WeatherKind): number => 1 - 0.06 * WEATHER[w].rain;
