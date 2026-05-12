import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id')
  if (!sessionId) return NextResponse.json({ email: null })

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId)
    const email = session.customer_details?.email ?? null
    return NextResponse.json({ email })
  } catch {
    return NextResponse.json({ email: null })
  }
}
