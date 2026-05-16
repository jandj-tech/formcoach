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
      className="bg-orange-500 hover:bg-red-500 text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors"
    >
      Log out
    </button>
  )
}
