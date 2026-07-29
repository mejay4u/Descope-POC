import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import AppButton from '../../components/AppButton';
import FingerprintIcon from '../../components/icons/FingerprintIcon';
import { useBranding } from '../../branding/BrandingContext';
import {
  disableBiometricLogin,
  getBiometricAvailability,
  hasBiometricLogin,
} from '../../auth/biometricStore';
import { colors, radius, spacing, typography } from '../../theme';

type Props = {
  /** Applies the held session and lands the member on the Portal. */
  onFinish: () => void;
};

/**
 * The final screen: the account exists and the session is about to be applied.
 *
 * The biometric toggle reflects real state rather than being decorative — the
 * enrollment prompt itself runs when the session is applied (see
 * `useAuth.finishRegistration`), because storing a refresh token requires a
 * session to store. So the switch shows whether biometric sign-in is set up and
 * lets the member turn it back off; turning it *on* happens through that
 * prompt, which is what keeps enrollment an explicit choice rather than a
 * silent one.
 */
export default function SuccessStep({ onFinish }: Props) {
  const { appName } = useBranding();
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const [availability, enabled] = await Promise.all([
        getBiometricAvailability(),
        hasBiometricLogin(),
      ]);
      if (active) {
        setBiometricAvailable(availability.available);
        setBiometricEnabled(enabled);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const onToggleBiometric = async (next: boolean) => {
    if (next) {
      // Enrolment needs an active session, which only exists once "Go to
      // Dashboard" applies it — the prompt fires there.
      return;
    }
    await disableBiometricLogin();
    setBiometricEnabled(false);
  };

  return (
    <View>
      <View style={styles.hero}>
        <Text style={styles.celebrate}>🎉</Text>
        <Text style={styles.heroTitle}>You're all set!</Text>
        <Text style={styles.heroSubtitle}>Your {appName} account is ready.</Text>
      </View>

      <Text style={styles.sectionTitle}>What's next?</Text>

      <View style={styles.note}>
        <Text style={styles.noteText}>
          You can always change these features or adjust permissions within your Profile &amp;
          settings.
        </Text>
      </View>

      <View style={styles.row}>
        <View style={styles.rowIcon}>
          <FingerprintIcon size={20} color={colors.brand} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Biometric Login</Text>
          <Text style={styles.rowSubtitle}>
            {biometricAvailable
              ? 'Use fingerprint or Face ID to sign in'
              : 'Not available — enable biometrics in your device settings'}
          </Text>
        </View>
        <Switch
          value={biometricEnabled}
          onValueChange={onToggleBiometric}
          disabled={!biometricAvailable || !biometricEnabled}
          trackColor={{ true: colors.brand, false: colors.border }}
        />
      </View>

      <AppButton label="Go to Dashboard →" onPress={onFinish} style={styles.cta} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.lg },
  celebrate: { fontSize: 44, marginBottom: spacing.sm },
  heroTitle: { ...typography.title, textAlign: 'center' },
  heroSubtitle: {
    ...typography.subtitle,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  sectionTitle: { ...typography.label, fontSize: 16, marginBottom: spacing.sm },
  note: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noteText: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowText: { flex: 1, marginRight: spacing.sm },
  rowTitle: { ...typography.label },
  rowSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  cta: { marginTop: spacing.lg },
});
