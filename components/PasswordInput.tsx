'use client'

import { useState } from 'react'

// A password input with an eye icon inside the field to show/hide the value.
// Pass `className` to override the default (light) field styling — keep `pr-11`
// so the text never runs under the eye icon.
export default function PasswordInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)

  return (
    <div className="relative">
      <input
        {...props}
        type={show ? 'text' : 'password'}
        className={className ?? 'w-full bg-white border border-gray-300 rounded-xl pl-4 pr-11 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors'}
      />
      {/* The icon is 20x20, which made the whole button a 20x20 target and
          failed WCAG 2.2 SC 2.5.8 (Target Size, Minimum: 24x24). The icon stays
          the same size; the button grows around it, so it is easier to hit with
          a thumb or a shaky hand. right-2 keeps it visually where it was now
          that the box is wider. */}
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 min-w-6 min-h-6 flex items-center justify-center text-gray-400 hover:opacity-70 transition-opacity"
      >
        {show ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" x2="22" y1="2" y2="22" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  )
}
