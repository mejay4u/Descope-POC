import React, { useCallback, useEffect, useRef } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useSession } from '@descope/react-native-sdk';
import { useAuth } from './useAuth';

/**
 * How long the app can sit with no user interaction (foreground *or*
 * backgrounded) before it auto signs out. Lower it while testing.
 */
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
/** How often the timer checks for inactivity. */
const CHECK_INTERVAL_MS = 15 * 1000; // 15 seconds

/**
 * Auto sign-out on inactivity. While the user is signed in, any touch resets
 * an activity timestamp; if no interaction happens for INACTIVITY_TIMEOUT_MS,
 * the session is cleared. Because `signOut` keeps the biometric-stored refresh
 * token (when biometrics is enabled), the user lands back on the Login screen
 * and can sign straight back in with Face ID / Touch ID / fingerprint.
 *
 * Time spent in the background counts toward the timeout too — a check runs
 * when the app returns to the foreground, so leaving the app for longer than
 * the timeout also signs out.
 */
export default function InactivityGate({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const { signOut } = useAuth();
  const isSignedIn = !!session?.refreshJwt;
  const lastActivity = useRef(Date.now());

  // Cheap: just records when the user last interacted. Called on every touch.
  const bump = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  const expired = useCallback(
    () => Date.now() - lastActivity.current >= INACTIVITY_TIMEOUT_MS,
    [],
  );

  // Periodic check while signed in.
  useEffect(() => {
    if (!isSignedIn) {
      return;
    }
    lastActivity.current = Date.now(); // fresh window on sign-in
    const id = setInterval(() => {
      if (expired()) {
        signOut();
      }
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isSignedIn, expired, signOut]);

  // Returning to the foreground: JS timers are throttled in the background, so
  // check immediately in case the app was away longer than the timeout.
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active' && isSignedIn && expired()) {
        signOut();
      }
    });
    return () => sub.remove();
  }, [isSignedIn, expired, signOut]);

  // Capture (but don't intercept) touches to reset the activity timer. Returning
  // false lets the events flow through to children as normal.
  return (
    <View
      style={styles.fill}
      onStartShouldSetResponderCapture={() => {
        bump();
        return false;
      }}
      onMoveShouldSetResponderCapture={() => {
        bump();
        return false;
      }}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
