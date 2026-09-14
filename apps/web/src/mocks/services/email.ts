/** Linear check equivalent to /^[^\s@]+@[^\s@]+\.[^\s@]+$/ (avoids regex backtracking). */
export function isValidEmail(email: string): boolean {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0 || email.includes('@', atIndex + 1) || /\s/.test(email)) {
    return false;
  }
  const domain = email.slice(atIndex + 1);
  return domain.length >= 3 && domain.slice(1, -1).includes('.');
}
