import type { SVGProps } from 'react'

/**
 * A basketball, drawn to match lucide's stroke style (24px grid, 2px round
 * strokes, currentColor) so it sits beside the rest of the icon set without
 * looking pasted in.
 *
 * Lucide has no basketball. This is the one glyph the product genuinely needs
 * and cannot import, which is why it is hand-drawn here rather than left as
 * the 🏀 emoji it replaced — emoji render in a different typeface on every
 * platform and read as a toy next to real icons.
 */
export function BasketballIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v20" />
      <path d="M2 12h20" />
      <path d="M4.93 4.93c3.9 3.9 3.9 10.24 0 14.14" />
      <path d="M19.07 4.93c-3.9 3.9-3.9 10.24 0 14.14" />
    </svg>
  )
}
