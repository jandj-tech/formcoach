import type { ReactNode } from 'react'

/**
 * Page container for the coach / organization dashboards.
 *
 * These are working surfaces — rosters, credit ledgers, schedules, class
 * rolls — not marketing pages, so they get a console-width column rather
 * than the reading-width one the rest of the site uses. At `max-w-3xl` a
 * roster table on a laptop wasted half the screen and wrapped rows that had
 * no reason to wrap.
 */
export default function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6 py-8 sm:py-10 space-y-7">
      {children}
    </div>
  )
}
