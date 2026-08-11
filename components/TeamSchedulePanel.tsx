'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

// ---------------------------------------------------------------------------
// Team schedule — one component, three faces:
//   1. /team hub (theme="dark")            — full panel for players + coaches
//   2. coach dashboard (theme="light")     — full panel with admin CRUD
//   3. player dashboard card (compact)     — next 3 events + "Full schedule →"
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
    chipGame: dark ? 'bg-ember-500 text-ink-950' : 'bg-orange-500 text-white',
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
    segActive: dark ? 'bg-ember-500 text-ink-950' : 'bg-orange-500 text-white',
    segIdle: dark ? 'bg-ink-900 text-chalk-dim hover:text-chalk' : 'bg-white text-gray-600 hover:bg-orange-100',
    segBorder: dark ? 'border border-courtline' : 'border border-orange-300',
    primaryBtn: dark
      ? 'bg-ember-500 hover:bg-ember-400 text-ink-950'
      : 'bg-orange-500 hover:bg-orange-400 text-white',
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

function TimeSelect({ value, onChange, dark }: { value: string; onChange: (v: string) => void; dark: boolean }) {
  const t = themeClasses(dark)
  // value is 24h "HH:MM"; render as tap-only hour/minute/AM-PM controls.
  const [hh, mm] = value ? value.split(':').map(n => parseInt(n, 10)) : [18, 0]
  const isPM = hh >= 12
  const hour12 = hh % 12 === 0 ? 12 : hh % 12
  const apply = (h12: number, minutes: number, pm: boolean) => {
    const h24 = pm ? (h12 % 12) + 12 : h12 % 12
    onChange(`${String(h24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`)
  }
  const selCls = `rounded-xl px-2.5 py-2.5 text-sm font-bold focus:outline-none cursor-pointer ${t.input}`
  return (
    <span className="inline-flex items-center gap-1.5">
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

      {/* When — date plus tap-only time dropdowns (native time inputs are fiddly) */}
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

      {/* Where */}
      <div>
        <p className={`text-xs font-bold uppercase tracking-wide mb-1.5 ${t.dim}`}>Where</p>
        <input
          type="text"
          value={v.location}
          maxLength={200}
          onChange={e => set('location', e.target.value)}
          placeholder="e.g. Main Gym"
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
          {event.location && <p className={`text-xs mt-0.5 ${t.dim}`}>📍 {event.location}</p>}
          {event.notes && (
            <button
              type="button"
              onClick={() => setNotesOpen(o => !o)}
              className={`block text-left text-xs mt-1 ${t.dim} ${notesOpen ? '' : 'line-clamp-2'}`}
            >
              {event.notes}
            </button>
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
  const [past, setPast] = useState<ScheduleData | 'error' | null>(null)
  const [pastOpen, setPastOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const loadUpcoming = useCallback(async () => {
    try {
      const res = await fetch(`/api/team/schedule?teamId=${encodeURIComponent(teamId)}&window=upcoming`)
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
  if (data === 'error')
    return <p className={`text-sm py-4 text-center ${t.dim}`}>The schedule isn&apos;t available right now.</p>

  const isCoach = data.isCoach && !compact
  const events = compact ? data.events.slice(0, 3) : data.events

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

      {/* Upcoming events */}
      {events.length === 0 ? (
        <p className={`text-sm py-4 text-center ${t.dim}`}>
          {isCoach
            ? 'No events yet — schedule your first practice.'
            : 'No upcoming events. Your coach hasn’t scheduled anything yet.'}
        </p>
      ) : (
        <div className="space-y-2.5">{events.map(e => renderCard(e, false))}</div>
      )}

      {compact ? (
        <div>
          <Link href="/team" className={`text-sm font-semibold transition-colors ${t.link}`}>
            Full schedule →
          </Link>
        </div>
      ) : (
        /* Past events — lazy accordion; final counts = the attendance record */
        <div className="pt-1">
          <button
            type="button"
            onClick={() => {
              // Retry on reopen after a failure — 'error' must never be a
              // dead-end the user can't leave without a full page reload.
              if (!pastOpen && (past === null || past === 'error')) loadPast()
              setPastOpen(o => !o)
            }}
            aria-expanded={pastOpen}
            className={`text-sm font-semibold transition-colors ${t.link}`}
          >
            {pastOpen ? '− Past events' : '+ Past events'}
          </button>
          {pastOpen &&
            (past === null ? (
              <p className={`text-sm py-3 text-center ${t.dim}`}>Loading past events…</p>
            ) : past === 'error' ? (
              <p className={`text-sm py-3 text-center ${t.dim}`}>Couldn&apos;t load past events.</p>
            ) : past.events.length === 0 ? (
              <p className={`text-sm py-3 text-center ${t.dim}`}>No past events yet.</p>
            ) : (
              <div className="space-y-2.5 mt-2">{past.events.map(e => renderCard(e, true))}</div>
            ))}
        </div>
      )}
    </div>
  )
}
