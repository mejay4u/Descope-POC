/**
 * Biometric-gated storage of the Descope refresh token.
 *
 * How "Sign in with biometrics" works here (no backend involved):
 *   1. After a successful sign-in, we persist the session's refresh JWT into the
 *      device Keychain / Keystore, bound to the biometrics enrolled right now.
 *   2. On a later launch, the user taps "Sign in with Face ID / Fingerprint".
 *      Reading the item makes the OS show its own biometric prompt, and the
 *      Secure Enclave / TEE releases the token only on a successful match.
 *   3. We exchange that refresh JWT with Descope (`descope.refresh`) for a fresh
 *      session — the user is signed back in without typing anything.
 *
 * THE SECURITY PROPERTY THIS FILE EXISTS TO HOLD: the biometric check happens
 * inside the OS, not in this code. An earlier version stored the token with no
 * access control and gated reads with an app-level `simplePrompt()` call. That
 * is weaker in two ways worth remembering before anyone "simplifies" it back:
 *
 *   - A JS prompt returns a boolean, and a boolean can be hooked. On a rooted or
 *     repackaged device, forcing it true handed over the refresh token with no
 *     biometric involved at all. Keychain access control cannot be hooked from
 *     JS — the enforcement is in hardware.
 *   - Without BIOMETRY_CURRENT_SET there is no re-enrollment invalidation, so
 *     anyone who could add their own fingerprint to an unlocked device could
 *     then sign in as the member indefinitely — the refresh token is long-lived
 *     and is deliberately not revoked on sign-out (see useAuth.signOut).
 *
 * There is still only ONE prompt: reading an access-control-protected item makes
 * the OS present the sheet itself, so the app does not present its own.
 */
import { Alert, Linking } from 'react-native';
import * as Keychain from 'react-native-keychain';
import ReactNativeBiometrics from 'react-native-biometrics';
import { ALLOW_INSECURE_BIOMETRIC_STORAGE_IN_DEV } from '../config';

const SERVICE = 'com.memberportal.descope.biometric';
const ACCOUNT = 'descope-refresh-jwt';

/**
 * Only used for `isSensorAvailable()` now — a non-prompting availability check
 * whose OS error message the UI surfaces verbatim. It no longer authenticates
 * anything; the OS does that when the Keychain item is read.
 */
const rnBiometrics = new ReactNativeBiometrics();

/**
 * DEV ONLY. The iOS Simulator does not enforce Keychain access control — reads
 * succeed with no Face ID sheet — which makes the real flow impossible to
 * exercise there. When this is on, the token is stored WITHOUT access control
 * and reads are gated by an app-level prompt instead: the old, weaker behaviour.
 *
 * It is guarded by `__DEV__` at every use, so a release build strips it even if
 * the flag is committed as true. Never rely on it for anything but local work.
 */
const insecureDevStorageEnabled = (): boolean =>
  __DEV__ && ALLOW_INSECURE_BIOMETRIC_STORAGE_IN_DEV;

/**
 * The access control that does the actual work.
 *
 * BIOMETRY_CURRENT_SET binds the item to the fingerprints and faces enrolled at
 * the moment it is written; enrolling a new one invalidates it. The
 * ..._OR_DEVICE_PASSCODE variant exists and is deliberately not used — it lets
 * anyone who knows the passcode read the token regardless of enrollment
 * changes, which is the exact attack this is meant to stop. Users who cannot
 * use biometrics sign in with their password instead.
 *
 * STORAGE_TYPE.RSA on Android, not AES_GCM, and the reason is not obvious: both
 * are biometric-backed, but AES_GCM requires authentication to ENCRYPT as well
 * as decrypt. This app re-saves the refresh token after every sign-in and every
 * refresh, so AES_GCM would raise a biometric prompt during ordinary password
 * sign-in. RSA encrypts with the public key (no prompt) and prompts only on
 * decrypt — write-often, read-rarely, which is exactly this workload.
 */
const accessControl = Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET;

/** Write-side options. `storage` and `securityLevel` are Android-only and apply
 *  when the item is created, so they are deliberately not repeated on reads. */
const writeAccessControlOptions = {
  accessControl,
  storage: Keychain.STORAGE_TYPE.RSA,
  securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
} as const;

/** Read-side options: the access control alone is what makes the OS prompt. */
const readAccessControlOptions = { accessControl } as const;

const authenticationPrompt = {
  title: 'Sign in to Member Portal',
  cancel: 'Cancel',
} as const;

/**
 * Persist the refresh JWT for biometric sign-in, bound to the currently
 * enrolled biometrics.
 *
 * Writing does not prompt on either platform — iOS only enforces the access
 * control on read, and Android's RSA storage encrypts with the public key. That
 * matters because this is called after every sign-in and every token refresh.
 */
export async function enableBiometricLogin(refreshJwt: string): Promise<void> {
  await Keychain.setGenericPassword(ACCOUNT, refreshJwt, {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    ...(insecureDevStorageEnabled() ? {} : writeAccessControlOptions),
  });
}

/**
 * DEV ONLY app-level prompt, used when {@link insecureDevStorageEnabled} is on
 * because the Simulator will not show the OS sheet by itself. Not part of the
 * production path — on a device the OS prompts during the Keychain read.
 */
async function devOnlyPrompt(): Promise<boolean> {
  try {
    const { success } = await rnBiometrics.simplePrompt({
      promptMessage: authenticationPrompt.title,
      cancelButtonText: authenticationPrompt.cancel,
    });
    return success;
  } catch {
    return false;
  }
}

/**
 * Outcome of trying to read the stored refresh token. Two failure modes that
 * the UI has to tell apart:
 *
 *   - `cancelled` — the user dismissed the OS sheet. The token is untouched and
 *     they can try again.
 *   - `invalidated` — the item can no longer be read, overwhelmingly because
 *     the device's biometrics were re-enrolled. The token is gone for good, so
 *     it is cleared and the user has to re-enable after a password sign-in.
 *     This is the security control working, not an error.
 *
 * There is deliberately no `missing` case. Callers check hasBiometricLogin()
 * first, so an item that is not there by the time we read it did not fail to
 * exist — it was thrown away, which is `invalidated`.
 */
export type BiometricTokenResult =
  | { status: 'ok'; refreshJwt: string }
  | { status: 'cancelled' }
  | { status: 'invalidated' };

/**
 * Whether a failed read was the user backing out.
 *
 * Deliberately matched the permissive way round: anything NOT recognisable as a
 * cancel is treated as invalidation. Getting that backwards would leave a dead
 * token in the Keychain and a biometric button that can never succeed, which is
 * far worse for the user than being asked to re-enable once. The platforms word
 * these errors differently and change the wording between OS versions, so this
 * cannot be an exhaustive list and is not written as one.
 */
function isUserCancellation(error: unknown): boolean {
  const message = (error as { message?: string } | undefined)?.message ?? String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes('cancel') ||
    lower.includes('code=-2') || // LAErrorUserCancel
    lower.includes('code=-4') || // LAErrorSystemCancel
    lower.includes('code=-9') || // LAErrorAppCancel
    lower.includes('-128') // errSecUserCanceled
  );
}

/**
 * Read the stored refresh JWT. The OS biometric prompt is raised by the read
 * itself — there is no app-level check in front of it, which is the whole point
 * (see the note at the top of this file).
 */
export async function getBiometricRefreshToken(): Promise<BiometricTokenResult> {
  if (insecureDevStorageEnabled() && !(await devOnlyPrompt())) {
    return { status: 'cancelled' };
  }

  try {
    const creds = await Keychain.getGenericPassword({
      service: SERVICE,
      authenticationPrompt,
      ...(insecureDevStorageEnabled() ? {} : readAccessControlOptions),
    });

    if (creds) {
      return { status: 'ok', refreshJwt: creds.password };
    }

    // A falsy result means the item is not there. Callers check
    // hasBiometricLogin() first, so reaching here means it disappeared between
    // that check and this read — which is what iOS does to an invalidated
    // access-control item rather than raising an error.
    await disableBiometricLogin().catch(() => {});
    return { status: 'invalidated' };
  } catch (e) {
    if (isUserCancellation(e)) {
      return { status: 'cancelled' };
    }
    // Android surfaces re-enrollment as KeyPermanentlyInvalidatedException here.
    // Clearing in this function rather than leaving it to the caller means the
    // cleanup cannot be forgotten by a future caller.
    await disableBiometricLogin().catch(() => {});
    return { status: 'invalidated' };
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
