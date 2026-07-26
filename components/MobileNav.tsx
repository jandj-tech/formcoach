'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MenuIcon, XIcon } from 'lucide-react'

type Tab = { href: string; label: string }

type Props = {
  tabs: Tab[]
  rootHref?: string
  useNextLink?: boolean
  footer?: React.ReactNode
}

export default function MobileNav({
  tabs,
  rootHref = '/',
  useNextLink = true,
  footer,
}: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const [prevPath, setPrevPath] = useState(pathname)
  if (pathname !== prevPath) {
    setPrevPath(pathname)
    if (open) setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const LinkEl: React.ElementType = useNextLink ? Link : 'a'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        className="md:hidden inline-flex items-center justify-center h-11 w-11 rounded-lg text-chalk hover:bg-ink-800 active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-ember-500"
      >
        <MenuIcon className="h-6 w-6" />
      </button>

      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`md:hidden fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        id="mobile-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        className={`md:hidden fixed top-0 right-0 z-50 h-dvh w-72 max-w-[85vw] bg-ink-950 border-l border-courtline transform transition-transform duration-200 ease-out flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-courtline">
          <span className="text-chalk-dim eyebrow select-none">Menu</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="inline-flex items-center justify-center h-11 w-11 rounded-lg text-chalk hover:bg-ink-800 active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-ember-500"
          >
            <XIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-1">
          {tabs.map((tab) => {
            const active =
              tab.href === rootHref
                ? pathname === rootHref
                : pathname.startsWith(tab.href)
            return (
              <LinkEl
                key={tab.href}
                href={tab.href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-3 rounded-xl text-base font-semibold transition-colors active:scale-[0.98] ${
                  active
                    ? 'bg-ember-500 text-white'
                    : 'text-chalk hover:bg-ink-800'
                }`}
              >
                {tab.label}
              </LinkEl>
            )
          })}
        </div>

        {footer ? (
          <div className="border-t border-courtline px-4 py-3 text-sm">
            {footer}
          </div>
        ) : null}
      </aside>
    </>
  )
}
