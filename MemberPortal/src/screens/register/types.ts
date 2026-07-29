/**
 * The wizard's steps. The design's progress bar shows **six**: step 5 is the
 * membership/eligibility check (SSN + Facets), which isn't built yet — the
 * wizard goes straight from Create Account to You're all set. The stepper still
 * counts to six so the numbering doesn't shift when step 5 lands.
 */
export type Step = 'personal' | 'verify' | 'review' | 'password' | 'success';

export const STEP_INDEX: Record<Step, number> = {
  personal: 1,
  verify: 2,
  review: 3,
  password: 4,
  success: 6,
};

export const STEP_LABEL: Record<Step, string> = {
  personal: 'Personal Information',
  verify: 'Verify Email',
  review: 'Review Your Information',
  password: 'Create Account',
  success: 'All set',
};

export const TOTAL_STEPS = 6;

export type FormState = {
  firstName: string;
  lastName: string;
  dob: string;
  zip: string;
  email: string;
  phone: string;
};

export const EMPTY_FORM: FormState = {
  firstName: '',
  lastName: '',
  dob: '',
  zip: '',
  email: '',
  phone: '',
};

/**
 * Password rules, taken from the Create Account screen's checklist. The API
 * enforces the same policy server-side — this drives what the member sees while
 * typing, so the two must be changed together.
 */
export type PasswordPolicy = {
  minLength: number;
  maxLength: number;
  lowercase: boolean;
  uppercase: boolean;
  number: boolean;
  nonAlphanumeric: boolean;
};

export const PASSWORD_POLICY: PasswordPolicy = {
  minLength: 14,
  maxLength: 56,
  lowercase: true,
  uppercase: true,
  number: true,
  nonAlphanumeric: true,
};

export const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const dobRe = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
export const zipRe = /^\d{5}(-\d{4})?$/;

/** Auto-inserts "/" separators as digits come in from a number-pad keyboard (no "/" key). */
export function formatDobInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    .filter(Boolean)
    .join('/');
}
