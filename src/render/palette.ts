/**
 * Visual identity: "thangka morning". Saturated pigment colours (indigo sky, saffron, madder red,
 * mineral green, lime-wash white) over soft hazy layered ridges, flat-shaded low-poly forms.
 */
export const PAL = {
  skyTop: 0x4a7aa8,
  skyMid: 0x9db9c6,
  skyHorizon: 0xe6d9bd,
  fog: 0xd8d0bd,
  mist: 0xe4dfd2,
  sun: 0xffe6bd,

  grassA: 0x78914a,
  grassB: 0x5c7a3d,
  meadow: 0x949a5c,
  dirt: 0x86704d,
  gravel: 0x9d8a68,
  rock: 0x8b857a,
  snow: 0xf3f2ee,
  sand: 0xb59e72,
  water: 0x4aa3c4,

  asphalt: 0x4a4745,
  paintWhite: 0xf2efe6,
  paintYellow: 0xe8b53a,

  pineDark: 0x2c5a3a,
  pineMid: 0x3b7044,
  cypress: 0x23483a,
  bark: 0x5a3a28,

  wall: 0xb9b2a2,
  wallPost: 0xf0ece0,
  wallPostRed: 0xc23a2c,

  whitewash: 0xf1e9d6,
  wood: 0x8a4b2a,
  woodDark: 0x5b2f1b,
  windowDark: 0x2a2220,
  roofSlate: 0x6a665f,
  roofRed: 0xa93a2a,
  gold: 0xdca72c,
  maroon: 0x8c2a20,

  flagBlue: 0x2f6fd0,
  flagWhite: 0xf6f4ee,
  flagRed: 0xd6322b,
  flagGreen: 0x2e9c4f,
  flagYellow: 0xf0c23a,

  yak: 0x3a2b24,
  yakHorn: 0xe9e0c8,
} as const;

export const FLAG_COLORS = [PAL.flagBlue, PAL.flagWhite, PAL.flagRed, PAL.flagGreen, PAL.flagYellow] as const;
