/**
 * Regression tests for the security properties of biometric sign-in.
 *
 * These do not test that biometrics "works" — that needs real hardware and
 * belongs in a device/E2E test. What they pin down is the part that is easy to
 * undo in a refactor and impossible to notice by using the app: that the gate is
 * enforced by the OS through Keychain access control rather than by an app-level
 * prompt, and that an item invalidated by re-enrollment gets cleared instead of
 * lingering as a token that can never be read.
 *
 * An earlier version of biometricStore did gate reads in JavaScript. It looked
 * identical to a user and to a code reviewer skimming it. Test 2 is the one that
 * would have caught it.
 */
import * as Keychain from 'react-native-keychain';
import {
  enableBiometricLogin,
  getBiometricRefreshToken,
} from '../src/auth/biometricStore';

const mockSimplePrompt = jest.fn();

jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(),
  getGenericPassword: jest.fn(),
  hasGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
  getSupportedBiometryType: jest.fn(),
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly' },
  ACCESS_CONTROL: {
    BIOMETRY_CURRENT_SET: 'BiometryCurrentSet',
    BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE: 'BiometryCurrentSetOrDevicePasscode',
  },
  STORAGE_TYPE: { RSA: 'KeystoreRSAECB', AES_GCM: 'KeystoreAESGCM' },
  SECURITY_LEVEL: { SECURE_HARDWARE: 'SECURE_HARDWARE' },
  BIOMETRY_TYPE: { FACE_ID: 'FaceID', TOUCH_ID: 'TouchID' },
}));

jest.mock('react-native-biometrics', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    simplePrompt: mockSimplePrompt,
    isSensorAvailable: jest.fn().mockResolvedValue({ available: true }),
  })),
}));

const keychain = Keychain as jest.Mocked<typeof Keychain>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('enableBiometricLogin', () => {
  it('binds the stored token to the currently enrolled biometrics', async () => {
    await enableBiometricLogin('refresh-jwt');

    expect(keychain.setGenericPassword).toHaveBeenCalledTimes(1);
    const [, password, options] = keychain.setGenericPassword.mock.calls[0];

    expect(password).toBe('refresh-jwt');
    // Without BIOMETRY_CURRENT_SET there is no re-enrollment invalidation, and
    // anyone who can add a fingerprint to an unlocked device becomes the member.
    expect(options).toMatchObject({
      accessControl: 'BiometryCurrentSet',
      accessible: 'AccessibleWhenUnlockedThisDeviceOnly',
    });
    // RSA rather than AES_GCM: AES_GCM would demand a biometric prompt to
    // encrypt, and this runs after every ordinary password sign-in.
    expect(options).toMatchObject({ storage: 'KeystoreRSAECB' });
  });

  it('does not accept the device passcode as an equivalent authenticator', async () => {
    await enableBiometricLogin('refresh-jwt');

    const [, , options] = keychain.setGenericPassword.mock.calls[0];
    // Asserted as an equality, not an inequality: `not.toBe(...)` would also
    // pass when accessControl is absent entirely, which is the very failure
    // this file exists to catch.
    expect(options?.accessControl).toBe('BiometryCurrentSet');
  });
});

describe('getBiometricRefreshToken', () => {
  it('lets the OS raise the prompt, never an app-level one', async () => {
    keychain.getGenericPassword.mockResolvedValue({
      username: 'descope-refresh-jwt',
      password: 'refresh-jwt',
      service: 'svc',
      storage: 'KeystoreRSAECB',
    } as never);

    const result = await getBiometricRefreshToken();

    expect(result).toEqual({ status: 'ok', refreshJwt: 'refresh-jwt' });
    // The read itself carries the access control, which is what makes the OS
    // show its sheet and withhold the token on a failed scan.
    expect(keychain.getGenericPassword).toHaveBeenCalledWith(
      expect.objectContaining({ accessControl: 'BiometryCurrentSet' }),
    );
    // The assertion that matters: no JavaScript boolean stands between an
    // attacker and the refresh token.
    expect(mockSimplePrompt).not.toHaveBeenCalled();
  });

  it('reports a cancelled prompt without discarding the stored token', async () => {
    keychain.getGenericPassword.mockRejectedValue(
      new Error('The user name or passphrase you entered is not correct. code=-128'),
    );

    const result = await getBiometricRefreshToken();

    expect(result).toEqual({ status: 'cancelled' });
    expect(keychain.resetGenericPassword).not.toHaveBeenCalled();
  });

  it('clears the token when re-enrollment has invalidated it', async () => {
    keychain.getGenericPassword.mockRejectedValue(
      new Error('android.security.keystore.KeyPermanentlyInvalidatedException'),
    );

    const result = await getBiometricRefreshToken();

    expect(result).toEqual({ status: 'invalidated' });
    // Left in place, this would be a token the OS will never release again and
    // a biometric button that fails forever.
    expect(keychain.resetGenericPassword).toHaveBeenCalled();
  });

  it('treats a vanished item as invalidated rather than a cancel', async () => {
    // iOS drops an invalidated access-control item rather than erroring, so the
    // read simply finds nothing.
    keychain.getGenericPassword.mockResolvedValue(false);

    const result = await getBiometricRefreshToken();

    expect(result).toEqual({ status: 'invalidated' });
    expect(keychain.resetGenericPassword).toHaveBeenCalled();
  });
});
