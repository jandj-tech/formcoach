import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest, type OrgSessionPayload } from './org-auth'
import { rejectNativeAppPurchase } from './in-app'
import { MembershipError } from './org-membership'

/**
 * Shared front door for /api/org/memberships/*. Org memberships are WEBSITE
 * ONLY: every route refuses the iOS app (native UA, WebView marker, or any
 * Authorization header — so only the httpOnly org cookie session gets in).
 */
export async function membershipOrgSession(
  req: NextRequest,
): Promise<{ session: OrgSessionPayload } | { response: NextResponse }> {
  const blocked = rejectNativeAppPurchase(req)
  if (blocked) return { response: blocked }
  const session = await getOrgSessionFromRequest(req)
  if (!session?.orgId) {
    return { response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }
  return { session }
}

export function membershipErrorResponse(err: unknown, label: string): NextResponse {
  if (err instanceof MembershipError) {
    return NextResponse.json({ error: err.message, ...(err.code ? { code: err.code } : {}) }, { status: err.status })
  }
  console.error(`[org-memberships] ${label} failed:`, err)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    throw new MembershipError('Invalid request body.', 400)
  }
}

export const ORG_NOT_ENTITLED_MESSAGE =
  'Player memberships are available to organizations on an active plan. Reactivate your plan to buy seats.'
