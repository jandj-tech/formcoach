'use client'

import { useRouter } from 'next/navigation'
import { LogOutIcon } from 'lucide-react'
import { useCart } from '@/lib/cart'
import { backendButton } from '@/components/backend/button-styles'

export default function LogoutButton() {
  const router = useRouter()
  const { clear } = useCart()

  async function handleLogout() {
    await fetch('/api/org/logout', { method: 'POST' })
    clear() // The cart is per-session — empty it on logout.
    router.push('/')
  }

  return (
    <button onClick={handleLogout} className={backendButton('quiet')}>
      <LogOutIcon aria-hidden />
      Log out
    </button>
  )
}
