// CLI way to add a reference shot — the admin Test Bench (/admin/eval) does
// the same thing with a click. Inserts a row into eval_fixtures with expected
// ranges prefilled from COALESCE(admin_score, ai_score) ± 1.0 (overall ± 0.5);
// tighten the ranges afterwards in the admin UI.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/eval/author-fixture.mjs <analysisId> [slug]
const [analysisIdArg, slugArg] = process.argv.slice(2)
const analysisId = parseInt(analysisIdArg, 10)
if (!Number.isInteger(analysisId)) {
  console.error('Usage: npx tsx --env-file=.env.local scripts/eval/author-fixture.mjs <analysisId> [slug]')
  process.exit(1)
}
const slug = slugArg || `shot-${analysisId}`

const { authorFixtureFromAnalysis } = await import('../../lib/eval.ts')

try {
  const fixture = await authorFixtureFromAnalysis(analysisId, slug)
  console.log(`Added reference shot "${fixture.slug}" (fixture id ${fixture.id}).`)
  console.log('Now tighten its expected ranges in the admin Test Bench (/admin/eval), then run: npm run eval')
  process.exit(0)
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}
