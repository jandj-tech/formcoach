import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY not set')
    stripeClient = new Stripe(key)
  }
  return stripeClient
}

export const PRODUCT = {
  name: 'The LearnHoops.com Training Ball',
  priceCents: 4999,
  currency: 'usd',
}

// 2-Ball Bundle: full price + 50% off second ball + 15 upload credits
export const BUNDLE = {
  ball1PriceCents: 4999,
  ball2PriceCents: 2500,  // Math.round(4999 * 0.5) = 2500
  uploadsGranted: 15,
}
