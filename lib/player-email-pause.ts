/**
 * Kill switch for every email the site sends a PLAYER because of something a
 * coach or organization did:
 *
 *   - roster add / "Resend setup" / give-own-account setup links
 *   - Results-tab score emails and team announcements (sendPlayerEmails)
 *   - the legacy org "send results" emails
 *   - org-membership notices to players (covered, ending, seat removed,
 *     personal plan paused / resumed)
 *
 * Switched ON 2026-10-01 while Maple Basketball tests the org and team
 * features; the owner will say when players may get email again. To turn
 * emails back on, set PAUSED_BY_DEFAULT to false below (or set the env var
 * PLAYER_EMAILS_PAUSED=0 and redeploy).
 *
 * Emails a player asks for themselves (password reset, signup confirmation,
 * purchase receipts) and emails to coaches / organizations are NOT affected.
 */
const PAUSED_BY_DEFAULT = true

export const PLAYER_EMAILS_PAUSED: boolean =
  process.env.PLAYER_EMAILS_PAUSED === '0' ? false
  : process.env.PLAYER_EMAILS_PAUSED === '1' ? true
  : PAUSED_BY_DEFAULT

/**
 * True (and logs) when a player email must be dropped. Callers return as if
 * the send succeeded so coach / org flows keep working during the test.
 */
export function playerEmailPaused(what: string, to: string): boolean {
  if (!PLAYER_EMAILS_PAUSED) return false
  console.log(`[email] PAUSED — player emails are off for testing; not sending ${what} to ${to}`)
  return true
}
