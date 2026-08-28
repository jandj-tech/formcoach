/**
 * Exists only to give this route its own <title>.
 *
 * WCAG 2.4.2 (Page Titled): without it the page inherits the homepage title,
 * which tells a screen-reader user nothing about where they landed and makes
 * tabs and history indistinguishable.
 *
 * No canonical URL here on purpose — the page requires a signup cookie and
 * redirects without one, so it is not something a crawler should index.
 */
export const metadata = {
  title: 'Organization plans | LearnHoops',
  description:
    'Choose a LearnHoops organization plan — one subscription covering every team, coach and player in your club.',
  robots: { index: false, follow: false },
}

export default function OrgPricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
