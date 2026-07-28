import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useSession } from '@descope/react-native-sdk';
import AppButton from '../components/AppButton';
import FingerprintIcon from '../components/icons/FingerprintIcon';
import { useBranding } from '../branding/BrandingContext';
import { useAuth } from './useAuth';
import {
  biometryLabel,
  getBiometricAvailability,
  getSupportedBiometry,
  verifyBiometricIdentity,
} from './biometricStore';
import { colors, spacing, typography } from '../theme';

/**
 * App-privacy lock. While the user is signed in, switching *away* to another
 * app (a genuine background) arms the lock, and switching *back* to this app
 * requires biometric (Face ID / Touch ID / fingerprint, with the usual PIN /
 * passcode fallback) re-authentication before the UI is revealed again.
 *
 * It deliberately does NOT react to transient 'inactive' states — pulling down
 * Control Center / the notification shade, an incoming call, or the biometric
 * sheet itself — so the app never covers itself while in the foreground. Only a
 * real app switch (background -> active) triggers the prompt.
 *
 * Only engaged when biometrics is available on the device — otherwise there's
 * nothing to re-authenticate with, so we don't lock the user out. A "Sign out"
 * escape is always offered so a failed/again-and-again prompt can't trap them.
 */
export default function AppLock({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const { signOut } = useAuth();
  const { Logo } = useBranding();
  const isSignedIn = !!session?.refreshJwt;

  const prompting = useRef(false);
  const [canLock, setCanLock] = useState(false);
  const [bioName, setBioName] = useState('Biometrics');
  const [locked, setLocked] = useState(false); // armed on background; needs re-auth to reveal
  const [authFailed, setAuthFailed] = useState(false);

  // Whether locking is possible on this device (biometrics enrolled/available).
  useEffect(() => {
    let active = true;
    if (!isSignedIn) {
      setCanLock(false);
      return;
    }
    (async () => {
      const [availability, supported] = await Promise.all([
        getBiometricAvailability(),
        getSupportedBiometry(),
      ]);
      if (active) {
        setCanLock(availability.available);
        setBioName(biometryLabel(supported));
      }
    })();
    return () => {
      active = false;
    };
  }, [isSignedIn]);

  const attemptUnlock = useCallback(async () => {
    if (prompting.current) {
      return;
    }
    prompting.current = true;
    setAuthFailed(false);
    const ok = await verifyBiometricIdentity();
    prompting.current = false;
    if (ok) {
      setLocked(false);
    } else {
      setAuthFailed(true);
    }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      // Ignore transitions while a prompt is up — the biometric sheet itself
      // flips AppState, and that must not re-arm or re-trigger the lock.
      if (prompting.current) {
        return;
      }
      if (next === 'background') {
        // Switched away to another app / home — arm the lock. (Transient
        // 'inactive' is intentionally ignored so we never cover the foreground.)
        if (isSignedIn && canLock) {
          setLocked(true);
        }
      } else if (next === 'active') {
        // Switched back — if armed, require re-auth before revealing the UI.
        if (isSignedIn && canLock && locked) {
          attemptUnlock();
        }
      }
    });
    return () => sub.remove();
  }, [isSignedIn, canLock, locked, attemptUnlock]);

  const onSignOut = async () => {
    setLocked(false);
    await signOut();
  };

  // The overlay is up only after a real app switch, until re-auth succeeds.
  const showOverlay = isSignedIn && locked;

  return (
    <View style={styles.root}>
      {children}
      {showOverlay && (
        <View style={styles.overlay}>
          <View style={styles.logoWrap}>
            <Logo size={72} />
          </View>
          {locked && (
            <>
              <Text style={styles.title}>Locked</Text>
              <Text style={styles.subtitle}>
                Unlock with {bioName} to return to your portal.
              </Text>
              {authFailed && (
                <Text style={styles.failed}>
                  Couldn’t verify it’s you. Try again.
                </Text>
              )}
              <AppButton
                label={`Unlock with ${bioName}`}
                icon={<FingerprintIcon size={18} color={colors.white} />}
                onPress={attemptUnlock}
                style={styles.unlock}
              />
              <Text style={styles.signOut} onPress={onSignOut}>
                Sign out instead
              </Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  logoWrap: { marginBottom: spacing.lg },
  title: { ...typography.title, textAlign: 'center' },
  subtitle: {
    ...typography.subtitle,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  failed: {
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  unlock: { alignSelf: 'stretch' },
  signOut: {
    color: colors.brand,
    fontWeight: '600',
    marginTop: spacing.lg,
  },
});
