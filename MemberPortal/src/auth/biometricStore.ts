/**
 * Biometric-gated storage of the Descope refresh token.
 *
 * How "Sign in with biometrics" works here (no backend involved):
 *   1. After a successful sign-in, we persist the session's refresh JWT into the
 *      device Keychain / Keystore, protected by the device biometrics.
 *   2. On a later launch, the user taps "Sign in with Face ID / Fingerprint".
 *      Reading the item triggers the OS biometric prompt.
 *   3. We exchange that refresh JWT with Descope (`descope.refresh`) for a fresh
 *      session — the user is signed back in without typing anything.
 *
 * The refresh token never leaves the secure enclave-backed storage unprotected.
 */
import { Alert } from 'react-native';
import * as Keychain from 'react-native-keychain';

const SERVICE = 'com.memberportal.descope.biometric';
const ACCOUNT = 'descope-refresh-jwt';

/**
 * Persist the refresh JWT behind a biometric lock.
 *
 * Note: this deliberately does NOT force `SECURITY_LEVEL.SECURE_HARDWARE` —
 * simulators (and some older devices) have no Secure Enclave, so requiring it
 * makes this call throw and silently fail to save anything. Requiring
 * biometric auth via `ACCESS_CONTROL.BIOMETRY_ANY` is enough of a guarantee
 * here; the OS still uses hardware backing when it's available.
 */
export async function enableBiometricLogin(refreshJwt: string): Promise<void> {
  await Keychain.setGenericPassword(ACCOUNT, refreshJwt, {
    service: SERVICE,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/**
 * Read the stored refresh JWT. Triggers the OS biometric prompt.
 * Returns null if the user cancels or nothing is stored.
 */
export async function getBiometricRefreshToken(): Promise<string | null> {
  try {
    const creds = await Keychain.getGenericPassword({
      service: SERVICE,
      authenticationPrompt: {
        title: 'Sign in to Member Portal',
        subtitle: 'Confirm your identity',
        cancel: 'Cancel',
      },
    });
    return creds ? creds.password : null;
  } catch {
    // User cancelled or biometry failed.
    return null;
  }
}

/** True if a biometric credential has been stored (does NOT prompt). */
export async function hasBiometricLogin(): Promise<boolean> {
  try {
    const result = await Keychain.hasGenericPassword({ service: SERVICE });
    return !!result;
  } catch {
    return false;
  }
}

/** Remove the stored refresh JWT (called on logout / disable). */
export async function disableBiometricLogin(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE });
}

/**
 * Which biometry the device supports, e.g. 'FaceID', 'TouchID', 'Fingerprint',
 * or null if none is enrolled/available.
 */
export async function getSupportedBiometry(): Promise<Keychain.BIOMETRY_TYPE | null> {
  return Keychain.getSupportedBiometryType();
}

/** Friendly label for the current device's biometry. */
export function biometryLabel(type: Keychain.BIOMETRY_TYPE | null): string {
  switch (type) {
    case Keychain.BIOMETRY_TYPE.FACE_ID:
      return 'Face ID';
    case Keychain.BIOMETRY_TYPE.TOUCH_ID:
      return 'Touch ID';
    case Keychain.BIOMETRY_TYPE.FACE:
      return 'Face Unlock';
    case Keychain.BIOMETRY_TYPE.IRIS:
      return 'Iris';
    case Keychain.BIOMETRY_TYPE.FINGERPRINT:
      return 'Fingerprint';
    default:
      return 'Biometrics';
  }
}

/**
 * After a successful sign-in, ask the user — never silently — whether they'd
 * like to enable biometric sign-in for next time. No-ops if biometry isn't
 * supported on the device or is already enabled.
 */
export async function promptEnableBiometricLogin(refreshJwt?: string): Promise<void> {
  if (!refreshJwt) {
    return;
  }
  try {
    const [supported, alreadyEnabled] = await Promise.all([
      getSupportedBiometry(),
      hasBiometricLogin(),
    ]);
    if (!supported || alreadyEnabled) {
      return;
    }
    const label = biometryLabel(supported);
    Alert.alert(
      `Enable ${label}?`,
      `Sign in faster next time using ${label} instead of your password.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Enable',
          onPress: () => {
            enableBiometricLogin(refreshJwt).catch(() => {
              Alert.alert(
                'Could not enable biometrics',
                'Something went wrong turning on biometric sign-in on this device. You can try again from the portal settings.',
              );
            });
          },
        },
      ],
    );
  } catch {
    // Non-fatal: the user can enable it later from the portal.
  }
}
