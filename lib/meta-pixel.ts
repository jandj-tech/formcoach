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

export function trackCompleteRegistration() {
  fbq('track', 'CompleteRegistration')
}

export function trackPurchase(value: number, currency = 'USD') {
  fbq('track', 'Purchase', { value, currency })
}
