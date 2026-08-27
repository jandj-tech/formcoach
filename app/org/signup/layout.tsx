/**
 * Exists only to give this route its own <title>.
 *
 * WCAG 2.4.2 (Page Titled): the page was inheriting the homepage's
 * "AI Basketball Shot Analysis…", which tells a screen-reader user nothing
 * about where they landed and makes tabs and history indistinguishable.
 *
 * It lives here rather than in page.tsx because that file is a client
 * component, and client components cannot export `metadata`.
 */
export const metadata = {
  title: 'Register your organization | LearnHoops',
  description:
    'Register a basketball organization on LearnHoops to manage teams, coaches and shot analysis credits.',
  alternates: { canonical: '/org/signup' },
}

export default function OrgSignupLayout({ children }: { children: React.ReactNode }) {
  return children
}
