import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { coerceJson } from '@/lib/eval'
import { isAdminSession } from '@/lib/admin-auth'

async function isAdmin() {
  return isAdminSession()
}

// Update a fixture's editable parts: expected ranges, description, active.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  // db.json() — never `${JSON.stringify(x)}::jsonb`, which double-encodes and
  // stores a jsonb string instead of an object (see coerceJson in lib/eval).
  // Left as raw null when absent so COALESCE keeps the existing value; a
  // db.json(null) would be jsonb 'null' and would overwrite it.
  const expectedParam = body.expected !== undefined ? db.json(body.expected) : null
  const [row] = (await db`
    UPDATE eval_fixtures SET
      expected = COALESCE(${expectedParam}::jsonb, expected),
      description = COALESCE(${body.description ?? null}, description),
      active = COALESCE(${typeof body.active === 'boolean' ? body.active : null}, active),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, slug, analysis_id, description, frames_hash, frame_urls, expected, active
  `) as unknown as [Record<string, unknown> | undefined]
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ fixture: { ...row, expected: coerceJson(row.expected, {}) } })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await db`DELETE FROM eval_fixtures WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
