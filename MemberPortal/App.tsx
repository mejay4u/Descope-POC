/**
 * Member Portal — a front-end-only React Native app that uses Descope as its
 * identity provider (IdP). There is no custom backend: every auth operation
 * (register, login, social, passkey, biometric) talks directly to Descope.
 *
 * @format
 */
import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@descope/react-native-sdk';
import RootNavigator from './src/navigation/RootNavigator';
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
          <RootNavigator />
        </BrandingProvider>
      </SafeAreaProvider>
    </AuthProvider>
  );
}

export default App;
