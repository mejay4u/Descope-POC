/**
 * Pilot App — a front-end-only React Native member portal that uses Descope as
 * its identity provider. There is no backend in the sign-in path: Descope holds
 * the credentials, runs the sign-in flow, and issues a session JWT carrying the
 * member's custom claims.
 *
 * Four ways in:
 *   - email + password           embedded Descope flow (src/screens/SignInScreen)
 *   - emailed OTP                a step inside that flow, on untrusted devices
 *   - passkey                    browser-hosted Descope flow (src/screens/PasskeyScreen)
 *   - device biometrics          local refresh-token exchange (src/auth/biometricStore)
 *
 * @format
 */
import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@descope/react-native-sdk';
import RootNavigator from './src/navigation/RootNavigator';
import InactivityGate from './src/auth/InactivityGate';
import { DESCOPE_PROJECT_ID, assertConfigured } from './src/config';
import { BrandingProvider } from './src/branding/BrandingContext';

assertConfigured();

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <AuthProvider projectId={DESCOPE_PROJECT_ID}>
      <SafeAreaProvider>
        {/* Pass `value` here to white-label the logo, app name, tagline, or
            button component for a different deployment — see BrandingContext. */}
        <BrandingProvider>
          <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
          {/* Signs out after a period of inactivity while signed in; the member
              re-authenticates with biometrics on the sign-in screen. */}
          <InactivityGate>
            <RootNavigator />
          </InactivityGate>
        </BrandingProvider>
      </SafeAreaProvider>
    </AuthProvider>
  );
}

export default App;
