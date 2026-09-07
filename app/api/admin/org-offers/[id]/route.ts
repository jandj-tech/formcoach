import { NextRequest, NextResponse } from 'next/server'
import { isAdminSession } from '@/lib/admin-auth'
import { getOfferById, getOrgSellingState, updateOffer } from '@/lib/org-offers-db'
import { parseOfferInput } from '@/lib/org-offer-input'
import { parseSharePercent } from '@/lib/org-offers'

// Site admin edits any org's offer: prices, content, on/off, and the
// LearnHoops share for it — a fixed fee (platformShareCents, wins when set) or
// a percent override (platformSharePercent); null on both = the org's quote.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await ctx.params
    const existing = await getOfferById(id)
    if (!existing) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const parsed = parseOfferInput(body, existing)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    let active: boolean | undefined
    if (typeof body.active === 'boolean') {
      if (body.active && !(await getOrgSellingState(existing.orgId)).enabled) {
        return NextResponse.json({ error: 'Set this organization’s split before turning offers on.' }, { status: 403 })
      }
      active = body.active
    }
    let platformSharePercent: number | null | undefined
    if ('platformSharePercent' in body) {
      if (body.platformSharePercent === null || body.platformSharePercent === '') platformSharePercent = null
      else {
        const pct = parseSharePercent(body.platformSharePercent)
        if (pct === null) return NextResponse.json({ error: 'Percent must be between 0 and 100' }, { status: 400 })
        platformSharePercent = Math.round(pct * 100) / 100
      }
    }
    let platformShareCents: number | null | undefined
    if ('platformShareCents' in body) {
      if (body.platformShareCents === null || body.platformShareCents === '') platformShareCents = null
      else {
        const cents = Number(body.platformShareCents)
        if (!Number.isInteger(cents) || cents < 0 || cents > 100000000) {
          return NextResponse.json({ error: 'Fixed fee must be a whole number of cents, 0 or more' }, { status: 400 })
        }
        platformShareCents = cents
      }
    }
    const offer = await updateOffer(id, parsed.value, { active, platformSharePercent, platformShareCents })
    return NextResponse.json({ success: true, offer })
  } catch (err) {
    console.error('[admin/org-offers/:id] failed:', err)
    return NextResponse.json({ error: 'Could not save the offer' }, { status: 500 })
  }
}
