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
// currency ($48.95 USD in the US, $48.95 CAD in Canada). Shipping is
// charged separately at checkout from address-based zone rates.
export const PRODUCT = {
  name: 'The LearnHoops Training Ball',
  priceCents: 4895,
  currency: 'usd',
}

// 2-Ball Bundle: full price + discounted second ball + free shot analyses
export const BUNDLE = {
  ball1PriceCents: 4895,
  ball2PriceCents: 3590,  // → bundle totals 8485 ($84.85), saves $13.05
  uploadsGranted: 10,     // free shot analyses for the whole bundle
}

// Free shot analyses granted per single training ball purchased.
export const BALL_ANALYSES_GRANTED = 5
