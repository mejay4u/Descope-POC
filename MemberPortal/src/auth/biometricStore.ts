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
import { Alert, Linking, Platform } from 'react-native';
import * as Keychain from 'react-native-keychain';
import ReactNativeBiometrics from 'react-native-biometrics';

const SERVICE = 'com.memberportal.descope.biometric';
const ACCOUNT = 'descope-refresh-jwt';

const rnBiometrics = new ReactNativeBiometrics();

/**
 * Persist the refresh JWT for biometric sign-in.
 *
 * The item is stored WITHOUT Keychain biometric access control, and reads are
 * gated by an explicit OS biometric prompt instead (see
 * getBiometricRefreshToken). Two reasons for this app-level-gating pattern:
 *   1. The iOS Simulator doesn't enforce Keychain access control — reads
 *      silently succeed with no Face ID prompt, so "biometric" sign-in was
 *      invisible there.
 *   2. Gating with BOTH an explicit prompt and Keychain access control would
 *      show two Face ID sheets in a row on real devices.
 * The token remains encrypted at rest in the Keychain, device-only.
 */
export async function enableBiometricLogin(refreshJwt: string): Promise<void> {
  await Keychain.setGenericPassword(ACCOUNT, refreshJwt, {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/** simplePrompt options, extended with the (natively supported) device-credential flag the library's types omit. */
type SimplePromptOptions = Parameters<typeof rnBiometrics.simplePrompt>[0] & {
  allowDeviceCredentials?: boolean;
};

/**
 * One OS auth prompt. `allowDeviceCredentials` decides whether the PIN /
 * pattern / passcode is an accepted authenticator in *this* prompt.
 * Resolves { cancelled } so callers can tell a deliberate cancel from a
 * biometric failure/lockout (which throws).
 */
async function runPrompt(allowDeviceCredentials: boolean): Promise<{ ok: boolean }> {
  const { success } = await rnBiometrics.simplePrompt({
    promptMessage: 'Sign in to Member Portal',
    cancelButtonText: 'Cancel',
    allowDeviceCredentials,
  } as SimplePromptOptions);
  return { ok: success };
}

/** How many biometric tries Android gets before falling back to the PIN/pattern. */
const ANDROID_MAX_BIOMETRIC_TRIES = 3;

/** Whether a thrown biometric error is a lockout (retrying biometrics is then pointless). */
function isLockout(e: unknown): boolean {
  const msg = (e as { message?: string })?.message?.toLowerCase() ?? '';
  return (
    msg.includes('lockout') ||
    msg.includes('too many') ||
    msg.includes('disabled')
  );
}

/**
 * Authenticate the user with the OS, returning true on success. The strategy
 * differs by platform because their fallback UX differs:
 *
 *   - iOS: a single prompt that allows the passcode. Face ID retries a couple
 *     of times on its own and then offers "Enter Passcode" *in the same
 *     sheet* — so one prompt already gives the retries-then-passcode flow.
 *     Doing a biometric-only prompt first would just show Face ID twice.
 *
 *   - Android: biometric-only, so a bad scan doesn't jump straight to the PIN.
 *     On real hardware a wrong fingerprint just shows "Not recognized" and the
 *     prompt stays open for retries; the emulator (and a locked-out sensor)
 *     instead throws immediately, so we also retry the prompt at the app level
 *     up to ANDROID_MAX_BIOMETRIC_TRIES. Only a genuine lockout, a user cancel,
 *     or exhausting those tries falls back to the device PIN / pattern.
 */
async function authenticate(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    try {
      const { ok } = await runPrompt(true);
      return ok;
    } catch {
      return false;
    }
  }

  for (let attempt = 1; attempt <= ANDROID_MAX_BIOMETRIC_TRIES; attempt++) {
    try {
      const { ok } = await runPrompt(false);
      return ok; // success, or the user cancelled (false) — don't force the PIN
    } catch (e) {
      // A throw is a biometric error. A lockout won't clear by retrying, and
      // once we've used our tries, hand off to the device credential.
      if (isLockout(e) || attempt === ANDROID_MAX_BIOMETRIC_TRIES) {
        break;
      }
      // Otherwise loop and let the user try their fingerprint again.
    }
  }

  try {
    const { ok } = await runPrompt(true); // device PIN / pattern
    return ok;
  } catch {
    return false;
  }
}

/**
 * Read the stored refresh JWT, gated behind an explicit OS auth prompt
 * (LocalAuthentication / BiometricPrompt — shown on real devices AND the
 * Simulator, unlike Keychain access control). Returns null if authentication
 * is cancelled/failed or nothing is stored.
 */
export async function getBiometricRefreshToken(): Promise<string | null> {
  if (!(await authenticate())) {
    return null;
  }
  const creds = await Keychain.getGenericPassword({ service: SERVICE });
  return creds ? creds.password : null;
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

export type BiometricAvailability =
  | { available: true }
  | { available: false; osMessage: string };

/**
 * On iOS, react-native-biometrics reports the whole NSError description —
 * `Error Domain=com.apple.LocalAuthentication Code=-7 "..." UserInfo={...,
 * NSLocalizedDescription=Biometry is not enrolled.}` — rather than just the
 * user-facing text. Pull out the NSLocalizedDescription (or the quoted
 * message) so the UI shows only the OS's human-readable sentence. Android's
 * messages are already plain and pass through unchanged.
 */
function humanReadableOsMessage(raw: string): string {
  const localized = raw.match(/NSLocalizedDescription=([^,}]+)/);
  if (localized) {
    return localized[1].trim();
  }
  const quoted = raw.match(/"([^"]+)"/);
  if (quoted) {
    return quoted[1];
  }
  return raw;
}

/**
 * Whether the OS will currently allow a biometric prompt. When it won't —
 * nothing enrolled, biometrics turned off in Settings, permission denied,
 * or a lockout after too many failed scans — the OS's own error message is
 * returned so the UI can show it verbatim instead of a generic one.
 */
export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  const fallback = 'Biometric authentication is not available on this device.';
  try {
    const { available, error } = await rnBiometrics.isSensorAvailable();
    if (available) {
      return { available: true };
    }
    return {
      available: false,
      osMessage: error ? humanReadableOsMessage(error) : fallback,
    };
  } catch (e) {
    const err = e as { message?: string } | undefined;
    return {
      available: false,
      osMessage: err?.message ? humanReadableOsMessage(err.message) : fallback,
    };
  }
}

/**
 * Native alert shown when biometrics is disabled at the OS level: leads with
 * the OS's own message and offers a shortcut into Settings. Used by both the
 * Login screen (biometric button) and the Portal (biometric toggle).
 */
export function showBiometricUnavailableAlert(label: string, osMessage: string): void {
  Alert.alert(
    `Enable ${label}`,
    `${osMessage}\n\nMember Portal uses ${label} to verify that it is you when you sign in. You can turn it on in Settings.`,
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ],
  );
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
 * supported on the device.
 *
 * If biometric sign-in is already enabled, this silently re-saves the fresh
 * refresh token instead of re-prompting. Descope issues a new refresh token
 * on every sign-in (and rotates it on every `refresh` call), so without this
 * the Keychain-stored token goes stale after the first use and biometric
 * sign-in starts failing with "Your saved sign-in expired."
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
    if (!supported) {
      return;
    }
    if (alreadyEnabled) {
      await enableBiometricLogin(refreshJwt).catch(() => {
        // Non-fatal: the stale token just won't be refreshed this time.
      });
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
