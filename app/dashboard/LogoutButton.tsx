'use client'

import { useRouter } from 'next/navigation'
import { useCart } from '@/lib/cart'

export default function LogoutButton() {
  const router = useRouter()
  const { clear } = useCart()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    clear() // The cart is per-session — empty it on logout.
    router.push('/')
  }

  return (
    <button
      onClick={handleLogout}
      className="shrink-0 border border-courtline text-chalk hover:border-ember-500/60 hover:text-ember-400 font-semibold text-sm px-4 py-2 rounded-full transition-colors"
    >
      Log out
    </button>
  )
}
