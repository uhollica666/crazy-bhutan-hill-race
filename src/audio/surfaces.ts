/** Synthesis coefficients; preserve mixer trims and reuse the existing continuous sound layers. */
interface SurfaceVoice { roll: number; cutoff: number; crunch: number; grainRate: number; mud: number; hiss: number; skid: number }
const asphalt: SurfaceVoice = { roll: 0.085, cutoff: 380, crunch: 0, grainRate: 1, mud: 0, hiss: 0, skid: 1 };
const voices: Record<string, SurfaceVoice> = {
  asphalt,
  worn: { ...asphalt, roll: 0.095, cutoff: 320, crunch: 0.012 },
  wetAsphalt: { ...asphalt, roll: 0.07, cutoff: 820, hiss: 0.055, skid: 0.45 },
  gravel: { roll: 0.085, cutoff: 260, crunch: 0.065, grainRate: 1.6, mud: 0, hiss: 0, skid: 0.18 },
  rocky: { roll: 0.095, cutoff: 210, crunch: 0.08, grainRate: 0.8, mud: 0, hiss: 0, skid: 0.12 },
  dirt: { roll: 0.065, cutoff: 290, crunch: 0.025, grainRate: 1.1, mud: 0, hiss: 0, skid: 0.1 },
  grass: { roll: 0.04, cutoff: 180, crunch: 0.01, grainRate: 1, mud: 0, hiss: 0.008, skid: 0 },
  mud: { roll: 0.05, cutoff: 170, crunch: 0.01, grainRate: 0.6, mud: 0.085, hiss: 0.006, skid: 0 },
  snow: { roll: 0.045, cutoff: 240, crunch: 0.035, grainRate: 1.05, mud: 0, hiss: 0.015, skid: 0.03 },
  packed: { roll: 0.055, cutoff: 370, crunch: 0.025, grainRate: 1.25, mud: 0, hiss: 0.022, skid: 0.08 },
  frost: { roll: 0.05, cutoff: 580, crunch: 0.018, grainRate: 1.4, mud: 0, hiss: 0.03, skid: 0.15 },
  ice: { roll: 0.025, cutoff: 1100, crunch: 0.008, grainRate: 1.7, mud: 0, hiss: 0.036, skid: 0.2 },
  slush: { roll: 0.045, cutoff: 380, crunch: 0.016, grainRate: 0.8, mud: 0.04, hiss: 0.04, skid: 0.04 },
  water: { roll: 0.025, cutoff: 720, crunch: 0, grainRate: 1, mud: 0.02, hiss: 0.035, skid: 0 },
};
export const surfaceVoice = (id: string): SurfaceVoice => voices[id] ?? asphalt;
