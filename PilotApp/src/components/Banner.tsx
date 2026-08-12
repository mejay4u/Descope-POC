import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing } from '../theme';

type Variant = 'error' | 'success';

type Props = {
  variant: Variant;
  children: React.ReactNode;
};

/** An inline banner that fades + slides in each time it mounts (i.e. becomes visible). */
export default function Banner({ variant, children }: Props) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [anim]);

  return (
    <Animated.View
      style={[
        styles.base,
        variant === 'error' ? styles.error : styles.success,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [-8, 0],
              }),
            },
          ],
        },
      ]}>
      <Text style={variant === 'error' ? styles.errorText : styles.successText}>
        {children}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  error: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  success: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  errorText: { color: colors.danger, fontSize: 14 },
  successText: { color: colors.brandDark, fontSize: 14, fontWeight: '600' },
});
