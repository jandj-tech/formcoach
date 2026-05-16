import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'

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

  return NextResponse.json({
    org: {
      id: org.id,
      name: org.name,
      adminEmail: org.admin_email,
      accessCode: org.access_code,
    },
  })
}
