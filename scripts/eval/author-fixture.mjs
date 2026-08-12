// Authors a golden-fixture file from an existing analysis.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/eval/author-fixture.mjs <analysisId> <slug>
//
// Pulls the analysis's frames + scores from Postgres, prefills expected ranges
// from COALESCE(admin_score, ai_score) ± 1.0 (overall ± 0.5), and writes
// fixtures/shots/<slug>.json. The "expected" block is a starting point — hand
// edit it (especially description, flags, player_type) before trusting it.
import postgres from 'postgres'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const [analysisId, slug] = process.argv.slice(2)
if (!analysisId || !slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('Usage: npx tsx --env-file=.env.local scripts/eval/author-fixture.mjs <analysisId> <slug>')
  console.error('  slug: lowercase letters, digits, dashes only (e.g. elbow-out-sidecam)')
  process.exit(1)
}

const db = postgres(process.env.DATABASE_URL, { ssl: 'require' })

const [a] = await db`
  SELECT id, overall_score, frame_urls, frames_hash, player_type, critical_flags
  FROM analyses WHERE id = ${analysisId}
`
if (!a) {
  console.error(`analysis ${analysisId} not found`)
  process.exit(1)
}
if (!a.frame_urls || a.frame_urls.length === 0) {
  console.error(`analysis ${analysisId} has no stored frame URLs — pick one whose frames were saved to Blob`)
  process.exit(1)
}

const scores = await db`
  SELECT c.name, cs.ai_score, cs.admin_score
  FROM criterion_scores cs
  JOIN criteria c ON c.id = cs.criterion_id
  WHERE cs.analysis_id = ${analysisId}
  ORDER BY cs.criterion_id
`
await db.end()

// Legacy rows may predate the frames_hash migration — compute it from the frames.
let framesHash = a.frames_hash
if (!framesHash) {
  console.log('frames_hash missing on this analysis — downloading frames to compute it...')
  const frames = []
  for (const url of a.frame_urls) {
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`failed to download ${url}: HTTP ${res.status}`)
      process.exit(1)
    }
    frames.push(Buffer.from(await res.arrayBuffer()).toString('base64'))
  }
  framesHash = crypto.createHash('sha256').update(frames.join('|')).digest('hex')
}

const half = (v) => Math.round(v * 2) / 2
const criteria = {}
for (const s of scores) {
  const base = s.admin_score ?? s.ai_score
  criteria[s.name] =
    base === null
      ? 'null'
      : [Math.max(1, half(Number(base) - 1)), Math.min(10, half(Number(base) + 1))]
}

const overall = Number(a.overall_score)
const fixture = {
  slug,
  analysis_id: Number(analysisId),
  description: 'EDIT ME — who is shooting, camera angle, and what makes this shot a useful reference',
  frames_hash: framesHash,
  frame_urls: a.frame_urls,
  expected: {
    overall: [Math.max(1, half(overall - 0.5)), Math.min(10, half(overall + 0.5))],
    criteria,
    flags: a.critical_flags ?? {},
    player_type: a.player_type ?? 'recreational',
    shot_detected: true,
  },
  authored_from: scores.some((s) => s.admin_score !== null) ? 'admin_corrections' : 'ai_scores',
  notes:
    'Ranges prefilled from COALESCE(admin_score, ai_score) ± 1.0 (overall ± 0.5). Hand-tighten after the first eval run. flags/player_type came from the stored analysis (empty for legacy rows) — set them to what an expert says is true.',
}

const outDir = path.join(process.cwd(), 'fixtures', 'shots')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, `${slug}.json`)
if (fs.existsSync(outPath)) {
  console.error(`${outPath} already exists — delete it first if you really want to re-author`)
  process.exit(1)
}
fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n')
console.log(`Wrote ${outPath}`)
console.log('Now hand-edit "description" and tighten "expected" — then run: npm run eval -- --only ' + slug)
process.exit(0)
