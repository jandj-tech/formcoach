'use client'

/**
 * A field real visitors never see or focus, but a form-filling bot will
 * happily complete. The server treats any non-empty value as a bot.
 *
 * Hidden with off-screen positioning rather than `display: none` or
 * `type="hidden"` — the cruder bots skip both of those, and this is aimed
 * squarely at the crude ones. `aria-hidden` plus `tabIndex={-1}` keep it out
 * of the way of screen readers and keyboard navigation, so no real visitor
 * can reach it by accident.
 */
export default function Honeypot({
  value,
  onChange,
  name = 'website',
}: {
  value: string
  onChange: (value: string) => void
  name?: string
}) {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
      <label htmlFor={`hp-${name}`}>Leave this field empty</label>
      <input
        id={`hp-${name}`}
        type="text"
        name={name}
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}
