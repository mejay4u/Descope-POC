/**
 * Smoke test for a presentational component.
 *
 * Note: we don't render <App /> here because it mounts Descope's AuthProvider,
 * which loads a native module unavailable in the Jest environment. Testing the
 * auth flows end-to-end belongs in a device/E2E test (e.g. Detox) — and much of
 * this app's behaviour (Face ID prompts, WebAuthn, the embedded flow) only
 * exists on a real device anyway.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AppButton from '../src/components/AppButton';

test('AppButton renders its label', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<AppButton label="Sign In" onPress={() => {}} />);
  });
  const json = JSON.stringify(tree!.toJSON());
  expect(json).toContain('Sign In');
});
