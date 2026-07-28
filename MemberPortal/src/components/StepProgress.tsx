import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

type Props = {
  current: number; // 1-indexed
  total: number;
  /** Omit to render dots only, with no "Step X of N" caption below them. */
  label?: string;
  /** Use on a colored (e.g. navy) background instead of the app's light surfaces. */
  onDark?: boolean;
};

/** A compact dot-and-line progress indicator for multi-step wizards. */
export default function StepProgress({ current, total, label, onDark }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {Array.from({ length: total }, (_, i) => i + 1).map(step => (
          <React.Fragment key={step}>
            <View
              style={[
                styles.dot,
                onDark && styles.dotOnDark,
                step < current && (onDark ? styles.dotDoneOnDark : styles.dotDone),
                step === current && (onDark ? styles.dotDoneOnDark : styles.dotCurrent),
              ]}
            />
            {step < total && (
              <View
                style={[
                  styles.line,
                  onDark && styles.lineOnDark,
                  step < current && (onDark ? styles.lineDoneOnDark : styles.lineDone),
                ]}
              />
            )}
          </React.Fragment>
        ))}
      </View>
      {!!label && (
        <Text style={[styles.label, onDark && styles.labelOnDark]}>
          Step {current} of {total} · {label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
  },
  dotOnDark: { backgroundColor: 'rgba(255,255,255,0.35)' },
  dotCurrent: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.brand,
  },
  dotDone: { backgroundColor: colors.brand },
  dotDoneOnDark: { backgroundColor: colors.white },
  line: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 4 },
  lineOnDark: { backgroundColor: 'rgba(255,255,255,0.35)' },
  lineDone: { backgroundColor: colors.brand },
  lineDoneOnDark: { backgroundColor: colors.white },
  label: { marginTop: spacing.sm, color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  labelOnDark: { color: 'rgba(255,255,255,0.85)' },
});
