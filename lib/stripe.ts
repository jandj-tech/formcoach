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
