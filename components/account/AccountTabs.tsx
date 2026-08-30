'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

export type AccountTab = {
  id: string
  label: string
  content: ReactNode
  // Optional count bubble shown next to the label (e.g. number of teams).
  count?: number
  // Hash fragments this tab also answers to. The active tab is written into
  // the URL, so renaming an id would silently break every link and bookmark
  // already pointing at the old one — list the old id here instead.
  aliases?: string[]
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
      const match = tabs.find(t => t.id === fromHash || t.aliases?.includes(fromHash))
      if (fromHash && match) setActive(match.id)
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
      {/* touch-action pan-x: on phones (the app's webview especially) this
          strip must only scroll sideways — without it, vertical pans starting
          on a tab fight the page scroll and the row judders diagonally.
          overscroll-x-contain stops a sideways fling rubber-banding the page. */}
      <div
        ref={listRef}
        role="tablist"
        aria-label="Account sections"
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-courtline -mx-1 px-1 [touch-action:pan-x] overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                  ? 'text-orange-600 dark:text-ember-400 border-orange-500 bg-orange-50/60 dark:bg-ember-500/10'
                  : 'text-gray-500 dark:text-chalk-dim border-transparent hover:text-gray-800 dark:hover:text-chalk hover:bg-gray-50 dark:hover:bg-ink-800'
              }`}
            >
              {t.label}
              {typeof t.count === 'number' && (
                <span className={`ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none align-middle ${
                  isActive ? 'bg-orange-100 dark:bg-ember-500/15 text-orange-700 dark:text-ember-400' : 'bg-gray-100 dark:bg-ink-800 text-gray-500 dark:text-chalk-dim'
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
