import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { cookies } from 'next/headers'

async function isAdminAuthed(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function GET() {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stripe = getStripe()

  const promotionCodes = await stripe.promotionCodes.list({
    limit: 100,
    expand: ['data.promotion.coupon'],
  })

  type ExpandedCoupon = { percent_off?: number; amount_off?: number; currency?: string }
  type ExpandedPromo = { coupon: ExpandedCoupon | string | null; type: string }
  type ExpandedPromoCode = Omit<(typeof promotionCodes.data)[number], 'promotion'> & {
    promotion: ExpandedPromo
  }
  const codes = (promotionCodes.data as unknown as ExpandedPromoCode[]).map((pc) => {
    const coupon = typeof pc.promotion?.coupon === 'object' ? pc.promotion.coupon as ExpandedCoupon : {}
    return {
      id: pc.id,
      code: pc.code,
      active: pc.active,
      times_redeemed: pc.times_redeemed,
      max_redemptions: pc.max_redemptions,
      expires_at: pc.expires_at,
      percent_off: coupon?.percent_off ?? null,
    }
  })

  return NextResponse.json({ codes })
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code, maxRedemptions, percentOff } = await req.json() as {
    code?: string
    maxRedemptions?: number
    percentOff?: number
  }

  const discountPercent = Math.min(100, Math.max(1, Math.round(percentOff ?? 100)))

  const stripe = getStripe()

  const couponName = discountPercent === 100 ? 'LearnHoops Free Access' : `LearnHoops ${discountPercent}% Off`
  const coupon = await stripe.coupons.create({
    percent_off: discountPercent,
    duration: 'forever',
    name: couponName,
  })

  // Create a promotion code for the coupon
  const promoCode = await stripe.promotionCodes.create({
    promotion: { coupon: coupon.id, type: 'coupon' as const },
    ...(code ? { code: code.toUpperCase().replace(/\s+/g, '') } : {}),
    ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
  })

  return NextResponse.json({
    id: promoCode.id,
    code: promoCode.code,
    active: promoCode.active,
    times_redeemed: promoCode.times_redeemed,
    max_redemptions: promoCode.max_redemptions,
  })
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const stripe = getStripe()
  await stripe.promotionCodes.update(id, { active: false })

  return NextResponse.json({ success: true })
}
