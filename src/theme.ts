import { Platform } from 'react-native';

/**
 * CMYK glass design system.
 *
 * Process inks on a "key" (black) canvas: Cyan is the primary action colour,
 * Magenta the accent / destructive colour, Yellow the attention colour.
 * Surfaces are frosted glass (blur on iOS, translucent fill on Android).
 */
export const cmyk = {
  cyan: '#00AEEF',
  magenta: '#EC008C',
  yellow: '#FFE600',
  key: '#07070C',
} as const;

export const colors = {
  primary: cmyk.cyan,
  primaryDark: '#0088BC',
  primarySoft: 'rgba(0,174,239,0.16)',
  secondary: cmyk.magenta,
  accent: cmyk.yellow,
  background: cmyk.key,
  backgroundRaised: '#0E0E18',
  surface: 'rgba(255,255,255,0.07)',
  surfaceStrong: 'rgba(255,255,255,0.12)',
  border: 'rgba(255,255,255,0.12)',
  borderStrong: 'rgba(255,255,255,0.22)',
  highlight: 'rgba(255,255,255,0.18)',
  text: '#F5F7FB',
  textMuted: 'rgba(225,232,255,0.58)',
  textFaint: 'rgba(225,232,255,0.35)',
  error: '#FF3D9A',
  success: '#2EE6A6',
  warning: cmyk.yellow,
  info: cmyk.cyan,
};

export const gradients = {
  /** primary CTA: cyan -> magenta */
  cm: [cmyk.cyan, cmyk.magenta] as const,
  /** attention: magenta -> yellow */
  my: [cmyk.magenta, '#FF8A3D', cmyk.yellow] as const,
  /** success / info */
  cy: [cmyk.cyan, '#5BF0C8'] as const,
  /** glass top sheen */
  sheen: ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.02)'] as const,
  canvas: ['#0D0D14', '#08080D', '#060609'] as const,
};

export const statusColors: Record<string, { bg: string; fg: string; label: string }> = {
  available: { bg: 'rgba(46,230,166,0.14)', fg: colors.success, label: 'Available' },
  checked_out: { bg: 'rgba(255,230,0,0.14)', fg: cmyk.yellow, label: 'Checked out' },
  maintenance: { bg: 'rgba(236,0,140,0.18)', fg: '#FF5CB0', label: 'Maintenance' },
  retired: { bg: 'rgba(255,255,255,0.08)', fg: colors.textMuted, label: 'Retired' },
  stock: { bg: 'rgba(0,174,239,0.16)', fg: cmyk.cyan, label: 'Stock' },
};

export const radius = { sm: 10, md: 14, lg: 22, xl: 28, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const type = {
  largeTitle: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.6, color: colors.text },
  title: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.4, color: colors.text },
  headline: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.2, color: colors.text },
  body: { fontSize: 15, fontWeight: '500' as const, color: colors.text },
  caption: { fontSize: 13, fontWeight: '500' as const, color: colors.textMuted },
  overline: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 1.1, textTransform: 'uppercase' as const, color: colors.textMuted },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), letterSpacing: 0.4 },
};

/** Height reserved at the bottom of scrolling screens for the floating tab bar. */
export const TAB_BAR_SPACE = 120;
