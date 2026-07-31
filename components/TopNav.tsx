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
    <nav className="h-20 flex items-center justify-between px-4 sm:px-6 border-b border-zinc-800 bg-black">
      <Link href="/" aria-label="LearnHoops.com home" className="flex items-center shrink-0">
        <Image
          src="/learnhoops-logo.png"
          alt="LearnHoops.com"
          width={578}
          height={113}
          style={{ height: '48px', width: 'auto' }}
          priority
        />
      </Link>
      <div className="flex items-center gap-1 sm:gap-2">
        <div className="hidden md:flex items-center gap-1 sm:gap-2">
          {tabs.map((tab) => {
            const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-orange-500 text-white'
                    : 'text-white hover:text-white hover:bg-zinc-900'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
          <Link
            href="/team"
            className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              pathname.startsWith('/team')
                ? 'bg-orange-500 text-white'
                : 'text-white hover:text-white hover:bg-zinc-900'
            }`}
          >
            Organizations
          </Link>
          <Link
            href={accountHref}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              accountActive
                ? 'bg-orange-500 text-white'
                : 'text-white hover:text-white hover:bg-zinc-900'
            }`}
          >
            {accountLabel}
          </Link>
        </div>
        <CartLink />
        <MobileNav tabs={mobileTabs} />
      </div>
    </nav>
  )
}
