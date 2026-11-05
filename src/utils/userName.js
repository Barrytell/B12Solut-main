// Name a user should be shown by: the full name from signup, then the
// platform's own name, then the email address.
export function getUserName(user) {
  if (!user) return '';
  return user.display_name || user.full_name || user.email || '';
}