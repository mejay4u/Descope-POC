/**
 * Remembers (device-locally) that the user added a passkey, so the Portal can
 * reflect it instead of always showing a bare "Add a passkey" prompt.
 *
 * This is a client-only hint — the source of truth is Descope. We can't query
 * "does this user have a passkey?" from the client SDK, so after a successful
 * add-passkey flow we record a per-user flag here and read it back on the
 * Portal. Keyed by user ID so switching accounts doesn't show a stale state.
 */
import * as Keychain from 'react-native-keychain';

const SERVICE = 'com.memberportal.passkeyAdded';

function accountFor(userId: string): string {
  return `passkey:${userId || 'unknown'}`;
}

export async function markPasskeyAdded(userId: string): Promise<void> {
  try {
    await Keychain.setGenericPassword(accountFor(userId), '1', { service: SERVICE });
  } catch {
    // Non-fatal: the Portal just won't show the "added" state.
  }
}

export async function hasAddedPasskey(userId: string): Promise<boolean> {
  try {
    const creds = await Keychain.getGenericPassword({ service: SERVICE });
    return !!creds && creds.username === accountFor(userId);
  } catch {
    return false;
  }
}
