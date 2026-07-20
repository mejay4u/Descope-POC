/**
 * "Remember username" on the Login screen — stores the last-used email
 * locally (device-only, not biometric-gated) so it can pre-fill the Email
 * field next time. Uses the Keychain/Keystore purely as encrypted-at-rest
 * local storage; no Descope call involved.
 */
import * as Keychain from 'react-native-keychain';

const SERVICE = 'com.memberportal.rememberedEmail';
const ACCOUNT = 'email';

export async function saveRememberedEmail(email: string): Promise<void> {
  await Keychain.setGenericPassword(ACCOUNT, email, { service: SERVICE });
}

export async function getRememberedEmail(): Promise<string | null> {
  try {
    const creds = await Keychain.getGenericPassword({ service: SERVICE });
    return creds ? creds.password : null;
  } catch {
    return null;
  }
}

export async function clearRememberedEmail(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE });
}
