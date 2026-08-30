import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * The masthead every coach / org dashboard opens with.
 *
 * One shape for both, so a coach who also owns an organization doesn't meet
 * two different-looking control panels: kicker, name, one line of context,
 * actions on the right, and a hairline that closes the block off from the
 * data below it.
 *
 * `title` is a node rather than a string because both dashboards make the
 * name editable in place (InlineEdit), which is part of the header, not a
 * setting buried in a tab.
 */
export default function DashboardHeader({
  eyebrow,
  title,
  meta,
  actions,
  back,
  children,
}: {
  eyebrow: string
  title: ReactNode
  /** One line under the title: who is signed in, what this is. */
  meta?: ReactNode
  /** Right-hand controls. Order them quiet-to-loud; see backendButton. */
  actions?: ReactNode
  /** Breadcrumb out of a drill-down, e.g. a team opened from the org. */
  back?: { href: string; label: string }
  /** Extra row under the header proper, e.g. the team switcher. */
  children?: ReactNode
}) {
  return (
    <header className="border-b border-gray-200 dark:border-courtline pb-5 space-y-4">
      {back && (
        <Link
          href={back.href}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 dark:text-chalk-dim hover:text-ember-500 dark:hover:text-ember-400 transition-colors"
        >
          <ArrowLeftIcon aria-hidden className="w-4 h-4" />
          {back.label}
        </Link>
      )}

      {/* flex-wrap: on phones the actions take their own row under the name
          rather than being crushed beside it and clipped off-screen. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="eyebrow text-ember-500 dark:text-ember-400 select-none">{eyebrow}</p>
          <div className="mt-1">{title}</div>
          {meta && (
            <p className="text-gray-500 dark:text-chalk-dim text-sm mt-1.5">{meta}</p>
          )}
        </div>
        {actions && (
          <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      {children}
    </header>
  )
}
