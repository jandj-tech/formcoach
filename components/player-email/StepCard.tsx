import type { ReactNode } from 'react'
import { CARD } from './types'

// One numbered step of the composer. The number is the navigation: a
// volunteer reads 1 → 2 → 3 top to bottom and never has to find a hidden tab.
export default function StepCard({
  step,
  title,
  description,
  aside,
  children,
  id,
}: {
  step: number
  title: string
  description?: ReactNode
  aside?: ReactNode
  children: ReactNode
  id?: string
}) {
  const headingId = `player-email-step-${step}`
  return (
    <section id={id} aria-labelledby={headingId} className={`${CARD} min-w-0`}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 sm:px-5 pt-4 sm:pt-5">
        <div className="flex items-start gap-3 min-w-0">
          <span
            aria-hidden
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ember-500/10 text-sm font-bold text-ember-600 dark:text-ember-400"
          >
            {step}
          </span>
          <div className="min-w-0">
            <h3 id={headingId} className="text-base font-bold text-gray-900 dark:text-chalk">
              <span className="sr-only">Step {step}: </span>
              {title}
            </h3>
            {description && <p className="mt-0.5 text-sm text-gray-500 dark:text-chalk-dim">{description}</p>}
          </div>
        </div>
        {aside}
      </header>
      <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-4">{children}</div>
    </section>
  )
}
