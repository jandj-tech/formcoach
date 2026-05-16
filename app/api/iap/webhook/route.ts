import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Only handle initial purchase events for our token product
    const event = body.event
    if (!event) return NextResponse.json({ ok: true })

    const productId = event.product_id ?? ''
    const eventType = event.type ?? ''

    if (productId !== 'com.learnhoops.app.token') return NextResponse.json({ ok: true })
    if (eventType !== 'INITIAL_PURCHASE' && eventType !== 'NON_SUBSCRIPTION_PURCHASE') {
      return NextResponse.json({ ok: true })
    }

    const appUserId = event.app_user_id ?? ''
    if (!appUserId) return NextResponse.json({ ok: true })

    // appUserId is the RevenueCat customer ID — match to our user by id
    await db`
      UPDATE users
      SET analysis_tokens = COALESCE(analysis_tokens, 0) + 1
      WHERE id = ${appUserId}
    `

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('IAP webhook error:', err)
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 })
  }
}
