/**
 * Central design tokens for the Member Portal app.
 */
export const colors = {
  brand: '#4F46E5', // indigo
  brandDark: '#4338CA',
  brandSoft: '#EEF2FF',
  bg: '#FFFFFF',
  surface: '#F8FAFC',
  border: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#64748B',
  danger: '#DC2626',
  success: '#16A34A',
  white: '#FFFFFF',
  black: '#000000',

  // Social brand colors
  apple: '#000000',
  microsoft: '#2F2F2F',
  google: '#FFFFFF',
  googleBorder: '#DADCE0',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const typography = {
  title: { fontSize: 30, fontWeight: '700' as const, color: colors.text },
  subtitle: { fontSize: 16, color: colors.textMuted },
  label: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
};
