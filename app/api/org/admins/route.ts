import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { inviteOrgAdmin, listOrgAdmins, orgRoleOf, removeOrgAdmin, OrgAdminError } from '@/lib/org-admins'
import { cleanOptionalDisplayText } from '@/lib/moderation'

// Linked organization admin accounts (lib/org-admins.ts).
//   GET    — the org's linked admins and the caller's own role
//   POST   — { email, name? } invites (or re-sends to a pending) admin
//   DELETE — { id } removes a linked admin; the organization OWNER only

export async function GET(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [admins, role] = await Promise.all([listOrgAdmins(session.orgId), orgRoleOf(session)])
  return NextResponse.json({ admins, role, email: session.adminEmail })
}

export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; name?: unknown }
  const name = cleanOptionalDisplayText(typeof body.name === 'string' ? body.name : undefined, 100)
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 })
  try {
    const out = await inviteOrgAdmin({
      orgId: session.orgId,
      email: String(body.email ?? ''),
      name: name.value ?? null,
      invitedBy: session.adminEmail,
    })
    return NextResponse.json({ success: true, ...out })
  } catch (err) {
    if (err instanceof OrgAdminError) return NextResponse.json({ error: err.message }, { status: err.status })
    const msg = err instanceof Error ? err.message : String(err)
    if (/relation .*org_admins.* does not exist/i.test(msg)) {
      return NextResponse.json({ error: 'Organization admins need a database update — run `npm run migrate`.' }, { status: 503 })
    }
    console.error('[org/admins] invite failed:', err)
    return NextResponse.json({ error: 'Could not add that admin' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((await orgRoleOf(session)) !== 'owner') {
    return NextResponse.json({ error: 'Only the organization owner can remove admins.' }, { status: 403 })
  }
  const body = (await req.json().catch(() => ({}))) as { id?: unknown }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Admin is required' }, { status: 400 })
  try {
    const removed = await removeOrgAdmin(session.orgId, id)
    if (!removed) return NextResponse.json({ error: 'Admin not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[org/admins] remove failed:', err)
    return NextResponse.json({ error: 'Could not remove that admin' }, { status: 500 })
  }
}
