import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AppButton from '../../components/AppButton';
import CheckIcon from '../../components/icons/CheckIcon';
import { colors, spacing } from '../../theme';
import { sharedStyles } from './styles';

type Props = {
  firstName: string;
  onFinish: () => void;
};

export default function SuccessStep({ firstName, onFinish }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <CheckIcon size={32} color={colors.white} />
      </View>
      <Text style={sharedStyles.title}>Account created!</Text>
      <Text style={sharedStyles.subtitle}>
        Welcome to Member Portal{firstName ? `, ${firstName}` : ''}. Your account is ready to go.
      </Text>
      <AppButton label="Continue to Member Portal" onPress={onFinish} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: spacing.xxl },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
});
