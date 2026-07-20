import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StepProgress from '../../components/StepProgress';
import { colors, spacing } from '../../theme';
import { STEP_INDEX, STEP_LABEL, TOTAL_STEPS, type Step } from './types';

type Props = {
  step: Step;
  onBack: () => void;
};

/** The solid navy header (back button + title + step dots) shown above each wizard step. */
export default function WizardHeader({ step, onBack }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {STEP_LABEL[step]}
        </Text>
        <View style={styles.backButton} />
      </View>

      <StepProgress current={STEP_INDEX[step]} total={TOTAL_STEPS} onDark />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    // StepProgress adds its own bottom margin below the dots, so this only
    // needs to cover the gap under the back-button/title row.
    paddingBottom: spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backChevron: { color: colors.white, fontSize: 30, fontWeight: '600', marginTop: -2 },
  title: {
    flex: 1,
    textAlign: 'center',
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
});
