// Email allowlist — only these accounts may hold a session, regardless of how
// they authenticated (Google OAuth or email/password).
// Default locks to r@bios.co.il with zero config; override via ALLOWED_EMAILS
// (comma-separated) without a code change.
// ponytail: single source of truth, checked in callback + middleware (defense in depth)
// `||` (not `??`) so an accidental empty ALLOWED_EMAILS='' still falls back to
// the default instead of locking everyone out.
const ALLOWED = (process.env.ALLOWED_EMAILS || 'r@bios.co.il')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export function isAllowedEmail(email: string | null | undefined): boolean {
  return !!email && ALLOWED.includes(email.trim().toLowerCase())
}
