import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'

// Rename the organization (org owner).
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { name } = await req.json()
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (!trimmed) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 })
    }
    if (trimmed.length > 255) {
      return NextResponse.json({ error: 'Name is too long' }, { status: 400 })
    }

    await db`UPDATE organizations SET name = ${trimmed} WHERE id = ${session.orgId}`
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Org rename error:', err)
    return NextResponse.json({ error: 'Could not rename' }, { status: 500 })
  }
}
