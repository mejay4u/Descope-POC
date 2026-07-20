import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

type Props = {
  current: number; // 1-indexed
  total: number;
  label: string;
};

/** A compact dot-and-line progress indicator for multi-step wizards. */
export default function StepProgress({ current, total, label }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {Array.from({ length: total }, (_, i) => i + 1).map(step => (
          <React.Fragment key={step}>
            <View
              style={[
                styles.dot,
                step < current && styles.dotDone,
                step === current && styles.dotCurrent,
              ]}
            />
            {step < total && (
              <View style={[styles.line, step < current && styles.lineDone]} />
            )}
          </React.Fragment>
        ))}
      </View>
      <Text style={styles.label}>
        Step {current} of {total} · {label}
      </Text>
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
  dotCurrent: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.brand,
  },
  dotDone: { backgroundColor: colors.brand },
  line: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 4 },
  lineDone: { backgroundColor: colors.brand },
  label: { marginTop: spacing.sm, color: colors.textMuted, fontSize: 13, fontWeight: '600' },
});
