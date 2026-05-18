import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { orgName, email, playerCount } = await req.json()
    if (!orgName?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Organization name and email are required' }, { status: 400 })
    }
    const emailLower = email.toLowerCase().trim()
    const count = typeof playerCount === 'number' ? playerCount : null

    const existing = await db`
      SELECT id FROM org_applications WHERE email = ${emailLower} AND status = 'pending'
    `
    if (existing.length > 0) {
      return NextResponse.json({ error: 'An application for this email is already pending review.' }, { status: 409 })
    }

    await db`
      INSERT INTO org_applications (org_name, email, player_count)
      VALUES (${orgName.trim()}, ${emailLower}, ${count})
    `
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Org apply error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
