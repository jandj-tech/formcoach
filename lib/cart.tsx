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

export type CartBallItem = {
  id: string
  productSlug: 'ball'
  variant: Variant
  size: Size
  quantity: number
}

export type CartBundleItem = {
  id: string
  productSlug: 'bundle'
  variant1: Variant
  size1: Size
  variant2: Variant
  size2: Size
}

export type CartItem = CartBallItem | CartBundleItem

type CartContextValue = {
  items: CartItem[]
  count: number
  hydrated: boolean
  addBall: (variant: Variant, size: Size, quantity: number) => void
  addBundle: (variant1: Variant, size1: Size, variant2: Variant, size2: Size) => void
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

function isVariant(v: unknown): v is Variant {
  return v === 'right' || v === 'left'
}

function isSize(s: unknown): s is Size {
  return s === '5' || s === '6' || s === '7'
}

function loadFromStorage(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((it): it is CartItem => {
      if (!it || typeof it.id !== 'string') return false
      if (it.productSlug === 'ball') {
        return isVariant(it.variant) && isSize(it.size) && typeof it.quantity === 'number' && it.quantity > 0
      }
      if (it.productSlug === 'bundle') {
        return isVariant(it.variant1) && isSize(it.size1) && isVariant(it.variant2) && isSize(it.size2)
      }
      return false
    })
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
      if (existing && existing.productSlug === 'ball') {
        return prev.map((it) =>
          it.id === id && it.productSlug === 'ball'
            ? { ...it, quantity: Math.min(MAX_QTY, it.quantity + quantity) }
            : it,
        )
      }
      return [
        ...prev,
        {
          id,
          productSlug: 'ball' as const,
          variant,
          size,
          quantity: Math.min(MAX_QTY, quantity),
        },
      ]
    })
  }, [])

  const addBundle = useCallback((variant1: Variant, size1: Size, variant2: Variant, size2: Size) => {
    const id = `bundle:${Date.now()}`
    setItems((prev) => [
      ...prev,
      { id, productSlug: 'bundle' as const, variant1, size1, variant2, size2 },
    ])
  }, [])

  const setQuantity = useCallback((id: string, quantity: number) => {
    if (quantity < 1) {
      setItems((prev) => prev.filter((it) => it.id !== id))
      return
    }
    setItems((prev) =>
      prev.map((it) =>
        it.id === id && it.productSlug === 'ball' ? { ...it, quantity: Math.min(MAX_QTY, quantity) } : it,
      ),
    )
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }, [])

  const clear = useCallback(() => {
    setItems([])
    // Wipe storage synchronously too, so a logout reliably empties the cart
    // even if navigation interrupts the persistence effect.
    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }, [])

  const count = items.reduce((sum, it) => sum + (it.productSlug === 'ball' ? it.quantity : 1), 0)

  return (
    <CartContext.Provider
      value={{ items, count, hydrated, addBall, addBundle, setQuantity, removeItem, clear }}
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
