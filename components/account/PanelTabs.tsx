'use client'

import { useRef, useState, type ReactNode } from 'react'

export type PanelTab = {
  id: string
  label: string
  content: ReactNode
  // Optional count bubble shown next to the label (e.g. number of players).
  count?: number
}

// Segmented tab strip for splitting one card's contents into panels.
//
// Deliberately not <AccountTabs>: that one writes the active tab into
// window.location.hash, and the dashboard's top-level tab bar already owns the
// hash. Two writers would fight over it, and goToTab()/goToTeam() drive that
// bar by clicking its [data-tab] buttons. So this is controlled — the caller
// holds the active id — and it reads as a pill track rather than an underline
// row, which keeps the nesting legible.
//
// Panels mount on first visit and stay mounted after that. Deferring the first
// mount keeps expensive panels (the team chat, which fetches on mount) off the
// page until someone asks for them; keeping them mounted afterwards means a
// half-typed message or a half-filled form survives switching away and back.
export default function PanelTabs({
  tabs,
  value,
  onChange,
  // Prefix for the tab/panel aria ids — must be unique per instance on a page.
  idBase,
  label = 'Panel sections',
}: {
  tabs: PanelTab[]
  value: string
  onChange: (id: string) => void
  idBase: string
  label?: string
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const [visited, setVisited] = useState<Set<string>>(() => new Set([value]))

  // Adjusting state during render: React re-runs this component before
  // committing, so the newly selected panel mounts in the same pass rather
  // than flashing empty for a frame.
  if (!visited.has(value)) {
    setVisited(prev => new Set(prev).add(value))
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = tabs.findIndex(t => t.id === value)
    const next = e.key === 'ArrowRight'
      ? tabs[(i + 1) % tabs.length]
      : tabs[(i - 1 + tabs.length) % tabs.length]
    onChange(next.id)
    listRef.current?.querySelector<HTMLButtonElement>(`[data-panel-tab="${next.id}"]`)?.focus()
  }

  return (
    <div>
      {/* touch-action pan-x, as on AccountTabs: on phones (the app's webview
          especially) this strip must only scroll sideways, or a vertical pan
          starting on a pill fights the page scroll and judders diagonally. */}
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 dark:bg-ink-800 p-1 [touch-action:pan-x] overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map(t => {
          const isActive = t.id === value
          return (
            <button
              key={t.id}
              type="button"
              data-panel-tab={t.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`${idBase}-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                isActive
                  ? 'bg-white dark:bg-ink-900 text-black dark:text-chalk shadow-sm'
                  : 'text-gray-500 dark:text-chalk-dim hover:text-black dark:hover:text-chalk'
              }`}
            >
              {t.label}
              {typeof t.count === 'number' && (
                <span className={`ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none align-middle ${
                  isActive
                    ? 'bg-ember-100 dark:bg-ember-500/15 text-ember-700 dark:text-ember-400'
                    : 'bg-gray-200 dark:bg-ink-900 text-gray-500 dark:text-chalk-dim'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {tabs.map(t => (
        <div
          key={t.id}
          id={`${idBase}-panel-${t.id}`}
          role="tabpanel"
          hidden={t.id !== value}
          className="pt-4"
        >
          {visited.has(t.id) ? t.content : null}
        </div>
      ))}
    </div>
  )
}
