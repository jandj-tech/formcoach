// Validation for offer create/update bodies, shared by the org builder routes
// and the admin editor so the two can't accept different shapes.

import {
  isOfferKind,
  isUnlockScope,
  validateOfferPrices,
  type OfferKind,
  type UnlockScope,
} from '@/lib/org-offers'

export interface OfferInput {
  kind: OfferKind
  title: string
  description: string | null
  includesBreakdown: boolean
  includesBall: boolean
  includesCourse: boolean
  regularPriceCents: number
  clubPriceCents: number | null
  discountPriceCents: number | null
  shippingCents: number
  joinTeamId: string | null
  unlockScope: UnlockScope
  sortOrder: number
}

type Result = { ok: true; value: OfferInput } | { ok: false; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function centsField(raw: unknown, label: string): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null }
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a number` }
  return { ok: true, value: Math.round(n) }
}

/**
 * Parse a full offer body. `base` supplies current values so a PATCH can send
 * only the fields it changes; a POST passes no base and every field must be
 * present or default.
 */
export function parseOfferInput(body: Record<string, unknown>, base?: OfferInput): Result {
  const b = body ?? {}
  const kind = b.kind ?? base?.kind ?? 'bundle'
  if (!isOfferKind(kind)) return { ok: false, error: 'Unknown offer type' }

  const titleRaw = b.title ?? base?.title
  const title = typeof titleRaw === 'string' ? titleRaw.trim().slice(0, 120) : ''
  if (!title) return { ok: false, error: 'Give the offer a name' }

  const descRaw = b.description ?? base?.description ?? null
  const description =
    descRaw === null || descRaw === undefined
      ? null
      : typeof descRaw === 'string'
        ? descRaw.trim().slice(0, 500) || null
        : null

  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
  const includesBreakdown = bool(b.includesBreakdown, base?.includesBreakdown ?? false)
  const includesBall = bool(b.includesBall, base?.includesBall ?? false)
  const includesCourse = bool(b.includesCourse, base?.includesCourse ?? false)
  if (!includesBreakdown && !includesBall && !includesCourse) {
    return { ok: false, error: 'An offer has to include something — the breakdown, the ball, or the class' }
  }

  const regular = centsField(b.regularPriceCents ?? base?.regularPriceCents, 'Regular price')
  if (!regular.ok) return regular
  if (regular.value === null) return { ok: false, error: 'Regular price is required' }
  const club = centsField('clubPriceCents' in b ? b.clubPriceCents : base?.clubPriceCents, 'Club price')
  if (!club.ok) return club
  const discount = centsField(
    'discountPriceCents' in b ? b.discountPriceCents : base?.discountPriceCents,
    'Discount price'
  )
  if (!discount.ok) return discount
  const priceError = validateOfferPrices({
    regularPriceCents: regular.value,
    clubPriceCents: club.value,
    discountPriceCents: discount.value,
  })
  if (priceError) return { ok: false, error: priceError }

  const shipping = centsField(b.shippingCents ?? base?.shippingCents ?? 0, 'Shipping')
  if (!shipping.ok) return shipping
  const shippingCents = shipping.value ?? 0
  if (shippingCents < 0 || shippingCents > 50000) return { ok: false, error: 'Shipping must be between $0 and $500' }

  const joinRaw = 'joinTeamId' in b ? b.joinTeamId : base?.joinTeamId ?? null
  const joinTeamId = typeof joinRaw === 'string' && UUID_RE.test(joinRaw) ? joinRaw : null

  const scope = b.unlockScope ?? base?.unlockScope ?? (includesBall || includesCourse ? 'player' : 'submission')
  if (!isUnlockScope(scope)) return { ok: false, error: 'Unknown unlock scope' }

  const sortRaw = b.sortOrder ?? base?.sortOrder ?? 99
  const sortOrder = Number.isFinite(Number(sortRaw)) ? Math.max(0, Math.floor(Number(sortRaw))) : 99

  return {
    ok: true,
    value: {
      kind,
      title,
      description,
      includesBreakdown,
      includesBall,
      includesCourse,
      regularPriceCents: regular.value,
      clubPriceCents: club.value,
      discountPriceCents: discount.value,
      shippingCents,
      joinTeamId,
      unlockScope: scope,
      sortOrder,
    },
  }
}
