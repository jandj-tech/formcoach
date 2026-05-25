import Image from 'next/image'

interface Props {
  playerName: string
  firstScore: number | null
  finalScore: number | null
  /** True on every certificate EXCEPT the last in a batch — adds a CSS page
   *  break after this cert so each one prints on its own landscape sheet. */
  pageBreak?: boolean
}

// Reusable certificate visual block. Both the single-player page
// (/org/certificate/[enrollmentId]) and the batch-print page
// (/org/class/[packageId]/certificates) render this so they stay
// pixel-identical and one set of tweaks updates both.
export default function CertificateBlock({ playerName, firstScore, finalScore, pageBreak = false }: Props) {
  const startNum = Number(firstScore ?? 0)
  const finalNum = Number(finalScore ?? 0)
  const startScore = startNum.toFixed(1)
  const finalDisplay = finalNum.toFixed(1)
  const diff = finalNum - startNum
  const improvement = `${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)}`

  return (
    <div
      className="certificate-print relative w-full max-w-5xl"
      style={{
        aspectRatio: '1491 / 1055',
        containerType: 'inline-size',
        breakAfter: pageBreak ? 'page' : 'auto',
        pageBreakAfter: pageBreak ? 'always' : 'auto',
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
          left: '70%',
          width: '8%',
          top: '61.3%',
          fontSize: '2.7cqw',
          fontFamily: 'var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif',
          fontWeight: 700,
          letterSpacing: '0.02em',
          color: diff >= 0 ? '#16a34a' : '#dc2626',
          lineHeight: 1,
        }}
      >
        {improvement}
      </div>
    </div>
  )
}
