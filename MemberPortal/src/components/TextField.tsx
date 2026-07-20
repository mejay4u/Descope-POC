import React, { useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

type Props = TextInputProps & {
  label: string;
  errorText?: string;
  /** An icon/button rendered inside the field's right edge, e.g. a password-visibility toggle. */
  rightElement?: React.ReactNode;
};

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export default function TextField({
  label,
  errorText,
  style,
  rightElement,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const focusAnim = useRef(new Animated.Value(0)).current;

  // Untyped event param: Animated.createAnimatedComponent(TextInput) widens
  // onFocus/onBlur to generic FocusEvent/BlurEvent, which don't line up with
  // TextInputProps' NativeSyntheticEvent<TextInputFocusEventData> — but we
  // only ever forward the event through, never read it.
  const handleFocus = (e: any) => {
    Animated.timing(focusAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: false,
    }).start();
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    Animated.timing(focusAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
    onBlur?.(e);
  };

  const borderColor = errorText
    ? colors.danger
    : focusAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.border, colors.brand],
      });

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <AnimatedTextInput
          placeholderTextColor={colors.textMuted}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[
            styles.input,
            { borderColor },
            !!rightElement && styles.inputWithRightElement,
            style,
          ]}
          {...rest}
        />
        {!!rightElement && <View style={styles.rightElement}>{rightElement}</View>}
      </View>
      {!!errorText && <Text style={styles.error}>{errorText}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { ...typography.label, marginBottom: spacing.xs },
  inputRow: { justifyContent: 'center' },
  input: {
    height: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputWithRightElement: { paddingRight: spacing.xl + spacing.md },
  rightElement: {
    position: 'absolute',
    right: spacing.md,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.xs },
});
