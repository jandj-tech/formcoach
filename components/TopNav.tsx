'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import MobileNav from './MobileNav'
import CartLink from './CartLink'
import TokenBanner from './TokenBanner'
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
      <>
        {/* safe-area padding keeps the logo/cart clear of the notch and
            status bar — the WebView runs edge-to-edge (viewport-fit=cover) */}
        <nav
          className="flex items-center justify-between px-4 border-b border-zinc-800 bg-black"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)', paddingBottom: 8, minHeight: 56 }}
        >
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
        <TokenBanner pathname={pathname} inApp />
      </>
    )
  }

  return (
    <>
      {/*
        Skip link — WCAG 2.4.1 (Bypass Blocks).
        Without it, a keyboard or switch user had to tab through every nav link
        on every page before reaching content. Visually hidden until focused,
        then pinned top-left so it is the first thing a keyboard user meets.

        It targets the marker rendered immediately AFTER this nav rather than a
        per-page id, because every page mounts its TopNav inside its own
        <main> — so a shared target here is the only version that cannot
        silently point at nothing.
      */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:bg-ember-500 focus:text-ink-950 focus:font-bold focus:px-4 focus:py-2.5 focus:rounded-lg"
      >
        Skip to main content
      </a>
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
      <TokenBanner pathname={pathname} />
    </nav>
      {/* Landing spot for the skip link. tabIndex -1 means it is reachable
          programmatically but never lands in the tab order itself, so the next
          Tab press continues into the page content. */}
      <div id="main-content" tabIndex={-1} />
    </>
  )
}
