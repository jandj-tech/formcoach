'use client'

import { useEffect } from 'react'
import { useCart } from '@/lib/cart'

export default function ClearCart() {
  const { clear, hydrated } = useCart()

  useEffect(() => {
    if (hydrated) clear()
  }, [hydrated, clear])

  return null
}
