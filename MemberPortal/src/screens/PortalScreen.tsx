import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@descope/react-native-sdk';
import AppButton from '../components/AppButton';
import { useAuth } from '../auth/useAuth';
import {
  biometryLabel,
  disableBiometricLogin,
  enableBiometricLogin,
  getSupportedBiometry,
  hasBiometricLogin,
} from '../auth/biometricStore';
import { colors, radius, spacing, typography } from '../theme';

export default function PortalScreen() {
  const { session } = useSession();
  const { signOut } = useAuth();
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioName, setBioName] = useState('Biometrics');
  const [bioSupported, setBioSupported] = useState(false);
  const [busy, setBusy] = useState(false);

  const user = session?.user;
  const displayName = user?.name || user?.email || 'Member';
  const initials = displayName
    .split(' ')
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  useEffect(() => {
    (async () => {
      const supported = await getSupportedBiometry();
      setBioSupported(!!supported);
      setBioName(biometryLabel(supported));
      setBioEnabled(await hasBiometricLogin());
    })();
  }, []);

  const toggleBiometric = async (value: boolean) => {
    if (value) {
      if (session?.refreshJwt) {
        await enableBiometricLogin(session.refreshJwt);
      }
    } else {
      await disableBiometricLogin();
    }
    setBioEnabled(await hasBiometricLogin());
  };

  const onSignOut = async () => {
    setBusy(true);
    await signOut();
    setBusy(false);
    // Session listener in App.tsx swaps back to the Welcome screen.
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials || 'M'}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.hello}>Welcome back,</Text>
            <Text style={styles.name}>{displayName}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your membership</Text>
          <Row label="Email" value={user?.email || '—'} />
          <Row
            label="Status"
            value={user?.verifiedEmail ? 'Verified' : 'Active'}
            valueColor={colors.success}
          />
          <Row label="Member ID" value={(user?.userId || '').slice(0, 12) || '—'} />
        </View>

        {bioSupported && (
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.cardTitle}>Sign in with {bioName}</Text>
                <Text style={styles.cardSub}>
                  Use {bioName} to sign in next time without a password.
                </Text>
              </View>
              <Switch
                value={bioEnabled}
                onValueChange={toggleBiometric}
                trackColor={{ true: colors.brand, false: colors.border }}
              />
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick actions</Text>
          <Text style={styles.cardSub}>
            This is a demo portal. Wire these to your own screens as needed.
          </Text>
          <View style={styles.actionsGrid}>
            <Tile label="Profile" />
            <Tile label="Billing" />
            <Tile label="Benefits" />
            <Tile label="Support" />
          </View>
        </View>

        <AppButton
          label="Sign Out"
          onPress={onSignOut}
          variant="secondary"
          loading={busy}
          style={styles.signOut}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
    </View>
  );
}

function Tile({ label }: { label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontSize: 22, fontWeight: '800' },
  headerText: { marginLeft: spacing.md },
  hello: { color: colors.textMuted, fontSize: 14 },
  name: { ...typography.title, fontSize: 24 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { ...typography.label, fontSize: 16 },
  cardSub: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.textMuted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchText: { flex: 1, marginRight: spacing.md },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  tile: {
    width: '48%',
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  tileText: { color: colors.brandDark, fontWeight: '700' },
  signOut: { marginTop: spacing.sm },
});
