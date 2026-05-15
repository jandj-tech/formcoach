'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import MobileNav from '@/components/MobileNav'

const ADMIN_TABS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/submissions', label: 'Submissions' },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/criteria', label: 'Criteria' },
  { href: '/admin/learn', label: 'Learn Mode' },
  { href: '/admin/emails', label: 'Emails' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/access', label: 'Access' },
]

export default function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="bg-zinc-950 border-b border-zinc-800 px-4 sm:px-6 py-3 flex items-center justify-between">
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
          {ADMIN_TABS.map((tab) => {
            const active =
              tab.href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(tab.href)
            return (
              <a
                key={tab.href}
                href={tab.href}
                className={`transition-colors ${
                  active
                    ? 'text-orange-500'
                    : 'text-white hover:text-white'
                }`}
              >
                {tab.label}
              </a>
            )
          })}
        </div>
      </div>
      <Link
        href="/"
        className="hidden md:inline text-white hover:text-white text-sm transition-colors"
      >
        ← Back to site
      </Link>
      <MobileNav
        tabs={ADMIN_TABS}
        rootHref="/admin"
        useNextLink={false}
        footer={
          <Link href="/" className="text-white hover:text-white">
            ← Back to site
          </Link>
        }
      />
    </nav>
  )
}
