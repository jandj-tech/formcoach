'use client'

import { useRouter } from 'next/navigation'
import { useCart } from '@/lib/cart'

export default function LogoutButton() {
  const router = useRouter()
  const { clear } = useCart()

  async function handleLogout() {
    await fetch('/api/org/logout', { method: 'POST' })
    clear() // The cart is per-session — empty it on logout.
    router.push('/')
  }

  return (
    <button
      onClick={handleLogout}
      className="flex-1 sm:flex-none border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600 font-semibold text-sm px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
    >
      Log out
    </button>
  )
}
