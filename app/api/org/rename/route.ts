import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'
import { cleanDisplayText } from '@/lib/moderation'

// Rename the organization (org owner).
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { name } = await req.json()
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 })
    }
    // Cap one past the column width so an over-long name is refused, not cut.
    const cleaned = cleanDisplayText(name, 256)
    if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 })
    const trimmed = cleaned.value
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
