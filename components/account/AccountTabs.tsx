'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

export type AccountTab = {
  id: string
  label: string
  content: ReactNode
  // Optional count bubble shown next to the label (e.g. number of teams).
  count?: number
}

// White-theme tab bar shared by the player, coach, and org dashboards.
// The active tab is kept in the URL hash so refresh and back/forward keep
// your place. Inactive panels stay mounted (just hidden) so form state and
// in-progress edits survive switching tabs.
export default function AccountTabs({ tabs, defaultTab }: { tabs: AccountTab[]; defaultTab?: string }) {
  const fallback = defaultTab ?? tabs[0]?.id
  const [active, setActive] = useState(fallback)
  const listRef = useRef<HTMLDivElement>(null)

  // Sync the active tab from the URL hash: once after mount (reading it
  // during render would mismatch SSR) and on browser back/forward.
  useEffect(() => {
    function syncFromHash() {
      const fromHash = window.location.hash.replace(/^#/, '')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the URL, an external system; runs once on mount
      if (fromHash && tabs.some(t => t.id === fromHash)) setActive(fromHash)
    }
    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function select(id: string) {
    setActive(id)
    // replaceState instead of assigning location.hash — no scroll jump,
    // no history spam.
    window.history.replaceState(null, '', `#${id}`)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = tabs.findIndex(t => t.id === active)
    const next = e.key === 'ArrowRight'
      ? tabs[(i + 1) % tabs.length]
      : tabs[(i - 1 + tabs.length) % tabs.length]
    select(next.id)
    const btn = listRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)
    btn?.focus()
  }

  return (
    <div>
      {/* touch-action pan-x: on phones (the app's webview especially) this strip
          must only ever scroll sideways — without it, vertical pans that start
          on a tab fight the page scroll and the whole row judders diagonally.
          overscroll-x-contain stops a sideways fling rubber-banding the page,
          and the scrollbar is hidden since the tabs themselves show position. */}
      <div
        ref={listRef}
        role="tablist"
        aria-label="Account sections"
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-gray-200 -mx-1 px-1 [touch-action:pan-x] overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map(t => {
          const isActive = t.id === active
          return (
            <button
              key={t.id}
              data-tab={t.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => select(t.id)}
              className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'text-orange-600 border-orange-500 bg-orange-50/60'
                  : 'text-gray-500 border-transparent hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              {t.label}
              {typeof t.count === 'number' && (
                <span className={`ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none align-middle ${
                  isActive ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
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
          id={`tabpanel-${t.id}`}
          role="tabpanel"
          hidden={t.id !== active}
          className="pt-6"
        >
          {t.content}
        </div>
      ))}
    </div>
  )
}
