import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSession } from '@descope/react-native-sdk';
import AppButton from '../components/AppButton';
import KeyIcon from '../components/icons/KeyIcon';
import { useAuth } from '../auth/useAuth';
import {
  biometryLabel,
  disableBiometricLogin,
  enableBiometricLogin,
  getBiometricAvailability,
  getSupportedBiometry,
  hasBiometricLogin,
  showBiometricUnavailableAlert,
} from '../auth/biometricStore';
import { decodeSessionToken, hasMemberClaims } from '../auth/claims';
import { hasAddedPasskey } from '../auth/passkeyStore';
import { colors, radius, spacing, typography } from '../theme';
import type { AppStackParamList } from '../navigation/types';

/**
 * The member portal, and — for this pilot — the visible proof that the whole
 * thing worked. The "Token claims" card renders what the JWT Template put in
 * the session JWT, so a wrong or missing template is obvious on screen rather
 * than only when the .NET service later rejects a token.
 */
export default function PortalScreen() {
  const { session } = useSession();
  const { signOut } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioName, setBioName] = useState('Biometrics');
  const [bioOsDisabled, setBioOsDisabled] = useState(false);
  const [passkeyAdded, setPasskeyAdded] = useState(false);
  const [busy, setBusy] = useState(false);

  const user = session?.user;
  const displayName = user?.name || user?.email || 'Member';
  const initials = displayName
    .split(' ')
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Re-decoded whenever the session JWT changes — including after a biometric
  // refresh, which is exactly the case where a flow-action claim would vanish
  // and a JWT Template claim survives.
  const decoded = useMemo(
    () => decodeSessionToken(session?.sessionJwt),
    [session?.sessionJwt],
  );
  const claims = decoded?.claims;
  const claimsPresent = hasMemberClaims(claims);

  useEffect(() => {
    (async () => {
      const [supported, availability, enabled] = await Promise.all([
        getSupportedBiometry(),
        getBiometricAvailability(),
        hasBiometricLogin(),
      ]);
      setBioName(biometryLabel(supported));
      setBioOsDisabled(!availability.available);
      setBioEnabled(enabled);
    })();
  }, []);

  // Re-check on focus so returning from a successful "Add a passkey" flow
  // immediately reflects the added state.
  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      (async () => {
        const added = await hasAddedPasskey(user?.userId ?? '');
        if (active) {
          setPasskeyAdded(added);
        }
      })();
      return () => {
        active = false;
      };
    }, [user?.userId]),
  );

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

  /**
   * The biometric card is always shown so members know the feature exists.
   * While biometrics is disabled at the OS level the switch is disabled, and
   * tapping the row re-checks availability (it may have changed in Settings
   * since mount) and shows the OS's own message if it's still off.
   */
  const onBiometricRowPress = async () => {
    const availability = await getBiometricAvailability();
    setBioOsDisabled(!availability.available);
    if (!availability.available) {
      showBiometricUnavailableAlert(bioName, availability.osMessage);
    }
  };

  const onSignOut = async () => {
    setBusy(true);
    await signOut();
    setBusy(false);
    // Session listener in RootNavigator swaps back to the Welcome screen.
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
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle}>Token claims</Text>
            <Text style={claimsPresent ? styles.badgeOk : styles.badgeWarn}>
              {claimsPresent ? 'Present ✓' : 'Missing'}
            </Text>
          </View>
          {claimsPresent ? (
            <>
              <Row label="memberId" value={claims?.memberId} />
              <Row label="plan" value={claims?.plan} />
              <Row label="subscriberId" value={claims?.subscriberId} />
              <Row label="lobs" value={claims?.lobs?.join(', ')} />
            </>
          ) : (
            <Text style={styles.cardSub}>
              The session JWT carries none of the four custom claims. Either the
              JWT Template isn’t assigned to the project, or this user has no
              values set for its custom attributes. See
              docs/descope-signin-flow-setup.md §3–§4.
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Session</Text>
          <Row label="Email" value={user?.email} />
          <Row
            label="Email verified"
            value={user?.verifiedEmail ? 'Yes' : 'No'}
            valueColor={user?.verifiedEmail ? colors.success : colors.warning}
          />
          <Row label="Descope user ID" value={decoded?.subject || user?.userId} />
          <Row label="Issuer" value={decoded?.issuer} />
          <Row label="Session expires" value={decoded?.expiresAt?.toLocaleTimeString()} />
        </View>

        <View style={styles.card}>
          <Pressable style={styles.switchRow} onPress={onBiometricRowPress}>
            <View style={styles.switchText}>
              <Text style={styles.cardTitle}>Sign in with {bioName}</Text>
              <Text style={styles.cardSub}>
                {bioOsDisabled
                  ? `${bioName} is turned off for this device. Tap to see why.`
                  : `Use ${bioName} to sign in next time without a password.`}
              </Text>
            </View>
            {/* pointerEvents 'none' while OS-disabled so taps on the switch
                fall through to the row and surface the OS message. */}
            <View pointerEvents={bioOsDisabled ? 'none' : 'auto'}>
              <Switch
                value={bioEnabled && !bioOsDisabled}
                disabled={bioOsDisabled}
                onValueChange={toggleBiometric}
                trackColor={{ true: colors.brand, false: colors.border }}
              />
            </View>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle}>Passkey</Text>
            {passkeyAdded && <Text style={styles.badgeOk}>Added ✓</Text>}
          </View>
          <Text style={styles.cardSub}>
            {passkeyAdded
              ? 'A passkey is set up for this account. You can add another for a different device or key.'
              : 'Add a passkey to sign in with Face ID, Touch ID, a fingerprint, or a security key — no password needed.'}
          </Text>
          <AppButton
            label={passkeyAdded ? 'Add another passkey' : 'Add a passkey'}
            variant="secondary"
            icon={<KeyIcon size={18} color={colors.brand} />}
            onPress={() => navigation.navigate('Passkey', { mode: 'signup' })}
            style={styles.passkeyButton}
          />
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
  value?: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[styles.rowValue, valueColor ? { color: valueColor } : null]}
        numberOfLines={1}>
        {value || '—'}
      </Text>
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
  headerText: { marginLeft: spacing.md, flex: 1 },
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
  cardSub: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs, lineHeight: 19 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgeOk: { color: colors.success, fontSize: 13, fontWeight: '700' },
  badgeWarn: { color: colors.warning, fontSize: 13, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.textMuted, fontSize: 14, marginRight: spacing.md },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchText: { flex: 1, marginRight: spacing.md },
  passkeyButton: { marginTop: spacing.md },
  signOut: { marginTop: spacing.sm },
});
