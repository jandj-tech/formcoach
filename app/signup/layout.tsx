/**
 * Exists only to give /signup its own <title>.
 *
 * WCAG 2.4.2 (Page Titled) asks every page to be identifiable by its title;
 * this route was inheriting the homepage's "AI Basketball Shot Analysis…",
 * which tells a screen-reader user nothing about where they landed and makes
 * browser tabs and history entries indistinguishable.
 *
 * It lives here rather than in page.tsx because that file is a client
 * component, and client components cannot export `metadata`.
 */
export const metadata = {
  title: 'Create your account | LearnHoops',
  description:
    'Create a LearnHoops account to upload your shot and get your shooting form graded.',
  alternates: { canonical: '/signup' },
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children
}
