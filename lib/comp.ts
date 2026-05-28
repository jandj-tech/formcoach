import { getStripe } from '@/lib/stripe'

const COMP_COUPON_ID = 'learnhoops_comp_100'

// Comp codes are defined server-side via the FREE_ORDER_CODES env var
// (comma-separated, case-insensitive). A matching code zeroes the order.
export function isValidCompCode(code: unknown): boolean {
  if (typeof code !== 'string' || !code.trim()) return false
  const allowed = (process.env.FREE_ORDER_CODES || '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
  return allowed.includes(code.trim().toUpperCase())
}

// A reusable 100%-off Stripe coupon. Applying it via `discounts` at session
// creation makes the total $0, so Stripe Checkout skips the card form (while
// still collecting shipping/email). Created lazily on first use.
export async function getCompCouponId(): Promise<string> {
  const stripe = getStripe()
  try {
    await stripe.coupons.retrieve(COMP_COUPON_ID)
  } catch {
    await stripe.coupons.create({
      id: COMP_COUPON_ID,
      percent_off: 100,
      duration: 'once',
      name: 'LearnHoops Comp (100% off)',
    })
  }
  return COMP_COUPON_ID
}
