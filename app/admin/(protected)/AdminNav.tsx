'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import MobileNav from '@/components/MobileNav'

const ADMIN_TABS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/submissions', label: 'Submissions' },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/organizations', label: 'Organizations' },
  { href: '/admin/criteria', label: 'Criteria' },
  { href: '/admin/learn', label: 'Learn Mode' },
  { href: '/admin/learn/notes', label: 'Coach Notes' },
  { href: '/admin/eval', label: 'Test Bench' },
  { href: '/admin/emails', label: 'Emails' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/access', label: 'Access' },
  { href: '/admin/settings', label: 'Settings' },
]

export default function AdminNav() {
  const pathname = usePathname()

  async function signOut() {
    await fetch('/api/admin/logout', { method: 'POST' })
    window.location.href = '/'
  }

  return (
    <nav className="bg-gray-50 dark:bg-zinc-950 border-b border-gray-200 dark:border-zinc-800 px-4 sm:px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <Image
            src="/learnhoops-logo.png"
            alt="LearnHoops.com"
            width={578}
            height={113}
            style={{ height: '32px', width: 'auto' }}
            priority
          />
          <span className="text-orange-500 font-black text-sm uppercase tracking-wider">
            Admin
          </span>
        </div>
        <div className="hidden md:flex items-center gap-4 text-sm">
          {/* Longest matching href wins, so a nested tab like /admin/learn/notes
              highlights only itself and not its parent /admin/learn. */}
          {ADMIN_TABS.map((tab) => {
            const matches = ADMIN_TABS.filter(
              (t) => pathname === t.href || pathname.startsWith(`${t.href}/`),
            )
            const best = matches.reduce(
              (longest, t) => (t.href.length > longest.length ? t.href : longest),
              '',
            )
            const active = tab.href === best
            return (
              <a
                key={tab.href}
                href={tab.href}
                className={`transition-colors ${
                  active
                    ? 'text-orange-500'
                    : 'text-black dark:text-white hover:text-black dark:hover:text-white'
                }`}
              >
                {tab.label}
              </a>
            )
          })}
        </div>
      </div>
      <div className="hidden md:flex items-center gap-4">
        <Link href="/" className="text-black dark:text-white hover:text-black dark:hover:text-white text-sm transition-colors">
          ← Back to site
        </Link>
        <button
          onClick={signOut}
          className="text-gray-600 dark:text-zinc-400 hover:text-orange-500 text-sm transition-colors"
        >
          Exit admin
        </button>
      </div>
      <MobileNav
        tabs={ADMIN_TABS}
        rootHref="/admin"
        useNextLink={false}
        footer={
          <div className="flex flex-col gap-3">
            <Link href="/" className="text-black dark:text-white hover:text-black dark:hover:text-white">
              ← Back to site
            </Link>
            <button onClick={signOut} className="text-left text-gray-600 dark:text-zinc-400 hover:text-orange-500">
              Exit admin
            </button>
          </div>
        }
      />
    </nav>
  )
}
