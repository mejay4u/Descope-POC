import { StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';

/** Styles shared across the registration wizard's steps. */
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
