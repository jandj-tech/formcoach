import Link from 'next/link'

const columns = [
  {
    title: 'Product',
    links: [
      { href: '/analyze', label: 'Analyze your shot' },
      { href: '/shop', label: 'Training ball' },
      { href: '/cart', label: 'Cart' },
      { href: '/mission', label: 'Our mission' },
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
      { href: '/accessibility', label: 'Accessibility' },
    ],
  },
]

function InstagramIcon() {
  return (
    <svg
      width="20"
      height="20"
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
  )
}

function YouTubeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.6 15.6V8.4L15.83 12 9.6 15.6z" />
    </svg>
  )
}

const socials = [
  {
    name: 'Instagram',
    handle: '@learnhoops_',
    tagline: 'Drills, form breakdowns & player highlights',
    href: 'https://www.instagram.com/learnhoops_/',
    icon: <InstagramIcon />,
    // Instagram's signature gradient on the icon tile and the hover wash.
    tile: 'bg-gradient-to-tr from-[#f58529] via-[#dd2a7b] to-[#8134af]',
    wash: 'from-[#f58529]/15 via-[#dd2a7b]/15 to-[#8134af]/15',
  },
  {
    name: 'YouTube',
    handle: '@LearnHoopsbasketball',
    tagline: 'Tutorials for every shot criterion',
    href: 'https://www.youtube.com/@LearnHoopsbasketball',
    icon: <YouTubeIcon />,
    tile: 'bg-[#FF0000]',
    wash: 'from-[#FF0000]/15 via-[#FF0000]/10 to-transparent',
  },
]

export default function SiteFooter() {
  return (
    <footer className="bg-ink-950 border-t border-courtline overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-14 pb-6">
        <div className="flex flex-col lg:flex-row lg:justify-between gap-12">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-10 max-w-3xl flex-1">
            {columns.map((col) => (
              <div key={col.title}>
                <p className="eyebrow text-chalk-dim mb-4 select-none">{col.title}</p>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-chalk hover:text-ember-400 transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Social — branded cards instead of a plain link list */}
          <div className="lg:w-80 shrink-0">
            <p className="eyebrow text-chalk-dim mb-4 select-none">Follow the game</p>
            <div className="flex flex-col gap-3">
              {socials.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative flex items-center gap-4 rounded-2xl border border-courtline bg-ink-900 px-4 py-3.5 overflow-hidden transition-colors hover:border-ember-500/60"
                >
                  <span
                    aria-hidden
                    className={`absolute inset-0 bg-gradient-to-r ${social.wash} opacity-0 group-hover:opacity-100 transition-opacity`}
                  />
                  <span
                    className={`relative w-10 h-10 rounded-xl ${social.tile} text-white flex items-center justify-center shrink-0`}
                  >
                    {social.icon}
                  </span>
                  <span className="relative flex-1 min-w-0">
                    <span className="block text-sm font-bold text-chalk leading-tight">
                      {social.name}{' '}
                      <span className="font-normal text-chalk-dim">{social.handle}</span>
                    </span>
                    <span className="block text-xs text-chalk-dim mt-0.5 truncate">
                      {social.tagline}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="relative text-chalk-dim group-hover:text-ember-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                  >
                    ↗
                  </span>
                </a>
              ))}
            </div>
          </div>
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
