// Joseph's own clip, cropped out of the pillarbox his phone wrote it into and
// re-encoded (8.7MB -> 386KB). Hosted on Blob rather than /public so an
// unchanging file is not shipped with every deployment and every clone.
const VIDEO =
  'https://x0swilm3wujbxncc.public.blob.vercel-storage.com/examples/filming-example.mp4'
const POSTER =
  'https://x0swilm3wujbxncc.public.blob.vercel-storage.com/examples/filming-example-poster.jpg'

/**
 * The worked example of a well-filmed shot, shown on the support FAQ and
 * beside step 1 on the learn page.
 *
 * Neutral dark-surface styling so it drops into either page without carrying
 * a theme with it. No hooks — this must not pull a client bundle onto pages
 * that are otherwise static.
 *
 * `showNote` adds the distance note. An example carries an implied
 * instruction — stand here — and in this clip the shoes are about 23 pixels
 * across, which is the resolution the stance criterion is documented to
 * struggle at. The note exists so the clip reads as one workable distance
 * rather than the only one.
 */
export default function FilmingExample({
  className = '',
  showNote = true,
  heading = 'A clip that grades well',
}: {
  className?: string
  showNote?: boolean
  heading?: string | null
}) {
  return (
    <div className={className}>
      {heading && (
        <p className="text-xs font-bold uppercase tracking-wider text-white mb-2">{heading}</p>
      )}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="shrink-0">
          <video
            src={VIDEO}
            poster={POSTER}
            controls
            playsInline
            preload="none"
            className="w-full max-w-[260px] rounded-xl border border-white/15 bg-black"
          />
          <p className="text-xs text-white/50 mt-2 max-w-[260px] leading-relaxed">
            Front-on, turned slightly off square, whole body in frame from the set-up through the
            landing. Portrait, one shot, a few seconds long.
          </p>
        </div>

        {showNote && (
          <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 sm:max-w-xs">
            <p className="text-sm font-black text-orange-400 leading-snug">Closer works too.</p>
            <p className="text-sm text-white/80 mt-1.5 leading-relaxed">
              This distance is fine, and so is standing nearer — whichever you prefer, as long as
              the whole body stays in frame. The closer you are, the more the camera picks up:
              where the elbow really sits, whether the guide hand is doing something, how wide the
              feet are. Just don&apos;t drift so far back that those details disappear.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
