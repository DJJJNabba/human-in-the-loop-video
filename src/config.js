// Shared constants: timebase, palette, type system. Edit here, not in shots.
export const FPS = 60;
export const DURATION = 266.4; // v2 recording (48 kHz WAV); v1 was 242.16 s
export const AUDIO_URL = '/assets/audio/human-in-the-loop-v2.wav';

// Logical frame sizes (the 4K master renders the landscape layout at 2x).
export const LANDSCAPE = { w: 1920, h: 1080 };
export const PORTRAIT = { w: 1080, h: 1920 };

// Palette (sRGB hex). Red exists only for the shutdown sequence.
export const PAL = {
  black: '#050607',
  graphite: '#0d0f10',
  graphite2: '#191c1e',
  steel: '#8d9399',
  silver: '#c9cdd1',
  white: '#f3f5f2',
  green: '#12e27a', // the approval green: one value, used everywhere
  greenDeep: '#06a856',
  warm: '#ffcf9a', // the only warmth: the operator's lamp, and house windows
  red: '#ff2b1c',
};

// Type system — three voices.
//   display: Inter Tight (heavy)   — what the operator says out loud, with confidence
//   doubt:   Newsreader italic     — what the operator asks himself
//   machine: Martian Mono          — everything the system says or labels
export const FONTS = {
  display: { file: 'inter-tight-latin-800-normal.woff', css: 'HITL Display', weight: 800, style: 'normal' },
  displayBlack: { file: 'inter-tight-latin-900-normal.woff', css: 'HITL Display', weight: 900, style: 'normal' },
  displayMed: { file: 'inter-tight-latin-500-normal.woff', css: 'HITL Display', weight: 500, style: 'normal' },
  doubt: { file: 'newsreader-latin-500-italic.woff', css: 'HITL Doubt', weight: 500, style: 'italic' },
  doubtLight: { file: 'newsreader-latin-400-italic.woff', css: 'HITL Doubt', weight: 400, style: 'italic' },
  serif: { file: 'newsreader-latin-500-normal.woff', css: 'HITL Doubt', weight: 500, style: 'normal' },
  machine: { file: 'martian-mono-latin-500-normal.woff', css: 'HITL Machine', weight: 500, style: 'normal' },
  machineLight: { file: 'martian-mono-latin-300-normal.woff', css: 'HITL Machine', weight: 300, style: 'normal' },
  machineBold: { file: 'martian-mono-latin-700-normal.woff', css: 'HITL Machine', weight: 700, style: 'normal' },
};
