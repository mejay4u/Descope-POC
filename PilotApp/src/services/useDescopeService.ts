import { useMemo } from 'react';
import { useDescope } from '@descope/react-native-sdk';
import { createDescopeService, type DescopeService } from './descopeService';

/** Binds the framework-agnostic descopeService to the current Descope SDK instance. */
export function useDescopeService(): DescopeService {
  const sdk = useDescope();
  return useMemo(() => createDescopeService(sdk), [sdk]);
}
