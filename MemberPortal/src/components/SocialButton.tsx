import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing } from '../theme';

export type SocialProvider = 'apple' | 'microsoft' | 'google';

const CONFIG: Record<
  SocialProvider,
  { label: string; glyph: string; bg: string; fg: string; border?: string }
> = {
  apple: { label: 'Continue with Apple', glyph: '', bg: colors.apple, fg: '#FFFFFF' },
  microsoft: {
    label: 'Continue with Microsoft',
    glyph: '⊞', // ⊞ window-like glyph as a lightweight stand-in
    bg: colors.microsoft,
    fg: '#FFFFFF',
  },
  google: {
    label: 'Continue with Google',
    glyph: 'G',
    bg: colors.google,
    fg: '#3C4043',
    border: colors.googleBorder,
  },
};

type Props = {
  provider: SocialProvider;
  onPress: (provider: SocialProvider) => void;
  loading?: boolean;
  disabled?: boolean;
};

export default function SocialButton({
  provider,
  onPress,
  loading,
  disabled,
}: Props) {
  const cfg = CONFIG[provider];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={() => onPress(provider)}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: cfg.bg },
        cfg.border ? { borderWidth: 1, borderColor: cfg.border } : null,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}>
      {loading ? (
        <ActivityIndicator color={cfg.fg} />
      ) : (
        <>
          <Text style={[styles.glyph, { color: cfg.fg }]}>{cfg.glyph}</Text>
          <Text style={[styles.label, { color: cfg.fg }]}>{cfg.label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  glyph: { fontSize: 18, fontWeight: '700', marginRight: spacing.sm },
  label: { fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
