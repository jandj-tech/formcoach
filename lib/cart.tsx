'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'

export type Variant = 'right' | 'left'
export type Size = '5' | '6' | '7'

export type CartItem = {
  id: string
  productSlug: 'ball'
  variant: Variant
  size: Size
  quantity: number
}

type CartContextValue = {
  items: CartItem[]
  count: number
  hydrated: boolean
  addBall: (variant: Variant, size: Size, quantity: number) => void
  setQuantity: (id: string, quantity: number) => void
  removeItem: (id: string) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)
const STORAGE_KEY = 'learnhoops_cart_v1'
const MAX_QTY = 99

export function ballId(variant: Variant, size: Size) {
  return `ball:${variant}:${size}`
}

function loadFromStorage(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (it): it is CartItem =>
        !!it &&
        typeof it.id === 'string' &&
        (it.variant === 'right' || it.variant === 'left') &&
        (it.size === '5' || it.size === '6' || it.size === '7') &&
        typeof it.quantity === 'number' &&
        it.quantity > 0,
    )
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    // Defer storage read to post-hydration so server (empty cart) matches the
    // first client render, then populate. Standard localStorage hydration
    // pattern; rule disabled deliberately.
    /* eslint-disable react-hooks/set-state-in-effect */
    setItems(loadFromStorage())
    setHydrated(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {}
  }, [items, hydrated])

  const addBall = useCallback((variant: Variant, size: Size, quantity: number) => {
    if (quantity < 1) return
    const id = ballId(variant, size)
    setItems((prev) => {
      const existing = prev.find((it) => it.id === id)
      if (existing) {
        return prev.map((it) =>
          it.id === id
            ? { ...it, quantity: Math.min(MAX_QTY, it.quantity + quantity) }
            : it,
        )
      }
      return [
        ...prev,
        {
          id,
          productSlug: 'ball',
          variant,
          size,
          quantity: Math.min(MAX_QTY, quantity),
        },
      ]
    })
  }, [])

  const setQuantity = useCallback((id: string, quantity: number) => {
    if (quantity < 1) {
      setItems((prev) => prev.filter((it) => it.id !== id))
      return
    }
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, quantity: Math.min(MAX_QTY, quantity) } : it,
      ),
    )
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const count = items.reduce((sum, it) => sum + it.quantity, 0)

  return (
    <CartContext.Provider
      value={{ items, count, hydrated, addBall, setQuantity, removeItem, clear }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
