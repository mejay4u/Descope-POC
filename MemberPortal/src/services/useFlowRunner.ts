import { useMemo } from 'react';
import { useDescope } from '@descope/react-native-sdk';
import { createFlowRunner, type FlowRunner } from './flowRunner';

/** Binds the framework-agnostic flowRunner to the current Descope SDK instance. */
export function useFlowRunner(): FlowRunner {
  const sdk = useDescope();
  return useMemo(() => createFlowRunner(sdk), [sdk]);
}
