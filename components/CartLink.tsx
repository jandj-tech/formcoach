'use client'

import Link from 'next/link'
import { ShoppingCartIcon } from 'lucide-react'
import { useCart } from '@/lib/cart'

export default function CartLink() {
  const { count, hydrated } = useCart()

  return (
    <Link
      href="/cart"
      aria-label={`Cart${hydrated && count > 0 ? `, ${count} item${count === 1 ? '' : 's'}` : ''}`}
      className="relative inline-flex items-center justify-center h-11 w-11 rounded-lg text-chalk hover:bg-ink-800 active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-ember-500"
    >
      <ShoppingCartIcon className="h-6 w-6" />
      {hydrated && count > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 bg-ember-500 text-white text-[10px] font-bold rounded-full font-numeric">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  )
}
