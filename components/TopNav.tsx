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

  // The account chip names the destination: coaches and orgs land on their
  // dashboard, so call it that instead of a vague "Account".
  const accountHref = account ? account.dashboard : '/login'
  const accountLabel =
    account?.type === 'org'
      ? 'Org Dashboard'
      : account?.type === 'team'
        ? 'Team Dashboard'
        : account
          ? 'Account'
          : 'Login'
  const accountActive =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/team/dashboard') ||
    pathname.startsWith('/org/dashboard')

  // The "/team" page is the organization information & signup page — a sales
  // pitch. Signed-in orgs and coaches already own the product, so the item
  // is dropped from their nav entirely; their dashboards link to the info
  // page with a small "learn more" line instead.
  const isAdminAccount = account?.type === 'org' || account?.type === 'team'
  const orgTab = isAdminAccount ? null : { href: '/team', label: 'Organizations' }
  const orgTabActive = pathname.startsWith('/team') && !pathname.startsWith('/team/dashboard')

  const mobileTabs = [
    ...tabs,
    ...(orgTab ? [orgTab] : []),
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
            {orgTab && (
              <Link
                href={orgTab.href}
                data-active={orgTabActive}
                className={`nav-underline px-3 py-2.5 text-sm font-semibold transition-colors ${
                  orgTabActive ? 'text-chalk' : 'text-chalk-dim hover:text-chalk'
                }`}
              >
                {orgTab.label}
              </Link>
            )}
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
  )
}
