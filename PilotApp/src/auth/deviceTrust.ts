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
 * The stored entry records *who* trusted this device. Only one entry exists per
 * Keychain service, so a second member signing in overwrites the first — which
 * is the behaviour we want, but see the caveat on `isAnyDeviceTrusted` about
 * what the app can actually check at flow-start time.
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
 * Whether *any* member has trusted this device.
 *
 * ⚠️ Note what this can't do. The sign-in flow renders its own email field, so
 * when the app mounts the flow it doesn't yet know who is signing in — and the
 * client input has to be supplied at that moment. So this is the honest answer
 * to the only question the app can ask that early: "has this handset ever
 * passed an OTP check?"
 *
 * On a shared device that means member B can skip the OTP because member A
 * trusted the handset. Fixing it means asking for the email on a native screen
 * before starting the flow, which trades away the single-flow design. Recorded
 * in docs/architecture.md.
 */
export async function isAnyDeviceTrusted(): Promise<boolean> {
  try {
    return !!(await Keychain.hasGenericPassword({ service: SERVICE }));
  } catch {
    return false;
  }
}
