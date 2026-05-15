import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ teamCode: string }> }
) {
  const { teamCode } = await params

  const [team] = await db`
    SELECT name, access_code, credits
    FROM teams WHERE access_code = ${teamCode.toUpperCase()}
  ` as unknown as [{ name: string; access_code: string; credits: number } | undefined]

  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  return NextResponse.json({
    name: team.name,
    accessCode: team.access_code,
    credits: team.credits,
  })
}
