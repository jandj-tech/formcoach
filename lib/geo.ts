import { headers } from 'next/headers'

export type Region = 'US' | 'CA'

export async function getRegion(): Promise<Region> {
  const h = await headers()
  return h.get('x-vercel-ip-country') === 'CA' ? 'CA' : 'US'
}
