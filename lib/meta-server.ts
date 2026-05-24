// Server-side Meta Conversions API. Sends events that the browser pixel misses
// due to iOS ATT, ad blockers, or Safari ITP. Always deduplicate with event_id.

import crypto from 'crypto'

const PIXEL_ID = process.env.META_PIXEL_ID
const ACCESS_TOKEN = process.env.META_CONVERSIONS_API_TOKEN
const API_VERSION = 'v19.0'

type MetaUserData = {
  em?: string[]
  client_ip_address?: string
  client_user_agent?: string
  fbc?: string
  fbp?: string
}

type MetaEvent = {
  event_name: string
  event_time: number
  event_id: string
  event_source_url?: string
  action_source: 'website' | 'app' | 'email' | 'other'
  user_data: MetaUserData
  custom_data?: Record<string, unknown>
}

function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex')
}

export function buildEventId(): string {
  return crypto.randomUUID()
}

export async function sendMetaEvent(event: MetaEvent): Promise<void> {
  if (!PIXEL_ID || !ACCESS_TOKEN) return
  const url = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [event] }),
    })
  } catch {
    // Non-fatal — pixel tracking must never break the app
  }
}

export function makeRegistrationEvent(opts: {
  email: string
  ip?: string
  userAgent?: string
  url?: string
  fbc?: string
  fbp?: string
}): MetaEvent {
  return {
    event_name: 'CompleteRegistration',
    event_time: Math.floor(Date.now() / 1000),
    event_id: buildEventId(),
    event_source_url: opts.url,
    action_source: 'website',
    user_data: {
      em: [hashEmail(opts.email)],
      client_ip_address: opts.ip,
      client_user_agent: opts.userAgent,
      fbc: opts.fbc,
      fbp: opts.fbp,
    },
  }
}

export function makePurchaseEvent(opts: {
  email?: string
  value: number
  currency?: string
  ip?: string
  userAgent?: string
  url?: string
  fbc?: string
  fbp?: string
}): MetaEvent {
  return {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: buildEventId(),
    event_source_url: opts.url,
    action_source: 'website',
    user_data: {
      ...(opts.email ? { em: [hashEmail(opts.email)] } : {}),
      client_ip_address: opts.ip,
      client_user_agent: opts.userAgent,
      fbc: opts.fbc,
      fbp: opts.fbp,
    },
    custom_data: {
      value: opts.value,
      currency: opts.currency ?? 'USD',
    },
  }
}

export function makeLeadEvent(opts: {
  email?: string
  ip?: string
  userAgent?: string
  url?: string
  fbc?: string
  fbp?: string
}): MetaEvent {
  return {
    event_name: 'Lead',
    event_time: Math.floor(Date.now() / 1000),
    event_id: buildEventId(),
    event_source_url: opts.url,
    action_source: 'website',
    user_data: {
      ...(opts.email ? { em: [hashEmail(opts.email)] } : {}),
      client_ip_address: opts.ip,
      client_user_agent: opts.userAgent,
      fbc: opts.fbc,
      fbp: opts.fbp,
    },
  }
}
