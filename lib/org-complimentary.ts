import { db } from './db'

/**
 * Whether an organization's OWN uploads (the owner analyzing a shot from the
 * org login) are complimentary.
 *
 * The admin grants complimentary access to an EMAIL (/admin/access writes
 * email_list.subscription_type = 'complimentary'). On a player account that
 * becomes the legacy-unlimited flag; here the same grant covers the org
 * account that logs in under that address, so the owner is not sent to buy
 * org tokens for their own shots.
 *
 * Deliberately narrow:
 *   - it never touches organizations.token_balance, team credits, coach
 *     credits or player tokens — every balance stays separate and the only
 *     way tokens reach anyone else is an explicit send from the Tokens tab;
 *   - it only funds uploads where the org session itself is the uploader
 *     (coachSelf). Team uploads for players keep drawing on the head coach's
 *     credits / team budget exactly as before;
 *   - revoking the comp in /admin/access clears email_list, which switches
 *     this off at the same time.
 *
 * Org accounts are only ever created through an admin-approved application
 * or a paid org checkout, and the address cannot already belong to another
 * coach or org, so a comped address cannot be claimed by a second org.
 * False on any database error (e.g. columns not migrated yet).
 */
export async function orgHasComplimentaryAccess(orgId: string): Promise<boolean> {
  if (!orgId) return false
  try {
    const [row] = (await db`
      SELECT EXISTS (
        SELECT 1
        FROM organizations o
        JOIN email_list e ON e.email = LOWER(TRIM(o.admin_email))
        WHERE o.id = ${orgId}
          AND e.subscription_type = 'complimentary'
          AND e.subscription_expires_at IS NOT NULL
          AND e.subscription_expires_at > NOW()
      ) AS comp
    `) as unknown as [{ comp: boolean } | undefined]
    return row?.comp === true
  } catch (err) {
    console.warn('[org-complimentary] lookup failed:', err instanceof Error ? err.message : err)
    return false
  }
}
