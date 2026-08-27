/**
 * The boundary between two shop sections, and the page's wayfinding device.
 *
 * The shop used to read as one unbroken column: the top three sections all sat
 * on the same ground with nothing between them, so scrolling gave no sense of
 * having moved from one thing to the next.
 *
 * The first attempt at fixing that alternated background shades, which does
 * not work on a dark theme — ink-900 against ink-950 measures a 1.05 contrast
 * ratio, and even ink-700 only reaches 1.27. Surface luminance is simply not a
 * usable signal down here. Edges and rhythm are, so this leans on those:
 *
 *   - a hairline across the full viewport, hard against the section above
 *   - a solid ember bar on the content grid, which is the thing the eye catches
 *   - the section's name beside it, tracked out
 *
 * It is named after the palette's own `courtline` token: the painted line on a
 * court floor, with the section name stencilled next to it.
 *
 * The label lives HERE rather than being repeated as an eyebrow inside the
 * section, so each element keeps one job — this one locates you on the page,
 * the section's heading sells what is in it.
 */
export default function SectionBreak({
  label,
  /** `light` flips the hairline for the chalk section, where a dark rule would
   *  disappear into the background. */
  tone = 'dark',
}: {
  label: string
  tone?: 'dark' | 'light'
}) {
  return (
    <div className="select-none">
      <div
        aria-hidden="true"
        className={tone === 'light' ? 'h-px w-full bg-ink-950/15' : 'h-px w-full bg-courtline'}
      />
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center gap-3 pt-4">
          <span
            aria-hidden="true"
            className="block h-1 w-12 shrink-0 rounded-full bg-ember-500"
          />
          <span
            className={`eyebrow ${tone === 'light' ? 'text-ink-950/60' : 'text-chalk-dim'}`}
          >
            {label}
          </span>
        </div>
      </div>
    </div>
  )
}
