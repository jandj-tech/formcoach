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
      className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
    >
      Log out
    </button>
  )
}
