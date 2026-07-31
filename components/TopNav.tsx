'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import MobileNav from './MobileNav'
import CartLink from './CartLink'
import { useIsInApp } from '@/lib/useIsInApp'

const tabs = [
  { href: '/', label: 'Home' },
  { href: '/analyze', label: 'Analyze' },
  { href: '/shop', label: 'Shop' },
  { href: '/learn', label: 'Learn' },
  { href: '/support', label: 'Support' },
]

export default function TopNav() {
  const pathname = usePathname()
  const inApp = useIsInApp()
  const [account, setAccount] = useState<{ type: string; dashboard: string } | null>(null)

  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(({ account }) => setAccount(account ?? null))
      .catch(() => {})
  }, [])

  // Signed in → "Account" (the player, coach, or org dashboard); signed out → "Login".
  const accountHref = account ? account.dashboard : '/login'
  const accountLabel = account ? 'Account' : 'Login'
  const accountActive =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/team/dashboard') ||
    pathname.startsWith('/org/dashboard')
  const mobileTabs = [
    ...tabs,
    { href: '/team', label: 'Organizations' },
    { href: accountHref, label: accountLabel },
  ]

  // Inside the iOS app the native tab bar handles navigation — show a slim
  // brand bar with just the logo and cart so pages don't read as a website.
  if (inApp) {
    return (
      <nav className="h-16 flex items-center justify-between px-4 border-b border-zinc-800 bg-black">
        <Image
          src="/learnhoops-logo.png"
          alt="LearnHoops.com"
          width={578}
          height={113}
          style={{ height: '40px', width: 'auto' }}
          priority
        />
        <CartLink />
      </nav>
    )
  }

  return (
    <nav
      className="sticky top-0 z-50 border-b border-courtline bg-ink-950/95 backdrop-blur-md"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="h-16 flex items-center justify-between px-4 sm:px-6 max-w-7xl mx-auto w-full">
        <Link href="/" aria-label="LearnHoops.com home" className="flex items-center shrink-0">
          <Image
            src="/learnhoops-logo.png"
            alt="LearnHoops.com"
            width={578}
            height={113}
            style={{ height: '40px', width: 'auto' }}
            priority
          />
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="hidden md:flex items-center gap-1">
            {tabs.map((tab) => {
              const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  data-active={active}
                  className={`nav-underline px-3 py-2.5 text-sm font-semibold transition-colors ${
                    active ? 'text-chalk' : 'text-chalk-dim hover:text-chalk'
                  }`}
                >
                  {tab.label}
                </Link>
              )
            })}
            <Link
              href="/team"
              data-active={pathname.startsWith('/team')}
              className={`nav-underline px-3 py-2.5 text-sm font-semibold transition-colors ${
                pathname.startsWith('/team') ? 'text-chalk' : 'text-chalk-dim hover:text-chalk'
              }`}
            >
              Organizations
            </Link>
            <Link
              href={accountHref}
              className={`ml-2 px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                accountActive
                  ? 'bg-ember-500 text-ink-950'
                  : 'border border-courtline text-chalk hover:border-ember-500/60 hover:text-white'
              }`}
            >
              {accountLabel}
            </Link>
          </div>
          <CartLink />
          <MobileNav tabs={mobileTabs} />
        </div>
      </div>
    </nav>
  )
}
