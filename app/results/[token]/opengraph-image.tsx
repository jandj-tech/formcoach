import { ImageResponse } from 'next/og'
import { db } from '@/lib/db'

// Social share card for a shot analysis. Shows the score and grade only —
// never a player's name, since many results belong to youth players.
export const alt = 'LearnHoops AI shot analysis score'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

function grade(score: number) {
  if (score >= 9) return { letter: 'A+', color: '#4ade80' }
  if (score >= 8) return { letter: 'A', color: '#4ade80' }
  if (score > 7) return { letter: 'B+', color: '#86efac' }
  if (score >= 6) return { letter: 'B', color: '#facc15' }
  if (score >= 5) return { letter: 'C', color: '#facc15' }
  if (score >= 4) return { letter: 'D', color: '#f87171' }
  return { letter: 'F', color: '#f87171' }
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let score: number | null = null
  try {
    const [row] = (await db`
      SELECT a.overall_score
      FROM submissions s
      JOIN analyses a ON a.submission_id = s.id
      WHERE s.token = ${token}
      ORDER BY a.created_at DESC
      LIMIT 1
    `) as unknown as [{ overall_score: string | number | null } | undefined]
    if (row?.overall_score != null) score = Number(row.overall_score)
  } catch {
    // Fall through to the generic card if the DB is unreachable.
  }

  const hasScore = score !== null && !Number.isNaN(score)
  const g = hasScore ? grade(score as number) : null

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0a0a0b',
          backgroundImage:
            'radial-gradient(circle at 50% -20%, rgba(249,115,22,0.35), rgba(10,10,11,0) 60%)',
          color: '#f5f5f4',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* top accent stripe */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: 14,
            backgroundColor: '#f97316',
            display: 'flex',
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: 10,
            color: '#f97316',
            textTransform: 'uppercase',
          }}
        >
          LearnHoops
        </div>

        {hasScore ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginTop: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <div style={{ fontSize: 220, fontWeight: 700, color: '#ffffff', display: 'flex' }}>
                {(score as number).toFixed(1)}
              </div>
              <div style={{ fontSize: 64, color: '#a8a29e', display: 'flex' }}>/10</div>
              <div
                style={{
                  fontSize: 96,
                  fontWeight: 700,
                  color: g!.color,
                  marginLeft: 48,
                  display: 'flex',
                }}
              >
                {g!.letter}
              </div>
            </div>
            <div style={{ fontSize: 44, fontWeight: 700, color: '#f5f5f4', display: 'flex' }}>
              My jump shot, graded by AI. Can you beat it?
            </div>
          </div>
        ) : (
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: '#ffffff',
              marginTop: 32,
              display: 'flex',
            }}
          >
            AI basketball shot analysis
          </div>
        )}

        <div
          style={{
            fontSize: 30,
            color: '#a8a29e',
            marginTop: 36,
            display: 'flex',
          }}
        >
          Scored across 17 shooting-form criteria · LearnHoops.com
        </div>
      </div>
    ),
    { ...size }
  )
}
