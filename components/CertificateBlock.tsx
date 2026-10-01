import Image from 'next/image'

interface Props {
  playerName: string
  firstScore: number | null
  finalScore: number | null
}

// Reusable certificate visual block. Both the single-player page
// (/org/certificate/[enrollmentId]) and the batch-print page
// (/org/class/[packageId]/certificates) render this so they stay
// pixel-identical and one set of tweaks updates both.
// Wrap each instance in a .cert-page div for proper print pagination
// (one cert per landscape page, vertically centered — see globals.css).
export default function CertificateBlock({ playerName, firstScore, finalScore }: Props) {
  const startNum = Number(firstScore ?? 0)
  const finalNum = Number(finalScore ?? 0)
  const startScore = startNum.toFixed(1)
  const finalDisplay = finalNum.toFixed(1)
  const diff = finalNum - startNum
  // A certificate is never the place to print a red minus: when the score
  // held or dipped, the slot just reads "Completed" (the completion rule
  // itself lives with the class enrolment, not here).
  const improved = diff > 0
  const improvement = improved ? `+${diff.toFixed(1)}` : 'Completed'

  return (
    <div
      className="certificate-print relative w-full max-w-5xl"
      style={{
        aspectRatio: '1491 / 1055',
        containerType: 'inline-size',
      }}
    >
      <Image
        src="/certificate-template.png"
        alt="LearnHoops Certificate of Completion"
        fill
        priority
        sizes="(max-width: 1024px) 100vw, 1024px"
        className="object-contain select-none pointer-events-none"
      />

      <div
        className="absolute text-black"
        style={{
          left: '24%',
          right: '5%',
          top: '53.6%',
          fontSize: '3.6cqw',
          fontFamily: 'var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif',
          fontWeight: 700,
          fontStyle: 'italic',
          letterSpacing: '0.01em',
          lineHeight: 1,
        }}
      >
        {playerName}
      </div>

      <div
        className="absolute text-black text-center"
        style={{
          left: '20.5%',
          width: '14%',
          top: '61.4%',
          fontSize: '2.8cqw',
          fontFamily: 'var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif',
          fontWeight: 700,
          letterSpacing: '0.02em',
          lineHeight: 1,
        }}
      >
        {startScore}
      </div>

      <div
        className="absolute text-black text-center"
        style={{
          left: '48%',
          width: '12%',
          top: '61.4%',
          fontSize: '2.8cqw',
          fontFamily: 'var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif',
          fontWeight: 700,
          letterSpacing: '0.02em',
          lineHeight: 1,
        }}
      >
        {finalDisplay}
      </div>

      <div
        className="absolute text-center whitespace-nowrap"
        style={{
          // The smaller "Completed" starts clear of the printed label and
          // drops so it sits on the same baseline as the scores.
          left: improved ? '70%' : '71%',
          width: improved ? '8%' : '7%',
          top: improved ? '61.3%' : '62.8%',
          fontSize: improved ? '2.7cqw' : '1.3cqw',
          fontFamily: 'var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif',
          fontWeight: 700,
          letterSpacing: '0.02em',
          color: improved ? '#16a34a' : '#000000',
          lineHeight: 1,
        }}
      >
        {improvement}
      </div>
    </div>
  )
}
