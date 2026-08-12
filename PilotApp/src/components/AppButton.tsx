import React from 'react';
import { useBranding } from '../branding/BrandingContext';
import DefaultAppButton, { type AppButtonProps } from './DefaultAppButton';

export type { AppButtonProps, ButtonVariant } from './DefaultAppButton';

/**
 * Renders whatever `Button` a BrandingProvider supplies, falling back to
 * DefaultAppButton. Every screen already renders buttons through this
 * component, so this is the single injection point for white-labeling the
 * app's primary button — no call sites need to change.
 */
export default function AppButton(props: AppButtonProps) {
  const { Button = DefaultAppButton } = useBranding();
  return <Button {...props} />;
}
