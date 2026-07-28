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
 * App-privacy lock. While the user is signed in, it:
 *   - covers the UI with an opaque overlay the moment the app goes inactive /
 *     background, so nothing sensitive shows in the app switcher snapshot, and
 *   - requires biometric (Face ID / Touch ID / fingerprint, with the usual
 *     PIN/passcode fallback) re-authentication when the app returns to the
 *     foreground before revealing the UI again.
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

  const appState = useRef(AppState.currentState);
  const prompting = useRef(false);
  const [canLock, setCanLock] = useState(false);
  const [bioName, setBioName] = useState('Biometrics');
  const [obscured, setObscured] = useState(false); // app switcher privacy cover
  const [locked, setLocked] = useState(false); // needs re-auth to reveal
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
      appState.current = next;
      // The biometric sheet itself can flip AppState to inactive — ignore
      // transitions while a prompt is up so it doesn't re-lock/re-trigger.
      if (prompting.current) {
        return;
      }
      if (next === 'inactive' || next === 'background') {
        setObscured(true);
        if (isSignedIn && canLock) {
          setLocked(true);
        }
      } else if (next === 'active') {
        setObscured(false);
        if (isSignedIn && canLock && locked) {
          attemptUnlock();
        }
      }
    });
    return () => sub.remove();
  }, [isSignedIn, canLock, locked, attemptUnlock]);

  const onSignOut = async () => {
    setLocked(false);
    setObscured(false);
    await signOut();
  };

  // Only cover/lock while signed in. `obscured` hides the app-switcher
  // snapshot; `locked` keeps it up until re-auth succeeds.
  const showOverlay = isSignedIn && (obscured || locked);

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
