import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

type Props = {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

/** A compact sign-in method tile used in the "or continue with" grid. */
export default function MethodTile({ icon, label, onPress, loading, disabled }: Props) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.tile,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors.brand} />
      ) : (
        <>
          <View style={styles.icon}>{icon}</View>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: '48%',
    height: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  icon: { marginRight: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  pressed: { opacity: 0.7, backgroundColor: colors.surface },
  disabled: { opacity: 0.5 },
});
