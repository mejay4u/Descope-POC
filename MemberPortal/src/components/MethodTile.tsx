import React, { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  };

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => !isDisabled && animateTo(0.95)}
        onPressOut={() => !isDisabled && animateTo(1)}
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '48%', marginBottom: spacing.sm },
  tile: {
    height: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { marginRight: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  pressed: { opacity: 0.7, backgroundColor: colors.surface },
  disabled: { opacity: 0.5 },
});
