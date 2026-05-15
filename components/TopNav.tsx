'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import MobileNav from './MobileNav'
import CartLink from './CartLink'

const tabs = [
  { href: '/', label: 'Home' },
  { href: '/analyze', label: 'Analyze' },
  { href: '/shop', label: 'Shop' },
  { href: '/partners', label: 'Partners' },
]

export default function TopNav() {
  const pathname = usePathname()

  // "Account" always points at the dashboard; middleware redirects
  // logged-out visitors to the login page.
  const accountHref = '/dashboard'
  const accountActive =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup')
  const mobileTabs = [...tabs, { href: accountHref, label: 'Account' }]

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
            href={accountHref}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              accountActive
                ? 'bg-orange-500 text-white'
                : 'text-white hover:text-white hover:bg-zinc-900'
            }`}
          >
            Account
          </Link>
        </div>
        <CartLink />
        <MobileNav tabs={mobileTabs} />
      </div>
    </nav>
  )
}
