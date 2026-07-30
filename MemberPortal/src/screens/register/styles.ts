import { StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';

/**
 * Styles for the native part of registration. Only SuccessStep is left — the
 * rest of the steps are Descope flow screens now — but these stay shared so a
 * future native step matches it without copying values.
 */
export const sharedStyles = StyleSheet.create({
  title: { ...typography.title, fontSize: 24 },
  subtitle: { ...typography.subtitle, marginTop: spacing.xs, marginBottom: spacing.lg },
  actionSpacing: { marginTop: spacing.xs },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  footerText: { color: colors.textMuted, fontSize: 15 },
  footerLink: { color: colors.brand, fontWeight: '700' },
  reviewSection: {
    ...typography.label,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
});
