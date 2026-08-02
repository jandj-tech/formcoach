import Link from 'next/link'

const columns = [
  {
    title: 'Product',
    links: [
      { href: '/analyze', label: 'Analyze your shot' },
      { href: '/shop', label: 'Training ball' },
      { href: '/cart', label: 'Cart' },
    ],
  },
  {
    title: 'Teams',
    links: [
      { href: '/team', label: 'Organizations' },
      { href: '/org/signup', label: 'Register an organization' },
      { href: '/partners', label: 'Partners' },
    ],
  },
  {
    title: 'Help',
    links: [
      { href: '/support', label: 'Contact support' },
      { href: '/support#faq', label: 'FAQ' },
      { href: '/privacy', label: 'Privacy policy' },
      {
        href: 'https://www.youtube.com/@LearnHoopsbasketball',
        label: 'YouTube channel',
        external: true,
      },
    ],
  },
]

export default function SiteFooter() {
  return (
    <footer className="bg-ink-950 border-t border-courtline overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-14 pb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-10 max-w-3xl">
          {columns.map((col) => (
            <div key={col.title}>
              <p className="eyebrow text-chalk-dim mb-4 select-none">{col.title}</p>
              <ul className="space-y-2.5">
                {col.links.map((link) =>
                  'external' in link && link.external ? (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-chalk hover:text-ember-400 transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ) : (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-chalk hover:text-ember-400 transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
        </div>

        <p
          aria-hidden
          className="wordmark-outline font-display font-black uppercase leading-none text-center whitespace-nowrap mt-14 -mb-2 text-[clamp(2.5rem,9vw,8rem)]"
        >
          LearnHoops
        </p>

        <div
          className="mt-6 pt-5 border-t border-courtline flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-chalk-dim"
          style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
        >
          <span>© {new Date().getFullYear()} LearnHoops.com. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <a
              href="https://www.instagram.com/learnhoops_/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LearnHoops on Instagram"
              className="inline-flex items-center gap-1.5 text-chalk-dim hover:text-ember-400 transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
              <span>@learnhoops_</span>
            </a>
            <span className="eyebrow text-[0.6rem]">AI basketball shot analysis</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
