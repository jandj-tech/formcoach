import { NextResponse } from 'next/server'

export async function POST() {
  const res = NextResponse.json({ success: true })
  res.cookies.set({
    name: 'fc_team_session',
    value: '',
    httpOnly: true,
    path: '/',
    maxAge: 0,
  })
  return res
}
