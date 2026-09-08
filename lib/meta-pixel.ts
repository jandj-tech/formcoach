// Client-side Meta Pixel helpers.
//
// fbq() DROPS a call when the pixel script has not loaded — it does not queue
// it. That is deliberate: the script only loads once a visitor has accepted
// marketing cookies (components/MetaPixel.tsx), and an event fired before that
// is exactly what the consent banner promises will not happen.
//
// Every event that ALSO has a server-side twin in lib/meta-server.ts must carry
// the SAME event_id both ways or Meta counts one conversion twice: Purchase
// uses the Stripe checkout session id, CompleteRegistration a browser-generated
// id posted to the signup API.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    _fbq?: (...args: unknown[]) => void
  }
}

export function fbq(...args: unknown[]) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq(...args)
  }
}

/**
 * The standard-event parameters Meta reads for optimization and reporting.
 * `currency` is not decoration: a value sent without it, or with the wrong one,
 * makes CAD and USD conversions incomparable in Ads Manager. Pass the currency
 * the server will actually charge (see lib/use-region-currency.ts).
 */
export type PixelParams = {
  value?: number
  currency?: string
  content_ids?: string[]
  content_type?: 'product' | 'product_group'
  content_name?: string
  num_items?: number
}

function track(event: string, params: PixelParams = {}, eventId?: string) {
  fbq('track', event, params, eventId ? { eventID: eventId } : undefined)
}

/** Someone looked at a product. The main mid-funnel signal on a cold landing. */
export function trackViewContent(params: PixelParams) {
  track('ViewContent', params)
}

export function trackAddToCart(params: PixelParams) {
  track('AddToCart', params)
}

/**
 * Checkout started. While purchases are rare (under ~50/week) this is the
 * event with enough volume to tell whether an ad set is working at all.
 */
export function trackInitiateCheckout(params: PixelParams = {}, eventId?: string) {
  track('InitiateCheckout', params, eventId)
}

/**
 * The browser half of a purchase. `eventId` MUST be the Stripe checkout session
 * id — lib/meta-server.ts keys the server event on exactly that, so the pair
 * collapses into one conversion. Zero-value (comp-coupon) orders send nothing,
 * matching checkoutSessionEvents, so the algorithm never learns that $0 buyers
 * are the target customer.
 */
export function trackPurchase(params: PixelParams & { value: number }, eventId?: string) {
  if (!(params.value > 0)) return
  track('Purchase', params, eventId)
}

export function trackLead(params: PixelParams = {}) {
  track('Lead', params)
}

/**
 * Pass the SAME id to the signup API call that mirrors this via the Conversions
 * API, or every consented signup is counted twice.
 */
export function trackCompleteRegistration(eventId?: string) {
  track('CompleteRegistration', {}, eventId)
}

/** Browser-side id shared between an fbq call and the API call that mirrors it. */
export function newMetaEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
