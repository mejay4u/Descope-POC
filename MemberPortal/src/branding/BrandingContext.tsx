import React, { createContext, useContext, useMemo, type ComponentType } from 'react';
import DefaultLogo from './DefaultLogo';
import type { AppButtonProps } from '../components/DefaultAppButton';

/**
 * Everything a white-label deployment might want to swap out without
 * touching screen code: the mark, the app name/tagline shown on the Welcome
 * screen, and the primary button's look. Screens/components read these via
 * `useBranding()` instead of hardcoding them.
 */
export type BrandingConfig = {
  appName: string;
  tagline: string;
  Logo: ComponentType<{ size?: number }>;
  Button?: ComponentType<AppButtonProps>;
};

export const defaultBranding: BrandingConfig = {
  appName: 'Member Portal',
  tagline: 'Secure access to your membership, powered by Descope.',
  Logo: DefaultLogo,
};

const BrandingContext = createContext<BrandingConfig>(defaultBranding);

type Props = {
  /** Partial overrides — anything omitted falls back to defaultBranding. */
  value?: Partial<BrandingConfig>;
  children: React.ReactNode;
};

export function BrandingProvider({ value, children }: Props) {
  const merged = useMemo<BrandingConfig>(
    () => ({ ...defaultBranding, ...value }),
    [value],
  );
  return <BrandingContext.Provider value={merged}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingConfig {
  return useContext(BrandingContext);
}
