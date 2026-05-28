'use client'

import { useEffect } from 'react'
import { useCart } from '@/lib/cart'

// The credit grant is now done server-side in the success page itself,
// so this component just clears the cart.
export default function ClearCart({ sessionId: _sessionId }: { sessionId?: string }) {
  const { clear, hydrated } = useCart()

  useEffect(() => {
    if (hydrated) clear()
  }, [hydrated, clear])

  return null
}
