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
  title: 'Log in | LearnHoops',
  description:
    'Log in to your LearnHoops account to upload a shot and see your form breakdown.',
  alternates: { canonical: '/login' },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
