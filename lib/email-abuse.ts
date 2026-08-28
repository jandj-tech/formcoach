import { db } from '@/lib/db'

/**
 * Signup-time email abuse checks.
 *
 * The July 2026 flood leaned on Gmail's alias rules: Gmail ignores dots and
 * everything after a `+` in the local part, so `j.o.hn@gmail.com`,
 * `jo.hn+1@gmail.com` and `john@gmail.com` are one inbox but three distinct
 * strings in our users table. Comparing the canonical form closes that.
 */

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

/** Disposable/throwaway providers. Deliberately short — a long list ages badly
 *  and every false positive is a real customer locked out. */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com',
  'yopmail.com', 'tempmail.com', 'temp-mail.org', 'throwawaymail.com',
  'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com',
  'maildrop.cc', 'fakeinbox.com', 'mintemail.com', 'moakt.com',
  'emailondeck.com', 'tempr.email', 'discard.email', 'spam4.me',
])

/**
 * Collapses an address to the single inbox it actually reaches, so alias
 * variants of one address cannot each claim their own account.
 */
export function canonicalizeEmail(email: string): string {
  const lower = email.toLowerCase().trim()
  const at = lower.lastIndexOf('@')
  if (at < 1) return lower

  let local = lower.slice(0, at)
  const domain = lower.slice(at + 1)

  // `+tag` is a sub-address on Gmail and most modern providers.
  const plus = local.indexOf('+')
  if (plus > 0) local = local.slice(0, plus)

  // Dots are significant everywhere except Gmail.
  if (GMAIL_DOMAINS.has(domain)) local = local.replace(/\./g, '')

  return `${local}@${domain === 'googlemail.com' ? 'gmail.com' : domain}`
}

export interface EmailAbuseVerdict {
  ok: boolean
  /** Shown to the visitor — vague on purpose, so it teaches a bot nothing. */
  error?: string
}

const OK: EmailAbuseVerdict = { ok: true }

/**
 * Rejects throwaway domains and addresses that duplicate an existing account
 * through aliasing.
 *
 * `table` is the table to check for an existing canonical match — users for
 * player signups, organizations/teams for their own registration flows.
 */
export async function checkEmailAbuse(
  email: string,
  table: 'users' | 'organizations' | 'teams' | 'org_applications'
): Promise<EmailAbuseVerdict> {
  const lower = email.toLowerCase().trim()
  const domain = lower.slice(lower.lastIndexOf('@') + 1)

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, error: 'Please sign up with a permanent email address.' }
  }

  const canonical = canonicalizeEmail(lower)

  // Only Gmail-style aliasing can produce a canonical form that differs from
  // what was typed; for everyone else the plain uniqueness check already ran.
  if (canonical === lower) return OK

  // Matched in SQL rather than by scanning every row into Node: strip `+tag`
  // and dots from the stored address the same way canonicalizeEmail does, and
  // compare. Only Gmail rows can match, so the scan is small and bounded.
  const rows =
    table === 'users'
      ? await db`
          SELECT 1 FROM users
          WHERE regexp_replace(split_part(split_part(lower(email), '@', 1), '+', 1), '\\.', '', 'g')
                || '@' || replace(split_part(lower(email), '@', 2), 'googlemail.com', 'gmail.com')
                = ${canonical}
          LIMIT 1`
      : table === 'organizations'
        ? await db`
            SELECT 1 FROM organizations
            WHERE regexp_replace(split_part(split_part(lower(admin_email), '@', 1), '+', 1), '\\.', '', 'g')
                  || '@' || replace(split_part(lower(admin_email), '@', 2), 'googlemail.com', 'gmail.com')
                  = ${canonical}
            LIMIT 1`
        : table === 'teams'
          ? await db`
              SELECT 1 FROM teams
              WHERE regexp_replace(split_part(split_part(lower(admin_email), '@', 1), '+', 1), '\\.', '', 'g')
                    || '@' || replace(split_part(lower(admin_email), '@', 2), 'googlemail.com', 'gmail.com')
                    = ${canonical}
              LIMIT 1`
          : await db`
              SELECT 1 FROM org_applications
              WHERE status <> 'rejected'
                AND regexp_replace(split_part(split_part(lower(email), '@', 1), '+', 1), '\\.', '', 'g')
                    || '@' || replace(split_part(lower(email), '@', 2), 'googlemail.com', 'gmail.com')
                    = ${canonical}
              LIMIT 1`

  if (rows.length > 0) {
    return { ok: false, error: 'An account already exists for this email. Please log in.' }
  }

  return OK
}
