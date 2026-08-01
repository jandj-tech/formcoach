import type { ReactNode } from 'react'
import InfoTip from '@/components/InfoTip'

// Collapsible white card used inside the account dashboards. Built on
// <details> so it needs no client JS and every section can be minimized.
// Sections start collapsed so dashboards load as a tidy list of headers;
// `summary` shows the current value at a glance while collapsed
// (e.g. "Not set", a team name, "3 coaches").
export default function Section({
  title,
  tip,
  tipLabel,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string
  // Short explanation shown in an (i) tooltip next to the title.
  tip?: ReactNode
  // Accessible label for the (i) icon, e.g. "What is a display name?"
  tipLabel?: string
  summary?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details className="group bg-white border border-gray-200 rounded-2xl" open={defaultOpen}>
      <summary className="flex items-center justify-between gap-3 px-5 py-3.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{title}</span>
          {tip && <InfoTip label={tipLabel ?? `About ${title}`} align="left">{tip}</InfoTip>}
        </span>
        <span className="flex items-center gap-2 text-sm text-gray-600 min-w-0">
          {summary && <span className="truncate max-w-[12rem]">{summary}</span>}
          <svg
            className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180 shrink-0"
            viewBox="0 0 20 20" fill="currentColor" aria-hidden
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </span>
      </summary>
      <div className="px-5 pb-5 pt-1 border-t border-gray-100">{children}</div>
    </details>
  )
}
