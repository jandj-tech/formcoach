// Client-side Meta Pixel helper. Safe to call before fbq loads — events queue automatically.

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

export function trackViewContent(contentName: string) {
  fbq('track', 'ViewContent', { content_name: contentName })
}

export function trackLead(email?: string) {
  fbq('track', 'Lead', email ? { em: email } : {})
}

export function trackInitiateCheckout(value?: number, currency = 'USD') {
  fbq('track', 'InitiateCheckout', value ? { value, currency } : {})
}

/**
 * Fires the browser half of the signup conversion. Pass the SAME eventId that
 * the signup API call sends to the Conversions API — Meta dedupes on
 * (event_name, event_id), so without it every consented signup counts twice.
 */
export function trackCompleteRegistration(eventId?: string) {
  fbq('track', 'CompleteRegistration', {}, eventId ? { eventID: eventId } : undefined)
}

/** Browser-side id shared between fbq and the API call that mirrors it via CAPI. */
export function newMetaEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function trackPurchase(value: number, currency = 'USD') {
  fbq('track', 'Purchase', { value, currency })
}
