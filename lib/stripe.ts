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

// Flat numeric pricing: the same cent value is charged in the region's
// currency ($39.99 USD in the US, $39.99 CAD in Canada). Shipping is
// charged separately at checkout from live carrier rates.
export const PRODUCT = {
  name: 'The LearnHoops Training Ball',
  priceCents: 3999,
  currency: 'usd',
}

// 2-Ball Bundle: full price + 50% off second ball + free shot analyses
export const BUNDLE = {
  ball1PriceCents: 3999,
  ball2PriceCents: 2000,  // ~50% off → bundle totals 5999 ($59.99)
  uploadsGranted: 10,     // free shot analyses for the whole bundle
}

// Free shot analyses granted per single training ball purchased.
export const BALL_ANALYSES_GRANTED = 5
