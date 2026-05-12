import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import OverallBadge from '@/components/OverallBadge'
import ScoreCard from '@/components/ScoreCard'

export default async function AdminSubmissionPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const [submission] = await db`
    SELECT id, email, status, token, created_at
    FROM submissions
    WHERE token = ${token}
  `

  if (!submission) return notFound()

  const [analysis] = await db`
    SELECT * FROM analyses
    WHERE submission_id = ${submission.id}
    ORDER BY created_at DESC
    LIMIT 1
  `

  const scores = analysis
    ? await db`
        SELECT cs.id, cs.ai_score, cs.ai_reasoning, c.name, c.order_index
        FROM criterion_scores cs
        JOIN criteria c ON cs.criterion_id = c.id
        WHERE cs.analysis_id = ${analysis.id}
        ORDER BY c.order_index
      `
    : []

  return (
    <div className="space-y-8 text-white">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/submissions" className="text-orange-400 hover:text-orange-300 text-xs">
            ← All submissions
          </Link>
          <h1 className="text-2xl font-black text-white mt-1">Submission</h1>
        </div>
        <span
          className={`text-xs px-3 py-1 rounded-full ${
            submission.status === 'complete'
              ? 'bg-green-500/10 text-orange-400'
              : submission.status === 'processing'
                ? 'bg-yellow-500/10 text-orange-400'
                : 'bg-red-500/10 text-red-400'
          }`}
        >
          {submission.status}
        </span>
      </div>

      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-zinc-400 text-xs uppercase tracking-wider mb-1">Email</div>
          <div className="text-white break-all">{submission.email || <span className="text-zinc-500">(not provided)</span>}</div>
        </div>
        <div>
          <div className="text-zinc-400 text-xs uppercase tracking-wider mb-1">Submitted</div>
          <div className="text-white">{new Date(submission.created_at).toLocaleString()}</div>
        </div>
        <div>
          <div className="text-zinc-400 text-xs uppercase tracking-wider mb-1">Token</div>
          <div className="text-zinc-500 text-xs font-mono break-all">{submission.token}</div>
        </div>
      </div>

      {!analysis ? (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center text-zinc-400">
          No analysis exists for this submission yet.
        </div>
      ) : (
        <>
          <div className="flex justify-center">
            <OverallBadge score={Number(analysis.overall_score)} />
          </div>

          {analysis.video_url && (
            <div className="space-y-3">
              <h2 className="text-white font-bold text-lg">Uploaded Video</h2>
              <video
                src={analysis.video_url as string}
                controls
                playsInline
                className="w-full rounded-xl bg-black border border-zinc-800"
              />
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-white font-bold text-lg">Criteria Breakdown</h2>
            <div className="space-y-3">
              {scores.map((s) => (
                <ScoreCard
                  key={s.id}
                  name={s.name}
                  score={s.ai_score !== null ? Number(s.ai_score) : null}
                  reasoning={s.ai_reasoning}
                />
              ))}
            </div>
          </div>

          {analysis.frame_urls && (analysis.frame_urls as string[]).length > 0 && (
            <div className="space-y-3">
              <h2 className="text-white font-bold text-lg">Analyzed Frames</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {(analysis.frame_urls as string[]).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={url}
                      alt={`Frame ${i + 1}`}
                      className="rounded-lg w-full aspect-video object-cover border border-zinc-800 hover:border-orange-500 transition-colors"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
