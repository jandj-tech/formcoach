'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/', label: 'Home' },
  { href: '/analyze', label: 'Analyze' },
  { href: '/shop', label: 'Shop' },
]

export default function TopNav() {
  const pathname = usePathname()

  return (
    <nav className="h-20 flex items-center justify-between px-4 sm:px-6 border-b border-slate-800 bg-slate-900">
      <Link href="/" aria-label="FormCoach home" className="flex items-center shrink-0">
        <Image
          src="/logo.png"
          alt="FormCoach"
          width={429}
          height={451}
          style={{ height: '64px', width: 'auto' }}
          priority
        />
      </Link>
      <div className="flex items-center gap-1 sm:gap-2">
        {tabs.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                active
                  ? 'bg-orange-500 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
