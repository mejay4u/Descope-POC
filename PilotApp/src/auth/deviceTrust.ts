/**
 * Trusted-device flag — the thing that decides whether the sign-in flow demands
 * an OTP.
 *
 * The policy: a member typing their password on a device we've never seen must
 * verify an emailed OTP. Once they've done that (or bound a passkey /
 * biometrics to the device), the device is "trusted" and later password
 * sign-ins skip the code. That OTP is what makes passkey and biometric
 * enrolment safe to offer — we know the person holding the device controls the
 * mailbox.
 *
 * Mechanically: the app reads this flag, passes it into the Descope flow as a
 * **client input** (see DEVICE_TRUSTED_INPUT in src/config), and a Condition
 * step in the flow branches on it.
 *
 * ⚠️ THIS IS NOT A SECURITY BOUNDARY. ⚠️
 *
 * The value is supplied by the client, so a modified or instrumented build can
 * simply assert `deviceTrusted: true` and skip the OTP. Treat it as a UX
 * optimisation for a pilot, nothing more. Making it a real control means moving
 * the decision server-side — a device registry keyed to a server-issued device
 * token, or Descope's own trusted-device support — so the flow believes the
 * server, not the app. This is called out in docs/architecture.md as a known
 * gap, and it should be closed before this pattern goes anywhere near
 * production.
 */
import * as Keychain from 'react-native-keychain';

const SERVICE = 'com.pilotapp.deviceTrust';

/**
 * Keyed by login ID: trusting a device for one member must not silently trust
 * it for the next person who signs in on the same handset.
 */
function accountFor(loginId: string): string {
  return `trusted:${loginId.trim().toLowerCase() || 'unknown'}`;
}

/** Record that this device is trusted for `loginId` (called after OTP / enrolment). */
export async function markDeviceTrusted(loginId: string): Promise<void> {
  try {
    await Keychain.setGenericPassword(accountFor(loginId), '1', {
      service: SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    // Non-fatal: the member is simply asked for an OTP again next time.
  }
}

/**
 * Whether this device is already trusted for `loginId`.
 *
 * Only one entry is kept per service, so this answers "is the trusted device
 * record the one belonging to this member?" — a different member on the same
 * device reads back false and gets the OTP, which is the behaviour we want.
 */
export async function isDeviceTrusted(loginId: string): Promise<boolean> {
  if (!loginId) {
    return false;
  }
  try {
    const creds = await Keychain.getGenericPassword({ service: SERVICE });
    return !!creds && creds.username === accountFor(loginId);
  } catch {
    return false;
  }
}

/**
 * Whether *any* member has trusted this device.
 *
 * The sign-in flow is a Descope-rendered screen, so the app doesn't know the
 * login ID until after the member types it — by which point the client input
 * has already been handed to the flow. This is what the app can honestly answer
 * at flow-start time. The per-login-ID check above is the stricter one, used
 * once we do know who signed in.
 */
export async function isAnyDeviceTrusted(): Promise<boolean> {
  try {
    return !!(await Keychain.hasGenericPassword({ service: SERVICE }));
  } catch {
    return false;
  }
}

/** Forget the trusted-device record (sign-out of the last member, or a reset). */
export async function clearDeviceTrust(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: SERVICE });
  } catch {
    // Non-fatal.
  }
}
