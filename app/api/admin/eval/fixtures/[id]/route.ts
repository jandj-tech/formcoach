import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

async function isAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

// Update a fixture's editable parts: expected ranges, description, active.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const [row] = (await db`
    UPDATE eval_fixtures SET
      expected = COALESCE(${body.expected !== undefined ? JSON.stringify(body.expected) : null}::jsonb, expected),
      description = COALESCE(${body.description ?? null}, description),
      active = COALESCE(${typeof body.active === 'boolean' ? body.active : null}, active),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, slug, analysis_id, description, frames_hash, frame_urls, expected, active
  `) as unknown as [Record<string, unknown> | undefined]
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ fixture: row })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await db`DELETE FROM eval_fixtures WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
