import { Platform } from 'react-native';

// ─── Colour tokens ────────────────────────────────────────────
export const C = {
  bg:       '#F4F1EA',   // warm cream canvas
  card:     '#FFFFFF',
  ink:      '#0E0E10',
  muted:    '#71717A',
  border:   'rgba(14,14,16,0.07)',
  // accent gradient
  accent:   '#6E56F7',
  accent2:  '#3D2EC4',
  accentFg: '#FFFFFF',
  // semantic tones
  green:    '#10B981',
  greenBg:  'rgba(16,185,129,0.12)',
  amber:    '#F59E0B',
  amberBg:  'rgba(245,158,11,0.12)',
  rose:     '#FB7185',
  roseBg:   'rgba(251,113,133,0.12)',
  red:      '#E11D6B',
  redBg:    'rgba(225,29,107,0.10)',
  violet:   '#6E56F7',
  violetBg: 'rgba(110,86,247,0.10)',
} as const;

// ─── Typography ───────────────────────────────────────────────
// Install for exact match:
//   npx expo install @expo-google-fonts/plus-jakarta-sans \
//                    @expo-google-fonts/jetbrains-mono
// Then load in App.tsx with useFonts() and replace undefined values below.
export const F = {
  sans:     undefined as string | undefined,   // Plus Jakarta Sans
  medium:   undefined as string | undefined,
  semibold: undefined as string | undefined,
  bold:     undefined as string | undefined,
  extrabold:undefined as string | undefined,
  mono:     Platform.OS === 'ios' ? 'Courier New' : 'monospace',
} as const;

// ─── Border radius ────────────────────────────────────────────
export const R = {
  xs:  8,
  sm:  12,
  md:  16,
  lg:  20,
  xl:  24,
  xxl: 28,
  pill:999,
} as const;

// ─── Spacing ──────────────────────────────────────────────────
export const S = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
} as const;

// ─── Helpers ──────────────────────────────────────────────────
/** Format ₦ currency, no decimals */
export function naira(n: number): string {
  return '₦' + Math.round(n).toLocaleString('en-NG');
}

/** Tone alpha — appends two-digit hex opacity to a 6-char hex colour */
export function alpha(hex: string, pct: number): string {
  return hex + Math.round(pct * 255).toString(16).padStart(2, '0');
}
