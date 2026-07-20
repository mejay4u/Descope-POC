import React, { useEffect, useRef } from 'react';
import { Animated, SafeAreaView, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AppButton from '../components/AppButton';
import { useBranding } from '../branding/BrandingContext';
import { colors, spacing, typography } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  const { appName, tagline, Logo } = useBranding();
  const heroAnim = useRef(new Animated.Value(0)).current;
  const actionsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(120, [
      Animated.timing(heroAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(actionsAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]).start();
  }, [heroAnim, actionsAnim]);

  return (
    <SafeAreaView style={styles.safe}>
      <Animated.View
        style={[
          styles.hero,
          {
            opacity: heroAnim,
            transform: [
              {
                translateY: heroAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
          },
        ]}>
        <Animated.View style={styles.logoWrap}>
          <Logo size={88} />
        </Animated.View>
        <Text style={styles.title}>{appName}</Text>
        <Text style={styles.subtitle}>{tagline}</Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.actions,
          {
            opacity: actionsAnim,
            transform: [
              {
                translateY: actionsAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
          },
        ]}>
        <AppButton
          label="Sign In"
          onPress={() => navigation.navigate('Login')}
          variant="primary"
          style={styles.actionSpacing}
        />
        <AppButton
          label="Create Account"
          onPress={() => navigation.navigate('Register')}
          variant="secondary"
        />
      </Animated.View>

      <Text style={styles.footer}>
        By continuing you agree to the Terms and Privacy Policy.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logoWrap: { marginBottom: spacing.lg },
  title: { ...typography.title, textAlign: 'center' },
  subtitle: {
    ...typography.subtitle,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  actions: { paddingBottom: spacing.md },
  actionSpacing: { marginBottom: spacing.sm },
  footer: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12,
    paddingBottom: spacing.lg,
  },
});
