import { NextResponse } from 'next/server'
import { OUT_OF_STOCK_SIZES } from '@/lib/ball-inventory'

/**
 * Which ball sizes are out of stock, for clients that render their own size
 * picker — namely the native iOS shop, which can't share the web components.
 * Reads the same source of truth as the checkout guard and the shop UI
 * (lib/ball-inventory.ts), so restocking is still a one-line edit that every
 * surface — web, schema feed, checkout, AND the app — picks up at once, with
 * no App Store submission.
 *
 * Public and cache-friendly: the app fetches it on the shop screen. A short
 * CDN cache keeps it fresh within a minute of a restock while staying cheap.
 */
export function GET() {
  return NextResponse.json(
    { outOfStock: OUT_OF_STOCK_SIZES },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  )
}
