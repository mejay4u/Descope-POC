/**
 * Masks the local part of an email for display (e.g. on an OTP screen),
 * leaving the domain fully visible: "jshelar@example.com" -> "j*****r@example.com".
 */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) {
    return email;
  }
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex); // includes the "@"

  if (local.length <= 2) {
    return `${local[0]}*${domain}`;
  }
  const maskedLength = Math.max(local.length - 2, 3);
  return `${local[0]}${'*'.repeat(maskedLength)}${local[local.length - 1]}${domain}`;
}
