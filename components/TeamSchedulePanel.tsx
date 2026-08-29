'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

// ---------------------------------------------------------------------------
// Team schedule — one component, three faces:
//   1. /team hub (theme="dark")            — full panel for players + coaches
//   2. coach dashboard (theme="light")     — full panel with admin CRUD
//   3. player dashboard card (compact)     — calendar + "Full schedule →", no admin
//
// Wire types mirror lib/team-schedule.ts exactly. That module is server-only
// (it imports the db client), so the shapes are re-declared for the client
// bundle — same pattern as TeamChatPanel.
// ---------------------------------------------------------------------------

export type EventType = 'practice' | 'game' | 'other'
export type RsvpStatus = 'in' | 'out'

export interface ScheduleEvent {
  id: string
  type: EventType
  title: string | null
  location: string | null
  notes: string | null
  startsAt: string // ISO 8601 — always rendered device-local
  timeTbd: boolean
  status: 'active' | 'cancelled'
  locked: boolean // starts_at has passed → RSVP frozen
  createdAt: string
  updatedAt: string
  counts: { in: number; out: number; noReply: number }
  going: Array<{ userId: string; name: string; note: string | null }>
  out: Array<{ userId: string; name: string; note: string | null }>
  noReply: Array<{ userId: string; name: string }>
  myRsvp: { status: RsvpStatus; note: string | null } | null
}

export interface ScheduleData {
  teamName: string
  isCoach: boolean
  canRsvp: boolean
  memberCount: number
  events: ScheduleEvent[]
}

// ---------------------------------------------------------------------------
// Formatting helpers — device-local everywhere; the server never formats dates.
// ---------------------------------------------------------------------------

function weekdayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' })
}
function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
function typeLabel(type: EventType): string {
  return type === 'practice' ? 'Practice' : type === 'game' ? 'Game' : 'Event'
}
function wasUpdated(e: ScheduleEvent): boolean {
  // created_at/updated_at land in the same transaction on insert; anything
  // more than a second apart means a real coach edit.
  return new Date(e.updatedAt).getTime() > new Date(e.createdAt).getTime() + 1000
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
function isoToLocalDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function isoToLocalTime(iso: string): string {
  const d = new Date(iso)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// ---------------------------------------------------------------------------
// Theme tokens — light copies the dashboard vocabulary (TeamChatPanel), dark
// copies /team's "Broadcast Court" classes. Green stays green in both.
// ---------------------------------------------------------------------------

function themeClasses(dark: boolean) {
  return {
    text: dark ? 'text-chalk' : 'text-black',
    dim: dark ? 'text-chalk-dim' : 'text-gray-500',
    faint: dark ? 'text-chalk-dim/70' : 'text-gray-400',
    card: dark ? 'bg-ink-950 border border-courtline' : 'bg-gray-50 border border-gray-200',
    panel: dark ? 'bg-ink-900 border border-courtline' : 'bg-white border border-gray-200',
    chipPractice: dark ? 'border border-ember-500/60 text-ember-400' : 'bg-orange-100 text-orange-700',
    chipGame: dark ? 'bg-ember-500 text-ink-950' : 'bg-orange-500 text-ink-950',
    chipOther: dark ? 'border border-courtline text-chalk-dim' : 'bg-gray-100 text-gray-600',
    amber: dark ? 'text-amber-400' : 'text-amber-600',
    btnIdle: dark
      ? 'border border-courtline text-chalk-dim hover:border-chalk-dim'
      : 'bg-white border border-gray-300 text-gray-700 hover:border-gray-400',
    link: dark ? 'text-ember-400 hover:text-ember-300' : 'text-orange-600 hover:text-orange-500',
    input: dark
      ? 'bg-ink-950 border border-courtline text-chalk placeholder:text-chalk-dim/60 focus:border-ember-500'
      : 'bg-white border border-gray-300 text-black placeholder:text-gray-400 focus:border-orange-500',
    form: dark ? 'bg-ink-950 border border-courtline' : 'bg-orange-50 border border-orange-200',
    segActive: dark ? 'bg-ember-500 text-ink-950' : 'bg-orange-500 text-ink-950',
    segIdle: dark ? 'bg-ink-900 text-chalk-dim hover:text-chalk' : 'bg-white text-gray-600 hover:bg-orange-100',
    segBorder: dark ? 'border border-courtline' : 'border border-orange-300',
    primaryBtn: dark
      ? 'bg-ember-500 hover:bg-ember-400 text-ink-950'
      : 'bg-orange-500 hover:bg-orange-400 text-ink-950',
    accent: dark ? 'accent-[#ff5c1a]' : 'accent-orange-500',
    quietBtn: dark ? 'text-chalk-dim hover:text-chalk' : 'text-gray-500 hover:text-black',
  }
}

// ---------------------------------------------------------------------------
// Create / edit form — inline (never a modal).
// ---------------------------------------------------------------------------

interface FormValues {
  type: EventType
  date: string // YYYY-MM-DD
  time: string // HH:MM
  timeTbd: boolean
  location: string
  title: string
  notes: string
  repeatWeeks: number
}

function emptyForm(): FormValues {
  // Defaults a coach usually wants: tomorrow at 6 PM — create in two taps,
  // adjust only what differs.
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return { type: 'practice', date, time: '18:00', timeTbd: false, location: '', title: '', notes: '', repeatWeeks: 1 }
}

function formFromEvent(e: ScheduleEvent): FormValues {
  return {
    type: e.type,
    date: isoToLocalDate(e.startsAt),
    time: e.timeTbd ? '' : isoToLocalTime(e.startsAt),
    timeTbd: e.timeTbd,
    location: e.location ?? '',
    title: e.title ?? '',
    notes: e.notes ?? '',
    repeatWeeks: 1,
  }
}

// TBD events store 12:00 local — the convention the whole stack shares.
function valuesToStartsAt(v: FormValues): string | null {
  const d = new Date(`${v.date}T${v.timeTbd || !v.time ? '12:00' : v.time}`)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

function repeatCaption(v: FormValues): string | null {
  if (v.repeatWeeks <= 1 || !v.date) return null
  const first = new Date(`${v.date}T12:00`)
  if (!Number.isFinite(first.getTime())) return null
  const last = new Date(first.getTime() + (v.repeatWeeks - 1) * 7 * 24 * 60 * 60 * 1000)
  const noun = v.type === 'practice' ? 'practices' : v.type === 'game' ? 'games' : 'events'
  return `Creates ${v.repeatWeeks} ${noun}, every ${first.toLocaleDateString(undefined, { weekday: 'short' })} through ${last.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

// Parse a typed time: "7:30", "7:30pm", "730", "7pm", "19:30", "1930".
// 1–12 with no am/pm keeps the currently selected period — typing "7:30"
// while PM is lit means 7:30 PM; 13–23 is unambiguous 24-hour.
function parseTypedTime(raw: string, fallbackPM: boolean): string | null {
  const s = raw.trim().toLowerCase().replace(/[\s.]/g, '')
  const m = s.match(/^(\d{1,2})(?::?([0-5]\d))?(am?|pm?)?$/)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = m[2] ? parseInt(m[2], 10) : 0
  const suffix = m[3]
  if (suffix) {
    if (h < 1 || h > 12) return null
    h = (h % 12) + (suffix.startsWith('p') ? 12 : 0)
  } else if (h > 23) {
    return null
  } else if (h >= 1 && h <= 12) {
    h = (h % 12) + (fallbackPM ? 12 : 0)
  }
  return `${pad2(h)}:${pad2(min)}`
}

function TimeSelect({ value, onChange, dark }: { value: string; onChange: (v: string) => void; dark: boolean }) {
  const t = themeClasses(dark)
  // value is 24h "HH:MM"; a typed field plus tap-only hour/minute/AM-PM
  // controls, kept in sync both ways. Type OR tap — whichever is faster.
  const [hh, mm] = value ? value.split(':').map(n => parseInt(n, 10)) : [18, 0]
  const isPM = hh >= 12
  const hour12 = hh % 12 === 0 ? 12 : hh % 12
  const apply = (h12: number, minutes: number, pm: boolean) => {
    const h24 = pm ? (h12 % 12) + 12 : h12 % 12
    onChange(`${String(h24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`)
  }
  // Uncontrolled + keyed by value: commits on blur/Enter; a dropdown tap
  // remounts it with the canonical text, so the two never disagree.
  const commitTyped = (el: HTMLInputElement) => {
    const parsed = parseTypedTime(el.value, isPM)
    if (parsed && parsed !== value) onChange(parsed)
    else el.value = `${hour12}:${pad2(mm)}`
  }
  const selCls = `rounded-xl px-2.5 py-2.5 text-sm font-bold focus:outline-none cursor-pointer ${t.input}`
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <input
        key={value}
        type="text"
        defaultValue={`${hour12}:${pad2(mm)}`}
        onFocus={e => e.currentTarget.select()}
        onBlur={e => commitTyped(e.currentTarget)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitTyped(e.currentTarget)
          }
        }}
        placeholder="7:30"
        aria-label="Type a time, e.g. 7:30"
        className={`w-[4.5rem] text-center rounded-xl px-2 py-2.5 text-sm font-bold focus:outline-none ${t.input}`}
      />
      <select value={hour12} onChange={e => apply(parseInt(e.target.value, 10), mm, isPM)} className={selCls} aria-label="Hour">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className={`font-bold ${t.dim}`}>:</span>
      <select value={mm} onChange={e => apply(hour12, parseInt(e.target.value, 10), isPM)} className={selCls} aria-label="Minutes">
        {Array.from(new Set([0, 15, 30, 45, mm])).sort((a, b) => a - b).map(m => (
          <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
        ))}
      </select>
      <span className={`inline-flex rounded-xl overflow-hidden ${t.segBorder}`}>
        {(['AM', 'PM'] as const).map(ap => (
          <button
            key={ap}
            type="button"
            onClick={() => apply(hour12, mm, ap === 'PM')}
            className={`px-3 py-2.5 text-xs font-bold transition-colors ${(ap === 'PM') === isPM ? t.segActive : t.segIdle}`}
          >
            {ap}
          </button>
        ))}
      </span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Location autocomplete — Photon (OpenStreetMap's typeahead API): free, no
// key, CORS-open. Suggestions appear as the coach types; picking one fills
// the field with a full address so the map links on the card resolve well.
// If the API is slow or down, nothing breaks — the field stays free text.
// ---------------------------------------------------------------------------

interface PhotonFeature {
  properties: {
    name?: string
    housenumber?: string
    street?: string
    city?: string
    state?: string
    country?: string
  }
}

function formatPhotonFeature(f: PhotonFeature): string | null {
  const p = f.properties
  const parts = [p.name, [p.street, p.housenumber].filter(Boolean).join(' '), p.city, p.state].filter(
    (x): x is string => !!x,
  )
  // A place named after its city ("Toronto", street "", city "Toronto")
  // shouldn't repeat itself in the label.
  const seen = new Set<string>()
  const label = parts
    .filter(x => {
      const k = x.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .join(', ')
  return label || null
}

function LocationInput({
  value,
  onChange,
  dark,
  className,
}: {
  value: string
  onChange: (v: string) => void
  dark: boolean
  className: string
}) {
  const t = themeClasses(dark)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      abortRef.current?.abort()
    },
    [],
  )

  function handleChange(q: string) {
    onChange(q.slice(0, 200))
    if (timer.current) clearTimeout(timer.current)
    const query = q.trim()
    if (query.length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }
    // Debounced + aborted per keystroke: at most one in-flight lookup.
    timer.current = setTimeout(async () => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      try {
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en`,
          { signal: ac.signal },
        )
        if (!res.ok) return
        const json = (await res.json()) as { features?: PhotonFeature[] }
        const seen = new Set<string>()
        const items = (json.features ?? [])
          .map(formatPhotonFeature)
          .filter((label): label is string => !!label)
          .filter(label => {
            const k = label.toLowerCase()
            if (seen.has(k)) return false
            seen.add(k)
            return true
          })
          .slice(0, 5)
        setSuggestions(items)
        setOpen(items.length > 0)
      } catch {
        // Aborted or offline — the typed text still works as a plain location.
      }
    }, 300)
  }

  function pick(label: string) {
    onChange(label.slice(0, 200))
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        maxLength={200}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true)
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false)
          // Enter takes the top suggestion — type, Enter, done.
          if (e.key === 'Enter' && open && suggestions.length > 0) {
            e.preventDefault()
            pick(suggestions[0])
          }
        }}
        placeholder="e.g. Main Gym"
        role="combobox"
        aria-expanded={open}
        aria-controls="location-suggestions"
        aria-autocomplete="list"
        className={className}
      />
      {open && (
        <div
          // Mousedown fires before the input's blur — without this the list
          // closes a beat before the click lands and taps select nothing.
          onMouseDown={e => e.preventDefault()}
          className={`absolute left-0 right-0 top-full mt-1 z-20 rounded-xl overflow-hidden shadow-lg ${t.panel}`}
        >
          <ul id="location-suggestions" role="listbox">
            {suggestions.map(label => (
              <li key={label} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => pick(label)}
                  className={`block w-full text-left px-3.5 py-2 text-sm transition-colors ${t.text} ${
                    dark ? 'hover:bg-ink-950' : 'hover:bg-orange-50'
                  }`}
                >
                  📍 {label}
                </button>
              </li>
            ))}
          </ul>
          <p className={`px-3.5 py-1.5 text-[10px] ${t.faint}`}>Suggestions © OpenStreetMap</p>
        </div>
      )}
    </div>
  )
}

function EventForm({
  mode,
  initial,
  dark,
  submitting,
  onSubmit,
  onClose,
}: {
  mode: 'create' | 'edit'
  initial: FormValues
  dark: boolean
  submitting: boolean
  onSubmit: (values: FormValues) => void
  onClose: () => void
}) {
  const t = themeClasses(dark)
  const [v, setV] = useState<FormValues>(initial)
  const [error, setError] = useState<string | null>(null)
  const [showExtras, setShowExtras] = useState(!!(initial.title || initial.notes))

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setV(prev => ({ ...prev, [key]: value }))
  }

  function submit() {
    if (!v.date) return setError('Pick a date.')
    if (!v.timeTbd && !v.time) return setError('Pick a time, or use "time TBD".')
    setError(null)
    onSubmit(v)
  }

  const caption = repeatCaption(v)
  const inputCls = `rounded-xl px-3.5 py-2.5 text-sm focus:outline-none ${t.input}`

  return (
    <div className={`rounded-xl p-4 space-y-4 ${t.form}`}>
      {/* What */}
      <div className="grid grid-cols-3 gap-2">
        {([
          ['practice', '🏀', 'Practice'],
          ['game', '🏆', 'Game'],
          ['other', '📌', 'Other'],
        ] as const).map(([ty, icon, label]) => (
          <button
            key={ty}
            type="button"
            onClick={() => set('type', ty)}
            className={`rounded-xl py-3 text-sm font-bold transition-colors ${v.type === ty ? t.segActive : t.segIdle}`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* When — date plus a typed time field with tap dropdowns as backup */}
      <div>
        <p className={`text-xs font-bold uppercase tracking-wide mb-1.5 ${t.dim}`}>When</p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={v.date} onChange={e => set('date', e.target.value)} className={inputCls} />
          {!v.timeTbd && (
            <TimeSelect value={v.time} onChange={time => set('time', time)} dark={dark} />
          )}
          <button
            type="button"
            onClick={() => set('timeTbd', !v.timeTbd)}
            className={`rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${v.timeTbd ? t.segActive : t.segIdle}`}
          >
            {v.timeTbd ? '⏱ Time TBD ✓' : 'Time TBD?'}
          </button>
        </div>
      </div>

      {/* Where — type a few letters and pick the real place, or free text */}
      <div>
        <p className={`text-xs font-bold uppercase tracking-wide mb-1.5 ${t.dim}`}>Where</p>
        <LocationInput
          value={v.location}
          onChange={loc => set('location', loc)}
          dark={dark}
          className={`w-full ${inputCls}`}
        />
      </div>

      {/* How often — once, or repeat weekly with a typed number of weeks */}
      {mode === 'create' && (
        <div>
          <p className={`text-xs font-bold uppercase tracking-wide mb-1.5 ${t.dim}`}>How often</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => set('repeatWeeks', 1)}
              className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${v.repeatWeeks <= 1 ? t.segActive : t.segIdle}`}
            >
              Just once
            </button>
            <button
              type="button"
              onClick={() => { if (v.repeatWeeks <= 1) set('repeatWeeks', 8) }}
              className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${v.repeatWeeks > 1 ? t.segActive : t.segIdle}`}
            >
              🔁 Repeat weekly
            </button>
            {v.repeatWeeks > 1 && (
              <span className={`inline-flex items-center gap-2 text-sm font-semibold ${t.text}`}>
                for
                <input
                  type="number"
                  min={2}
                  max={16}
                  value={v.repeatWeeks}
                  onChange={e => {
                    const n = parseInt(e.target.value, 10)
                    set('repeatWeeks', Number.isNaN(n) ? 2 : Math.min(16, Math.max(2, n)))
                  }}
                  onFocus={e => e.target.select()}
                  className={`w-16 text-center font-bold ${inputCls}`}
                />
                weeks
              </span>
            )}
          </div>
          {caption && <p className={`text-xs mt-1.5 font-semibold ${t.dim}`}>📅 {caption}</p>}
        </div>
      )}

      {/* Rarely-needed fields stay out of the way */}
      {!showExtras ? (
        <button type="button" onClick={() => setShowExtras(true)} className={`text-xs font-semibold underline ${t.dim}`}>
          + Add a title or notes
        </button>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={v.title}
            maxLength={120}
            onChange={e => set('title', e.target.value)}
            placeholder={v.type === 'game' ? 'Title (e.g. vs Raptors)' : 'Title (optional)'}
            className={`w-full ${inputCls}`}
          />
          <textarea
            value={v.notes}
            maxLength={500}
            rows={2}
            onChange={e => set('notes', e.target.value)}
            placeholder="Notes (e.g. bring both jerseys)"
            className={`w-full resize-none ${inputCls}`}
          />
        </div>
      )}

      {error && <p className="text-xs font-semibold text-red-500">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className={`flex-1 font-bold rounded-xl px-5 py-3 text-sm transition-colors disabled:opacity-40 ${t.primaryBtn}`}
        >
          {submitting ? 'Saving…' : mode === 'create'
            ? v.repeatWeeks > 1 ? `Create ${v.repeatWeeks} events` : 'Create event'
            : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className={`text-xs font-semibold px-3 py-2 transition-colors ${t.quietBtn}`}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Attendance name lists — going / out / NO REPLY (the anti-Heja clarity play:
// the missing kids are one tap away, hollow dot and all).
// ---------------------------------------------------------------------------

function AttendeeLists({ event, dark }: { event: ScheduleEvent; dark: boolean }) {
  const t = themeClasses(dark)
  const groups: Array<{
    key: string
    header: string
    headerCls: string
    people: Array<{ userId: string; name: string; note?: string | null }>
    hollow?: boolean
  }> = [
    { key: 'going', header: `Going (${event.counts.in})`, headerCls: dark ? 'text-green-400' : 'text-green-600', people: event.going },
    { key: 'out', header: `Out (${event.counts.out})`, headerCls: dark ? 'text-red-400' : 'text-red-500', people: event.out },
    {
      key: 'noReply',
      header: `Hasn't replied yet (${event.counts.noReply})`,
      headerCls: t.amber,
      people: event.noReply,
      hollow: true,
    },
  ]

  return (
    <div className={`rounded-xl p-3.5 mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 ${t.panel}`}>
      {groups.map(g => (
        <div key={g.key}>
          <p className={`text-[11px] font-bold uppercase tracking-wide mb-1.5 ${g.headerCls}`}>{g.header}</p>
          {g.people.length === 0 ? (
            <p className={`text-xs ${t.faint}`}>—</p>
          ) : (
            <ul className="space-y-1">
              {g.people.map(p => (
                <li key={p.userId} className={`text-sm ${g.hollow ? t.faint : t.text}`}>
                  {g.hollow && <span aria-hidden className="mr-1 select-none">○</span>}
                  {p.name}
                  {p.note && <span className={`italic ${t.dim}`}> — {p.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// One event card — the atom of the whole feature. Calendar-crisp: the date is
// the biggest thing on the card.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Add to calendar — Google (prefilled link) and Apple/Outlook (.ics download).
// Events default to 90 minutes; time-TBD events export as all-day.
// ---------------------------------------------------------------------------

function calStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function calDateOnly(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

function calSummary(event: ScheduleEvent): string {
  return event.title || typeLabel(event.type)
}

function googleCalUrl(event: ScheduleEvent): string {
  const start = new Date(event.startsAt)
  const dates = event.timeTbd
    ? `${calDateOnly(start)}/${calDateOnly(new Date(start.getTime() + 24 * 60 * 60 * 1000))}`
    : `${calStamp(start)}/${calStamp(new Date(start.getTime() + 90 * 60 * 1000))}`
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: calSummary(event),
    dates,
    ...(event.location ? { location: event.location } : {}),
    ...(event.notes ? { details: event.notes } : {}),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function downloadIcs(event: ScheduleEvent) {
  const start = new Date(event.startsAt)
  const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
  const timing = event.timeTbd
    ? [`DTSTART;VALUE=DATE:${calDateOnly(start)}`]
    : [`DTSTART:${calStamp(start)}`, `DTEND:${calStamp(new Date(start.getTime() + 90 * 60 * 1000))}`]
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LearnHoops//Team Schedule//EN',
    'BEGIN:VEVENT',
    `UID:learnhoops-event-${event.id}`,
    `DTSTAMP:${calStamp(new Date())}`,
    ...timing,
    `SUMMARY:${esc(calSummary(event))}`,
    ...(event.location ? [`LOCATION:${esc(event.location)}`] : []),
    ...(event.notes ? [`DESCRIPTION:${esc(event.notes)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${calSummary(event).replace(/[^\w\d -]+/g, '').trim() || 'event'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function EventCard({
  event,
  dark,
  compact,
  isPast,
  canRsvp,
  isCoach,
  memberCount,
  busy,
  editing,
  onRsvp,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
  onCancelEvent,
  onRestoreEvent,
  onDeleteEvent,
}: {
  event: ScheduleEvent
  dark: boolean
  compact: boolean
  isPast: boolean
  canRsvp: boolean
  isCoach: boolean
  memberCount: number
  busy: boolean
  editing: boolean
  onRsvp: (event: ScheduleEvent, status: RsvpStatus | 'clear', note?: string) => Promise<boolean>
  onStartEdit: (event: ScheduleEvent) => void
  onSubmitEdit: (event: ScheduleEvent, values: FormValues) => void
  onCancelEdit: () => void
  onCancelEvent: (event: ScheduleEvent) => void
  onRestoreEvent: (event: ScheduleEvent) => void
  onDeleteEvent: (event: ScheduleEvent) => void
}) {
  const t = themeClasses(dark)
  const [menuOpen, setMenuOpen] = useState(false)
  const [namesOpen, setNamesOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState(event.myRsvp?.note ?? '')

  const cancelled = event.status === 'cancelled'
  const mine = event.myRsvp?.status ?? null
  const chipCls = event.type === 'game' ? t.chipGame : event.type === 'practice' ? t.chipPractice : t.chipOther
  const showAdmin = isCoach && !compact
  const showRsvpButtons = canRsvp && !cancelled && !event.locked && !isPast

  async function saveNote() {
    if (!event.myRsvp) return
    const trimmed = noteDraft.trim().slice(0, 140)
    const ok = await onRsvp(event, event.myRsvp.status, trimmed)
    if (ok) setNoteOpen(false)
  }

  return (
    <div className={`rounded-2xl p-4 ${t.card} ${cancelled ? 'opacity-50' : ''}`}>
      <div className="flex gap-3">
        {/* Left rail — big date block */}
        <div className="w-16 shrink-0 text-center font-display font-black uppercase">
          <p className={`text-[10px] tracking-wider ${t.dim}`}>{weekdayLabel(event.startsAt)}</p>
          <p className={`text-lg leading-tight ${t.text}`}>{dayLabel(event.startsAt)}</p>
          <p className={`text-xs mt-0.5 ${event.timeTbd ? t.amber : t.dim}`}>
            {event.timeTbd ? 'TBD' : timeLabel(event.startsAt)}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${chipCls}`}>
              {event.type === 'game' ? '🏀 Game' : event.type === 'practice' ? 'Practice' : 'Other'}
            </span>
            {cancelled && (
              <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-red-500/15 text-red-500 border border-red-500/40">
                Cancelled
              </span>
            )}
            {wasUpdated(event) && !cancelled && (
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${t.chipOther}`}>
                Updated
              </span>
            )}
          </div>
          <p className={`text-sm font-bold mt-1 ${t.text} ${cancelled ? 'line-through' : ''}`}>
            {event.title || typeLabel(event.type)}
          </p>
          {event.location && (
            <p className={`text-xs mt-0.5 ${t.dim}`}>
              📍{' '}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline underline-offset-2"
              >
                {event.location}
              </a>
              {' · '}
              <a
                href={`https://maps.apple.com/?q=${encodeURIComponent(event.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 whitespace-nowrap"
              >
                Apple Maps
              </a>
            </p>
          )}
          {event.notes && (
            <button
              type="button"
              onClick={() => setNotesOpen(o => !o)}
              className={`block text-left text-xs mt-1 ${t.dim} ${notesOpen ? '' : 'line-clamp-2'}`}
            >
              {event.notes}
            </button>
          )}
          {!cancelled && !isPast && (
            <p className={`text-[11px] mt-1.5 ${t.faint}`}>
              Add to{' '}
              <button type="button" onClick={() => downloadIcs(event)} className={`font-semibold underline ${t.dim}`}>
                 Apple Calendar
              </button>
              {' · '}
              <a
                href={googleCalUrl(event)}
                target="_blank"
                rel="noopener noreferrer"
                className={`font-semibold underline ${t.dim}`}
              >
                Google Calendar
              </a>
            </p>
          )}
        </div>

        {/* Coach kebab */}
        {showAdmin && (
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Event actions"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(o => !o)}
              className={`w-8 h-8 rounded-lg font-bold ${t.btnIdle}`}
            >
              ⋯
            </button>
            {menuOpen && (
              <div className={`absolute right-0 mt-1 z-10 rounded-xl py-1 w-32 shadow-lg ${t.panel}`}>
                {!cancelled && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        onStartEdit(event)
                      }}
                      className={`block w-full text-left px-3 py-1.5 text-xs font-semibold ${t.text}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        onCancelEvent(event)
                      }}
                      className="block w-full text-left px-3 py-1.5 text-xs font-semibold text-red-500"
                    >
                      Cancel event
                    </button>
                  </>
                )}
                {cancelled && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        onRestoreEvent(event)
                      }}
                      className={`block w-full text-left px-3 py-1.5 text-xs font-semibold ${t.text}`}
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        onDeleteEvent(event)
                      }}
                      className="block w-full text-left px-3 py-1.5 text-xs font-semibold text-red-500"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="mt-3">
          <EventForm
            mode="edit"
            initial={formFromEvent(event)}
            dark={dark}
            submitting={busy}
            onSubmit={v => onSubmitEdit(event, v)}
            onClose={onCancelEdit}
          />
        </div>
      )}

      {/* RSVP row */}
      {cancelled ? (
        <p className={`text-xs mt-3 ${t.dim}`}>This event was cancelled.</p>
      ) : isPast ? (
        <p className={`text-xs mt-3 font-semibold ${t.dim}`}>
          <span className="font-numeric">{event.counts.in}</span> of{' '}
          <span className="font-numeric">{memberCount}</span> in
        </p>
      ) : event.locked ? (
        <p className={`text-xs mt-3 ${t.dim}`}>
          RSVPs locked · <span className="font-numeric">{event.counts.in}</span> going
        </p>
      ) : showRsvpButtons ? (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              aria-pressed={mine === 'in'}
              onClick={() => onRsvp(event, mine === 'in' ? 'clear' : 'in')}
              className={`flex-1 rounded-xl py-2 text-sm font-bold transition-colors ${
                mine === 'in' ? 'bg-green-600 border border-green-600 text-white' : t.btnIdle
              }`}
            >
              ✓ Going (<span className="font-numeric">{event.counts.in}</span>)
            </button>
            <button
              type="button"
              aria-pressed={mine === 'out'}
              onClick={() => onRsvp(event, mine === 'out' ? 'clear' : 'out')}
              className={`flex-1 rounded-xl py-2 text-sm font-bold transition-colors ${
                mine === 'out' ? 'bg-gray-700 border border-gray-700 text-white' : t.btnIdle
              }`}
            >
              ✗ Out (<span className="font-numeric">{event.counts.out}</span>)
            </button>
          </div>
          {mine && !noteOpen && (
            <button
              type="button"
              onClick={() => {
                setNoteDraft(event.myRsvp?.note ?? '')
                setNoteOpen(true)
              }}
              className={`text-xs font-semibold transition-colors ${t.link}`}
            >
              {event.myRsvp?.note ? `Note: ${event.myRsvp.note} — edit` : '+ add a note'}
            </button>
          )}
          {mine && noteOpen && (
            <div className="flex gap-2">
              <input
                type="text"
                value={noteDraft}
                maxLength={140}
                onChange={e => setNoteDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveNote()
                }}
                placeholder="e.g. running 15 min late"
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs focus:outline-none ${t.input}`}
              />
              <button
                type="button"
                onClick={saveNote}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${t.primaryBtn}`}
              >
                Save
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* Attendance strip — everyone; tap for the three name lists */}
      {!cancelled && (
        <button
          type="button"
          onClick={() => setNamesOpen(o => !o)}
          aria-expanded={namesOpen}
          className={`block text-xs mt-2 transition-colors ${t.dim} hover:underline`}
        >
          <span className="font-numeric">{event.counts.in}</span> going ·{' '}
          <span className="font-numeric">{event.counts.out}</span> out ·{' '}
          <span className={event.counts.noReply > 0 ? `font-semibold ${t.amber}` : ''}>
            <span className="font-numeric">{event.counts.noReply}</span> no reply
          </span>
        </button>
      )}
      {namesOpen && !cancelled && <AttendeeLists event={event} dark={dark} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Week calendar — one week at a time, Google-style: ‹ › arrows, a Today
// button, a 7-day grid with event chips, and the tapped event's full card
// (RSVP, names, coach menu) rendered underneath. Back-navigation reaches
// past weeks; their events come from the lazily fetched past window.
// ---------------------------------------------------------------------------

function startOfWeekLocal(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - x.getDay()) // Sunday-start, device-local
  return x
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function weekRangeLabel(weekStart: Date): string {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  const startStr = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString(
    undefined,
    weekStart.getMonth() === end.getMonth() ? { day: 'numeric' } : { month: 'short', day: 'numeric' },
  )
  return `${startStr} – ${endStr}`
}

function weekTitle(weekStart: Date): string {
  const thisWeek = startOfWeekLocal(new Date())
  // Local-midnight anchors can differ by an hour across a DST switch — round.
  const diffWeeks = Math.round((weekStart.getTime() - thisWeek.getTime()) / (7 * 24 * 60 * 60 * 1000))
  if (diffWeeks === -1) return 'Last week'
  if (diffWeeks === 0) return 'This week'
  if (diffWeeks === 1) return 'Next week'
  return weekRangeLabel(weekStart)
}

function WeekCalendar({
  weekStart,
  events,
  dark,
  selectedId,
  isCurrentWeek,
  onSelect,
  onStep,
  onToday,
}: {
  weekStart: Date
  events: ScheduleEvent[] // this week's events only, sorted by start
  dark: boolean
  selectedId: string | null
  isCurrentWeek: boolean
  onSelect: (id: string) => void
  onStep: (dir: -1 | 1) => void
  onToday: () => void
}) {
  const t = themeClasses(dark)
  const today = new Date()
  const border = dark ? 'border-courtline' : 'border-gray-200'
  const navBtn = `w-8 h-8 rounded-lg inline-flex items-center justify-center ${t.btnIdle}`
  const title = weekTitle(weekStart)
  const range = weekRangeLabel(weekStart)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  return (
    <div className={`rounded-2xl overflow-hidden border ${border} ${dark ? '' : 'bg-white'}`}>
      {/* Nav bar */}
      <div className={`flex items-center justify-between gap-2 px-3 py-2.5 border-b ${border}`}>
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Previous week" onClick={() => onStep(-1)} className={navBtn}>
            <ChevronLeftIcon className="w-4 h-4" aria-hidden />
          </button>
          <button type="button" aria-label="Next week" onClick={() => onStep(1)} className={navBtn}>
            <ChevronRightIcon className="w-4 h-4" aria-hidden />
          </button>
          {!isCurrentWeek && (
            <button type="button" onClick={onToday} className={`rounded-lg px-2.5 h-8 text-xs font-bold ${t.btnIdle}`}>
              Today
            </button>
          )}
        </div>
        <p className="text-right min-w-0">
          <span className={`font-display font-black uppercase text-sm tracking-wide ${t.text}`}>{title}</span>
          {title !== range && <span className={`ml-2 text-xs whitespace-nowrap ${t.dim}`}>{range}</span>}
        </p>
      </div>

      {/* 7-day grid — columns on desktop, stacked day rows on phones */}
      <div className={`grid grid-cols-1 sm:grid-cols-7 divide-y sm:divide-y-0 sm:divide-x ${dark ? 'divide-courtline' : 'divide-gray-200'}`}>
        {days.map((day, i) => {
          const dayEvents = events.filter(e => sameLocalDay(new Date(e.startsAt), day))
          const isToday = sameLocalDay(day, today)
          return (
            <div key={i} className="flex sm:flex-col gap-2 p-2 sm:min-h-[7.5rem] min-w-0">
              <div className="w-14 sm:w-auto shrink-0 flex sm:flex-col items-center gap-1.5 sm:gap-0.5">
                <span className={`text-[10px] font-bold uppercase tracking-wide ${isToday ? (dark ? 'text-ember-400' : 'text-orange-600') : t.dim}`}>
                  {day.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span
                  className={`text-sm font-bold w-6 h-6 rounded-full inline-flex items-center justify-center ${
                    isToday ? (dark ? 'bg-ember-500 text-ink-950' : 'bg-orange-500 text-ink-950') : t.text
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                {dayEvents.map(e => {
                  const chipCls = e.type === 'game' ? t.chipGame : e.type === 'practice' ? t.chipPractice : t.chipOther
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onSelect(e.id)}
                      aria-pressed={selectedId === e.id}
                      className={`block w-full text-left rounded-md px-1.5 py-1 text-[11px] font-semibold truncate transition-shadow ${chipCls} ${
                        e.status === 'cancelled' ? 'line-through opacity-50' : ''
                      } ${selectedId === e.id ? (dark ? 'ring-2 ring-chalk' : 'ring-2 ring-black/50') : ''}`}
                    >
                      {e.timeTbd ? 'TBD' : timeLabel(e.startsAt)} · {e.title || typeLabel(e.type)}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export default function TeamSchedulePanel({
  teamId,
  theme = 'light',
  compact = false,
}: {
  teamId: string
  theme?: 'light' | 'dark'
  compact?: boolean
}) {
  const dark = theme === 'dark'
  const t = themeClasses(dark)

  const [data, setData] = useState<ScheduleData | 'error' | null>(null)
  // 402 from the API: this team's plan doesn't include scheduling. Kept apart
  // from 'error' so the empty state can offer the upgrade instead of a shrug.
  const [locked, setLocked] = useState(false)
  const [past, setPast] = useState<ScheduleData | 'error' | null>(null)
  // Calendar position (weeks from the current one) and the tapped event.
  // null = auto (first event of the visible week); 'closed' = user collapsed.
  const [weekOffset, setWeekOffset] = useState(0)
  const [selected, setSelected] = useState<string | 'closed' | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const loadUpcoming = useCallback(async () => {
    try {
      const res = await fetch(`/api/team/schedule?teamId=${encodeURIComponent(teamId)}&window=upcoming`)
      // 402: this team's plan doesn't include scheduling. Tracked apart from
      // 'error' so the panel can say something true rather than "unavailable".
      if (res.status === 402) {
        setLocked(true)
        setData('error')
        return
      }
      if (!res.ok) {
        setData('error')
        return
      }
      const json = (await res.json()) as ScheduleData
      setData(json)
      // Coach + empty schedule → open the create form (spec's empty state).
      if (!compact && json.isCoach && json.events.length === 0) setShowCreate(true)
    } catch {
      setData('error')
    }
  }, [teamId, compact])

  const loadPast = useCallback(async () => {
    setPast(null) // show "Loading…" on retry instead of the stale error
    try {
      const res = await fetch(`/api/team/schedule?teamId=${encodeURIComponent(teamId)}&window=past`)
      setPast(res.ok ? ((await res.json()) as ScheduleData) : 'error')
    } catch {
      setPast('error')
    }
  }, [teamId])

  /* eslint-disable react-hooks/set-state-in-effect -- initial fetch from the network, an external system; same pattern as TeamChatPanel */
  useEffect(() => {
    setData(null)
    loadUpcoming()
  }, [loadUpcoming])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  function refresh() {
    loadUpcoming()
    if (past !== null) loadPast()
  }

  function replaceEvent(next: ScheduleEvent) {
    const patch = (d: ScheduleData | 'error' | null) =>
      d && d !== 'error' ? { ...d, events: d.events.map(e => (e.id === next.id ? next : e)) } : d
    setData(patch)
    setPast(patch)
  }

  // Optimistic RSVP: flip the buttons + counts instantly, reconcile with the
  // returned event, revert (reload) + toast on error.
  const rsvp = useCallback(
    async (event: ScheduleEvent, status: RsvpStatus | 'clear', note?: string): Promise<boolean> => {
      setData(prev => {
        if (!prev || prev === 'error') return prev
        return {
          ...prev,
          events: prev.events.map(e => {
            if (e.id !== event.id) return e
            const counts = { ...e.counts }
            if (e.myRsvp) counts[e.myRsvp.status] = Math.max(0, counts[e.myRsvp.status] - 1)
            else counts.noReply = Math.max(0, counts.noReply - 1)
            if (status === 'clear') return { ...e, counts: { ...counts, noReply: counts.noReply + 1 }, myRsvp: null }
            counts[status] += 1
            return {
              ...e,
              counts,
              myRsvp: { status, note: note !== undefined ? note || null : (e.myRsvp?.note ?? null) },
            }
          }),
        }
      })
      try {
        const res = await fetch('/api/team/schedule/rsvp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            note === undefined
              ? { teamId, eventId: event.id, status }
              : { teamId, eventId: event.id, status, note },
          ),
        })
        const json = (await res.json().catch(() => ({}))) as { error?: string; event?: ScheduleEvent }
        if (!res.ok || !json.event) {
          setToast(json.error ?? 'Could not save your RSVP')
          loadUpcoming()
          return false
        }
        replaceEvent(json.event)
        return true
      } catch {
        setToast('Could not save your RSVP')
        loadUpcoming()
        return false
      }
    },
    [teamId, loadUpcoming],
  )

  async function createEvents(v: FormValues) {
    const startsAt = valuesToStartsAt(v)
    if (!startsAt) {
      setToast('That date/time is not valid.')
      return
    }
    // Device IANA timezone — lets the server keep weekly repeats at the same
    // local wall-clock time across DST switches.
    let timeZone: string | undefined
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {}
    setBusy(true)
    try {
      const res = await fetch('/api/team/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId,
          type: v.type,
          startsAt,
          timeTbd: v.timeTbd,
          title: v.title.trim() || undefined,
          location: v.location.trim() || undefined,
          notes: v.notes.trim() || undefined,
          repeatWeeks: v.repeatWeeks,
          timeZone,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; events?: ScheduleEvent[] }
      if (!res.ok || !json.events) {
        setToast(json.error ?? 'Could not create the event')
        return
      }
      const created = json.events
      setShowCreate(false)
      setToast(created.length > 1 ? `${created.length} events created` : 'Event created')
      setData(prev => {
        if (!prev || prev === 'error') return prev
        const events = [...prev.events, ...created].sort(
          (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
        )
        return { ...prev, events }
      })
    } catch {
      // Network failure — without this the rejection is unhandled and the
      // coach gets no feedback at all.
      setToast('Could not create the event')
    } finally {
      setBusy(false)
    }
  }

  async function patchEvent(eventId: string, patch: Record<string, unknown>, failMsg: string): Promise<boolean> {
    setBusy(true)
    try {
      const res = await fetch('/api/team/schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, eventId, ...patch }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; event?: ScheduleEvent }
      if (!res.ok || !json.event) {
        setToast(json.error ?? failMsg)
        return false
      }
      replaceEvent(json.event)
      return true
    } catch {
      setToast(failMsg)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function submitEdit(event: ScheduleEvent, v: FormValues) {
    const startsAt = valuesToStartsAt(v)
    if (!startsAt) {
      setToast('That date/time is not valid.')
      return
    }
    const ok = await patchEvent(
      event.id,
      {
        type: v.type,
        startsAt,
        timeTbd: v.timeTbd,
        title: v.title.trim(),
        location: v.location.trim(),
        notes: v.notes.trim(),
      },
      'Could not update the event',
    )
    if (ok) {
      setEditingId(null)
      setToast('Event updated — RSVPs kept')
    }
  }

  async function cancelEvent(event: ScheduleEvent) {
    if (!window.confirm('Cancel this event? It stays on the schedule with a CANCELLED badge — no silent disappearance.')) return
    const ok = await patchEvent(event.id, { status: 'cancelled' }, 'Could not cancel the event')
    if (ok) setToast('Event cancelled')
  }

  async function restoreEvent(event: ScheduleEvent) {
    const ok = await patchEvent(event.id, { status: 'active' }, 'Could not restore the event')
    if (ok) setToast('Event restored')
  }

  async function deleteEvent(event: ScheduleEvent) {
    if (!window.confirm('Permanently delete this event? This can’t be undone.')) return
    setBusy(true)
    try {
      const res = await fetch(
        `/api/team/schedule?teamId=${encodeURIComponent(teamId)}&eventId=${encodeURIComponent(event.id)}`,
        { method: 'DELETE' },
      )
      const json = (await res.json().catch(() => ({}))) as { error?: string; success?: boolean }
      if (!res.ok || !json.success) {
        setToast(json.error ?? 'Could not delete the event')
        return
      }
      const drop = (d: ScheduleData | 'error' | null) =>
        d && d !== 'error' ? { ...d, events: d.events.filter(e => e.id !== event.id) } : d
      setData(drop)
      setPast(drop)
      setToast('Event deleted')
    } catch {
      setToast('Could not delete the event')
    } finally {
      setBusy(false)
    }
  }

  // ---------------------------------------------------------------------- //

  if (data === null) return <p className={`text-sm py-4 text-center ${t.dim}`}>Loading schedule…</p>
  if (locked)
    return (
      <div className={`rounded-xl p-5 text-center space-y-2 ${t.panel}`}>
        <p className={`text-sm font-bold ${t.text}`}>Scheduling is part of the Plus plan</p>
        <p className={`text-xs ${t.dim}`}>
          Upgrade to Plus to turn on scheduling and RSVPs for every team you run.
        </p>
        <a
          href="/org/signup"
          className="inline-block mt-1 bg-orange-500 hover:bg-orange-400 text-ink-950 font-bold text-sm px-5 py-2.5 rounded-xl transition-colors"
        >
          Get started today
        </a>
      </div>
    )

  if (data === 'error')
    return <p className={`text-sm py-4 text-center ${t.dim}`}>The schedule isn&apos;t available right now.</p>

  const isCoach = data.isCoach && !compact

  // Calendar derivations — the event pool is upcoming + (lazily) past, so
  // back-navigation shows finished weeks with their attendance record.
  const pastEvents = past && past !== 'error' ? past.events : []
  const pastIds = new Set(pastEvents.map(e => e.id))
  const seenIds = new Set<string>()
  const pool = [...data.events, ...pastEvents].filter(e => (seenIds.has(e.id) ? false : (seenIds.add(e.id), true)))
  const weekStart = startOfWeekLocal(new Date())
  weekStart.setDate(weekStart.getDate() + weekOffset * 7)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)
  const visibleEvents = pool
    .filter(e => {
      const ts = new Date(e.startsAt).getTime()
      return ts >= weekStart.getTime() && ts < weekEnd.getTime()
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  const shownEvent =
    selected === 'closed'
      ? null
      : selected
        ? (visibleEvents.find(e => e.id === selected) ?? null)
        : (visibleEvents[0] ?? null)

  function gotoWeek(offset: number) {
    setWeekOffset(offset)
    setSelected(null) // back to auto-select for the new week
    // Past weeks need the past window — fetch on first visit, retry on error.
    if (offset < 0 && (past === null || past === 'error')) loadPast()
  }

  function renderCard(event: ScheduleEvent, isPast: boolean) {
    return (
      <EventCard
        key={event.id}
        event={event}
        dark={dark}
        compact={compact}
        isPast={isPast}
        canRsvp={data !== null && data !== 'error' && data.canRsvp}
        isCoach={isCoach && !isPast}
        memberCount={data !== null && data !== 'error' ? data.memberCount : 0}
        busy={busy}
        editing={editingId === event.id}
        onRsvp={rsvp}
        onStartEdit={e => {
          setEditingId(e.id)
          setShowCreate(false)
        }}
        onSubmitEdit={submitEdit}
        onCancelEdit={() => setEditingId(null)}
        onCancelEvent={cancelEvent}
        onRestoreEvent={restoreEvent}
        onDeleteEvent={deleteEvent}
      />
    )
  }

  return (
    <div className="space-y-3">
      {/* Toast */}
      {toast && (
        <div role="status" className="bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl">
          {toast}
        </div>
      )}

      {/* Top bar: create (coach) + manual refresh — schedule isn't chat, no polling */}
      {!compact && (
        <div className="flex items-center justify-end gap-2">
          {isCoach && (
            <button
              type="button"
              onClick={() => {
                setShowCreate(o => !o)
                setEditingId(null)
              }}
              className={`font-bold rounded-xl px-4 py-2 text-sm transition-colors ${t.primaryBtn}`}
            >
              {showCreate ? 'Close' : '+ New event'}
            </button>
          )}
          <button
            type="button"
            aria-label="Refresh schedule"
            title="Refresh"
            onClick={refresh}
            className={`w-9 h-9 rounded-xl font-bold text-base ${t.btnIdle}`}
          >
            ↻
          </button>
        </div>
      )}

      {/* Create form */}
      {isCoach && showCreate && (
        <EventForm
          mode="create"
          initial={emptyForm()}
          dark={dark}
          submitting={busy}
          onSubmit={createEvents}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Events — the same week calendar everywhere; compact adds the hub link */}
      <WeekCalendar
        weekStart={weekStart}
        events={visibleEvents}
        dark={dark}
        selectedId={shownEvent?.id ?? null}
        isCurrentWeek={weekOffset === 0}
        onSelect={id => setSelected(shownEvent?.id === id ? 'closed' : id)}
        onStep={dir => gotoWeek(weekOffset + dir)}
        onToday={() => gotoWeek(0)}
      />
      {weekOffset < 0 && past === null && (
        <p className={`text-sm py-2 text-center ${t.dim}`}>Loading past events…</p>
      )}
      {weekOffset < 0 && past === 'error' && (
        <p className={`text-sm py-2 text-center ${t.dim}`}>Couldn&apos;t load past events.</p>
      )}
      {data.events.length === 0 && (
        <p className={`text-sm py-2 text-center ${t.dim}`}>
          {isCoach
            ? 'No events yet — schedule your first practice.'
            : 'No upcoming events. Your coach hasn’t scheduled anything yet.'}
        </p>
      )}
      {/* The tapped event's full card — RSVP, attendance, coach actions */}
      {shownEvent && renderCard(shownEvent, pastIds.has(shownEvent.id))}

      {compact && (
        <div>
          <Link href="/team" className={`text-sm font-semibold transition-colors ${t.link}`}>
            Full schedule →
          </Link>
        </div>
      )}
    </div>
  )
}
