import { NextRequest, NextResponse } from 'next/server'
import { regionFromRequest, currencyForRegion } from '@/lib/region'

// The buyer's region, and the currency they'll actually be charged in. Both
// come from the same helper the checkout routes use, so a price labelled here
// can never disagree with the price billed there.
export async function GET(req: NextRequest) {
  const region = regionFromRequest(req)
  return NextResponse.json({
    region,
    currency: currencyForRegion(region).toUpperCase(),
  })
}
