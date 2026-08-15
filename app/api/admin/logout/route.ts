import { NextResponse } from 'next/server'
import { ADMIN_COOKIE } from '@/lib/sessions'

// Drops admin mode without touching any player/coach session, so the owner can
// step out of the admin view — and out of coach mode on results pages — while
// staying signed in as himself.
export async function POST() {
  const res = NextResponse.json({ success: true })
  res.cookies.set({ name: ADMIN_COOKIE, value: '', httpOnly: true, path: '/', maxAge: 0 })
  return res
}
