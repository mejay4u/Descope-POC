export type Step = 'personal' | 'verify' | 'review' | 'password' | 'success';

export const STEP_INDEX: Record<Step, number> = {
  personal: 1,
  verify: 2,
  review: 3,
  password: 4,
  success: 5,
};

export const STEP_LABEL: Record<Step, string> = {
  personal: 'Personal information',
  verify: 'Verify email',
  review: 'Review your information',
  password: 'Set a password',
  success: 'Account created',
};

export const TOTAL_STEPS = 5;

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
