import type { StepKind } from './flowScreens';

export type Step = StepKind;

export const STEP_INDEX: Record<Step, number> = {
  personal: 1,
  verify: 2,
  password: 3,
  member: 4,
  success: 5,
};

export const STEP_LABEL: Record<Step, string> = {
  personal: 'Personal information',
  verify: 'Verify email',
  password: 'Set a password',
  member: 'Member details',
  success: 'Account created',
};

export const TOTAL_STEPS = 5;

export type FormState = {
  firstName: string;
  lastName: string;
  dob: string;
  zip: string;
  email: string;
};

export const EMPTY_FORM: FormState = {
  firstName: '',
  lastName: '',
  dob: '',
  zip: '',
  email: '',
};

/**
 * Password rules for the "Set a password" checklist. The flow (and behind it
 * the BFF) is what actually enforces them — this is only what the member sees
 * while typing, so keep it in step with the server-side policy.
 */
export type PasswordPolicy = {
  minLength: number;
  lowercase: boolean;
  uppercase: boolean;
  number: boolean;
  nonAlphanumeric: boolean;
};

export const PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  lowercase: true,
  uppercase: true,
  number: true,
  nonAlphanumeric: true,
};

export const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const dobRe = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
export const zipRe = /^\d{5}(-\d{4})?$/;
export const ssnRe = /^\d{3}-\d{2}-\d{4}$/;

/** Auto-inserts "/" separators as digits come in from a number-pad keyboard (no "/" key). */
export function formatDobInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    .filter(Boolean)
    .join('/');
}

/** Formats an SSN as the member types: 123-45-6789. */
export function formatSsnInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 9);
  return [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5, 9)].filter(Boolean).join('-');
}
