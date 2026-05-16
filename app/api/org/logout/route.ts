import { NextResponse } from 'next/server'
import { clearAllSessions } from '@/lib/sessions'

export async function POST() {
  const res = NextResponse.json({ success: true })
  clearAllSessions(res)
  return res
}
