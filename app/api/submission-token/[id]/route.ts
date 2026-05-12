import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [submission] = await db`
    SELECT token FROM submissions WHERE id = ${id} AND user_id = ${session.userId}
  ` as unknown as [{ token: string } | undefined]

  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ token: submission.token })
}
