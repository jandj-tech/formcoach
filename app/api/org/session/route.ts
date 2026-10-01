import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'
import { orgRoleOf } from '@/lib/org-admins'

export async function GET(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ org: null })
  }

  const [org] = await db`
    SELECT id, name, admin_email, access_code
    FROM organizations WHERE id = ${session.orgId}
  ` as unknown as [{ id: string; name: string; admin_email: string; access_code: string } | undefined]

  if (!org) {
    return NextResponse.json({ org: null })
  }

  // role: 'owner' (the organizations row) or 'admin' (a linked org_admins
  // login — lib/org-admins.ts). email is the address signed in NOW;
  // adminEmail stays the owner's address for older clients.
  const role = await orgRoleOf(session)
  return NextResponse.json({
    org: {
      id: org.id,
      name: org.name,
      adminEmail: org.admin_email,
      accessCode: org.access_code,
      email: session.adminEmail,
      role,
    },
  })
}
