import postgres from 'postgres'
const db = postgres(process.env.DATABASE_URL, { ssl: 'require' })
const [a] = await db`
  SELECT a.id, a.frame_urls FROM analyses a
  JOIN submissions s ON s.id = a.submission_id
  WHERE s.status = 'complete' AND array_length(a.frame_urls, 1) >= 20
  ORDER BY a.id DESC LIMIT 1`
console.log('using analysis', a.id)
const frames = []
for (const url of a.frame_urls) {
  const res = await fetch(url)
  frames.push(Buffer.from(await res.arrayBuffer()).toString('base64'))
}
await db.end()
const { analyzeShot } = await import('./lib/analyze.ts')
const mimes = frames.map(() => 'image/jpeg')
const runs = []
for (let i = 1; i <= 3; i++) {
  const r = await analyzeShot(frames, mimes)
  runs.push(r)
  console.log(`run ${i}: overall ${r.overall_score} flags:`, JSON.stringify(r.critical_flags))
}
const overalls = runs.map(r => r.overall_score)
const spread = Math.max(...overalls) - Math.min(...overalls)
console.log('OVERALL SPREAD:', spread.toFixed(2), spread <= 0.1 ? 'PASS' : spread <= 0.5 ? 'CLOSE' : 'FAIL')
let worst = 0
for (const c of runs[0].criteria) {
  const vals = runs.map(r => r.criteria.find(x => x.id === c.id)?.score).filter(v => v !== null && v !== undefined)
  if (vals.length === 3) worst = Math.max(worst, Math.max(...vals) - Math.min(...vals))
}
console.log('WORST CRITERION SPREAD:', worst.toFixed(2))
